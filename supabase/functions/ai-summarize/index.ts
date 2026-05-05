/**
 * ai-summarize — FASE H.2
 *
 * Riassume un testo lungo in formato strutturato (TL;DR + bullet + action items).
 * Utile per: note lunghe contatti, email cliente, contratti, descrizioni progetti.
 *
 * Input:
 *   { text: string, company_id: uuid, max_length?: 'short'|'medium'|'long', focus?: string }
 *
 * Output:
 *   { success, summary: { tldr, bullets[], actions_needed[], keywords[] }, ai_meta }
 */

import { requireAuth, requireCompanyAccess } from "../_shared/auth.ts";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { aiRouterComplete } from "../_shared/aiRouter.ts";
import { buildStableAiIdempotencyKey } from "../_shared/directAiLedger.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = Record<string, any>;

const MAX_INPUT_CHARS = 30000;

function buildPrompt(focus: string | undefined, maxLength: string): string {
  const tldrLen = maxLength === "short" ? 60 : maxLength === "long" ? 200 : 120;
  const bulletsCount = maxLength === "short" ? 3 : maxLength === "long" ? 8 : 5;

  let p = `Sei un assistente di knowledge worker italiano. Riassumi il testo fornito in formato strutturato professionale.

OUTPUT JSON ESATTO (no markdown):
{
  "tldr": "string max ${tldrLen} char — sintesi una frase",
  "bullets": ["max ${bulletsCount} punti chiave"],
  "actions_needed": ["azioni concrete da fare, se presenti"],
  "keywords": ["max 8 parole chiave per categorizzazione"],
  "tone_rilevato": "neutro" | "formale" | "informale" | "urgente" | "positivo" | "critico",
  "confidenza": "alta" | "media" | "bassa"
}`;

  if (focus && focus.length > 0) {
    p += `\n\nFOCUS RICHIESTO: ${focus.slice(0, 200)}`;
  }
  return p;
}

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
    const { text, company_id, max_length, focus } = body as {
      text?: string;
      company_id?: string;
      max_length?: "short" | "medium" | "long";
      focus?: string;
    };

    if (!company_id) return errorResponse("company_id obbligatorio", 400, cors);
    await requireCompanyAccess(supabaseAdmin, userId, company_id, cors);
    if (!text || text.trim().length < 10) {
      return errorResponse("text obbligatorio (min 10 caratteri)", 400, cors);
    }

    const truncated = text.slice(0, MAX_INPUT_CHARS);
    const sysPrompt = buildPrompt(focus, max_length ?? "medium");
    const idempotencyKey = await buildStableAiIdempotencyKey("text_summarize", [
      company_id,
      userId,
      max_length ?? "medium",
      focus ?? "",
      truncated,
    ]);

    let aiResult;
    try {
      aiResult = await aiRouterComplete({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase: supabaseAdmin as any,
        taskKey: "text_summarize",
        messages: [
          { role: "system", content: sysPrompt },
          { role: "user", content: truncated },
        ],
        params: { temperature: 0.2, max_tokens: 1000 },
        responseFormat: { type: "json_object" },
        companyId: company_id,
        userId,
        idempotencyKey,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return errorResponse(`AI Router error: ${msg}`, 502, cors);
    }

    let summary: AnyObj = {};
    try {
      summary = JSON.parse(aiResult.content);
    } catch {
      return errorResponse("AI ha restituito JSON non valido", 502, cors);
    }

    return jsonResponse({
      success: true,
      summary,
      input_length_chars: text.length,
      truncated: text.length > MAX_INPUT_CHARS,
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
