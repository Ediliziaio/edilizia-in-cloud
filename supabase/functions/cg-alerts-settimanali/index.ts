/**
 * cg-alerts-settimanali
 *
 * Cron settimanale (lunedì 08:00 UTC, configurato lato Dashboard Supabase).
 * Per ogni company con `controllo_gestione_v1` attivo:
 *  - chiama le 3 RPC (CE / SP / Rating)
 *  - applica un sottoinsieme di regole "danger" (le critiche)
 *  - inserisce row in `notifications` con dedup 7 giorni (idempotenza)
 *
 * Sicurezza: header `x-internal-secret` deve corrispondere a INTERNAL_CRON_SECRET.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface VoceCE { codice: string; valore: number; }
interface CEResp { voci: VoceCE[]; meta: { anno: number; }; }
interface SPResp { attivo: { attivo_circolante: number; totale: number; }; passivo: { pas_corrente: number; mezzi_propri: number; totale: number; }; }
interface RTResp { classe: string; livello: string; score: number; }
interface BEPResp { gia_raggiunto: boolean; bep_giorno_anno: number | null; margine_contribuzione_pct: number; }

interface CriticalAlert {
  insight_id: string;
  title: string;
  body: string;
  action_url?: string;
}

const fmtEur = (n: number): string =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

function getVoce(ce: CEResp | null, codice: string): number {
  if (!ce) return 0;
  return ce.voci.find((v) => v.codice === codice)?.valore ?? 0;
}

function buildCriticalAlerts(
  ce: CEResp | null,
  sp: SPResp | null,
  rt: RTResp | null,
  bep: BEPResp | null,
): CriticalAlert[] {
  const out: CriticalAlert[] = [];
  if (!ce || !sp || !rt) return out;

  const ricavi = getVoce(ce, "01");
  const ebit = getVoce(ce, "F");
  const utile = getVoce(ce, "L");
  const of = getVoce(ce, "11");
  const ac = sp.attivo.attivo_circolante;
  const pc = sp.passivo.pas_corrente;
  const mp = sp.passivo.mezzi_propri;
  const totPas = sp.passivo.totale;

  // Utile in perdita
  if (utile < 0) {
    out.push({
      insight_id: "utile-negativo",
      title: `Bilancio in perdita di ${fmtEur(Math.abs(utile))}`,
      body: "Esercizio in rosso. Tre azioni urgenti: blocca nuovi investimenti, accelera incassi scaduti, rivedi i contratti più dispendiosi.",
      action_url: "/azienda/controllo-gestione",
    });
  }

  // Liquidità critica
  if (pc > 0 && ac / pc < 0.7) {
    out.push({
      insight_id: "liquidita-critica",
      title: "Attività correnti molto sotto le passività correnti",
      body: `Indice ${(ac / pc).toFixed(2)}. Fai cassa subito: solleciti incassi e rimanda pagamenti non urgenti.`,
      action_url: "/azienda/scadenzario",
    });
  }

  // Indipendenza finanziaria sotto 10%
  if (totPas > 0 && mp / totPas < 0.10) {
    out.push({
      insight_id: "indipendenza-bassa",
      title: `Mezzi propri al ${((mp / totPas) * 100).toFixed(1)}% — capitale fragile`,
      body: "Sotto il 10% le banche ti vedono ad alto rischio. Valuta aumento di capitale o ricapitalizzazione con utili a nuovo.",
      action_url: "/azienda/controllo-gestione",
    });
  }

  // Rating peggiorato in classe rischiosa
  if (rt.classe === "B" || rt.classe === "CCC") {
    out.push({
      insight_id: "rating-critico",
      title: `Rating ${rt.classe} — accesso al credito a rischio`,
      body: `Score ${rt.score}/100. Le banche ti faranno pagare tassi elevati o rifiuteranno nuove linee. Lavora su liquidità e mezzi propri.`,
      action_url: "/azienda/controllo-gestione",
    });
  }

  // BEP non raggiungibile
  if (bep && !bep.gia_raggiunto && bep.margine_contribuzione_pct <= 0) {
    out.push({
      insight_id: "bep-non-raggiungibile",
      title: "BEP non raggiungibile a questo ritmo",
      body: `Margine di contribuzione ${bep.margine_contribuzione_pct.toFixed(1)}%. Aumenta i prezzi o riduci i costi variabili.`,
      action_url: "/azienda/controllo-gestione",
    });
  }

  // Oneri finanziari oltre 6%
  if (ricavi > 0 && of / ricavi > 0.06) {
    out.push({
      insight_id: "oneri-finanziari-alti",
      title: `Oneri finanziari al ${((of / ricavi) * 100).toFixed(1)}% del fatturato`,
      body: `${fmtEur(of)} di interessi e spese bancarie su ${fmtEur(ricavi)} di ricavi. Valuta consolidamento o estinzione anticipata.`,
      action_url: "/azienda/tesoreria",
    });
  }

  // EBIT negativo
  if (ebit < 0 && ricavi > 0) {
    out.push({
      insight_id: "ebit-negativo",
      title: "EBIT operativo negativo",
      body: `Ricavi ${fmtEur(ricavi)} ma EBIT ${fmtEur(ebit)}. Le operazioni correnti generano perdita. Rivedi prezzi e costi fissi.`,
      action_url: "/azienda/controllo-gestione",
    });
  }

  return out;
}

Deno.serve(async (req) => {
  const expected = Deno.env.get("INTERNAL_CRON_SECRET");
  if (!expected || req.headers.get("x-internal-secret") !== expected) {
    return new Response("Forbidden", { status: 403 });
  }

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: enabledCompanies, error: cfErr } = await sb
    .from("company_feature_overrides")
    .select("company_id")
    .eq("feature_key", "controllo_gestione_v1")
    .eq("is_enabled", true);
  if (cfErr) return new Response(`Errore overrides: ${cfErr.message}`, { status: 500 });

  const companies = (enabledCompanies ?? []) as Array<{ company_id: string }>;
  const annoCorr = new Date().getFullYear();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

  let companiesProcessate = 0;
  let alertCreati = 0;
  let alertSkippati = 0;
  const errori: Array<{ company_id: string; error: string }> = [];

  for (const c of companies) {
    try {

      const [ceRes, spRes, rtRes, bepRes] = await Promise.all([
        (sb.rpc as any)("cg_get_conto_economico_riclassificato", {
          p_company_id: c.company_id, p_anno: annoCorr,
        }),
        (sb.rpc as any)("cg_get_stato_patrimoniale_riclassificato", {
          p_company_id: c.company_id, p_anno: annoCorr,
        }),
        (sb.rpc as any)("cg_get_rating", { p_company_id: c.company_id, p_anno: annoCorr }),
        (sb.rpc as any)("cg_get_bep", { p_company_id: c.company_id, p_anno: annoCorr }),
      ]);

      const alerts = buildCriticalAlerts(
        ceRes.data as CEResp | null,
        spRes.data as SPResp | null,
        rtRes.data as RTResp | null,
        bepRes.data as BEPResp | null,
      );

      for (const alert of alerts) {
        // Dedup 7 giorni: skip se already notificato
        const { count } = await sb
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .eq("company_id", c.company_id)
          .eq("type", "controllo_gestione_alert")
          .eq("entity_id", alert.insight_id)
          .gte("created_at", sevenDaysAgo);
        if ((count ?? 0) > 0) { alertSkippati += 1; continue; }

        await sb.from("notifications").insert({
          company_id: c.company_id,
          type: "controllo_gestione_alert",
          title: alert.title,
          body: alert.body,
          entity_type: "controllo_gestione_insight",
          entity_id: alert.insight_id,
          action_url: alert.action_url ?? "/azienda/controllo-gestione",
        });
        alertCreati += 1;
      }
      companiesProcessate += 1;
    } catch (e) {
      errori.push({
        company_id: c.company_id,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return new Response(
    JSON.stringify({
      total: companies.length,
      companiesProcessate,
      alertCreati,
      alertSkippati,
      errori,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
});
