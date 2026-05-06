/**
 * MP-OPS-05 — Predict Material Consumption (cron daily 22:00)
 *
 * Per ogni company con jit_reorder_enabled, identifica stockout imminenti
 * (<7gg) e crea proposed_purchase_orders draft (yellow → HITL approval).
 *
 * Defensive: materials_catalog non esiste → uso material_sku/name come keys.
 */
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";

interface StockoutItem {
  order_id: string;
  order_code: string | null;
  material_sku: string | null;
  material_name: string;
  unita: string;
  saldo_attuale: number;
  consumo_medio_gg: number;
  giorni_residui_stimati: number | null;
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
    stockouts_detected: 0,
    proposals_created: 0,
    errors: 0,
    duration_ms: 0,
  };

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: companies } = await (supabase as any)
      .from("companies")
      .select("id, name, jit_safety_buffer_pct")
      .eq("jit_reorder_enabled", true);

    if (!companies || companies.length === 0) {
      summary.duration_ms = Date.now() - t0;
      return jsonOk(summary);
    }

    summary.companies_processed = companies.length;

    for (const c of companies) {
      try {
        // 1. Lista stockout imminenti
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: stockoutRes } = await (supabase as any)
          .rpc("silvio_tool_lista_stockout_imminenti", {
            p_company_id: c.id,
            p_user_id: "00000000-0000-0000-0000-000000000000",
            p_days_ahead: 7,
          });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const stockouts = ((stockoutRes as any)?.stockouts ?? []) as StockoutItem[];
        summary.stockouts_detected += stockouts.length;

        // 2. Aggrega per cantiere e crea proposal per cantiere
        const byCantiere = new Map<string, StockoutItem[]>();
        for (const s of stockouts) {
          if (!byCantiere.has(s.order_id)) byCantiere.set(s.order_id, []);
          byCantiere.get(s.order_id)!.push(s);
        }

        for (const [orderId, items] of byCantiere) {
          try {
            // Trova fornitore best-effort (primo supplier disponibile per company)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data: suppliers } = await (supabase as any)
              .from("suppliers")
              .select("id")
              .eq("company_id", c.id)
              .limit(1);
            const supplierId = (suppliers?.[0] as { id?: string } | undefined)?.id ?? null;
            if (!supplierId) {
              console.warn(`[predict-material] no supplier for company ${c.id}`);
              continue;
            }

            const buffer = (c.jit_safety_buffer_pct as number) ?? 10;
            const itemsPayload = items.map((s) => {
              const qtyNeeded = s.consumo_medio_gg * 14 * (1 + buffer / 100); // 14gg + buffer
              return {
                material_sku: s.material_sku,
                name: s.material_name,
                qty: Math.ceil(qtyNeeded),
                unit: s.unita,
                price_estimate: 0, // placeholder: in produzione lookup listino fornitore
                note: `Saldo ${s.saldo_attuale} ${s.unita}, residuo stimato ${s.giorni_residui_stimati}gg`,
              };
            });

            const totalEur = itemsPayload.length * 100; // placeholder

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data: createRes } = await (supabase as any)
              .rpc("silvio_tool_crea_proposta_ordine_fornitore", {
                p_company_id: c.id,
                p_user_id: "00000000-0000-0000-0000-000000000000",
                p_supplier_id: supplierId,
                p_for_cantiere_id: orderId,
                p_items: itemsPayload,
                p_proposal_reason: `Stockout imminente: ${items.length} materiali sotto soglia 7gg`,
                p_total_amount_eur: totalEur,
                p_optimal_send_date: new Date(Date.now() + 86400_000).toISOString().substring(0, 10),
                p_expected_delivery_date: new Date(Date.now() + 3 * 86400_000).toISOString().substring(0, 10),
              });

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if ((createRes as any)?.success) summary.proposals_created++;
          } catch (e) {
            summary.errors++;
            console.error(`[predict-material] order ${orderId} failed:`,
              e instanceof Error ? e.message : String(e));
          }
        }
      } catch (e) {
        summary.errors++;
        console.error(`[predict-material] company ${c.id} failed:`,
          e instanceof Error ? e.message : String(e));
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
  return new Response(JSON.stringify(body), {
    status: 200, headers: { "Content-Type": "application/json" },
  });
}
