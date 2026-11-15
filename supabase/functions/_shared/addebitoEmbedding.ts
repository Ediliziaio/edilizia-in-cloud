/**
 * Embedding addebitato all'azienda che lo causa (15/11/2026).
 *
 * `brainEmbed.ts` è un client puro e non sa di chi è la chiamata. I punti che
 * lavorano per un'azienda (ricerca nel listino del computo e dei preventivi,
 * contesto RAG di Silvio) chiamano questo subito dopo l'embedding: stessa
 * strada diretta degli altri embedding (`addebita_ai_diretta`, ricarico da
 * `ai_pricing_markup`). Costo trascurabile, ma registrato e addebitato come
 * tutto il resto. Non lancia mai: l'embedding è già pagato.
 */
import { chargeAndLogDirect, estimateEmbeddingUsage } from "./ai-provider/directApi.ts";

export async function addebitaEmbedding(args: {
  // deno-lint-ignore no-explicit-any
  supabase: any;
  companyId: string | null | undefined;
  testo: string | string[];
  taskKind: string;
  userId?: string | null;
}): Promise<void> {
  if (!args.supabase) return;
  try {
    const uso = estimateEmbeddingUsage(args.testo);
    await chargeAndLogDirect({
      supabase: args.supabase,
      company_id: args.companyId ?? null,
      task_kind: args.taskKind,
      model_used: "openai/text-embedding-3-small",
      cost_usd_real: uso.costUsd,
      cost_is_estimated: true,
      tokens_prompt: uso.tokens,
      metadata: args.userId ? { user_id: args.userId } : {},
    });
  } catch (e) {
    console.warn(`[addebitoEmbedding] ${args.taskKind}:`, (e as Error)?.message ?? e);
  }
}
