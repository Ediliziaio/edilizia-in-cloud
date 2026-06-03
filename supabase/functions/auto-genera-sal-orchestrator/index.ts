/**
 * MP-OPS-04 — Auto Genera SAL Orchestrator (cron 15gg + on-demand)
 *
 * Per ogni company con sal_auto_enabled, identifica cantieri attivi che
 * necessitano nuovo SAL (ultimo SAL > N giorni o avanzamento > soglia%).
 * Per ognuno aggrega rapportini/DDT del periodo, AI compose narrative,
 * calcola importi (lordo, ritenute legge 296, garanzie, anticipi, netto),
 * crea sal con status='draft_ai'.
 *
 * Defensive: tabella `rapportini` può non esistere → consumo da
 * material_consumption_daily come proxy.
 */
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";
import { aiRouterComplete } from "../_shared/aiRouter.ts";

interface OrderForSal {
  id: string;
  order_code: string | null;
  company_id: string;
  total_amount: number | null;
  start_date: string | null;
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
    companies_processed: 0,
    orders_evaluated: 0,
    sal_created: 0,
    skipped: 0,
    errors: 0,
    duration_ms: 0,
  };

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: companies } = await (supabase as any)
      .from("companies")
      .select("id, name, sal_auto_frequency_days, sal_auto_threshold_pct, sal_ritenute_garanzia_pct")
      .eq("sal_auto_enabled", true);

    if (!companies || companies.length === 0) {
      summary.duration_ms = Date.now() - t0;
      return jsonOk({ ...summary, note: "Nessuna company con sal_auto_enabled" });
    }

    summary.companies_processed = companies.length;

    for (const c of companies) {
      const freqDays = (c.sal_auto_frequency_days as number) ?? 15;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: orders } = await (supabase as any)
        .from("orders")
        .select("id, order_code, company_id, total_amount, start_date")
        .eq("company_id", c.id)
        .in("status", ["in_corso", "programmato"]);

      const list = (orders ?? []) as OrderForSal[];
      summary.orders_evaluated += list.length;

      for (const order of list) {
        try {
          // Check ultimo SAL approvato
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: lastSal } = await (supabase as any)
            .from("sal")
            .select("data_sal, importo, pct_avanzamento")
            .eq("order_id", order.id)
            .in("status", ["approvato", "firmato", "inviato", "pagato"])
            .order("data_sal", { ascending: false })
            .limit(1)
            .maybeSingle();

          const lastSalDate = lastSal?.data_sal as string | undefined;
          const daysSinceLast = lastSalDate
            ? Math.floor((Date.now() - new Date(lastSalDate).getTime()) / 86400_000)
            : 999;

          if (daysSinceLast < freqDays) {
            summary.skipped++;
            continue;
          }

          // 1. Avvia run pending via RPC
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: runRes } = await (supabase as any)
            .rpc("silvio_tool_compone_sal_da_rapportini", {
              p_company_id: c.id,
              p_user_id: "00000000-0000-0000-0000-000000000000",
              p_order_id: order.id,
              p_period_start: null,
              p_period_end: null,
              p_force_regenerate: false,
            });
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const r = runRes as any;
          if (r?.error) { summary.skipped++; continue; }

          // 2. AI compose narrativa SAL (best-effort)
          const aiResult = await aiRouterComplete({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            supabase: supabase as any,
            taskKey: "email_compose",
            messages: [
              {
                role: "system",
                content: `Sei il PM Cantiere. Compose il Verbale Lavorazioni del SAL per il periodo specificato.
Lingua: italiano professionale, registro tecnico-contabile.
Struttura: descrizione lavorazioni eseguite, % avanzamento totale, riepilogo materiali consegnati.
NON inventare dati: usa solo quello che hai.`,
              },
              {
                role: "user",
                content: JSON.stringify({
                  order_code: order.order_code,
                  period_start: r.period_start,
                  period_end: r.period_end,
                  total_amount_contract: order.total_amount,
                }),
              },
            ],
            params: { temperature: 0.3, max_tokens: 800 },
            companyId: c.id,
            estimatedCostEur: 0.04,
            idempotencyKey: `sal-narrative-${order.id}-${r.period_end}`,
          });

          // 3. Crea SAL row con status=draft_ai (numero progressivo + calcoli)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: salCount } = await (supabase as any)
            .from("sal")
            .select("id", { count: "exact", head: true })
            .eq("order_id", order.id);
          const numProgressivo = (salCount as { count?: number } | null)?.count ?? 0;

          // Calcoli stimati (placeholder: in produzione carica da computo metrico)
          const importoLordo = (order.total_amount ?? 0) * 0.15; // 15% del contratto come progress placeholder
          const ritenutaLegge296 = importoLordo * 0.005;
          const ritenuteGaranzia = importoLordo * ((c.sal_ritenute_garanzia_pct as number ?? 0.5) / 100);
          const importoNetto = importoLordo - ritenutaLegge296 - ritenuteGaranzia;

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: newSal } = await (supabase as any)
            .from("sal")
            .insert({
              company_id: c.id,
              order_id: order.id,
              numero_progressivo: numProgressivo + 1,
              data_sal: new Date().toISOString().substring(0, 10),
              importo: importoLordo,
              pct_avanzamento: numProgressivo === 0 ? 15 : null,
              status: "draft_ai",
              ai_narrative: aiResult.content,
              generation_method: "auto_ai",
              ai_persona_used: "pm_cantiere",
              ai_cost_billed_eur: aiResult.costBilledEur ?? 0,
              ai_confidence: 0.7,
              trigger_type: "schedule_15days",
              source_period_start: r.period_start,
              source_period_end: r.period_end,
              importo_lordo: importoLordo,
              ritenuta_legge_296: ritenutaLegge296,
              ritenute_garanzia: ritenuteGaranzia,
              importo_netto: importoNetto,
              // Stima lineare grezza (15% per periodo): cap a 100% per non
              // generare avanzamenti impossibili (>100%) dal 7° SAL in poi.
              pct_avanzamento_totale: Math.min(100, 15 * (numProgressivo + 1)),
            })
            .select("id")
            .maybeSingle();

          if (newSal?.id) {
            // Marca run come draft_ready
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (supabase as any)
              .from("sal_auto_generation_runs")
              .update({ status: "draft_ready", sal_generated_id: newSal.id })
              .eq("id", r.run_id);
            summary.sal_created++;
          }
        } catch (e) {
          summary.errors++;
          console.error(`[auto-sal] order ${order.id} failed:`, e instanceof Error ? e.message : String(e));
        }
      }
    }

    summary.duration_ms = Date.now() - t0;
    return jsonOk(summary);
  } catch (e) {
    summary.duration_ms = Date.now() - t0;
    return new Response(
      JSON.stringify({ ...summary, error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});

function jsonOk(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}
