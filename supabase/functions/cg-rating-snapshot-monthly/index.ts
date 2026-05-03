/**
 * cg-rating-snapshot-monthly
 *
 * Cron mensile: il 1° di ogni mese alle 03:00 UTC chiama `cg_get_rating` per
 * ogni company che ha il flag `controllo_gestione_v1` attivo, e salva lo
 * snapshot in `cg_rating_snapshot` per tracciare il trend storico.
 *
 * Sicurezza: header `x-internal-secret` deve corrispondere a INTERNAL_CRON_SECRET.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface RatingResult {
  anno: number;
  classe: string;
  livello: string;
  score: number;
  indicatori: Array<{ codice: string; valore: number; punteggio: number }>;
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

  // Solo le company con flag attivo (default OFF + override).
  const { data: enabledCompanies, error: cfErr } = await sb
    .from("company_feature_overrides")
    .select("company_id")
    .eq("feature_key", "controllo_gestione_v1")
    .eq("is_enabled", true);
  if (cfErr) {
    return new Response(`Errore lettura overrides: ${cfErr.message}`, { status: 500 });
  }

  const companies = (enabledCompanies ?? []) as Array<{ company_id: string }>;
  let ok = 0;
  let errs = 0;
  const errors: Array<{ company_id: string; error: string }> = [];
  const today = new Date();
  const annoCorr = today.getFullYear();

  for (const c of companies) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: ratingRaw, error: rErr } = await (sb.rpc as any)("cg_get_rating", {
        p_company_id: c.company_id,
        p_anno: annoCorr,
      });
      if (rErr) throw rErr;
      const rating = ratingRaw as RatingResult;
      if (!rating) continue;

      const ind = rating.indicatori ?? [];
      const findIdx = (codice: string) => ind.find((i) => i.codice === codice)?.valore ?? null;

      await sb.from("cg_rating_snapshot").insert({
        company_id: c.company_id,
        ratio_liquidita:    findIdx("liquidita"),
        ratio_indipendenza: findIdx("indipendenza"),
        ratio_oneri:        findIdx("oneri_finanziari"),
        ratio_cashflow:     findIdx("cashflow"),
        scoring_totale:     rating.score,
        classe_rating:      rating.classe,
        livello_rischio:    rating.livello,
        fonte:              "auto",
        payload:            rating,
      });
      ok += 1;
    } catch (e) {
      errs += 1;
      errors.push({
        company_id: c.company_id,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return new Response(
    JSON.stringify({ total: companies.length, ok, errs, errors }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
});
