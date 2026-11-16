/**
 * Embedding registrato all'azienda che lo causa.
 *
 * `brainEmbed.ts` è un client puro e non sa di chi è la chiamata. I punti che
 * lavorano per un'azienda (ricerca nel listino del computo e dei preventivi,
 * contesto RAG di Silvio) chiamano questo subito dopo l'embedding: strada
 * diretta (`addebita_ai_diretta`). Dal 16/11/2026 gli embedding sono REGALATI
 * (decisione del titolare): la riga resta col costo vero e l'azienda, a 0 sul
 * portafoglio, come costo della piattaforma (`ai_ricarico_per`: modello
 * `*embed*`). Non lancia mai: l'embedding è già pagato.
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
