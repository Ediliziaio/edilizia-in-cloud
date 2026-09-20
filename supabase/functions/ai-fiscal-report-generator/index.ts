/**
 * MP-FAT-06 — AI Fiscal Report Generator (cron mensile/trimestrale/annuale)
 *
 * Body opzionale:
 *   { mode?: 'lipe' | 'f24' | 'cu' | 'auto' }
 *
 * Auto: detect periodo corrente.
 *   - LIPE: trimestrale (chiamato il 20° giorno del mese successivo trimestre)
 *   - F24: mensile (chiamato il 16 del mese successivo)
 *   - CU: annuale (gennaio anno successivo)
 *
 * Per ogni company crea fiscal_reports draft via RPC + warnings AI quadrature.
 */
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";
import { chiamataInternaValida, rispostaNonAutorizzata } from "../_shared/chiamataInterna.ts";

Deno.serve(async (req) => {
  // Crea bozze LIPE, F24 e CU per TUTTE le aziende, con la chiave di servizio:
  // la fa partire solo il cron o un'altra nostra funzione —
  // fino al 20/09/2026 bastava conoscere l'URL. Prima di qualunque lavoro.
  if (!chiamataInternaValida(req)) return rispostaNonAutorizzata();

  if (req.method !== "POST" && req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let mode: "lipe" | "f24" | "cu" | "auto" = "auto";
  if (req.method === "POST") {
    try {
      const body = await req.json();
      if (body?.mode) mode = body.mode;
    } catch { /* ignore */ }
  }

  const now = new Date();
  const t0 = Date.now();
  const summary = {
    mode,
    companies_processed: 0,
    lipe_created: 0,
    f24_created: 0,
    cu_created: 0,
    duration_ms: 0,
    errors: [] as string[],
  };

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: companies } = await (supabase as any).from("companies").select("id");
    if (!companies || companies.length === 0) {
      summary.duration_ms = Date.now() - t0;
      return jsonOk(summary);
    }

    summary.companies_processed = companies.length;

    for (const c of companies) {
      try {
        if (mode === "lipe" || mode === "auto") {
          const month = now.getMonth() + 1;
          const lastQ = month >= 4 && month <= 6 ? 1 :
                        month >= 7 && month <= 9 ? 2 :
                        month >= 10 && month <= 12 ? 3 : 4;
          const lastQyear = lastQ === 4 ? now.getFullYear() - 1 : now.getFullYear();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: r } = await (supabase as any).rpc("silvio_tool_genera_lipe_trimestrale", {
            p_company_id: c.id, p_year: lastQyear, p_quarter: lastQ,
          });
          if ((r as { ok?: boolean } | null)?.ok) summary.lipe_created += 1;
        }

        if (mode === "f24" || mode === "auto") {
          const monthPrev = now.getMonth() === 0 ? 12 : now.getMonth();
          const yearPrev = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: r } = await (supabase as any).rpc("silvio_tool_genera_f24_mese", {
            p_company_id: c.id, p_year: yearPrev, p_month: monthPrev,
          });
          if ((r as { ok?: boolean } | null)?.ok) summary.f24_created += 1;
        }

        if (mode === "cu" || (mode === "auto" && now.getMonth() <= 2)) {
          // CU si genera entro marzo per l'anno solare precedente
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: r } = await (supabase as any).rpc("silvio_tool_genera_cu_anno", {
            p_company_id: c.id, p_year: now.getFullYear() - 1,
          });
          if ((r as { ok?: boolean } | null)?.ok) summary.cu_created += 1;
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
