/**
 * MP-SALES-03 — Identify Dormant Customers (cron settimanale lunedì 10:00)
 *
 * Per ogni company con winback_enabled, identifica top N dormienti, genera
 * offerta personalizzata per ognuno via persona sales, salva come draft (HITL).
 */
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";
import { aiRouterComplete } from "../_shared/aiRouter.ts";

interface DormantCustomer {
  customer_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  last_order_at: string | null;
  days_since_last: number;
  orders_count: number;
  total_ltv_eur: number;
  dormancy_score: number;
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
    dormant_identified: 0,
    drafts_created: 0,
    skipped_opted_out: 0,
    errors: 0,
    duration_ms: 0,
  };

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: companies } = await (supabase as any)
      .from("companies")
      .select("id, name, winback_dormancy_threshold_days, winback_max_per_week, vertical_key")
      .eq("winback_enabled", true);

    if (!companies || companies.length === 0) {
      summary.duration_ms = Date.now() - t0;
      return jsonOk(summary);
    }

    summary.companies_processed = companies.length;

    for (const c of companies) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: identifyRes } = await (supabase as any)
          .rpc("silvio_tool_identify_dormant_customers", {
            p_company_id: c.id,
            p_user_id: "00000000-0000-0000-0000-000000000000",
            p_threshold_days: c.winback_dormancy_threshold_days ?? 180,
            p_top_n: c.winback_max_per_week ?? 50,
          });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const dormants = ((identifyRes as any)?.dormant_customers ?? []) as DormantCustomer[];
        summary.dormant_identified += dormants.length;

        for (const cust of dormants) {
          try {
            const offer = await composeWinbackOffer(supabase, c, cust);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data: createRes } = await (supabase as any)
              .rpc("silvio_tool_crea_winback_draft", {
                p_company_id: c.id,
                p_user_id: "00000000-0000-0000-0000-000000000000",
                p_customer_id: cust.customer_id,
                p_dormancy_days: cust.days_since_last,
                p_dormancy_score: cust.dormancy_score,
                p_customer_ltv_eur: cust.total_ltv_eur,
                p_customer_orders_count: cust.orders_count,
                p_ai_analysis: offer.analysis,
                p_ai_offer_summary: offer.summary,
                p_offered_products: offer.products,
                p_ai_message: offer.message,
                p_ai_cost_billed_eur: offer.costEur,
                p_channel: cust.email ? "email" : (cust.phone ? "whatsapp" : "email"),
              });

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const r = createRes as any;
            if (r?.skipped) summary.skipped_opted_out++;
            else if (r?.success) summary.drafts_created++;
          } catch (e) {
            summary.errors++;
            console.error(`[winback] customer ${cust.customer_id} failed:`,
              e instanceof Error ? e.message : String(e));
          }
        }
      } catch (e) {
        summary.errors++;
        console.error(`[winback] company ${c.id} failed:`, e instanceof Error ? e.message : String(e));
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

interface WinbackOffer {
  analysis: string;
  summary: string;
  message: string;
  products: Array<Record<string, unknown>>;
  costEur: number;
}

async function composeWinbackOffer(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  company: { id: string; name: string; vertical_key: string | null },
  cust: DormantCustomer,
): Promise<WinbackOffer> {
  const aiResult = await aiRouterComplete({
    supabase,
    taskKey: "email_compose",
    messages: [
      {
        role: "system",
        content: `Sei un sales di ${company.name} (vertical: ${company.vertical_key ?? "edilizia generale"}).

Genera offerta winback personalizzata per cliente dormiente.

Output JSON:
{
  "analysis": "ragionamento breve su cosa è probabile gli serva ora (max 200 char)",
  "offer_summary": "sintesi offerta (max 150 char)",
  "products": [{"name": "...", "qty": 1, "special_offer": "...", "reasoning": "..."}],
  "message": "messaggio personalizzato pronto da inviare (italiano caloroso, 150-250 parole)"
}

PRINCIPI:
- Tono caloroso, riferimento al cantiere/lavoro precedente se possibile
- Se cliente ha alto LTV → offerta premium con sconto fedeltà
- Se cliente è inattivo da molto → check-up gratuito o consulenza
- Includi link unsubscribe per GDPR
- Nessuna pressione commerciale aggressiva`,
      },
      {
        role: "user",
        content: JSON.stringify({
          customer_name: cust.full_name,
          days_since_last: cust.days_since_last,
          orders_count: cust.orders_count,
          total_ltv_eur: cust.total_ltv_eur,
          dormancy_score: cust.dormancy_score,
        }),
      },
    ],
    params: { temperature: 0.6, max_tokens: 1000 },
    responseFormat: { type: "json_object" },
    companyId: company.id,
    estimatedCostEur: 0.04,
    idempotencyKey: `winback-${cust.customer_id}-${new Date().toISOString().substring(0, 10)}`,
  });

  let parsed: Record<string, unknown> = {};
  try { parsed = JSON.parse(aiResult.content); }
  catch { parsed = { _parse_failed: true, _raw: aiResult.content }; }

  return {
    analysis: String(parsed.analysis ?? "Cliente dormiente da " + cust.days_since_last + " giorni"),
    summary: String(parsed.offer_summary ?? "Re-engagement con sconto fedeltà"),
    message: String(parsed.message ?? aiResult.content),
    products: Array.isArray(parsed.products) ? parsed.products as Array<Record<string, unknown>> : [],
    costEur: aiResult.costBilledEur ?? 0,
  };
}
