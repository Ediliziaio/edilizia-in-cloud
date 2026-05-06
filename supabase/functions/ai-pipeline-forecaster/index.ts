/**
 * MP-SALES-06 — AI Pipeline Forecaster (cron daily 22:00)
 *
 * Per ogni company:
 *   1. Calcola probabilità close per ogni quote attiva
 *   2. Aggrega snapshot pipeline_forecasts (totale, weighted, 30/60/90gg)
 *   3. Identifica hot quotes (top probability) + stale quotes (in pipeline > 30gg)
 */
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";

Deno.serve(async (req) => {
  if (req.method !== "POST" && req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const t0 = Date.now();
  const summary = {
    companies_processed: 0,
    quotes_predicted: 0,
    snapshots_created: 0,
    duration_ms: 0,
    errors: [] as string[],
  };

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: companies } = await (supabase as any)
      .from("companies").select("id");

    if (!companies || companies.length === 0) {
      summary.duration_ms = Date.now() - t0;
      return jsonOk(summary);
    }

    summary.companies_processed = companies.length;

    for (const c of companies) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: quotes } = await (supabase as any)
          .from("quotes")
          .select("id, total, sent_at, viewed_at, signed_at, refused_at, status, ai_close_probability_pct")
          .eq("company_id", c.id)
          .in("status", ["sent", "viewed", "negotiating"])
          .is("signed_at", null)
          .is("refused_at", null);

        if (!quotes) continue;

        let totalEur = 0; let weightedEur = 0;
        const hotIds: string[] = []; const staleIds: string[] = [];

        for (const q of quotes) {
          // Re-stima per ogni quote
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: pred } = await (supabase as any).rpc("silvio_tool_stima_probabilita_close_quote", {
            p_company_id: c.id, p_quote_id: q.id,
          });

          const prob = (pred as { probability_pct?: number } | null)?.probability_pct ?? 50;
          const total = Number(q.total ?? 0);
          totalEur += total;
          weightedEur += total * prob / 100;

          if (prob >= 70) hotIds.push(q.id);
          if (q.sent_at && (Date.now() - new Date(q.sent_at).getTime()) > 30 * 86400000) {
            staleIds.push(q.id);
          }

          summary.quotes_predicted += 1;
        }

        // Snapshot
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: insErr } = await (supabase as any)
          .from("pipeline_forecasts")
          .upsert({
            company_id: c.id,
            forecast_date: new Date().toISOString().slice(0, 10),
            pipeline_total_eur: totalEur,
            pipeline_weighted_eur: weightedEur,
            forecast_30d_eur: weightedEur * 0.3,
            forecast_60d_eur: weightedEur * 0.6,
            forecast_90d_eur: weightedEur,
            quotes_in_pipeline_count: quotes.length,
            hot_quotes_ids: hotIds,
            stale_quotes_ids: staleIds,
            ai_persona_used: "sales",
          }, { onConflict: "company_id,forecast_date" });

        if (!insErr) summary.snapshots_created += 1;
      } catch (e) {
        summary.errors.push(`company ${c.id}: ${(e as Error).message}`);
      }
    }

    summary.duration_ms = Date.now() - t0;
    return jsonOk(summary);
  } catch (e) {
    summary.duration_ms = Date.now() - t0;
    summary.errors.push(`fatal: ${(e as Error).message}`);
    return jsonOk(summary, 500);
  }
});

function jsonOk(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
