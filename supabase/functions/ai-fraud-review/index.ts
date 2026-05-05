/**
 * ai-fraud-review — FASE I.2
 *
 * Analizza anomalie rilevate (frodi/duplicati/importi anomali) e produce
 * report consulenziale con classificazione gravita + azioni concrete.
 *
 * Input:  { company_id: uuid }
 * Output: { success, review: {...}, ai_meta }
 */

import { requireAuth, requireCompanyAccess } from "../_shared/auth.ts";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { aiRouterComplete } from "../_shared/aiRouter.ts";
import { buildStableAiIdempotencyKey } from "../_shared/directAiLedger.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = Record<string, any>;

const SYSTEM_PROMPT = `Sei un esperto di internal audit e fraud detection per imprese italiane.
Analizza le anomalie rilevate e produci una review consulenziale.

OUTPUT JSON ESATTO (no markdown):
{
  "livello_rischio_complessivo": "basso"|"medio"|"alto"|"critico",
  "anomalie_classificate": [
    {
      "tipo": "string (dal dato originale)",
      "dato_id": "string",
      "gravita": "bassa"|"media"|"alta"|"critica",
      "interpretazione": "string max 200 char — perche e un problema",
      "azioni_consigliate": ["max 3 string max 100 char"],
      "fraud_score": int 0-100
    }
  ],
  "pattern_sospetti": ["string max 200 char — pattern trasversali"],
  "next_actions_audit": ["max 5 azioni concrete da fare in audit"],
  "raccomandazione_governance": "string max 300 char — miglioramenti processo"
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
    const { company_id } = body as { company_id?: string };
    if (!company_id) return errorResponse("company_id obbligatorio", 400, cors);
    await requireCompanyAccess(supabaseAdmin, userId, company_id, cors);

    // Fetch anomalie + run anomalie detect on fatture before
    await supabaseAdmin.rpc("silvio_fatture_anomalie_detect", { p_company_id: company_id });

    const { data: anomalie } = await supabaseAdmin.rpc(
      "silvio_detect_frodi_anomalie", { p_company_id: company_id },
    );

    const anomalieList = ((anomalie as AnyObj)?.anomalie ?? []) as AnyObj[];

    if (anomalieList.length === 0) {
      return jsonResponse({
        success: true,
        review: {
          livello_rischio_complessivo: "basso",
          anomalie_classificate: [],
          pattern_sospetti: [],
          next_actions_audit: ["Nessuna anomalia rilevata - mantieni pratiche correnti"],
          raccomandazione_governance: "Sistema sano. Continua monitoraggio mensile.",
        },
        contesto: { anomalie_count: 0 },
        ai_meta: { skipped: true },
      }, 200, cors);
    }

    let aiResult;
    try {
      const idempotencyKey = await buildStableAiIdempotencyKey("fraud_review", [
        company_id,
        userId,
        anomalieList,
      ]);
      aiResult = await aiRouterComplete({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase: supabaseAdmin as any,
        taskKey: "fraud_anomaly_review",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Analizza queste anomalie:\n\n${JSON.stringify(anomalieList, null, 2)}` },
        ],
        params: { temperature: 0.1, max_tokens: 1500 },
        responseFormat: { type: "json_object" },
        companyId: company_id,
        userId,
        idempotencyKey,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return errorResponse(`AI Router error: ${msg}`, 502, cors);
    }

    let review: AnyObj = {};
    try {
      review = JSON.parse(aiResult.content);
    } catch {
      return errorResponse("AI ha restituito JSON non valido", 502, cors);
    }

    return jsonResponse({
      success: true,
      review,
      contesto: { anomalie_count: anomalieList.length },
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
