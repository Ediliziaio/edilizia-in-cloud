/**
 * elastic-email-esiti — consegne, aperture, click, rimbalzi, reclami e
 * disiscrizioni delle email spedite con Elastic Email (07/11/2026).
 *
 * Fino a oggi nessun esito di Elastic arrivava in piattaforma: il webhook
 * (email-provider-webhook) non è mai stato chiamato, e le colonne
 * delivered_at / opened_at / clicked_at / bounced_at di email_delivery_log
 * restavano vuote. Elastic gli esiti li raccoglie comunque, se il
 * tracciamento è acceso nell'account: qui si leggono con GET /v4/events e si
 * scrivono con email_esiti_registra(), un lotto alla volta.
 *
 * Modi (corpo JSON):
 *   {}                 un giro: dal cursore a adesso, a pagine.
 *   {"anteprima":true} legge una pagina piccola delle ultime 24 ore e dice
 *                      cosa ha ricevuto e come lo interpreterebbe. NON scrive.
 *
 * Primo giro: senza cursore si importano gli ultimi STORICO_GIORNI giorni.
 * I rimborsi del credito sui rimbalzi definitivi valgono solo per gli eventi
 * da quel momento in poi (email_esiti_elastic_rimborsi_dal): un'ondata di
 * rimborsi arretrati è una decisione di chi gestisce i conti, non di un import.
 *
 * Chiamata dal cron (x-cron-secret) o col service role. Risponde a pg_net
 * entro pochi secondi e finisce sotto waitUntil (serveConMetricheRapida).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { chiamataInternaValida, rispostaNonAutorizzata } from "../_shared/chiamataInterna.ts";
import { serveConMetricheRapida } from "../_shared/withMetricsRapida.ts";
import { loadProviderSettings } from "../_shared/emailProvider.ts";
import { leggiImpostazioniPiattaforma } from "../_shared/getPlatformSetting.ts";
import {
  blocchiDaPortare,
  esitiDaEventi,
  inizioFinestra,
  nuovoCursore,
  TIPI_EVENTO_ELASTIC,
  type Esito,
} from "../_shared/esitiElastic.ts";

const API = "https://api.elasticemail.com/v4/events";
const CHIAVE_CURSORE = "email_esiti_elastic_cursore";
const CHIAVE_RIMBORSI_DAL = "email_esiti_elastic_rimborsi_dal";
const PER_PAGINA = 1000;
const PAGINE_MAX = 8;
const TEMPO_MASSIMO_MS = 90_000;
const STORICO_GIORNI = 30;

async function leggiPagina(apiKey: string, da: Date, a: Date, offset: number, limite: number) {
  const q = new URLSearchParams();
  for (const t of TIPI_EVENTO_ELASTIC) q.append("eventTypes", t);
  q.set("from", da.toISOString());
  q.set("to", a.toISOString());
  q.set("orderBy", "DateAscending");
  q.set("limit", String(limite));
  q.set("offset", String(offset));
  const res = await fetch(`${API}?${q.toString()}`, {
    headers: { "X-ElasticEmail-ApiKey": apiKey, Accept: "application/json" },
    signal: AbortSignal.timeout(25_000),
  });
  const testo = await res.text();
  let corpo: unknown = null;
  try { corpo = JSON.parse(testo); } catch { /* non è JSON */ }
  return { http: res.status, corpo, testo: testo.slice(0, 500) };
}

// deno-lint-ignore no-explicit-any
async function sincronizzaListaBlocco(admin: any, apiKey: string, applica: boolean, adesso: Date) {
  const lista: Array<Record<string, unknown>> = [];
  let http = 0;
  for (let p = 0; p < 50; p++) {
    const res = await fetch(`https://api.elasticemail.com/v4/suppressions?limit=1000&offset=${p * 1000}`, {
      headers: { "X-ElasticEmail-ApiKey": apiKey }, signal: AbortSignal.timeout(25_000),
    });
    http = res.status;
    const pagina = res.ok ? await res.json().catch(() => []) : [];
    if (!Array.isArray(pagina) || pagina.length === 0) break;
    lista.push(...pagina);
    if (pagina.length < 1000) break;
  }
  const portare = blocchiDaPortare(lista);
  const daPortare = new Set(portare.map((b) => b.email));

  // Cosa resta fuori, raggruppato per codice e messaggio: è da lì che si vede
  // se la regola è troppo prudente o troppo larga.
  const esclusi: Record<string, number> = {};
  const inclusi: Record<string, number> = {};
  for (const v of lista) {
    const email = String(v.Email ?? "").trim().toLowerCase();
    const chiave = `${v.ErrorCode ?? "-"} | ${String(v.FriendlyErrorMessage ?? "").slice(0, 90)}`;
    if (daPortare.has(email)) {
      const r = portare.find((b) => b.email === email)!.reason;
      inclusi[`${r} ← ${chiave}`] = (inclusi[`${r} ← ${chiave}`] ?? 0) + 1;
    } else {
      esclusi[chiave] = (esclusi[chiave] ?? 0) + 1;
    }
  }

  let scritti: unknown = null;
  let errore: string | null = null;
  if (applica && portare.length > 0) {
    const { data, error } = await admin.rpc("email_blocchi_elastic_registra", { p_blocchi: portare });
    if (error) errore = error.message; else scritti = data;
  }
  const risultato = {
    modo: applica ? "applica" : "anteprima", fatta_il: adesso.toISOString(), http,
    nella_lista_elastic: lista.length, da_portare: portare.length,
    per_motivo: portare.reduce<Record<string, number>>((a, b) => { a[b.reason] = (a[b.reason] ?? 0) + 1; return a; }, {}),
    inclusi, esclusi, scritti, errore,
  };
  await admin.from("platform_settings").upsert(
    { key: "email_esiti_elastic_blocchi_ultimo", value: JSON.stringify(risultato) }, { onConflict: "key" },
  );
  return risultato;
}

const conta = (esiti: Esito[]) =>
  esiti.reduce<Record<string, number>>((acc, e) => { acc[e.tipo] = (acc[e.tipo] ?? 0) + 1; return acc; }, {});

serveConMetricheRapida("elastic-email-esiti", async (req) => {
  if (!chiamataInternaValida(req)) return rispostaNonAutorizzata();
  const corpo = await req.json().catch(() => ({})) as { anteprima?: boolean };
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const impostazioni = await loadProviderSettings("marketing");
  if (impostazioni.provider !== "elastic_email" || !impostazioni.apiKey) {
    return Response.json({ ok: false, motivo: "Elastic Email non è il provider marketing, o manca la chiave" }, { status: 200 });
  }
  const apiKey = impostazioni.apiKey;
  const adesso = new Date();

  // ── Anteprima: nessuna scrittura ─────────────────────────────────────────
  if (corpo.anteprima === true) {
    const pagina = await leggiPagina(apiKey, new Date(adesso.getTime() - 24 * 3600_000), adesso, 0, 50);
    const eventi = Array.isArray(pagina.corpo) ? pagina.corpo as Array<Record<string, unknown>> : [];
    const esiti = esitiDaEventi(eventi);
    const nascondi = (v: unknown) => typeof v === "string" && v.includes("@") ? v.replace(/^[^@]+/, "***") : v;
    return Response.json({
      anteprima: true,
      http: pagina.http,
      eventi_ricevuti: eventi.length,
      campi: eventi[0] ? Object.keys(eventi[0]) : [],
      tipi_ricevuti: [...new Set(eventi.map((e) => e.EventType))],
      esempi: eventi.slice(0, 3).map((e) => Object.fromEntries(Object.entries(e).map(([k, v]) => [k, nascondi(v)]))),
      esiti_interpretati: conta(esiti),
      risposta_se_non_json: Array.isArray(pagina.corpo) ? null : pagina.testo,
    });
  }

  // ── La lista di blocco di Elastic → i blocchi della piattaforma ──────────
  // {"lista_blocco":"anteprima"} classifica e conta, senza scrivere blocchi.
  // {"lista_blocco":"applica"} scrive con email_blocchi_elastic_registra().
  // Il giro normale la applica da solo una volta al giorno, ma solo se
  // platform_settings.email_esiti_elastic_blocchi_automatico = 'si': si
  // accende a mano dopo aver guardato l'anteprima. Il risultato si salva in
  // email_esiti_elastic_blocchi_ultimo (a pg_net si risponde prima).
  const modoBlocchi = (corpo as { lista_blocco?: string }).lista_blocco;
  if (modoBlocchi === "anteprima" || modoBlocchi === "applica") {
    const risultato = await sincronizzaListaBlocco(admin, apiKey, modoBlocchi === "applica", adesso);
    return Response.json(risultato);
  }

  // ── Diagnosi delle email spedite e mai consegnate ────────────────────────
  // Il 07/11/2026 circa 190 email della settimana risultavano spedite a
  // Elastic e mai consegnate, senza nessun rimbalzo. Qui si guarda, per
  // ciascuna, cosa sa Elastic: quali eventi ha registrato (anche Submission
  // e FailedAttempt, che il giro normale non legge) e se l'indirizzo è nella
  // sua lista di blocco. Sola lettura verso Elastic e verso gli invii; il
  // risultato si salva in platform_settings (email_esiti_elastic_diagnosi),
  // perché a pg_net si risponde prima che il lavoro finisca.
  if ((corpo as { diagnosi?: boolean }).diagnosi === true) {
    const settimana = new Date(adesso.getTime() - 8 * 24 * 3600_000);
    const { data: mancanti, error: errMancanti } = await admin
      .from("email_delivery_log")
      .select("provider_id, recipient, template_type, sent_at")
      .eq("provider", "elastic_email")
      .is("delivered_at", null).is("bounced_at", null)
      .gte("sent_at", settimana.toISOString())
      .lt("sent_at", new Date(adesso.getTime() - 2 * 3600_000).toISOString())
      .not("provider_id", "is", null)
      .limit(2000);
    if (errMancanti) return Response.json({ ok: false, errore: errMancanti.message }, { status: 500 });
    const righe = (mancanti ?? []) as Array<{ provider_id: string; recipient: string | null; template_type: string | null; sent_at: string }>;

    // Tutti gli eventi della settimana, di ogni tipo.
    const perMsg = new Map<string, string[]>();
    const categorie = new Map<string, string>();
    const tutti = ["Submission", "FailedAttempt", "Bounce", "Sent", "Open", "Click", "Unsubscribe", "Complaint"];
    let eventiLetti = 0;
    for (let p = 0; p < 15; p++) {
      const q = new URLSearchParams();
      for (const t of tutti) q.append("eventTypes", t);
      q.set("from", settimana.toISOString()); q.set("to", adesso.toISOString());
      q.set("orderBy", "DateAscending"); q.set("limit", "1000"); q.set("offset", String(p * 1000));
      const res = await fetch(`${API}?${q}`, { headers: { "X-ElasticEmail-ApiKey": apiKey }, signal: AbortSignal.timeout(25_000) });
      const lista = res.ok ? await res.json().catch(() => []) : [];
      if (!Array.isArray(lista)) break;
      eventiLetti += lista.length;
      for (const e of lista as Array<Record<string, string | null>>) {
        const id = e.MsgID ?? "";
        if (!id) continue;
        const v = perMsg.get(id) ?? [];
        v.push(String(e.EventType));
        perMsg.set(id, v);
        if (e.MessageCategory && e.MessageCategory !== "Unknown") categorie.set(id, `${e.MessageCategory}${e.Message ? ": " + String(e.Message).slice(0, 80) : ""}`);
      }
      if (lista.length < 1000) break;
    }

    // La lista di blocco di Elastic.
    const bloccati = new Map<string, string>();
    let campiBlocco: string[] = [];
    let httpBlocco = 0;
    for (let p = 0; p < 30; p++) {
      const res = await fetch(`https://api.elasticemail.com/v4/suppressions?limit=1000&offset=${p * 1000}`, {
        headers: { "X-ElasticEmail-ApiKey": apiKey }, signal: AbortSignal.timeout(25_000),
      });
      httpBlocco = res.status;
      const lista = res.ok ? await res.json().catch(() => []) : [];
      if (!Array.isArray(lista) || lista.length === 0) break;
      if (!campiBlocco.length && lista[0]) campiBlocco = Object.keys(lista[0]);
      for (const s of lista as Array<Record<string, unknown>>) {
        const em = String(s.Email ?? "").trim().toLowerCase();
        if (em) bloccati.set(em, String(s.ErrorCode ?? s.Reason ?? s.Status ?? "bloccato"));
      }
      if (lista.length < 1000) break;
    }

    const perEsito: Record<string, number> = {};
    const perModello: Record<string, Record<string, number>> = {};
    const esempi: Array<Record<string, unknown>> = [];
    for (const r of righe) {
      const ev = perMsg.get(r.provider_id) ?? [];
      const blocco = r.recipient ? bloccati.get(r.recipient.trim().toLowerCase()) : undefined;
      const esito = blocco ? `nella lista di blocco di Elastic (${blocco})`
        : ev.includes("FailedAttempt") ? "tentativi falliti, Elastic sta ancora riprovando o ha smesso"
        : ev.includes("Submission") ? "accettata da Elastic ma mai spedita"
        : ev.length > 0 ? `eventi: ${[...new Set(ev)].join(", ")}`
        : "nessun evento su Elastic";
      perEsito[esito] = (perEsito[esito] ?? 0) + 1;
      const m = r.template_type ?? "-";
      perModello[m] = perModello[m] ?? {};
      perModello[m][esito] = (perModello[m][esito] ?? 0) + 1;
      if (esempi.length < 12) {
        esempi.push({
          a: r.recipient ? r.recipient.replace(/^[^@]+/, "***") : null,
          inviata: r.sent_at, modello: m, esito,
          categoria: categorie.get(r.provider_id) ?? null,
        });
      }
    }
    const risultato = {
      fatta_il: adesso.toISOString(), mancanti: righe.length, eventi_letti: eventiLetti,
      indirizzi_nella_lista_di_blocco: bloccati.size, http_lista_blocco: httpBlocco, campi_lista_blocco: campiBlocco,
      per_esito: perEsito, per_modello: perModello, esempi,
    };
    await admin.from("platform_settings").upsert(
      { key: "email_esiti_elastic_diagnosi", value: JSON.stringify(risultato) }, { onConflict: "key" },
    );
    return Response.json(risultato);
  }

  // ── Giro normale ─────────────────────────────────────────────────────────
  const valori = await leggiImpostazioniPiattaforma([CHIAVE_CURSORE, CHIAVE_RIMBORSI_DAL]);
  const cursore = valori[CHIAVE_CURSORE] || null;
  let rimborsiDal = valori[CHIAVE_RIMBORSI_DAL] || null;
  if (!rimborsiDal) {
    rimborsiDal = adesso.toISOString();
    await admin.from("platform_settings").upsert({ key: CHIAVE_RIMBORSI_DAL, value: rimborsiDal }, { onConflict: "key" });
  }

  const da = inizioFinestra(cursore, new Date(adesso.getTime() - STORICO_GIORNI * 24 * 3600_000));
  const inizio = Date.now();
  const totale = { letti: 0, esiti: {} as Record<string, number>, scritti: {} as Record<string, number>, rimborsi: 0, pagine: 0 };
  let ultimoCursore = cursore;
  let errore: string | null = null;

  for (let p = 0; p < PAGINE_MAX && Date.now() - inizio < TEMPO_MASSIMO_MS; p++) {
    const pagina = await leggiPagina(apiKey, da, adesso, p * PER_PAGINA, PER_PAGINA);
    if (pagina.http !== 200 || !Array.isArray(pagina.corpo)) {
      errore = `Elastic Email ha risposto HTTP ${pagina.http}: ${pagina.testo}`;
      break;
    }
    const eventi = pagina.corpo as unknown[];
    totale.pagine++;
    totale.letti += eventi.length;
    const esiti = esitiDaEventi(eventi);
    for (const [k, v] of Object.entries(conta(esiti))) totale.esiti[k] = (totale.esiti[k] ?? 0) + v;

    if (esiti.length > 0) {
      const { data, error } = await admin.rpc("email_esiti_registra", { p_esiti: esiti });
      if (error) { errore = `email_esiti_registra: ${error.message}`; break; }
      for (const [k, v] of Object.entries((data ?? {}) as Record<string, number>)) {
        totale.scritti[k] = (totale.scritti[k] ?? 0) + (Number(v) || 0);
      }

      // Rimborso del credito sui rimbalzi definitivi, solo da rimborsi_dal.
      for (const e of esiti) {
        if (e.tipo !== "rimbalzo_definitivo" || !e.msg_id || e.quando < rimborsiDal) continue;
        const { error: errRimborso } = await admin.rpc("refund_email_credit_on_bounce", {
          p_provider_message_id: e.msg_id, p_reason: e.motivo ?? "hard_bounce",
        });
        if (!errRimborso) totale.rimborsi++;
      }
    }
    // Il cursore avanza solo dopo che la pagina è stata scritta, e si salva
    // subito: un giro interrotto a metà riparte da qui, non da capo.
    const avanzato = nuovoCursore(esiti, ultimoCursore);
    if (avanzato && avanzato !== ultimoCursore) {
      await admin.from("platform_settings").upsert({ key: CHIAVE_CURSORE, value: avanzato }, { onConflict: "key" });
      ultimoCursore = avanzato;
    }
    if (eventi.length < PER_PAGINA) break;
  }

  if (!errore && !ultimoCursore) {
    // Nessun evento nello storico: si parte da adesso, per non rileggerlo ogni volta.
    await admin.from("platform_settings").upsert({ key: CHIAVE_CURSORE, value: adesso.toISOString() }, { onConflict: "key" });
  }

  // Una volta al giorno la lista di blocco, se l'interruttore è acceso.
  let listaBlocco: unknown = null;
  const blocchi = await leggiImpostazioniPiattaforma(["email_esiti_elastic_blocchi_automatico", "email_esiti_elastic_blocchi_il"]);
  const ultimaVolta = blocchi["email_esiti_elastic_blocchi_il"] ? new Date(blocchi["email_esiti_elastic_blocchi_il"]).getTime() : 0;
  if (blocchi["email_esiti_elastic_blocchi_automatico"] === "si" && adesso.getTime() - ultimaVolta > 23 * 3600_000) {
    await admin.from("platform_settings").upsert({ key: "email_esiti_elastic_blocchi_il", value: adesso.toISOString() }, { onConflict: "key" });
    const r = await sincronizzaListaBlocco(admin, apiKey, true, adesso);
    listaBlocco = { da_portare: r.da_portare, scritti: r.scritti, errore: r.errore };
  }

  if (errore) console.error(`[elastic-email-esiti] ${errore}`);
  return Response.json({ ok: !errore, errore, dal: da.toISOString(), cursore: ultimoCursore, ...totale, lista_blocco: listaBlocco }, { status: errore ? 502 : 200 });
});
