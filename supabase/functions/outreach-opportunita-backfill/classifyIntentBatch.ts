/**
 * classifyIntentBatch — classifica con l'AI fino a `lotto` risposte email
 * ancora senza `intent`, per il backfill storico. Stessa logica AI del
 * flusso live (outreach-reply-handler.ts), qui applicata a un lotto invece
 * che a una risposta appena arrivata.
 */

// deno-lint-ignore-file no-explicit-any

import { aiRouterComplete } from "../_shared/aiRouter.ts";
import { normalizeIntent, normalizeConfidence, INTENT_SYSTEM_PROMPT, buildIntentUserPrompt } from "../_shared/outreach-intent.ts";

export async function classifyIntentBatch(admin: any, companyId: string, lotto: number): Promise<number> {
  const { data: righe } = await admin
    .from("outreach_replies")
    .select("id, subject, snippet")
    .eq("company_id", companyId)
    .is("intent", null)
    .limit(lotto);

  let classificate = 0;
  for (const r of (righe ?? []) as Array<{ id: string; subject: string | null; snippet: string | null }>) {
    try {
      const result = await aiRouterComplete({
        supabase: admin,
        taskKey: "outreach_reply_intent",
        messages: [
          { role: "system", content: INTENT_SYSTEM_PROMPT },
          { role: "user", content: buildIntentUserPrompt(r.subject ?? "", r.snippet ?? "") },
        ],
        params: { temperature: 0, max_tokens: 60 },
        responseFormat: { type: "json_object" },
        companyId,
        userId: null,
        skipCharge: true,
      });
      let intent = "other";
      let confidence = 0;
      try {
        const o = JSON.parse(result.content || "{}");
        intent = normalizeIntent(o.intent);
        confidence = normalizeConfidence(o.confidence);
      } catch { /* default other */ }
      await admin.from("outreach_replies").update({ intent, intent_confidence: confidence }).eq("id", r.id);
      classificate++;
    } catch (e) {
      console.warn("[classifyIntentBatch] skip:", e instanceof Error ? e.message : e);
    }
  }
  return classificate;
}
