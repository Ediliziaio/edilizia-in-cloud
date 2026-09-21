// Chiede a openapi.it com'è finita ogni fattura trasmessa allo SDI.
//
// Perché esiste: invia-sdi metteva la fattura in «attesa esito» (AT) e lì
// finiva. A openapi non veniva registrato nessun indirizzo di richiamo, nessun
// lavoro andava a chiedere l'esito, e il webhook che c'era cercava il documento
// con un identificativo diverso da quello salvato. Così ricevute di consegna e
// scarti non arrivavano mai: sdi_log e sdi_provider_responses erano vuoti al
// 20/09/2026, e una fattura scartata restava «inviata» senza che nessuno lo
// sapesse.
//
// Come funziona: ogni quarto d'ora prende i documenti ancora senza esito
// definitivo e per ciascuno chiede GET {base}/IT-invoices/{id}. La traduzione
// dello stato sta in _shared/sdiStatoOpenapi.ts; quello che non si riconosce
// NON cambia il documento e finisce in sdi_log, così la prima fattura vera ci
// dice il vocabolario esatto del provider.
//
// Chiamata dal cron `sdi-stato-quarto-dora` con x-cron-secret, oppure a mano
// con la service-role key. verify_jwt = false in supabase/config.toml: pg_cron
// non manda nessun JWT, il controllo lo fa la funzione qui sotto.
//
// Risposta rapida (serveConMetricheRapida): quaranta documenti con 15 secondi
// di attesa ciascuno possono durare minuti, e pg_net ha una coda sola per tutti
// i cron — vedi «Cron e pg_net» in CLAUDE.md. A pg_net si risponde entro 5
// secondi, il giro finisce in background.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";
import { serveConMetricheRapida } from "../_shared/withMetricsRapida.ts";
import { leggiImpostazionePiattaforma } from "../_shared/getPlatformSetting.ts";
import { estraiIdentificativoSdi, leggiEsitoOpenapi } from "../_shared/sdiStatoOpenapi.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

/** Documenti guardati per giro: tiene la chiamata lontana dai limiti. */
const PER_GIRO = 40;
/** Stati SDI già definitivi: non si chiede più niente. */
const DEFINITIVI = ["NS", "EC01", "EC02", "DT"];

serveConMetricheRapida("sdi-stato-tick", async (req) => {
  const cors = { ...getCorsHeaders(req), "Access-Control-Allow-Methods": "POST, OPTIONS" };
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });

  const cronHeader = req.headers.get("x-cron-secret") || "";
  const token = req.headers.get("Authorization")?.replace("Bearer ", "") || "";
  const autorizzato =
    (!!cronHeader &&
      (cronHeader === Deno.env.get("PROACTIVE_CRON_SECRET") ||
        cronHeader === Deno.env.get("INTERNAL_CRON_SECRET"))) ||
    (!!token && token === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
  if (!autorizzato) return json({ error: "non autorizzato" }, 401);

  try {
    // Documenti trasmessi davvero (non in modalità manuale) e senza esito finale.
    const { data: documenti, error } = await supabase
      .from("documenti_fiscali")
      .select("id, company_id, numero, sdi_id_trasmissione, sdi_stato, stato, trasmissione")
      .not("sdi_id_trasmissione", "is", null)
      .eq("trasmissione", "sdi")
      .is("deleted_at", null)
      .or(`sdi_stato.is.null,sdi_stato.not.in.(${DEFINITIVI.join(",")})`)
      .order("updated_at", { ascending: true })
      .limit(PER_GIRO);
    if (error) return json({ error: error.message }, 500);
    if (!documenti?.length) return json({ ok: true, guardati: 0 });

    const tokenOpenapi = ((await leggiImpostazionePiattaforma("openapi_it_token")) || "").trim();
    if (!tokenOpenapi) return json({ ok: false, motivo: "token_mancante", guardati: 0 });

    const { data: envRow } = await supabase
      .from("platform_settings").select("value").eq("key", "openapi_env").maybeSingle();
    const env = (envRow?.value || "prod").toLowerCase();
    const base = env === "sandbox" || env === "test" ? "test.invoice.openapi.com" : "invoice.openapi.com";

    let aggiornati = 0;
    let sconosciuti = 0;
    let falliti = 0;

    for (const doc of documenti) {
      // Gli invii in modalità manuale hanno un id finto: non si chiede niente.
      if (String(doc.sdi_id_trasmissione).startsWith("MAN-")) continue;

      let grezzo: unknown = null;
      let httpStatus = 0;
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15_000);
        const r = await fetch(`https://${base}/IT-invoices/${encodeURIComponent(doc.sdi_id_trasmissione!)}`, {
          headers: { Authorization: `Bearer ${tokenOpenapi}` },
          signal: controller.signal,
        });
        clearTimeout(timeout);
        httpStatus = r.status;
        grezzo = await r.json().catch(() => null);
      } catch (e) {
        falliti++;
        console.error(`[sdi-stato-tick] ${doc.id}: ${String(e)}`);
        continue;
      }

      await supabase.from("sdi_provider_responses").insert({
        company_id: doc.company_id,
        documento_id: doc.id,
        provider: "openapi",
        endpoint: `https://${base}/IT-invoices/${doc.sdi_id_trasmissione}`,
        status_code: httpStatus,
        response_json: grezzo,
        detected_keys: grezzo && typeof grezzo === "object" ? Object.keys(grezzo as object) : [],
      });

      if (httpStatus < 200 || httpStatus >= 300) {
        falliti++;
        continue;
      }

      const esito = leggiEsitoOpenapi(grezzo);
      if (!esito) {
        // Non si inventa uno stato: si lascia com'è e si scrive cosa ha risposto.
        sconosciuti++;
        await supabase.from("sdi_log").insert({
          company_id: doc.company_id,
          documento_id: doc.id,
          evento: "esito_non_riconosciuto",
          sdi_id: doc.sdi_id_trasmissione,
          messaggio: "openapi ha risposto con uno stato che non sappiamo tradurre",
          xml_content: JSON.stringify(grezzo).slice(0, 5000),
        });
        continue;
      }

      if (esito.sdi_stato === (doc.sdi_stato ?? "")) continue;

      const patch: Record<string, unknown> = {
        sdi_stato: esito.sdi_stato,
        sdi_notifica_tipo: esito.sdi_stato,
      };
      if (esito.stato) patch.stato = esito.stato;
      if (esito.sdi_stato === "RC" || esito.sdi_stato === "EC01" || esito.sdi_stato === "DT") {
        patch.sdi_data_consegna = new Date().toISOString();
      }
      // L'IdentificativoSdI, quando arriva, è quello che il webhook cerca.
      const idSdi = estraiIdentificativoSdi(grezzo);
      if (idSdi) patch.sdi_identificativo = idSdi;

      const { error: upErr } = await supabase
        .from("documenti_fiscali").update(patch).eq("id", doc.id);
      if (upErr) {
        falliti++;
        console.error(`[sdi-stato-tick] update ${doc.id}: ${upErr.message}`);
        continue;
      }

      aggiornati++;
      await supabase.from("sdi_log").insert({
        company_id: doc.company_id,
        documento_id: doc.id,
        evento: "esito_sdi",
        sdi_id: doc.sdi_id_trasmissione,
        tipo_notifica: esito.sdi_stato,
        messaggio: esito.messaggio,
      });
    }

    return json({ ok: true, guardati: documenti.length, aggiornati, sconosciuti, falliti });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
