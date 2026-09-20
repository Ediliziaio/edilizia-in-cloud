/**
 * company-restore — rimette dentro un backup di company-backup, o prova a farlo.
 *
 * Le azioni:
 *   elenca   → i file di backup disponibili, per azienda o per tutte
 *   prova    → ripristina il backup in uno schema a parte: conta le righe che
 *              entrano, riporta quelle che non entrano, e butta via lo schema.
 *              È la prova che il backup è ripristinabile, non un ripristino.
 *   stato    → a che punto è la prova di un backup a blocchi, e il suo esito
 *   prosegui → (interna) il giro successivo di una prova a blocchi
 *   reale    → ripristino in public, solo per un'azienda purgata; tutto o niente.
 *
 * I BACKUP A BLOCCHI (20/09/2026). Le aziende grandi non si salvano in un file
 * solo ma in una cartella <azienda>/<data>/ con un indice e un file per blocco
 * (vedi company-backup). «elenca» li mostra leggendo l'indice. La loro prova
 * non può passare da admin_ripristina_backup, che vuole il dump intero in un
 * parametro: un dump intero di quelle aziende è proprio ciò che non passa.
 * Quindi la prova si fa a blocchi, come il backup:
 *   · admin_ripristino_prova_apri crea lo schema di prova e le tabelle;
 *   · ogni file dell'indice va a admin_ripristino_prova_versa COSÌ COM'È — i
 *     byte del file dentro il corpo della chiamata, senza aprirlo: il 19/09
 *     company-backup si è fermato per «CPU Time exceeded» proprio trasformando
 *     i blocchi in oggetti e di nuovo in testo;
 *   · un blocco che non passa intero (gli 8 secondi di PostgREST, il peso) si
 *     riprova in quattro pezzi, e solo allora lo si apre;
 *   · admin_ripristino_prova_chiudi conta quello che c'è davvero e butta via
 *     lo schema.
 * Il lavoro dura minuti: la risposta è subito 202 e si prosegue sotto
 * EdgeRuntime.waitUntil; lo stato sta in backup_prove_ripristino e la scheda lo
 * chiede con «stato». Se un giro non basta (l'area super admin sono 300.000
 * righe) la funzione chiama se stessa con «prosegui»: il cursore sta nel
 * database, e «versa» non versa due volte lo stesso blocco.
 *
 * Chiamabile dal super admin dalla pagina o dal cron con x-cron-secret.
 * La logica di ripristino sta nel database: qui si scaricano i file e si passa
 * il testimone. Le regole senza rete stanno in _shared/ripristinoBlocchi.ts.
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serveConMetriche } from "../_shared/withMetrics.ts";
import {
  componiEsito,
  corpoAttornoAlFile,
  cursoreDopo,
  dividiInPezzi,
  giroFinito,
  type IndiceABlocchi,
  leggiPercorsoIndice,
  type Passo,
  pianoDellaProva,
  provaChiusa,
  provaInterrotta,
  riassuntoAvanzamento,
  vaRiprovatoAPezzi,
  type VoceAvanzamento,
} from "../_shared/ripristinoBlocchi.ts";

const BUCKET = "company-exports";
const REGISTRO = "backup_prove_ripristino";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Tre nomi per lo stesso concetto, ereditati da tre epoche: si accettano
// tutti, come fa cronAuth per il resto delle funzioni.
const NOMI_SEGRETO = ["INTERNAL_CRON_SECRET", "PROACTIVE_CRON_SECRET", "CRON_SECRET"];

async function autorizzato(req: Request, db: SupabaseClient): Promise<boolean> {
  const inviato = req.headers.get("x-cron-secret") ?? "";
  const segreti = NOMI_SEGRETO.map((n) => Deno.env.get(n) ?? "").filter(Boolean);
  if (inviato && segreti.includes(inviato)) return true;
  const auth = req.headers.get("authorization") ?? "";
  const jwt = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!jwt) return false;
  const { data: utente } = await db.auth.getUser(jwt);
  if (!utente?.user) return false;
  const { data: ruoli } = await db.from("user_roles").select("role").eq("user_id", utente.user.id);
  return (ruoli ?? []).some((r: { role: string }) => r.role === "super_admin");
}

function json(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

// ---------------------------------------------------------------------------
// La prova di un backup a blocchi
// ---------------------------------------------------------------------------

interface RigaProva {
  id: string;
  percorso: string;
  stato: "in_corso" | "finita" | "fallita";
  passo: number;
  pezzo: number;
  passi_totali: number | null;
  righe_attese: number | null;
  avanzamento: Record<string, VoceAvanzamento> | null;
  conteggi: Record<string, number> | null;
  esito: Record<string, unknown> | null;
  errore: string | null;
  aggiornata_il: string | null;
  finita_il: string | null;
}

/** Quanto si aspetta la risposta di «versa»: PostgREST la ferma a 8 secondi, il resto è il viaggio del blocco. */
const ATTESA_VERSA_MS = 60_000;

/** Fa partire il lavoro in sottofondo, se il runtime lo permette; altrimenti lo aspetta. */
async function inSottofondo(lavoro: Promise<unknown>): Promise<boolean> {
  const runtime = (globalThis as unknown as {
    EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void };
  }).EdgeRuntime;
  if (runtime?.waitUntil) {
    runtime.waitUntil(lavoro);
    return true;
  }
  await lavoro;
  return false;
}

async function scaricaIndice(db: SupabaseClient, percorso: string): Promise<IndiceABlocchi | null> {
  const { data: blob } = await db.storage.from(BUCKET).download(percorso);
  if (!blob) return null;
  try {
    return JSON.parse(await blob.text()) as IndiceABlocchi;
  } catch {
    return null;
  }
}

/** Il messaggio dentro la risposta d'errore di PostgREST, o il suo inizio se non è JSON. */
function messaggioDi(testo: string): string {
  try {
    const m = (JSON.parse(testo) as { message?: string })?.message;
    if (m) return m.slice(0, 200);
  } catch { /* non è JSON: va bene il testo */ }
  return (testo ?? "").slice(0, 200);
}

/**
 * La chiamata a «versa» senza passare da supabase-js: il corpo è un Blob fatto
 * dei byte del file con due pezzetti di testo attorno, e rpc() lo vorrebbe
 * come oggetto. status 0 = la risposta non è arrivata (rete, attesa finita).
 */
async function chiamaVersa(corpo: BodyInit): Promise<{ status: number; testo: string }> {
  const chiave = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  try {
    const risposta = await fetch(`${Deno.env.get("SUPABASE_URL")}/rest/v1/rpc/admin_ripristino_prova_versa`, {
      method: "POST",
      headers: { apikey: chiave, Authorization: `Bearer ${chiave}`, "Content-Type": "application/json" },
      body: corpo,
      signal: AbortSignal.timeout(ATTESA_VERSA_MS),
    });
    return { status: risposta.status, testo: await risposta.text() };
  } catch (e) {
    return { status: 0, testo: (e as Error)?.message ?? "nessuna risposta" };
  }
}

/** Dove andare dopo un passo: il prossimo (passo, pezzo), o fermarsi perché la prova è stata chiusa. */
interface DopoIlPasso { prossimo: number; pezzo: number; fermati: boolean }

const avanti = (c: { passo: number; pezzo: number }): DopoIlPasso => ({ prossimo: c.passo, pezzo: c.pezzo, fermati: false });

/** Il passo non è andato: lo si scrive sulla tabella e il cursore avanza lo stesso. */
async function segnaErrore(provaId: string, passo: Passo, numero: number, pezzo: number, errore: string): Promise<DopoIlPasso> {
  console.warn(`[company-restore] ${passo.tabella}, passo ${numero}: ${errore}`);
  const r = await chiamaVersa(JSON.stringify({
    p_prova_id: provaId, p_tabella: passo.tabella, p_righe: [],
    p_passo: numero, p_pezzo: pezzo, p_ultimo_pezzo: true, p_errore: errore,
  }));
  if (r.status >= 200 && r.status < 300) return avanti(cursoreDopo(r.testo, numero, pezzo, true));
  if (provaChiusa(r.status, r.testo)) return { prossimo: numero, pezzo, fermati: true };
  throw new Error(`il database non risponde (HTTP ${r.status}): ${messaggioDi(r.testo)}`);
}

/** Un passo del piano: scarica il file e lo versa, intero se passa, a pezzi se no. */
async function versaPasso(db: SupabaseClient, provaId: string, passo: Passo, numero: number, pezzoIniziale: number): Promise<DopoIlPasso> {
  const nomeCorto = passo.file.split("/").slice(-2).join("/");
  const { data: blob, error: errFile } = await db.storage.from(BUCKET).download(passo.file);
  if (errFile || !blob) return await segnaErrore(provaId, passo, numero, pezzoIniziale, `file mancante: ${nomeCorto}`);

  if (pezzoIniziale === 0) {
    // Il file così com'è, senza aprirlo (vedi l'intestazione).
    const { prima, dopo } = corpoAttornoAlFile({ provaId, tabella: passo.tabella, passo: numero }, passo.azienda === true);
    const intero = await chiamaVersa(new Blob([prima, blob, dopo], { type: "application/json" }));
    if (intero.status >= 200 && intero.status < 300) return avanti(cursoreDopo(intero.testo, numero, 0, true));
    if (provaChiusa(intero.status, intero.testo)) return { prossimo: numero, pezzo: 0, fermati: true };
    if (passo.azienda || !vaRiprovatoAPezzi(intero.status, intero.testo)) {
      return await segnaErrore(provaId, passo, numero, 0, `${nomeCorto} non è passato (HTTP ${intero.status}): ${messaggioDi(intero.testo)}`);
    }
    console.warn(`[company-restore] ${nomeCorto} non è passato intero (HTTP ${intero.status}): lo riprovo a pezzi`);
  }

  // A pezzi: solo qui il file si apre. Gli stessi pezzi per chiunque riprenda da metà.
  let righe: unknown[];
  try {
    const contenuto = JSON.parse(await blob.text()) as { righe?: unknown[] } | unknown[];
    const elenco = Array.isArray(contenuto) ? contenuto : contenuto?.righe;
    if (!Array.isArray(elenco)) throw new Error("senza righe");
    righe = elenco;
  } catch {
    return await segnaErrore(provaId, passo, numero, pezzoIniziale, `${nomeCorto} non è un blocco leggibile`);
  }
  const pezzi = dividiInPezzi(righe);
  if (pezzoIniziale >= pezzi.length) {
    return await segnaErrore(provaId, passo, numero, pezzoIniziale, `${nomeCorto}: ripresa dal pezzo ${pezzoIniziale + 1}, ma i pezzi sono ${pezzi.length}`);
  }
  for (let k = pezzoIniziale; k < pezzi.length;) {
    const ultimo = k === pezzi.length - 1;
    const r = await chiamaVersa(JSON.stringify({
      p_prova_id: provaId, p_tabella: passo.tabella, p_righe: pezzi[k],
      p_passo: numero, p_pezzo: k, p_ultimo_pezzo: ultimo,
    }));
    if (r.status >= 200 && r.status < 300) {
      // Di norma il pezzo dopo; se un altro giro è già più avanti, da dove dice il cursore.
      const cursore = cursoreDopo(r.testo, numero, k, ultimo);
      if (cursore.passo !== numero) return avanti(cursore);
      k = cursore.pezzo;
      continue;
    }
    if (provaChiusa(r.status, r.testo)) return { prossimo: numero, pezzo: k, fermati: true };
    return await segnaErrore(provaId, passo, numero, k,
      `${nomeCorto}: il pezzo ${k + 1} di ${pezzi.length} non è passato (HTTP ${r.status}): ${messaggioDi(r.testo)}`);
  }
  return { prossimo: numero + 1, pezzo: 0, fermati: false };
}

/** Chiude la prova nel database (conta, butta via lo schema) e scrive l'esito che la scheda sa mostrare. */
async function chiudiProva(
  db: SupabaseClient, provaId: string, percorso: string, stato: "finita" | "fallita",
  errore: string | null, indiceNoto?: IndiceABlocchi | null,
): Promise<void> {
  const { data, error } = await db.rpc("admin_ripristino_prova_chiudi", { p_prova_id: provaId, p_stato: stato, p_errore: errore });
  if (error) throw new Error(`chiusura della prova: ${error.message}`);
  const chiusa = data as { gia_chiusa?: boolean; stato?: string; avanzamento?: Record<string, VoceAvanzamento>; conteggi?: Record<string, number> };
  const indice = indiceNoto ?? await scaricaIndice(db, percorso);
  if (!indice || !Array.isArray(indice.tabelle)) return; // senza indice resta l'errore, che basta
  const esito = componiEsito(indice, percorso, chiusa.avanzamento, chiusa.conteggi, new Date().toISOString());
  // Una prova fallita non è mai «integra», nemmeno se i conti per caso tornano.
  if ((chiusa.gia_chiusa ? chiusa.stato : stato) !== "finita") esito.integro = false;
  await db.from(REGISTRO).update({ esito }).eq("id", provaId);
}

/** Chiede a questa stessa funzione il giro successivo. Due tentativi: «versa» non versa due volte. */
async function passaIlTestimone(provaId: string): Promise<void> {
  const segreto = NOMI_SEGRETO.map((n) => Deno.env.get(n) ?? "").find(Boolean);
  if (!segreto) throw new Error("nessun segreto interno configurato: la prova non può proseguire in un secondo giro");
  let ultimo = "";
  for (let tentativo = 1; tentativo <= 2; tentativo++) {
    try {
      const risposta = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/company-restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-cron-secret": segreto },
        body: JSON.stringify({ azione: "prosegui", prova_id: provaId }),
        signal: AbortSignal.timeout(20_000),
      });
      await risposta.body?.cancel().catch(() => {});
      if (risposta.ok) return;
      ultimo = `HTTP ${risposta.status}`;
    } catch (e) {
      ultimo = (e as Error)?.message ?? "nessuna risposta";
    }
  }
  throw new Error(`il giro successivo della prova non è partito (${ultimo})`);
}

/** Un giro di lavoro: dal cursore in avanti, finché c'è tempo; poi chiude o passa il testimone. */
async function giro(db: SupabaseClient, provaId: string): Promise<void> {
  const inizio = Date.now();
  let percorso = "";
  try {
    const { data: riga, error } = await db.from(REGISTRO).select("percorso, stato, passo, pezzo").eq("id", provaId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!riga || riga.stato !== "in_corso") return;
    percorso = String(riga.percorso);

    const indice = await scaricaIndice(db, percorso);
    const piano = pianoDellaProva(indice, percorso);
    if (!piano.ok) {
      await chiudiProva(db, provaId, percorso, "fallita", piano.errore, indice);
      return;
    }

    let numero = Number(riga.passo ?? 0);
    let pezzo = Number(riga.pezzo ?? 0);
    while (numero < piano.piano.length) {
      if (giroFinito(inizio, Date.now())) {
        await passaIlTestimone(provaId);
        return;
      }
      const dopo = await versaPasso(db, provaId, piano.piano[numero], numero, pezzo);
      if (dopo.fermati) return;
      numero = dopo.prossimo;
      pezzo = dopo.pezzo;
    }
    await chiudiProva(db, provaId, percorso, "finita", null, indice);
    console.log(JSON.stringify({ fn: "company-restore", prova: provaId, percorso, passi: piano.piano.length, durata_s: Math.round((Date.now() - inizio) / 1000) }));
  } catch (e) {
    const messaggio = (e as Error)?.message ?? "errore sconosciuto";
    console.error(`[company-restore] prova ${provaId}:`, messaggio);
    // Niente copia dei dati lasciata in giro: si chiude comunque, da fallita.
    await chiudiProva(db, provaId, percorso, "fallita", messaggio).catch((e2) =>
      console.error(`[company-restore] prova ${provaId}, chiusura:`, (e2 as Error)?.message ?? e2));
  }
}

/** Lo stato di una prova come lo vuole la scheda: avanzamento finché gira, esito quando ha finito. */
async function statoProva(db: SupabaseClient, provaId: string): Promise<Response> {
  const leggi = async () =>
    (await db.from(REGISTRO).select("*").eq("id", provaId).maybeSingle()).data as RigaProva | null;
  let riga = await leggi();
  if (!riga) return json({ ok: false, error: "Prova non trovata" }, 404);

  // Una prova muta da dieci minuti è morta: la si chiude qui, così la copia dei
  // dati non resta in giro e la scheda smette di aspettare.
  if (provaInterrotta(riga.stato, riga.aggiornata_il, Date.now())) {
    await chiudiProva(db, provaId, riga.percorso, "fallita", "Interrotta: nessun segno di vita da più di dieci minuti");
    riga = await leggi() ?? riga;
  } else if (riga.stato !== "in_corso" && !riga.esito) {
    // Chiusa, ma l'esito non è stato scritto (la funzione si è fermata tra le due cose): si ricompone dai conti.
    const indice = await scaricaIndice(db, riga.percorso);
    if (indice && Array.isArray(indice.tabelle)) {
      const esito = componiEsito(indice, riga.percorso, riga.avanzamento, riga.conteggi, riga.finita_il ?? new Date().toISOString());
      if (riga.stato !== "finita") esito.integro = false;
      await db.from(REGISTRO).update({ esito }).eq("id", provaId);
      riga = await leggi() ?? riga;
    }
  }

  return json({
    ok: riga.stato !== "fallita",
    prova_id: riga.id,
    percorso: riga.percorso,
    stato: riga.stato,
    in_corso: riga.stato === "in_corso",
    avanzamento: riassuntoAvanzamento(riga),
    ...(riga.stato === "in_corso" ? {} : { esito: esitoPerLaScheda(riga) }),
  });
}

/** L'esito di una prova chiusa, nel formato della scheda: quello del file unico, con `error` se è fallita. */
function esitoPerLaScheda(riga: Pick<RigaProva, "stato" | "esito" | "errore" | "finita_il">): Record<string, unknown> {
  return {
    ok: riga.stato === "finita",
    ...(riga.esito ?? { integro: false }),
    ...(riga.stato === "fallita" ? { integro: false, error: riga.errore ?? "La prova non è arrivata in fondo" } : {}),
    provata_il: riga.finita_il,
  };
}

serveConMetriche("company-restore", async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  try {
    if (!await autorizzato(req, db)) return json({ error: "Non autorizzato" }, 401);

    const corpo = await req.json().catch(() => ({}));
    const azione = String(corpo.azione ?? "prova");

    if (azione === "elenca") {
      const prefisso = corpo.companyId ? `${corpo.companyId}` : "";
      const cartelle = prefisso
        ? [prefisso]
        : ((await db.storage.from(BUCKET).list("", { limit: 500 })).data ?? [])
            .filter((o) => !o.name.includes(".")).map((o) => o.name);

      // L'ultima prova di ogni backup a blocchi, così la scheda la mostra anche
      // dopo aver ricaricato la pagina. Solo per la scheda di un'azienda: nell'
      // elenco di tutte sarebbero centinaia di esiti che nessuno guarda.
      const ultimeProve = new Map<string, Record<string, unknown>>();
      if (prefisso) {
        const { data: prove } = await db.from(REGISTRO)
          .select("id, percorso, stato, esito, errore, finita_il")
          .eq("azienda_id", prefisso).order("avviata_il", { ascending: false }).limit(30);
        for (const p of (prove ?? []) as Array<Pick<RigaProva, "id" | "percorso" | "stato" | "esito" | "errore" | "finita_il">>) {
          if (ultimeProve.has(p.percorso)) continue;
          ultimeProve.set(p.percorso, p.stato === "in_corso"
            ? { prova_id: p.id, stato: p.stato }
            : { prova_id: p.id, stato: p.stato, esito: esitoPerLaScheda(p) });
        }
      }

      const file: Array<{
        percorso: string; dimensione: number; creato_il: string | null;
        a_blocchi?: boolean; completo?: boolean; righe?: number; tabelle?: number;
        ultima_prova?: Record<string, unknown>;
      }> = [];
      for (const cartella of cartelle) {
        const { data } = await db.storage.from(BUCKET).list(cartella, { limit: 100, sortBy: { column: "name", order: "desc" } });
        // Le cartelle con una data per nome sono backup a blocchi: si legge
        // l'indice (piccolo) per dire quante righe tiene e se è completo.
        // Solo le ultime sei: ogni indice è un file da scaricare.
        const aBlocchi = (data ?? []).filter((o) => /^\d{4}-\d{2}-\d{2}$/.test(o.name)).slice(0, 6);
        for (const o of aBlocchi) {
          const percorso = `${cartella}/${o.name}/indice.json`;
          const { data: blob } = await db.storage.from(BUCKET).download(percorso);
          if (!blob) continue; // cartella senza indice: backup mai arrivato in fondo
          try {
            const indice = JSON.parse(await blob.text()) as {
              esportato_il?: string; completo?: boolean; tabelle?: Array<{ righe_salvate?: number }>;
            };
            file.push({
              percorso,
              dimensione: 0,
              creato_il: indice.esportato_il ?? null,
              a_blocchi: true,
              completo: indice.completo === true,
              righe: (indice.tabelle ?? []).reduce((n, t) => n + Number(t.righe_salvate ?? 0), 0),
              tabelle: (indice.tabelle ?? []).length,
              ...(ultimeProve.has(percorso) ? { ultima_prova: ultimeProve.get(percorso) } : {}),
            });
          } catch {
            // indice illeggibile: non lo si mostra come backup
          }
        }
        for (const o of data ?? []) {
          if (!o.name.endsWith(".json")) continue;
          file.push({
            percorso: `${cartella}/${o.name}`,
            dimensione: Number((o.metadata as Record<string, unknown> | null)?.size ?? 0),
            creato_il: o.created_at ?? null,
          });
        }
      }
      return json({ ok: true, file });
    }

    if (azione === "stato") {
      const provaId = String(corpo.prova_id ?? "");
      if (!provaId) return json({ error: "prova_id obbligatorio" }, 400);
      return await statoProva(db, provaId);
    }

    if (azione === "prosegui") {
      const provaId = String(corpo.prova_id ?? "");
      if (!provaId) return json({ error: "prova_id obbligatorio" }, 400);
      const avviato = await inSottofondo(giro(db, provaId));
      return json({ ok: true, prova_id: provaId, avviato }, avviato ? 202 : 200);
    }

    const percorso = String(corpo.percorso ?? "");
    if (!percorso || percorso.includes("..")) return json({ error: "percorso obbligatorio" }, 400);

    if (percorso.endsWith("/indice.json")) {
      // Un backup a blocchi. Il ripristino reale di questo formato non esiste:
      // si dice, invece di passare l'indice ad admin_ripristina_backup.
      if (azione === "reale") {
        return json({ ok: false, percorso, error: "Il ripristino reale di un backup a blocchi non è disponibile: per questo formato c'è solo la prova." }, 422);
      }
      if (!leggiPercorsoIndice(percorso)) return json({ error: "Il percorso non è quello dell'indice di un backup a blocchi" }, 400);
      const indice = await scaricaIndice(db, percorso);
      if (!indice) return json({ error: `Indice non trovato o illeggibile: ${percorso}` }, 404);
      const piano = pianoDellaProva(indice, percorso);
      if (!piano.ok) return json({ ok: false, percorso, error: piano.errore }, 422);

      const { data: aperta, error: errApri } = await db.rpc("admin_ripristino_prova_apri", {
        p_company_id: piano.companyId, p_percorso: percorso, p_tabelle: piano.tabelle,
        p_passi: piano.piano.length, p_righe: piano.righe,
      });
      if (errApri) return json({ ok: false, percorso, error: errApri.message }, 500);
      const prova = aperta as { prova_id: string; gia_in_corso?: boolean; percorso?: string };
      // Una prova per azienda alla volta: chi arriva secondo si aggancia a quella che gira.
      if (prova.gia_in_corso) {
        return json({ ok: true, in_corso: true, gia_in_corso: true, prova_id: prova.prova_id, percorso: prova.percorso ?? percorso }, 202);
      }

      const avviato = await inSottofondo(giro(db, prova.prova_id));
      if (!avviato) return await statoProva(db, prova.prova_id); // runtime senza waitUntil: è già finita
      return json({ ok: true, in_corso: true, prova_id: prova.prova_id, percorso }, 202);
    }

    const modo = azione === "reale" ? "reale" : "prova";

    const { data: blob, error: errFile } = await db.storage.from(BUCKET).download(percorso);
    if (errFile || !blob) return json({ error: `File non trovato: ${errFile?.message ?? percorso}` }, 404);

    let dump: unknown;
    try {
      dump = JSON.parse(await blob.text());
    } catch {
      return json({ error: "Il file non è un JSON valido" }, 422);
    }

    const { data, error } = await db.rpc("admin_ripristina_backup", {
      p_dump: dump, p_modo: modo, p_conserva_schema: corpo.conserva_schema === true,
    });
    if (error) return json({ ok: false, modo, percorso, error: error.message }, 500);

    return json({ ok: true, percorso, ...(data as Record<string, unknown>) });
  } catch (e) {
    console.error("[company-restore]", e);
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});
