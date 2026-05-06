/**
 * MP-HR-02 — HR Genera Cedolini Mese (cron mensile 1° del mese)
 *
 * Per ogni company:
 *   1. Lista dipendenti attivi
 *   2. Per ciascuno: calcola ore mese precedente (ordinarie/straord/festive)
 *      tramite RPC calcola_ore_mese_dipendente
 *   3. Genera cedolino draft via RPC genera_cedolino_dipendente
 *   4. Cedolini draft restano in stato "to_review" per controllo HR
 *
 * Defensive: mancanza modulo HR → ritorno 0 senza errori.
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
    cedolini_creati: 0,
    cedolini_skipped: 0,
    duration_ms: 0,
    errors: [] as string[],
  };

  // Determina mese precedente (YYYY-MM)
  const now = new Date();
  const yearPrev = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const monthPrev = now.getMonth() === 0 ? 12 : now.getMonth();
  const periodo = `${yearPrev}-${String(monthPrev).padStart(2, "0")}`;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: companies } = await (supabase as any)
      .from("companies")
      .select("id");

    if (!companies || companies.length === 0) {
      summary.duration_ms = Date.now() - t0;
      return jsonOk(summary);
    }

    summary.companies_processed = companies.length;

    for (const c of companies) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: dipendenti } = await (supabase as any)
          .from("hr_dipendenti")
          .select("id, nome, cognome")
          .eq("company_id", c.id)
          .eq("attivo", true);

        if (!dipendenti || dipendenti.length === 0) continue;

        for (const d of dipendenti) {
          try {
            // 1. Calcola ore mese
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data: ore } = await (supabase as any).rpc(
              "silvio_tool_calcola_ore_mese_dipendente",
              {
                p_company_id: c.id,
                p_dipendente_id: d.id,
                p_periodo: periodo,
              },
            );

            if (!ore) {
              summary.cedolini_skipped += 1;
              continue;
            }

            // 2. Genera cedolino
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data: cedolino } = await (supabase as any).rpc(
              "silvio_tool_genera_cedolino_dipendente",
              {
                p_company_id: c.id,
                p_dipendente_id: d.id,
                p_periodo: periodo,
                p_ore_breakdown: ore,
              },
            );

            if (cedolino) summary.cedolini_creati += 1;
            else summary.cedolini_skipped += 1;
          } catch (e) {
            summary.errors.push(`dip ${d.id}: ${(e as Error).message}`);
            summary.cedolini_skipped += 1;
          }
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
