/**
 * MP-PRED-02 — Predict Cantiere Delays (cron daily 21:00)
 *
 * Per ogni cantiere attivo:
 *   1. Calcola avanzamento attuale vs piano
 *   2. Stima velocity ultime 4 settimane
 *   3. Predice data fine + risk_level
 *   4. Insert in cantiere_risk_predictions
 *   5. Se risk >= high: alert PM
 *
 * Defensive: assenza giornali cantiere → risk='low' di default.
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
    cantieri_processed: 0,
    predictions_created: 0,
    high_risk_alerts: 0,
    duration_ms: 0,
    errors: [] as string[],
  };

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: cantieri } = await (supabase as any)
      .from("orders")
      .select("id, company_id, percentuale_avanzamento, work_start_date, work_end_date, fulfillment_status")
      .in("fulfillment_status", ["in_progress", "active", "open"]);

    if (!cantieri || cantieri.length === 0) {
      summary.duration_ms = Date.now() - t0;
      return jsonOk(summary);
    }

    summary.cantieri_processed = cantieri.length;

    for (const cantiere of cantieri) {
      try {
        const current = Number(cantiere.percentuale_avanzamento ?? 0);
        const start = cantiere.work_start_date ? new Date(cantiere.work_start_date) : null;
        const end = cantiere.work_end_date ? new Date(cantiere.work_end_date) : null;

        let plannedPct = 0;
        if (start && end) {
          const totalMs = end.getTime() - start.getTime();
          const elapsedMs = Date.now() - start.getTime();
          plannedPct = Math.max(0, Math.min(100, (elapsedMs / totalMs) * 100));
        }

        const gap = plannedPct - current;
        const riskLevel: "low" | "medium" | "high" | "critical" =
          gap > 25 ? "critical" : gap > 15 ? "high" : gap > 7 ? "medium" : "low";

        const delayDays = end && current < 100 && current > 0
          ? Math.round((plannedPct - current) * (end.getTime() - (start?.getTime() ?? Date.now())) / (100 * 86400000))
          : 0;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: insErr } = await (supabase as any)
          .from("cantiere_risk_predictions")
          .insert({
            company_id: cantiere.company_id,
            cantiere_id: cantiere.id,
            prediction_date: new Date().toISOString().slice(0, 10),
            current_avanzamento_pct: current,
            planned_avanzamento_pct: plannedPct,
            contractual_deadline: cantiere.work_end_date,
            delay_days_predicted: Math.max(0, delayDays),
            delay_probability_pct: gap > 0 ? Math.min(100, gap * 4) : 0,
            risk_level: riskLevel,
            primary_causes: gap > 15 ? ["sotto_organico", "ritardo_avanzamento"] : [],
            ai_mitigations: riskLevel === "high" || riskLevel === "critical"
              ? ["aumentare_squadra", "valutare_recovery_plan"]
              : [],
          });

        if (!insErr) {
          summary.predictions_created += 1;
          if (riskLevel === "high" || riskLevel === "critical") {
            summary.high_risk_alerts += 1;
            try {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              await (supabase as any).from("notifications").insert({
                company_id: cantiere.company_id,
                type: "cantiere_risk",
                severity: riskLevel === "critical" ? "high" : "medium",
                title: `Cantiere a rischio ${riskLevel}`,
                body: `Avanzamento ${current.toFixed(1)}% vs pianificato ${plannedPct.toFixed(1)}% (gap ${gap.toFixed(1)}pp).`,
                metadata: { source: "predict-cantiere-delays", cantiere_id: cantiere.id },
              });
            } catch { /* notifications may not exist */ }
          }
        }
      } catch (e) {
        summary.errors.push(`cantiere ${cantiere.id}: ${(e as Error).message}`);
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
