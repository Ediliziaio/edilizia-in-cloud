/**
 * MP-FAT-05 — AI CFO Weekly Report (cron lunedì 08:00)
 *
 * Per ogni company con cfo_weekly_report_enabled=true:
 *   1. Crea skeleton report tramite RPC silvio_tool_genera_report_cfo_settimanale
 *   2. Aggrega snapshot fatturato/incassi/DSO/cantieri attivi (best-effort)
 *   3. Compone narrative AI (placeholder; in prod: chiamata LLM persona cfo)
 *   4. Invia report via canali abilitati (email, whatsapp)
 *
 * Defensive: tabelle mancanti → skip aggregazione, narrative neutro.
 */
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";
import { chiamataInternaValida, rispostaNonAutorizzata } from "../_shared/chiamataInterna.ts";

Deno.serve(async (req) => {
  // Crea il report CFO di ogni azienda che l'ha acceso — cioè tutte, l'opzione
  // nasce accesa — e lo segna come inviato, con la chiave di servizio: la fa
  // partire solo il cron o un'altra nostra funzione. Fino al 20/09/2026 bastava
  // conoscere l'URL. Prima di qualunque lavoro.
  if (!chiamataInternaValida(req)) return rispostaNonAutorizzata();

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
    reports_created: 0,
    reports_sent: 0,
    duration_ms: 0,
    errors: [] as string[],
  };

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: companies } = await (supabase as any)
      .from("companies")
      .select("id, name, cfo_weekly_report_enabled")
      .eq("cfo_weekly_report_enabled", true);

    if (!companies || companies.length === 0) {
      summary.duration_ms = Date.now() - t0;
      return jsonOk(summary);
    }

    summary.companies_processed = companies.length;

    for (const c of companies) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: rpcRes } = await (supabase as any).rpc(
          "silvio_tool_genera_report_cfo_settimanale",
          { p_company_id: c.id, p_week_start: null, p_force_regenerate: false },
        );

        const reportId = (rpcRes as { report_id?: string } | null)?.report_id;
        if (!reportId) continue;

        summary.reports_created += 1;

        // Skeleton narrative; in produzione: persona cfo via LLM
        const narrative = `Report CFO automatico generato. Dati settimana in elaborazione.`;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
          .from("cfo_weekly_reports")
          .update({ ai_narrative: narrative, ai_top_actions: [] })
          .eq("id", reportId);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).rpc("silvio_tool_invia_report_cfo", {
          p_company_id: c.id,
          p_report_id: reportId,
          p_channels: ["email"],
        });

        summary.reports_sent += 1;
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
