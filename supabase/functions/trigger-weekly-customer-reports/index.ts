/**
 * MP-OPS-01 v2 — Trigger Weekly Customer Reports (cron entry)
 *
 * Edge function chiamata dal cron settimanale (venerdì 17:00). Itera tutti i
 * cantieri attivi delle company con `weekly_reports_enabled=true` e chiama
 * il TOOL centrale `genera_reportino_settimanale_committente` per ognuno.
 *
 * Usa lo STESSO punto di ingresso della chat conversazionale → audit trail
 * unificato + comportamento coerente.
 */
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";
import { executeToolWithRouting } from "../_shared/silvioToolExecution.ts";

interface CantiereRow {
  id: string;
  company_id: string;
  order_code: string | null;
}

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
    company_count: 0,
    cantiere_count: 0,
    triggered: 0,
    skipped: 0,
    errors: 0,
    duration_ms: 0,
    details: [] as Array<{ cantiere_id: string; status: string; message?: string }>,
  };

  try {
    // 1. Lista companies con weekly_reports_enabled
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: companies } = await (supabase as any)
      .from("companies")
      .select("id, name, weekly_reports_enabled")
      .eq("weekly_reports_enabled", true);

    if (!companies || companies.length === 0) {
      return jsonOk({ ...summary, note: "Nessuna company con weekly_reports_enabled=true" });
    }
    summary.company_count = companies.length;

    // 2. Per ogni company, trova cantieri attivi con weekly_report_enabled
    for (const c of companies) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: cantieri } = await (supabase as any)
        .from("orders")
        .select("id, company_id, order_code")
        .eq("company_id", c.id)
        .eq("weekly_report_enabled", true)
        .in("status", ["in_corso", "programmato"]);

      if (!cantieri || cantieri.length === 0) continue;

      const list = cantieri as CantiereRow[];
      summary.cantiere_count += list.length;

      // Esegui il tool per ognuno (sequenziale per non saturare risorse)
      for (const cantiere of list) {
        try {
          const result = await executeToolWithRouting(
            "genera_reportino_settimanale_committente",
            { cantiere_id: cantiere.id, send_email: true, send_whatsapp: true },
            {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              supabase: supabase as any,
              companyId: c.id,
              userId: "00000000-0000-0000-0000-000000000000", // service-role pseudo user
              primaryRole: "super_admin",
              channel: "cron",
              personaKey: "silvio",
              traceId: `weekly-${new Date().toISOString().substring(0, 10)}`,
            },
          );
          if (result.success) {
            summary.triggered++;
            summary.details.push({
              cantiere_id: cantiere.id,
              status: "ok",
              message: cantiere.order_code ?? undefined,
            });
          } else {
            summary.errors++;
            summary.details.push({
              cantiere_id: cantiere.id,
              status: "error",
              message: result.error?.message,
            });
          }
        } catch (e) {
          summary.errors++;
          summary.details.push({
            cantiere_id: cantiere.id,
            status: "exception",
            message: e instanceof Error ? e.message : String(e),
          });
        }
      }
    }

    summary.duration_ms = Date.now() - t0;
    return jsonOk(summary);
  } catch (e) {
    summary.duration_ms = Date.now() - t0;
    return new Response(
      JSON.stringify({
        ...summary,
        error: e instanceof Error ? e.message : String(e),
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});

function jsonOk(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
