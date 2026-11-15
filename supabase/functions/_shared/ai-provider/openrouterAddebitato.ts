/**
 * `callOpenRouter` con controllo del credito prima e addebito dopo (15/11/2026).
 *
 * `callOpenRouter` è un client puro: non sa di chi è la chiamata e non tocca i
 * crediti. Chi lo usa direttamente (fuori da `chat()` e dal router) chiamava
 * l'AI a carico della piattaforma: `email-ai-estrai-allegato` (Sonnet sui PDF),
 * `email-ai-opportunita`. Questo involucro mette il blocco e l'addebito nel
 * punto della chiamata, sulla strada diretta (`ai_model_usage_log`, ricarico
 * da `ai_pricing_markup`), con la chiave di idempotenza e l'id della generazione.
 */
import { callOpenRouter, type OpenRouterParams, type OpenRouterResult } from "./openrouter.ts";
import { precallCheck } from "./billing.ts";
import { chargeAndLogDirect } from "./directApi.ts";
import type { TaskKind } from "./types.ts";

export class CreditoAiInsufficiente extends Error {
  constructor(public messaggio: string) {
    super(messaggio);
    this.name = "CreditoAiInsufficiente";
  }
}

export interface AddebitoOpenRouter {
  // deno-lint-ignore no-explicit-any
  supabase: any;
  task_kind: string;
  company_id: string | null;
  /** Identità del lavoro (allegato, email): un retry non addebita due volte la stessa generazione. */
  idempotency_key?: string | null;
  estimated_tokens_total?: number;
  metadata?: Record<string, unknown>;
}

export async function callOpenRouterAddebitato(
  params: OpenRouterParams,
  addebito: AddebitoOpenRouter,
): Promise<OpenRouterResult> {
  const pre = await precallCheck(addebito.supabase, {
    company_id: addebito.company_id,
    task_kind: addebito.task_kind as TaskKind,
    estimated_tokens_total: addebito.estimated_tokens_total ?? 4000,
  });
  if (!pre.allow) {
    throw new CreditoAiInsufficiente(pre.user_message_it || "Crediti AI esauriti: ricarica il borsellino per continuare.");
  }

  const t0 = Date.now();
  const r = await callOpenRouter(params, { task_kind: addebito.task_kind, company_id: addebito.company_id });

  await chargeAndLogDirect({
    supabase: addebito.supabase,
    company_id: addebito.company_id,
    task_kind: addebito.task_kind,
    model_used: r.model || params.model,
    cost_usd_real: r.cost_usd,
    cost_is_estimated: r.cost_is_estimated,
    tokens_prompt: r.usage?.prompt_tokens ?? 0,
    tokens_completion: r.usage?.completion_tokens ?? 0,
    idempotency_key: addebito.idempotency_key ?? null,
    metadata: { ...(addebito.metadata ?? {}), generation_id: r.generation_id ?? null, latency_ms: Date.now() - t0 },
  });
  return r;
}
