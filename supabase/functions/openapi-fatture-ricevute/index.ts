// openapi-fatture-ricevute — le fatture dei fornitori arrivate su openapi.it,
// registrate in Fatture ricevute.
//
// Perché esiste (24/09/2026): con openapi si inviava, ma le fatture passive
// entravano solo a mano, un file o uno zip alla volta. Un'azienda che registra
// all'Agenzia delle Entrate il codice destinatario di openapi (PIC7CPS) riceve
// lì le fatture dei fornitori: questa funzione le porta nell'app da sola.
//
// Tre modi di chiamarla:
//   · il cron `openapi-fatture-ricevute-ora` (x-cron-secret), ogni ora: per
//     ogni azienda registrata la prima pagina dell'elenco, e una volta al giorno
//     l'elenco intero (non sappiamo in che ordine lo restituisce openapi);
//   · openapi stesso, quando arriva una fattura (callback registrata da
//     sdi-onboarding, intestazione x-callback-token): del corpo si usa solo
//     l'id, la fattura si rilegge col nostro token;
//   · l'app, dal pulsante «Controlla adesso» (JWT dell'utente + company_id):
//     l'elenco intero di quell'azienda.
//
// Costi, sul conto openapi della piattaforma: le GET sono gratis fino a 1.000
// al giorno per tutto l'account, poi 0,001 € l'una. Ogni azienda costa una GET
// all'ora, più una ogni cento fatture ricevute nel giro completo del giorno;
// ogni fattura nuova ne costa due (la fattura e il suo file).
//
// Risposta rapida (serveConMetricheRapida): a pg_net si risponde entro 5
// secondi, il giro finisce in background. Vedi «Cron e pg_net» in CLAUDE.md.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { DOMParser } from "https://deno.land/x/deno_dom@v0.1.45/deno-dom-wasm.ts";
import { getCorsHeaders } from "../_shared/headers.ts";
import { serveConMetricheRapida } from "../_shared/withMetricsRapida.ts";
import { chiamataInternaValida, rispostaNonAutorizzata } from "../_shared/chiamataInterna.ts";
import { verifyCompanyAccess } from "../_shared/companyAuth.ts";
import { leggiImpostazionePiattaforma } from "../_shared/getPlatformSetting.ts";
import type { LettoreXml } from "../_shared/fatturapaReader.ts";
import { leggiFatturaRicevuta } from "../_shared/fatturaRicevutaXml.ts";
import { avvisaFatturaRicevuta, salvaFatturaRicevuta } from "../_shared/salvaFatturaRicevuta.ts";
import {
  allegatoFattura,
  fatturaRicevutaPer,
  fileOriginale,
  fiscalIdFattura,
  gettoneCallback,
  giroCompletoDovuto,
  idDaCallback,
  identificativoSdi,
  lunghezzaElenco,
  nomeFileSdi,
  stessoGettone,
  testoFileDaJson,
  vociElenco,
  xmlDaFile,
} from "../_shared/ricevuteOpenapi.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

/** Il massimo che openapi dà per pagina. */
const PER_PAGINA = 100;
/** Giro completo: fino a 3.000 fatture per azienda. */
const PAGINE_MASSIME = 30;
/**
 * Fatture nuove scaricate per giro, tra tutte le aziende. Il limite vero è la
 * CPU del worker (2 secondi): una fattura con un PDF allegato dentro l'XML
 * pesa megabyte. Quelle in più restano nuove e passano al giro dopo.
 */
const NUOVE_PER_GIRO = 12;
/** Aziende per giro, dalle guardate meno di recente: a rotazione. */
const AZIENDE_PER_GIRO = 50;
/** Dopo tre tentativi falliti una fattura si lascia a chi guarda il registro. */
const TENTATIVI_MASSIMI = 3;
const ATTESA_MS = 15_000;

interface Accesso {
  token: string;
  base: string;
}

interface Config {
  company_id: string;
  fiscal_id: string;
  ricevute_giro_completo_at?: string | null;
}

type Esito =
  | { esito: "nuova"; id: string | null }
  | { esito: "doppione"; id: string | null }
  | { esito: "saltata"; motivo: string }
  | { esito: "errore"; motivo: string };

async function accessoOpenapi(): Promise<Accesso | null> {
  // Il token dal 19/09/2026 sta nel Vault. Mai `??` qui: vuoto è "".
  const token = ((await leggiImpostazionePiattaforma("openapi_it_token")) || Deno.env.get("OPENAPI_IT_TOKEN") || "").trim();
  if (!token) return null;
  const { data } = await supabase.from("platform_settings").select("value").eq("key", "openapi_env").maybeSingle();
  const env = String(data?.value || "prod").toLowerCase();
  const base = env === "sandbox" || env === "test" ? "https://test.invoice.openapi.com" : "https://invoice.openapi.com";
  return { token, base };
}

async function chiedi(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ATTESA_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

const conToken = (acc: Accesso, accetta = "application/json") => ({
  Authorization: `Bearer ${acc.token}`,
  Accept: accetta,
});

/** La fattura com'è su openapi: dettagli, stato SDI, allegati. */
async function leggiFatturaOpenapi(acc: Accesso, id: string): Promise<{ fattura: unknown } | { errore: string }> {
  const r = await chiedi(`${acc.base}/IT-invoices/${encodeURIComponent(id)}`, { headers: conToken(acc) });
  if (!r.ok) return { errore: `openapi ha risposto ${r.status} per la fattura ${id}` };
  const fattura = await r.json().catch((): null => null) as unknown;
  return fattura ? { fattura } : { errore: `risposta di openapi non leggibile per la fattura ${id}` };
}

/**
 * Il file della fattura. Prima l'allegato (un indirizzo temporaneo, spesso
 * firmato: si chiama SENZA il nostro token, che un indirizzo firmato
 * rifiuterebbe); se non c'è, il documento stesso chiesto come XML, come dice
 * la documentazione di openapi.
 */
async function scaricaFile(acc: Accesso, id: string, fattura: unknown): Promise<Uint8Array | { errore: string }> {
  const allegato = allegatoFattura(fattura);
  if (allegato) {
    let r = await chiedi(allegato.url);
    if (r.status === 401 || r.status === 403) r = await chiedi(allegato.url, { headers: conToken(acc, "*/*") });
    if (r.ok) return new Uint8Array(await r.arrayBuffer());
    await r.body?.cancel();
  }
  const r = await chiedi(`${acc.base}/IT-invoices/${encodeURIComponent(id)}`, {
    headers: { ...conToken(acc, "application/xml"), "Content-Type": "application/xml" },
  });
  if (!r.ok) {
    await r.body?.cancel();
    return { errore: `file della fattura non scaricabile (HTTP ${r.status})` };
  }
  const byte = new Uint8Array(await r.arrayBuffer());
  if (/json/i.test(r.headers.get("content-type") ?? "")) {
    let json: unknown = null;
    try {
      json = JSON.parse(new TextDecoder().decode(byte));
    } catch {
      // Non era JSON: si prova a leggerlo com'è.
    }
    const testo = json ? testoFileDaJson(json) : null;
    if (testo) return new TextEncoder().encode(testo);
  }
  return byte;
}

async function registraErrore(cfg: Config, id: string, motivo: string) {
  await supabase.from("sdi_log").insert({
    company_id: cfg.company_id,
    evento: "ricevuta_openapi_errore",
    sdi_id: id,
    messaggio: motivo.slice(0, 1000),
  });
}

/** Una fattura, dall'id openapi alla riga in Fatture ricevute. */
async function importaUna(acc: Accesso, cfg: Config, id: string, giaLetta?: unknown): Promise<Esito> {
  let fattura = giaLetta;
  if (fattura === undefined) {
    const letta = await leggiFatturaOpenapi(acc, id);
    if ("errore" in letta) return { esito: "errore", motivo: letta.errore };
    fattura = letta.fattura;
  }
  if (!fatturaRicevutaPer(fattura, cfg.fiscal_id)) {
    return { esito: "saltata", motivo: "non è una fattura ricevuta per questa azienda" };
  }

  const file = await scaricaFile(acc, id, fattura);
  if ("errore" in file) return { esito: "errore", motivo: file.errore };
  const xml = xmlDaFile(file);
  if (!xml) return { esito: "errore", motivo: `il file (${file.length} byte) non contiene una fattura leggibile` };
  const letta = leggiFatturaRicevuta(xml, new DOMParser() as unknown as LettoreXml);
  if (!letta) return { esito: "errore", motivo: "fattura senza fornitore, numero o data" };

  const idSdi = identificativoSdi(fattura);
  const salvata = await salvaFatturaRicevuta(supabase, {
    companyId: cfg.company_id,
    xml,
    letta,
    originale: fileOriginale(file),
    nomeFileSdi: nomeFileSdi(fattura),
    openapiId: id,
    identificativoSdi: idSdi,
  });
  if (salvata.errore) return { esito: "errore", motivo: salvata.errore };
  if (salvata.doppione) return { esito: "doppione", id: salvata.id };

  await supabase.from("sdi_log").insert({
    company_id: cfg.company_id,
    evento: "fattura_ricevuta",
    sdi_id: idSdi ?? id,
    messaggio: `Fattura ricevuta da ${letta.cedente_ragione_sociale} - ${letta.numero_fattura} (openapi)`,
  });
  if (salvata.id) await avvisaFatturaRicevuta(supabase, cfg.company_id, salvata.id, letta);
  return { esito: "nuova", id: salvata.id };
}

interface Riepilogo {
  company_id: string;
  completo: boolean;
  pagine: number;
  nuove: number;
  importate: number;
  doppioni: number;
  fallite: number;
  rimandate: number;
  errore: string | null;
}

async function giroAzienda(acc: Accesso, cfg: Config, completo: boolean, budget: { resto: number }): Promise<Riepilogo> {
  const r: Riepilogo = {
    company_id: cfg.company_id, completo, pagine: 0, nuove: 0,
    importate: 0, doppioni: 0, fallite: 0, rimandate: 0, errore: null,
  };
  const nuove: string[] = [];
  let finito = false;

  for (let skip = 0; r.pagine < (completo ? PAGINE_MASSIME : 1); skip += PER_PAGINA) {
    const url = `${acc.base}/IT-invoices?fiscal_id=${cfg.fiscal_id}&direction=incoming&limit=${PER_PAGINA}&skip=${skip}`;
    let pagina: unknown;
    try {
      const risposta = await chiedi(url, { headers: conToken(acc) });
      if (!risposta.ok) {
        r.errore = `Openapi non ha dato l'elenco delle fatture (risposta ${risposta.status}): si riprova al prossimo controllo.`;
        await risposta.body?.cancel();
        break;
      }
      pagina = await risposta.json();
    } catch (e) {
      console.error(`[openapi-fatture-ricevute] elenco ${cfg.company_id}: ${String(e)}`);
      r.errore = "Openapi non ha risposto: si riprova al prossimo controllo.";
      break;
    }
    r.pagine++;

    const ids = vociElenco(pagina).map((v) => v.id);
    if (ids.length > 0) {
      // Solo gli id di questa pagina: PostgREST taglia a mille righe, e
      // un'azienda può averne di più.
      const { data: note, error } = await supabase.from("fatture_ricevute")
        .select("openapi_id").eq("company_id", cfg.company_id).in("openapi_id", ids);
      if (error) {
        r.errore = `Errore interno nel confronto con le fatture già registrate: ${error.message}`;
        break;
      }
      const noti = new Set(((note ?? []) as Array<{ openapi_id: string }>).map((n) => n.openapi_id));
      for (const id of ids) if (!noti.has(id) && !nuove.includes(id)) nuove.push(id);
    }
    if (lunghezzaElenco(pagina) < PER_PAGINA) {
      finito = true;
      break;
    }
  }
  r.nuove = nuove.length;

  // Quelle che hanno già fallito tre volte restano nel registro per una persona.
  // A blocchi di cento: tremila id in un colpo solo non stanno in un indirizzo.
  const conta = new Map<string, number>();
  for (let i = 0; i < nuove.length; i += PER_PAGINA) {
    const { data: falliti } = await supabase.from("sdi_log").select("sdi_id")
      .eq("company_id", cfg.company_id).eq("evento", "ricevuta_openapi_errore")
      .in("sdi_id", nuove.slice(i, i + PER_PAGINA));
    for (const f of (falliti ?? []) as Array<{ sdi_id: string }>) conta.set(f.sdi_id, (conta.get(f.sdi_id) ?? 0) + 1);
  }
  const daFare = nuove.filter((id) => (conta.get(id) ?? 0) < TENTATIVI_MASSIMI);

  for (const id of daFare) {
    if (budget.resto <= 0) {
      r.rimandate++;
      continue;
    }
    budget.resto--;
    let e: Esito;
    try {
      e = await importaUna(acc, cfg, id);
    } catch (err) {
      e = { esito: "errore", motivo: String(err) };
    }
    if (e.esito === "nuova") r.importate++;
    else if (e.esito === "doppione") r.doppioni++;
    else {
      // Anche una «saltata» si annota: resterebbe nuova per sempre, e ogni giro
      // la richiederebbe a openapi. Dopo tre volte la si lascia stare.
      if (e.esito === "errore") r.fallite++;
      await registraErrore(cfg, id, e.esito === "saltata" ? `saltata: ${e.motivo}` : e.motivo);
      console.error(`[openapi-fatture-ricevute] ${cfg.company_id} ${id}: ${e.motivo}`);
    }
  }

  const adesso = new Date().toISOString();
  const patch: Record<string, unknown> = {
    ricevute_controllate_at: adesso,
    // Il dettaglio per fattura è in sdi_log (ricevuta_openapi_errore); qui la
    // frase per chi guarda Impostazioni → Fatturazione.
    ricevute_ultimo_errore: r.errore ??
      (r.fallite > 0
        ? `${r.fallite === 1 ? "1 fattura non è stata importata" : `${r.fallite} fatture non sono state importate`}: ` +
          "si riprova al prossimo controllo, fino a tre volte. Se l'avviso resta, avvisa l'assistenza."
        : null),
  };
  // Il giro completo vale solo se è arrivato in fondo e non ha lasciato indietro niente.
  if (completo && finito && !r.errore && r.rimandate === 0) patch.ricevute_giro_completo_at = adesso;
  await supabase.from("sdi_cedente_config").update(patch).eq("company_id", cfg.company_id);
  return r;
}

async function giro(soloAzienda: string | null, forzaCompleto: boolean) {
  let q = supabase.from("sdi_cedente_config")
    .select("company_id, fiscal_id, ricevute_giro_completo_at")
    .eq("provider", "openapi")
    .in("stato", ["registrato", "attivo"])
    .not("fiscal_id", "is", null);
  if (soloAzienda) q = q.eq("company_id", soloAzienda);
  const { data: aziende, error } = await q
    .order("ricevute_controllate_at", { ascending: true, nullsFirst: true })
    .limit(AZIENDE_PER_GIRO);
  if (error) return { ok: false, errore: error.message };
  if (!aziende?.length) return { ok: true, aziende: 0 };

  const acc = await accessoOpenapi();
  if (!acc) return { ok: false, motivo: "token_mancante", aziende: aziende.length };

  const budget = { resto: NUOVE_PER_GIRO };
  const esiti: Riepilogo[] = [];
  for (const cfg of aziende as Config[]) {
    const completo = forzaCompleto || giroCompletoDovuto(cfg.ricevute_giro_completo_at);
    esiti.push(await giroAzienda(acc, cfg, completo, budget));
  }
  const somma = (k: keyof Riepilogo) => esiti.reduce((s, e) => s + (Number(e[k]) || 0), 0);
  return {
    ok: true,
    aziende: esiti.length,
    importate: somma("importate"),
    doppioni: somma("doppioni"),
    fallite: somma("fallite"),
    rimandate: somma("rimandate"),
    esiti,
  };
}

/** Il corpo di una callback, JSON o modulo: serve solo a trovare l'id. */
async function corpoCallback(req: Request): Promise<{ corpo: unknown; testo: string }> {
  const testo = await req.text();
  const tipo = req.headers.get("content-type") ?? "";
  if (/form-urlencoded/i.test(tipo)) return { corpo: Object.fromEntries(new URLSearchParams(testo)), testo };
  try {
    return { corpo: JSON.parse(testo), testo };
  } catch {
    return { corpo: testo, testo };
  }
}

serveConMetricheRapida("openapi-fatture-ricevute", async (req) => {
  const cors = { ...getCorsHeaders(req), "Access-Control-Allow-Methods": "POST, OPTIONS" };
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    // 1. openapi: è arrivata una fattura.
    const gettone = req.headers.get("x-callback-token");
    if (gettone !== null) {
      const chiave = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
      if (!chiave || !stessoGettone(gettone, await gettoneCallback(chiave))) return rispostaNonAutorizzata(cors);

      const { corpo, testo } = await corpoCallback(req);
      const id = idDaCallback(corpo);
      if (!id) {
        // Niente da importare: la vedrà il giro orario, se è una fattura.
        console.warn(`[openapi-fatture-ricevute] callback senza id: ${testo.slice(0, 500)}`);
        return json({ ok: true, ignorata: true });
      }
      const acc = await accessoOpenapi();
      if (!acc) return json({ ok: false, motivo: "token_mancante" }, 503);
      const letta = await leggiFatturaOpenapi(acc, id);
      if ("errore" in letta) return json({ ok: false, errore: letta.errore }, 502);

      // L'azienda la dice la fattura riletta da openapi, non il corpo della chiamata.
      const fiscalId = fiscalIdFattura(letta.fattura);
      const { data: cfg } = fiscalId
        ? await supabase.from("sdi_cedente_config").select("company_id, fiscal_id")
          .eq("provider", "openapi").eq("fiscal_id", fiscalId).limit(1).maybeSingle()
        : { data: null };
      if (!cfg) {
        console.warn(`[openapi-fatture-ricevute] callback ${id}: nessuna azienda con partita IVA ${fiscalId ?? "—"}`);
        return json({ ok: true, ignorata: true });
      }
      const esito = await importaUna(acc, cfg as Config, id, letta.fattura);
      if (esito.esito === "errore") await registraErrore(cfg as Config, id, esito.motivo);
      return json({ ok: esito.esito !== "errore", ...esito });
    }

    // 2. Il cron, o un'altra nostra funzione.
    if (chiamataInternaValida(req)) {
      const corpo = await req.json().catch(() => ({})) as { company_id?: string; completo?: boolean };
      return json(await giro(corpo.company_id ?? null, !!corpo.completo));
    }

    // 3. L'app: «Controlla adesso».
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return rispostaNonAutorizzata(cors);
    const { data: { user } } = await supabase.auth.getUser(auth.slice("Bearer ".length));
    if (!user) return rispostaNonAutorizzata(cors);
    const { company_id } = await req.json().catch(() => ({})) as { company_id?: string };
    if (!company_id) return json({ error: "company_id obbligatorio" }, 400);
    try {
      await verifyCompanyAccess(supabase, user.id, company_id);
    } catch {
      return json({ error: "Accesso negato a questa azienda" }, 403);
    }
    // Un clic ripetuto non rifà il giro: ogni pagina dell'elenco è una GET.
    const { data: stato } = await supabase.from("sdi_cedente_config")
      .select("ricevute_controllate_at").eq("company_id", company_id).maybeSingle();
    const ultimo = Date.parse(String(stato?.ricevute_controllate_at ?? ""));
    if (Number.isFinite(ultimo) && Date.now() - ultimo < 60_000) {
      return json({ ok: true, appena_controllato: true, importate: 0 });
    }
    return json(await giro(company_id, true));
  } catch (e) {
    console.error("[openapi-fatture-ricevute]", e);
    return json({ error: String(e) }, 500);
  }
});
