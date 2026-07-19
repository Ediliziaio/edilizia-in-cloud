/**
 * MP-FAT-04 — AI Cashflow Forecast Builder (cron daily 23:00)
 *
 * Per ogni company:
 *   1. Legge dati storici (fatture attive/passive ultimi 12 mesi, scadenze, costi fissi)
 *   2. Costruisce 3 scenari forecast 90gg: realistic / best / worst
 *   3. Salva snapshot via RPC save_cashflow_snapshot
 *   4. Se scenario worst < 0 → invia alert al CFO/Amministrazione
 *
 * Output: 1 snapshot/company/giorno in cashflow_forecast_snapshots.
 */
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";

Deno.serve(async (req) => {
  if (req.method !== "POST" && req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  // SICUREZZA (P1): funzione fleet-wide (itera TUTTE le aziende, calcola forecast
  // pesanti e scrive notifiche). Deve girare solo da cron con il segreto interno,
  // altrimenti chiunque su internet può innescare compute-DoS + notifiche a tappeto.
  const cronSecret = Deno.env.get("INTERNAL_CRON_SECRET");
  if (!cronSecret || req.headers.get("x-cron-secret") !== cronSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const t0 = Date.now();
  const summary = {
    companies_processed: 0,
    snapshots_created: 0,
    alerts_sent: 0,
    duration_ms: 0,
    errors: [] as string[],
  };

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: companies } = await (supabase as any)
      .from("companies")
      .select("id, name");

    if (!companies || companies.length === 0) {
      summary.duration_ms = Date.now() - t0;
      return jsonOk(summary);
    }

    summary.companies_processed = companies.length;

    for (const c of companies) {
      try {
        // Calcola forecast 3 scenari
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: forecast } = await (supabase as any).rpc(
          "silvio_tool_get_cashflow_forecast_scenarios",
          { p_company_id: c.id, p_giorni: 90 },
        );

        if (!forecast) continue;

        // Salva snapshot (la RPC accetta JSONB scenario_data)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: snap } = await (supabase as any).rpc(
          "silvio_tool_save_cashflow_snapshot",
          {
            p_company_id: c.id,
            p_forecast: forecast,
          },
        );

        if (snap) summary.snapshots_created += 1;

        // Alert se scenario worst negativo
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const worst = (forecast as any)?.worst_case ?? null;
        if (worst && typeof worst.cumulative_eur === "number" && worst.cumulative_eur < 0) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (supabase as any).from("notifications").insert({
              company_id: c.id,
              type: "cashflow_alert",
              severity: "high",
              title: `Cashflow worst-case: € ${worst.cumulative_eur.toFixed(0)}`,
              body: `Lo scenario pessimistico a 90gg è negativo. Verifica scadenze e costi.`,
              metadata: { source: "ai-cashflow-forecast-builder" },
            });
            summary.alerts_sent += 1;
          } catch (_e) { /* table may not exist */ }
        }
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
