// meta-leads-backfill
// ─────────────────────────────────────────────────────────────────────────────
// Rete di sicurezza "near-realtime" per i lead Meta (Facebook/Instagram Lead Ads).
//
// PERCHÉ ESISTE: il webhook leadgen in tempo reale può NON essere consegnato da
// Meta anche quando la pagina risulta iscritta (es. app in Accesso Standard /
// non-Live per le pagine dei clienti). In quel caso i lead esistono su Meta ma
// non entrano mai nel CRM. Questa funzione, girando a cadenza breve (cron ogni
// 15 min), interroga Graph e ripesca i lead recenti di TUTTI i moduli di ogni
// pagina selezionata, mettendoli in coda in integration_webhook_events (pending).
// Il cron meta-process-leads (ogni 2 min) li trasforma poi in contatti/opportunità.
//
// - Dedup idempotente su (company_id, provider, event_id): rilanciare non duplica.
// - Scopre i form da Meta (/{page}/leadgen_forms), non solo quelli registrati nel
//   wizard: una campagna nuova con un modulo mai configurato è comunque coperta.
// - Auth: header x-cron-secret (CRON_SECRET) oppure la chiave di servizio.
// - Body opzionale: { company_id?: string, days?: number } per un backfill mirato.
// - Recupero esplicito di UN modulo da una data (19/09/2026):
//   { company_id, form_id, da: "AAAA-MM-GG" } — lo stesso «Importa lead → Da
//   una data» del pannello, vale anche prima del collegamento del modulo.
// - Dal 20/09/2026 il giro automatico non interroga più a ogni passaggio i
//   moduli che Meta dà per archiviati o eliminati (erano quasi tutti i ~317
//   moduli per giro: ~30.000 chiamate al giorno per niente, giri da 118 s). Non
//   ci si fida alla cieca: chi ha portato lead negli ultimi 30 giorni si legge
//   comunque, e ogni archiviato si rilegge un'ora al giorno. Regole in
//   _shared/metaModuliDaInterrogare.ts. Un recupero chiesto legge tutto.
// - Log: una riga per pagina e una per giro, con i conteggi. Non una per modulo.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { serveConMetricheRapida } from "../_shared/withMetricsRapida.ts";
import { dataInSecondi, inizioFinestra } from "../_shared/metaFinestraRecupero.ts";
import {
  chiusoSuMeta,
  conta,
  conteggiVuoti,
  type ConteggiPagina,
  decidiModulo,
  GIORNI_LEAD_RECENTI,
  rigaGiro,
  rigaPagina,
  somma,
  statoMeta,
} from "../_shared/metaModuliDaInterrogare.ts";
const apiVersion = Deno.env.get("META_API_VERSION") || "v21.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-cron-secret, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

// ── Decrypt AES-GCM (allineato a _shared/encryption.ts) ──────────────────────
const AES_PREFIX = "aes:";
function getEncryptionKey(): string {
  const key = Deno.env.get("GOOGLE_TOKEN_ENCRYPTION_KEY");
  if (key) return key;
  const srk = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!srk) throw new Error("Encryption key mancante");
  return srk.substring(0, 32);
}
async function deriveAesKey(secret: string): Promise<CryptoKey> {
  const raw = new TextEncoder().encode(secret.padEnd(32, "0").substring(0, 32));
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["decrypt"]);
}
async function decrypt(encoded: string, key: string): Promise<string> {
  if (!encoded.startsWith(AES_PREFIX)) throw new Error("Formato token non AES");
  const aesKey = await deriveAesKey(key);
  const combined = Uint8Array.from(atob(encoded.slice(AES_PREFIX.length)), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, aesKey, ciphertext);
  return new TextDecoder().decode(plaintext);
}

// ── Chiamata a Graph con un limite di tempo ──────────────────────────────────
// Senza limite una risposta appesa teneva fermo il giro intero finché la
// piattaforma non chiudeva la funzione, e le pagine dopo restavano non lette.
const ATTESA_GRAPH_MS = 20_000;
// deno-lint-ignore no-explicit-any
async function chiediAGraph(url: string): Promise<any> {
  const r = await fetch(url, { signal: AbortSignal.timeout(ATTESA_GRAPH_MS) });
  return await r.json();
}

// Il token della pagina viaggia nell'indirizzo, e un errore di rete riporta
// l'indirizzo per intero: nei log non ci deve finire.
const senzaToken = (e: unknown): string =>
  String((e as Error)?.message ?? e).replace(/access_token=[^&\s"')]+/g, "access_token=***");

// Il salto dei moduli archiviati. Spento si legge tutto come prima e nel log si
// conta soltanto quanti se ne salterebbero: la regola si prova sui dati veri
// prima di fidarsi. È anche il modo per tornare indietro: false, e si pubblica.
const SALTA_ARCHIVIATI = false;

// Un giro oltre questa durata si fa notare nel log (il 20/09/2026 arrivava a 118 s).
const GIRO_LENTO_MS = 100_000;

// Oltre i primi, gli errori di una pagina si contano e basta: se Meta comincia a
// rifiutare le chiamate non devono tornare le trentamila righe al giorno.
const ERRORI_IN_CHIARO = 3;

// ── Elenco dei moduli della pagina, con lo stato che dà Meta ─────────────────
// ACTIVE, ARCHIVED, DELETED, DRAFT. Se Meta rifiutasse il campo si torna
// all'elenco di soli id, e senza stato si legge tutto come prima: un campo in
// più non deve poter fermare i lead di una pagina.
async function elencaModuli(
  pageId: string,
  pageToken: string,
): Promise<{ moduli: Array<{ id: string; status: unknown }>; errore: string | null; senzaStato: string | null }> {
  let moduli = new Map<string, unknown>();
  let errore: string | null = null;
  let senzaStato: string | null = null;
  for (const campi of ["id,status", "id"]) {
    // Secondo tentativo: ci si ricorda perché il primo, con lo stato, è fallito.
    if (campi === "id") senzaStato = errore;
    moduli = new Map<string, unknown>();
    errore = null;
    let url: string | null =
      `https://graph.facebook.com/${apiVersion}/${pageId}/leadgen_forms?fields=${campi}&limit=100&access_token=${pageToken}`;
    try {
      while (url) {
        const d = await chiediAGraph(url);
        if (d.error) {
          errore = String(d.error.message ?? "errore di Graph");
          break;
        }
        for (const f of d.data ?? []) if (f.id) moduli.set(String(f.id), f.status);
        url = d.paging?.next || null;
      }
    } catch (e) {
      errore = senzaToken(e);
    }
    // Riuscito, o fallito a metà elenco: si lavora con quello che c'è, come prima.
    if (!errore || moduli.size > 0) break;
  }
  // Se anche l'elenco di soli id fallisce il problema non era lo stato.
  if (errore) senzaStato = null;
  return { moduli: [...moduli].map(([id, status]) => ({ id, status })), errore, senzaStato };
}

// ── Moduli archiviati su Meta che però ci hanno portato lead di recente ──────
// È la prova sui dati veri prima di saltarne uno: se negli ultimi 30 giorni da
// un modulo «archiviato» è arrivato un lead, quel modulo si continua a leggere a
// ogni giro. Si chiedono solo i moduli in dubbio, così la risposta è quasi
// sempre vuota. `null` = non si è riusciti a saperlo, e allora non si salta niente.
// Il tetto sta sotto il taglio di PostgREST (mille righe) apposta: così una
// risposta piena si riconosce con certezza.
const BLOCCO_MODULI = 100;
const TETTO_RIGHE = 500;
async function moduliConLeadRecenti(
  admin: ReturnType<typeof createClient>,
  companyId: string,
  moduli: string[],
): Promise<Map<string, string> | null> {
  const da = new Date(Date.now() - GIORNI_LEAD_RECENTI * 24 * 60 * 60 * 1000).toISOString();
  const trovati = new Map<string, string>(); // modulo → ultimo lead ricevuto
  // Un id che non è un numero non entra nel filtro: nel dubbio si legge.
  for (const f of moduli) if (!/^\d+$/.test(f)) trovati.set(f, "");
  const numerici = moduli.filter((f) => /^\d+$/.test(f));
  for (let i = 0; i < numerici.length; i += BLOCCO_MODULI) {
    const blocco = numerici.slice(i, i + BLOCCO_MODULI);
    // Il nome della colonna si scrive per esteso (`modulo:payload->>form_id`):
    // senza alias la chiave della risposta dipende da PostgREST, e leggere la
    // chiave sbagliata darebbe «nessun lead recente» in silenzio — cioè
    // esattamente il caso in cui un modulo NON va saltato.
    const { data, error } = await admin
      .from("integration_webhook_events")
      .select("received_at, modulo:payload->>form_id")
      .eq("company_id", companyId)
      .eq("provider", "meta")
      .eq("event_type", "leadgen")
      .gte("received_at", da)
      .in("payload->>form_id", blocco)
      .order("received_at", { ascending: false })
      .limit(TETTO_RIGHE);
    if (error) {
      console.warn(`meta-leads-backfill: controllo lead recenti fallito (azienda ${companyId}): ${error.message}`);
      return null;
    }
    const righe = (data ?? []) as unknown as Array<{ received_at: string; modulo: string | null }>;
    // Righe che arrivano ma senza il modulo dentro: la lettura non ha detto
    // quello che doveva. Meglio non sapere che sapere male.
    if (righe.length > 0 && righe.every((r) => !r.modulo)) {
      console.warn(
        `meta-leads-backfill: controllo lead recenti senza il modulo nelle righe (azienda ${companyId}): si leggono tutti`,
      );
      return null;
    }
    for (const r of righe) {
      const f = String(r.modulo ?? "");
      if (f && !trovati.has(f)) trovati.set(f, r.received_at);
    }
    // Risposta piena: qualche modulo del blocco può essere rimasto fuori dal
    // taglio. Nel dubbio si leggono tutti.
    if (righe.length >= TETTO_RIGHE) for (const f of blocco) if (!trovati.has(f)) trovati.set(f, "");
  }
  return trovati;
}

interface OpzioniGiro {
  days: number;
  ignoraSegnalibro: boolean;
  soloModulo: string | null;
  daEsplicita: number | null;
  /** false quando qualcuno ha chiesto un recupero: lì lo stato su Meta non conta. */
  giroAutomatico: boolean;
  adesso: Date;
}

// ── Lead di un modulo da un certo istante: quanti nuovi, e se è andata bene ──
async function leggiModulo(
  admin: ReturnType<typeof createClient>,
  integ: { id: string; company_id: string },
  pageId: string,
  pageToken: string,
  formId: string,
  effectiveSince: number,
): Promise<{ nuovi: number; errore: string | null }> {
  let totaleNuovi = 0;
  let nextUrl: string | null =
    `https://graph.facebook.com/${apiVersion}/${formId}/leads` +
    `?fields=id,created_time,field_data,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name` +
    `&limit=50&filtering=[{"field":"time_created","operator":"GREATER_THAN","value":${effectiveSince}}]` +
    `&access_token=${pageToken}`;
  try {
    while (nextUrl) {
      const data = await chiediAGraph(nextUrl);
      if (data.error) return { nuovi: totaleNuovi, errore: String(data.error.message ?? "errore di Graph") };
      // Solo i lead che non abbiamo già: una lettura per pagina di Meta e una
      // scrittura sola per i nuovi. Prima era un upsert per lead, rifatto a ogni
      // giro — i moduli senza riga in meta_lead_forms non hanno segnalibro e
      // rileggono gli ultimi giorni: dal 14/09/2026 (BeMade) ~136 upsert ogni
      // 5 minuti, ~39.000 richieste al giorno per nessun lead nuovo.
      const leads = (data.data ?? []) as Array<{ id: string } & Record<string, unknown>>;
      if (leads.length > 0) {
        const { data: esistenti, error: errEsistenti } = await admin
          .from("integration_webhook_events")
          .select("event_id")
          .eq("company_id", integ.company_id)
          .eq("provider", "meta")
          .in("event_id", leads.map((l) => l.id));
        if (errEsistenti) {
          console.warn(`meta-leads-backfill: lettura lead già presenti fallita (${formId}):`, errEsistenti.message);
        }
        const giaPresenti = new Set((esistenti ?? []).map((r: { event_id: string }) => r.event_id));
        const nuovi = errEsistenti ? leads : leads.filter((l) => !giaPresenti.has(l.id));
        if (nuovi.length > 0) {
          const ora = new Date().toISOString();
          const { error: errUpsert } = await admin.from("integration_webhook_events").upsert(
            nuovi.map((lead) => ({
              company_id: integ.company_id,
              integration_id: integ.id,
              provider: "meta",
              event_type: "leadgen",
              event_id: lead.id,
              payload: { ...lead, leadgen_id: lead.id, form_id: formId, page_id: pageId },
              received_at: ora,
              status: "pending",
              fail_count: 0,
            })),
            { onConflict: "company_id,provider,event_id", ignoreDuplicates: true },
          );
          // Lead letti ma non salvati: il segnalibro non deve avanzare, al
          // prossimo giro si riprovano.
          if (errUpsert) return { nuovi: totaleNuovi, errore: `salvataggio lead fallito: ${errUpsert.message}` };
          totaleNuovi += errEsistenti ? 0 : nuovi.length;
        }
      }
      nextUrl = data.paging?.next || null;
    }
  } catch (e) {
    return { nuovi: totaleNuovi, errore: senzaToken(e) };
  }
  return { nuovi: totaleNuovi, errore: null };
}

// ── Backfill di una pagina: scopri i form su Meta e ripesca i lead recenti ───
async function backfillPage(
  admin: ReturnType<typeof createClient>,
  integ: { id: string; company_id: string },
  pageId: string,
  pageRowId: string,
  pageToken: string,
  o: OpzioniGiro,
): Promise<ConteggiPagina> {
  const avvio = Date.now();
  const c = conteggiVuoti();
  const sinceTs = Math.floor((Date.now() - o.days * 24 * 60 * 60 * 1000) / 1000);
  const segnalaErrore = (testo: string) => {
    c.errori++;
    if (c.errori <= ERRORI_IN_CHIARO) console.warn(`meta-leads-backfill: ${testo}`);
  };

  const { moduli, errore: erroreElenco, senzaStato } = await elencaModuli(pageId, pageToken);
  if (erroreElenco) segnalaErrore(`elenco moduli ${pageId} errore: ${erroreElenco}`);
  if (senzaStato) {
    console.warn(`meta-leads-backfill: pagina ${pageId} — Meta non ha dato lo stato dei moduli (${senzaStato}): si leggono tutti`);
  }

  // ── Impostazioni per-modulo (meta_lead_forms) ──────────────────────────────
  // Prima venivano completamente ignorate: status, sync_mode e since_date erano
  // scritti dal wizard ma nessuno li leggeva, e last_pull_at restava NULL anche
  // dopo import riusciti. Risultato: un modulo disattivato continuava comunque a
  // riversare lead nel CRM.
  // Le righe con page_asset_id NULL valgono per qualunque pagina dell'azienda:
  // in produzione esistono e un join stretto le avrebbe escluse, fermando i lead.
  const { data: formRows } = await admin
    .from("meta_lead_forms")
    .select("id, form_id, status, sync_mode, since_date, last_pull_at, page_asset_id, created_at")
    .eq("company_id", integ.company_id);

  const settingsByForm = new Map<string, {
    id: string; status: string | null; sync_mode: string | null;
    since_date: string | null; last_pull_at: string | null; created_at: string | null;
  }>();
  for (const row of formRows ?? []) {
    const r = row as Record<string, unknown>;
    const pa = r.page_asset_id as string | null;
    if (pa && pa !== pageRowId) continue; // riga di un'altra pagina
    settingsByForm.set(String(r.form_id), {
      id: String(r.id),
      status: (r.status as string) ?? null,
      sync_mode: (r.sync_mode as string) ?? null,
      since_date: (r.since_date as string) ?? null,
      last_pull_at: (r.last_pull_at as string) ?? null,
      created_at: (r.created_at as string) ?? null,
    });
  }

  // Quali moduli si leggono: le regole stanno in _shared/metaModuliDaInterrogare.ts.
  // Dei moduli che Meta dà per archiviati si guarda prima se ci hanno portato
  // lead negli ultimi 30 giorni: quelli si continuano a leggere a ogni giro.
  const inDubbio = o.giroAutomatico
    ? moduli
      .filter((m) => chiusoSuMeta(statoMeta(m.status)))
      // quelli spenti da noi non si leggono comunque: inutile chiedere di loro
      .filter((m) => (settingsByForm.get(m.id)?.status ?? "active") === "active")
      .map((m) => m.id)
    : [];
  const recenti = inDubbio.length > 0
    ? await moduliConLeadRecenti(admin, integ.company_id, inDubbio)
    : new Map<string, string>();
  const conLeadRecenti = recenti ? new Set(recenti.keys()) : null;
  const archiviatiVivi: string[] = [];

  for (const { id: formId, status } of moduli) {
    const cfg = settingsByForm.get(formId);
    // Un modulo disattivato da noi non si importa; i moduli SENZA riga restano
    // coperti (rete di sicurezza per le campagne nuove, vedi commento in testa).
    const d = decidiModulo({
      formId,
      statusMeta: status,
      cfg,
      giroAutomatico: o.giroAutomatico,
      soloModulo: o.soloModulo,
      conLeadRecenti,
      oraUtc: o.adesso.getUTCHours(),
      saltaArchiviati: SALTA_ARCHIVIATI,
    });
    conta(c, d);
    if (d.esito !== "letto") continue;
    if (d.motivo === "lead_recenti") {
      archiviatiVivi.push(`${formId} (ultimo lead ${(recenti?.get(formId) ?? "").slice(0, 10) || "?"})`);
    }

    // Limite temporale: il piu' RECENTE fra finestra di default, since_date
    // (quando l'utente ha chiesto "solo i nuovi"), collegamento del modulo e
    // ultimo pull riuscito. MAI prima di quando il modulo è stato collegato:
    // chi collega Meta oggi non si aspetta di trovarsi dentro i lead del mese
    // scorso. L'eccezione è il recupero esplicito di un modulo da una data,
    // che vale come l'«Importa lead» del pannello. Regole in
    // _shared/metaFinestraRecupero.ts.
    const effectiveSince = inizioFinestra({
      sinceTs, cfg, ignoraSegnalibro: o.ignoraSegnalibro, daEsplicita: o.daEsplicita,
    });

    const inizioLettura = new Date().toISOString();
    const { nuovi, errore } = await leggiModulo(admin, integ, pageId, pageToken, formId, effectiveSince);
    c.leadNuovi += nuovi;
    if (errore) segnalaErrore(`lead del modulo ${formId} errore: ${errore}`);

    // Un lead NUOVO da un modulo che Meta dà per archiviato smentisce la regola
    // per cui quei moduli si leggono di rado: deve restare scritto.
    if (nuovi > 0 && o.giroAutomatico && chiusoSuMeta(d.stato)) {
      c.leadNuoviDaArchiviati += nuovi;
      console.warn(
        `meta-leads-backfill: ATTENZIONE modulo ${formId} (pagina ${pageId}) è ${d.stato} su Meta ` +
        `ma ha portato ${nuovi} lead nuovi (letto per: ${d.motivo})`,
      );
    }

    // Segnalibro: senza, ogni giro ripartiva dalla stessa finestra. Avanza solo
    // se la lettura è andata fino in fondo (prima avanzava anche dopo un errore
    // di Meta, e i lead di quel buco non si rileggevano più), e segna l'INIZIO
    // della lettura, non la fine: un lead nato nel mezzo resta davanti.
    if (cfg && !errore) {
      await admin
        .from("meta_lead_forms")
        .update({ last_pull_at: inizioLettura })
        .eq("id", cfg.id);
    }
  }

  console.log(rigaPagina({ companyId: integ.company_id, pageId, ms: Date.now() - avvio, c }));
  // Il dettaglio dei moduli archiviati ma vivi una volta l'ora, non a ogni giro
  // (a ogni giro finché il salto è spento: è il momento in cui lo si guarda).
  if (archiviatiVivi.length > 0 && (o.adesso.getUTCMinutes() < 15 || !SALTA_ARCHIVIATI)) {
    console.log(
      `meta-leads-backfill: pagina ${pageId} — archiviati su Meta ma con lead negli ultimi ${GIORNI_LEAD_RECENTI} giorni, ` +
      `si continuano a leggere: ${archiviatiVivi.slice(0, 20).join(", ")}` +
      (archiviatiVivi.length > 20 ? ` e altri ${archiviatiVivi.length - 20}` : ""),
    );
  }
  return c;
}

// A pg_net (i cron) si risponde entro pochi secondi: vedi _shared/rispostaRapidaCron.ts.
serveConMetricheRapida("meta-leads-backfill", async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const cronSecret = Deno.env.get("CRON_SECRET");
  const reqSecret = req.headers.get("x-cron-secret");
  const authHeader = req.headers.get("Authorization");
  // Prima bastava un «Bearer» qualsiasi (la funzione è verify_jwt=false):
  // chiunque conoscesse l'URL poteva lanciare un recupero storico sul CRM di
  // un'azienda. L'unico chiamante è il cron: segreto del cron, o la chiave di
  // servizio per un giro lanciato dal server (19/09/2026).
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const bearer = (authHeader ?? "").replace(/^Bearer\s+/i, "");
  const authorized = (!!cronSecret && reqSecret === cronSecret) || (!!serviceKey && bearer === serviceKey);
  if (!authorized) return json({ error: "Unauthorized" }, 401);

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const onlyCompany = (body as { company_id?: string })?.company_id ?? null;
    const daysRaw = (body as { days?: number })?.days;
    const giorniChiesti = Number.isFinite(Number(daysRaw)) && Number(daysRaw) > 0 ? Number(daysRaw) : null;
    const days = giorniChiesti ?? 2;
    // Recupero esplicito di UN modulo da una data (come «Importa lead → Da una
    // data» del pannello): { company_id, form_id, da: "AAAA-MM-GG" }.
    const soloModulo = typeof (body as { form_id?: unknown })?.form_id === "string"
      ? String((body as { form_id: string }).form_id).trim() || null
      : null;
    const daRaw = (body as { da?: unknown })?.da;
    const daEsplicita = dataInSecondi(daRaw);
    if (daRaw !== undefined && daEsplicita === null) {
      return json({ error: "«da» dev'essere una data AAAA-MM-GG" }, 400);
    }
    if (daEsplicita !== null && !soloModulo) {
      return json({ error: "Il recupero da una data vale per un modulo solo: serve form_id" }, 400);
    }
    // Chi passa "days" (o una data) sta chiedendo di tornare indietro nel
    // tempo: il segnalibro last_pull_at (aggiornato a ogni giro del cron,
    // quindi sempre «pochi minuti fa») va ignorato, altrimenti la finestra
    // richiesta veniva schiacciata sull'ultimo giro e lo storico non rientrava mai.
    const ignoraSegnalibro = giorniChiesti !== null || daEsplicita !== null;

    // Una finestra storica vale per UN cliente per volta. Il 12/09/2026 un
    // recupero con "days" senza azienda ha ripescato l'arretrato di tutti i
    // clienti Meta insieme: tre aziende, ~90 lead a testa riversati nel CRM in
    // un quarto d'ora. Il giro automatico (senza "days") continua a passare su
    // tutti: guarda solo le ultime ore e rispetta il segnalibro.
    if ((giorniChiesti !== null || soloModulo) && !onlyCompany) {
      return new Response(
        JSON.stringify({
          error: "Per recuperare lo storico serve company_id: una finestra di giorni vale per un cliente per volta, " +
                 "altrimenti l'arretrato di tutti i clienti entra insieme e le loro automazioni partono tutte.",
        }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    let q = admin
      .from("integrations")
      .select("id, company_id")
      .eq("provider", "meta")
      .in("status", ["connected", "error"]);
    if (onlyCompany) q = q.eq("company_id", onlyCompany);
    const { data: integrations, error } = await q;
    if (error) throw error;

    const encKey = getEncryptionKey();
    const out: Array<Record<string, unknown>> = [];
    const avvioGiro = Date.now();
    const totale = conteggiVuoti();
    let pagineLette = 0;
    const opzioni = {
      days,
      ignoraSegnalibro,
      soloModulo,
      daEsplicita,
      // Chi chiede giorni, un modulo o una data vuole lo storico: lì si legge
      // tutto, anche i moduli archiviati. Il cron non passa niente di questo.
      giroAutomatico: giorniChiesti === null && daEsplicita === null && !soloModulo,
      adesso: new Date(),
    };

    for (const integ of integrations ?? []) {
      try {
        const { data: pages } = await admin
          .from("meta_assets")
          .select("id, asset_id")
          .eq("integration_id", integ.id)
          .eq("company_id", integ.company_id)
          .eq("asset_type", "page")
          .eq("selected", true);
        if (!pages?.length) continue;

        const { data: creds } = await admin
          .from("integration_credentials")
          .select("meta_page_tokens")
          .eq("integration_id", integ.id)
          .maybeSingle();
        const tokens = (creds?.meta_page_tokens ?? {}) as Record<string, string>;

        for (const page of pages) {
          const enc = tokens[page.asset_id];
          if (!enc) continue;
          let pageToken: string;
          try {
            pageToken = await decrypt(enc, encKey);
          } catch {
            console.warn(`meta-leads-backfill: token pagina ${page.asset_id} non decifrabile`);
            continue;
          }
          // Una pagina che va storta non deve lasciare senza lettura le altre
          // pagine della stessa azienda.
          let c: ConteggiPagina;
          try {
            c = await backfillPage(admin, integ, page.asset_id, page.id, pageToken, opzioni);
          } catch (e) {
            totale.errori++;
            console.warn(`meta-leads-backfill: pagina ${page.asset_id} giro interrotto: ${senzaToken(e)}`);
            out.push({ company_id: integ.company_id, page_id: page.asset_id, error: senzaToken(e) });
            continue;
          }
          somma(totale, c);
          pagineLette++;
          out.push({
            company_id: integ.company_id,
            page_id: page.asset_id,
            imported: c.leadNuovi,
            moduli: c.moduli,
            letti: c.letti,
            saltati_archiviati: c.saltatiArchiviati,
            saltati_disattivati: c.saltatiDisattivati,
            errori: c.errori,
          });
        }
      } catch (e) {
        totale.errori++;
        console.warn(`meta-leads-backfill: azienda ${integ.company_id} giro interrotto: ${senzaToken(e)}`);
        out.push({ company_id: integ.company_id, error: senzaToken(e) });
      }
    }

    const msGiro = Date.now() - avvioGiro;
    console.log(rigaGiro({ pagine: pagineLette, ms: msGiro, c: totale, automatico: opzioni.giroAutomatico }));
    // La funzione viene chiusa dalla piattaforma oltre un certo tempo, e a quel
    // punto le ultime pagine restano non lette senza che nessuno lo sappia.
    if (msGiro > GIRO_LENTO_MS) {
      console.warn(
        `meta-leads-backfill: GIRO LENTO ${Math.round(msGiro / 1000)} s su ${pagineLette} pagine — ` +
        `vicino al tempo massimo della funzione, le ultime pagine rischiano di non essere lette`,
      );
    }

    return json({ ok: true, integrations: (integrations ?? []).length, ms: msGiro, results: out });
  } catch (e) {
    console.error("meta-leads-backfill error:", senzaToken(e));
    return json({ error: senzaToken(e) }, 500);
  }
});
