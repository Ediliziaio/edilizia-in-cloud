/**
 * MP-SALES-04 — AI Pricing Engine (on-demand)
 *
 * Body:
 *   { quote_id: uuid, company_id: uuid, customer_id?: uuid,
 *     voci: Array<{ descrizione: string, qty: number, computo_line_id?: string }> }
 *
 * Flow per ogni voce:
 *   1. RPC storico_pricing_voce → costo medio company storico
 *   2. RPC suggerisci_prezzo_voce → prezzo AI (margine target + fattori contestuali)
 *   3. Calcola 3 varianti: economy (-15%), standard (AI), premium (+20%)
 *   4. Insert in pricing_suggestions con reasoning + comparison
 *
 * Risk level safe — read+propose only, decisione finale al sales.
 */
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const t0 = Date.now();
  let body: {
    quote_id?: string;
    company_id?: string;
    customer_id?: string;
    voci?: Array<{ descrizione: string; qty: number; computo_line_id?: string }>;
  } = {};

  try {
    body = await req.json();
  } catch {
    return jsonOk({ ok: false, error: "invalid_json" }, 400);
  }

  if (!body.quote_id || !body.company_id || !Array.isArray(body.voci)) {
    return jsonOk({ ok: false, error: "missing_required_fields" }, 400);
  }

  const summary = {
    voci_processate: 0,
    suggestions_create: 0,
    duration_ms: 0,
    errors: [] as string[],
  };

  // Default margine company (se modulo settings dispone, override via DB)
  const defaultMarginPct = 25;

  for (const voce of body.voci) {
    try {
      summary.voci_processate += 1;

      // 1. Storico pricing voce
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: storico } = await (supabase as any).rpc(
        "silvio_tool_storico_pricing_voce",
        {
          p_company_id: body.company_id,
          p_voce_descrizione: voce.descrizione,
        },
      );

      // 2. Prezzo AI suggerito
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: suggested } = await (supabase as any).rpc(
        "silvio_tool_suggerisci_prezzo_voce",
        {
          p_company_id: body.company_id,
          p_voce_descrizione: voce.descrizione,
          p_qty: voce.qty,
          p_customer_id: body.customer_id ?? null,
        },
      );

      const suggestedPrice = (suggested as { price_eur?: number } | null)?.price_eur ??
        (storico as { avg_price_eur?: number } | null)?.avg_price_eur ?? 0;
      const costReal = (storico as { avg_cost_eur?: number } | null)?.avg_cost_eur ?? 0;
      const margin = suggestedPrice > 0
        ? ((suggestedPrice - costReal) / suggestedPrice) * 100
        : defaultMarginPct;

      // 3. Calcolo 3 varianti
      const economy = suggestedPrice * 0.85;
      const standard = suggestedPrice;
      const premium = suggestedPrice * 1.2;

      // 4. Insert in pricing_suggestions
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: insErr } = await (supabase as any)
        .from("pricing_suggestions")
        .insert({
          company_id: body.company_id,
          quote_id: body.quote_id,
          customer_id: body.customer_id ?? null,
          computo_line_id: voce.computo_line_id ?? null,
          voce_descrizione: voce.descrizione,
          cost_real_eur: costReal,
          price_history_avg_eur: (storico as { avg_price_eur?: number } | null)?.avg_price_eur ?? null,
          suggested_price_eur: standard,
          suggested_margin_pct: margin,
          ai_reasoning:
            (suggested as { reasoning?: string } | null)?.reasoning ??
            "Suggestion basata su storico company.",
          economy_price_eur: economy,
          standard_price_eur: standard,
          premium_price_eur: premium,
          ai_persona_used: "sales",
          ai_cost_billed_eur: 0.002,
        });

      if (!insErr) summary.suggestions_create += 1;
      else summary.errors.push(`voce ${voce.descrizione}: ${insErr.message}`);
    } catch (e) {
      summary.errors.push(`voce ${voce.descrizione}: ${(e as Error).message}`);
    }
  }

  summary.duration_ms = Date.now() - t0;
  return jsonOk({ ok: true, ...summary });
});

function jsonOk(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
