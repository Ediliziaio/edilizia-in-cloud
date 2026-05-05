/**
 * ai-customer-ltv — FASE D
 *
 * Esegue il calcolo deterministico LTV (RPC silvio_compute_customer_ltv)
 * e poi opzionalmente arricchisce i top N clienti con AI reasoning + azioni.
 *
 * Input:
 *   { company_id: uuid, ai_enrich_top?: number (default 5) }
 *
 * Output:
 *   { success, summary: {...}, top_value: [...], top_at_risk: [...], ai_meta }
 */

import { requireAuth } from "../_shared/auth.ts";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { aiRouterComplete } from "../_shared/aiRouter.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = Record<string, any>;

const AI_ENRICH_PROMPT = `Sei un consulente commerciale italiano specializzato in CRM edilizio.
Per il cliente fornito (con storico ordini), genera:
- ai_reasoning: 1-2 frasi sul cliente (comportamento di acquisto, profilo)
- azione_consigliata: azione concreta (max 100 char) per massimizzare LTV / ridurre churn

Ritorna JSON: { "ai_reasoning": "string", "azione_consigliata": "string" }`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }
  const cors = getCorsHeaders(req);

  try {
    if (req.method !== "POST") {
      return errorResponse("Metodo non consentito", 405, cors);
    }

    const { userId, supabaseAdmin } = await requireAuth(req, cors);

    const body = await req.json().catch(() => ({}));
    const { company_id, ai_enrich_top } = body as {
      company_id?: string;
      ai_enrich_top?: number;
    };

    if (!company_id) return errorResponse("company_id obbligatorio", 400, cors);

    // Step 1: ricalcola snapshots deterministici
    const { data: computeData, error: computeErr } = await supabaseAdmin
      .rpc("silvio_compute_customer_ltv", { p_company_id: company_id });
    if (computeErr) {
      return errorResponse(`Compute LTV error: ${computeErr.message}`, 500, cors);
    }

    // Step 2: top value e top at risk
    const { data: topValue } = await supabaseAdmin
      .rpc("silvio_top_value_customers", { p_company_id: company_id, p_limit: 10 });
    const { data: topAtRisk } = await supabaseAdmin
      .rpc("silvio_top_at_risk_customers", { p_company_id: company_id, p_limit: 10 });

    // Step 3: opzionale AI enrich top N (default 5)
    const enrichN = Math.min(20, Math.max(0, Number(ai_enrich_top ?? 5)));
    let aiTokens = 0;
    let aiCostEur = 0;
    let aiModel = "";
    let enriched = 0;

    if (enrichN > 0) {
      // Fetch top N snapshots da arricchire
      const { data: snapshots } = await supabaseAdmin
        .from("customer_ltv_snapshots")
        .select("id, client_display_name, ordini_totali, fatturato_storico_eur, ticket_medio_eur, ltv_predetto_12m_eur, churn_risk, giorni_dall_ultimo_ordine, frequenza_ordini_mesi, payment_delay_avg_gg")
        .eq("company_id", company_id)
        .order("ltv_predetto_12m_eur", { ascending: false })
        .limit(enrichN);

      for (const s of (snapshots ?? []) as AnyObj[]) {
        try {
          const result = await aiRouterComplete({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            supabase: supabaseAdmin as any,
            taskKey: "customer_ltv_predict",
            messages: [
              { role: "system", content: AI_ENRICH_PROMPT },
              { role: "user", content: JSON.stringify(s, null, 2) },
            ],
            params: { temperature: 0.2, max_tokens: 400 },
            responseFormat: { type: "json_object" },
            companyId: company_id,
            userId,
          });
          aiTokens += result.totalTokens;
          aiCostEur += result.costRealEur;
          aiModel = result.modelUsed;

          let parsed: AnyObj = {};
          try { parsed = JSON.parse(result.content); } catch { continue; }

          await supabaseAdmin
            .from("customer_ltv_snapshots")
            .update({
              ai_reasoning: String(parsed.ai_reasoning ?? "").slice(0, 1000),
              azione_consigliata: String(parsed.azione_consigliata ?? "").slice(0, 500),
              ai_model_used: aiModel,
            })
            .eq("id", s.id);
          enriched++;
        } catch (e) {
          console.warn(`[ai-customer-ltv] enrich failed for ${s.client_display_name}: ${e}`);
        }
      }
    }

    return jsonResponse({
      success: true,
      summary: computeData,
      top_value: topValue ?? [],
      top_at_risk: topAtRisk ?? [],
      ai_meta: {
        enriched,
        model_used: aiModel,
        total_tokens: aiTokens,
        total_cost_eur: aiCostEur,
      },
    }, 200, cors);
  } catch (err) {
    if (err instanceof Response) return err;
    return errorResponse(`Errore interno: ${err instanceof Error ? err.message : String(err)}`, 500, getCorsHeaders(req));
  }
});
