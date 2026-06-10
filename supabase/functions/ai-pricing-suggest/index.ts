/**
 * ai-pricing-suggest — FASE F.2
 *
 * Suggerisce prezzo ottimale per una voce listino/articolo basandosi su:
 *   - storico vendite (silvio_pricing_history RPC)
 *   - costo unitario corrente
 *   - margine target
 *   - elasticità (se prezzo medio recente < prezzo medio vecchio = pressione)
 *
 * Input: { item_name: string, company_id: uuid, costo_corrente?: number, margine_target_pct?: number }
 * Output: { success, suggestion: {...}, ai_meta }
 */

import { requireAuth, requireCompanyAccess } from "../_shared/auth.ts";
import { gateAiPayment } from "../_shared/requirePaymentMethod.ts";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { aiRouterComplete } from "../_shared/aiRouter.ts";
import { buildStableAiIdempotencyKey } from "../_shared/directAiLedger.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = Record<string, any>;

const SYSTEM_PROMPT = `Sei un esperto di pricing strategy per aziende edili italiane.
Suggerisci il prezzo di vendita ottimale per la voce.

REGOLE:
- prezzo_suggerito_eur: deve essere ragionevole vs storico (mai < costo_corrente, mai > 3x prezzo_medio storico)
- markup target consigliato edilizia: 20-40% per materiali, 40-80% per manodopera, 30-60% subappalti
- Se ultimo prezzo medio < prezzo medio storico → mercato in pressione, suggerisci leggera riduzione
- Se ultimo prezzo medio > storico → mercato favorevole, puoi alzare
- Confidenza: alta solo se hai >5 dati storici
- razionale: 1-2 frasi chiare

OUTPUT JSON ESATTO (no markdown):
{
  "prezzo_suggerito_eur": number,
  "markup_proposto_pct": number,
  "margine_eur": number,
  "confidenza": "alta"|"media"|"bassa",
  "razionale": "string max 200 char",
  "warning": ["string"],
  "trend_mercato": "in pressione"|"stabile"|"favorevole"|"sconosciuto"
}`;

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
    const { item_name, company_id, costo_corrente, margine_target_pct } = body as {
      item_name?: string;
      company_id?: string;
      costo_corrente?: number;
      margine_target_pct?: number;
    };

    if (!item_name || !company_id) {
      return errorResponse("item_name e company_id obbligatori", 400, cors);
    }
    await requireCompanyAccess(supabaseAdmin, userId, company_id, cors);

    // Gate carta (audit AI 2026-06): strumento a costo senza controllo pagamento.
    const paymentBlock = await gateAiPayment(supabaseAdmin, company_id, cors);
    if (paymentBlock) return paymentBlock;

    // Fetch storico
    const { data: history } = await supabaseAdmin.rpc("silvio_pricing_history", {
      p_company_id: company_id,
      p_item_name: item_name,
    });

    const payload = {
      voce: item_name,
      costo_corrente_eur: Number(costo_corrente ?? 0),
      margine_target_pct: Number(margine_target_pct ?? 30),
      storico_vendite: history ?? {},
    };

    let aiResult;
    try {
      const idempotencyKey = await buildStableAiIdempotencyKey("pricing_suggest", [
        company_id,
        userId,
        item_name,
        Number(costo_corrente ?? 0),
        Number(margine_target_pct ?? 30),
        history ?? null,
      ]);
      aiResult = await aiRouterComplete({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase: supabaseAdmin as any,
        taskKey: "ai_pricing_suggest",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: JSON.stringify(payload, null, 2) },
        ],
        params: { temperature: 0.2, max_tokens: 500 },
        responseFormat: { type: "json_object" },
        companyId: company_id,
        userId,
        idempotencyKey,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return errorResponse(`AI Router error: ${msg}`, 502, cors);
    }

    let parsed: AnyObj = {};
    try {
      parsed = JSON.parse(aiResult.content);
    } catch {
      return errorResponse("AI ha restituito JSON non valido", 502, cors);
    }

    return jsonResponse({
      success: true,
      suggestion: parsed,
      contesto: history,
      ai_meta: {
        model_used: aiResult.modelUsed,
        tokens: aiResult.totalTokens,
        cost_billed_eur: aiResult.costBilledEur,
      },
    }, 200, cors);
  } catch (err) {
    if (err instanceof Response) return err;
    return errorResponse(`Errore interno: ${err instanceof Error ? err.message : String(err)}`, 500, getCorsHeaders(req));
  }
});
