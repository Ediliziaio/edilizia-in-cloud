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
  const totale = { letti: 0, esiti: {} as Record<string, number>, scritti: {} as Record<string, unknown>, rimborsi: 0, pagine: 0 };
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
      totale.scritti = data ?? {};

      // Rimborso del credito sui rimbalzi definitivi, solo da rimborsi_dal.
      for (const e of esiti) {
        if (e.tipo !== "rimbalzo_definitivo" || !e.msg_id || e.quando < rimborsiDal) continue;
        const { error: errRimborso } = await admin.rpc("refund_email_credit_on_bounce", {
          p_provider_message_id: e.msg_id, p_reason: e.motivo ?? "hard_bounce",
        });
        if (!errRimborso) totale.rimborsi++;
      }
    }
    // Il cursore avanza solo dopo che la pagina è stata scritta.
    ultimoCursore = nuovoCursore(esiti, ultimoCursore);
    if (eventi.length < PER_PAGINA) break;
  }

  if (!errore && ultimoCursore && ultimoCursore !== cursore) {
    await admin.from("platform_settings").upsert({ key: CHIAVE_CURSORE, value: ultimoCursore }, { onConflict: "key" });
  } else if (!errore && !cursore) {
    // Nessun evento nello storico: si parte da adesso, per non rileggerlo ogni volta.
    await admin.from("platform_settings").upsert({ key: CHIAVE_CURSORE, value: adesso.toISOString() }, { onConflict: "key" });
  }

  if (errore) console.error(`[elastic-email-esiti] ${errore}`);
  return Response.json({ ok: !errore, errore, dal: da.toISOString(), cursore: ultimoCursore, ...totale }, { status: errore ? 502 : 200 });
});
