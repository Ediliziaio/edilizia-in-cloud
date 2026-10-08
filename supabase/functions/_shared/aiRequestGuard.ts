/** Cross-worker provider deduplication. Requires the matching DB migration.
 * No lease stealing: a crashed worker may already have spent money. Such a
 * request must be reconciled, never silently sent to the provider again.
 */
export interface GuardDb {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error?: unknown }>;
}

export class AiRequestGuardError extends Error {
  constructor(public code: string) {
    super(`AI request safety: ${code}`);
    this.name = "AiRequestGuardError";
  }
}

export class AiProviderCreditError extends Error {
  constructor() {
    super("OpenRouter 402: credito provider insufficiente; tentativi automatici sospesi");
    this.name = "AiProviderCreditError";
  }
}

export function isProviderCreditError(error: unknown): boolean {
  return error instanceof AiProviderCreditError ||
    /OpenRouter(?:\s+error)?\s*402\b/i.test(error instanceof Error ? error.message : String(error));
}

export async function aiRequestHash(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
}

export interface ProviderAttempt {
  model: string;
  generation_id: string | null;
  status: "response" | "http_error" | "unknown";
  http_status?: number;
  cost_usd: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
}

export function providerAttempt(model: string, data: { id?: unknown; usage?: Record<string, unknown> }): ProviderAttempt {
  const count = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
  return { model, status: "response", generation_id: typeof data.id === "string" ? data.id : null,
    cost_usd: count(data.usage?.cost), input_tokens: count(data.usage?.prompt_tokens),
    output_tokens: count(data.usage?.completion_tokens) };
}

export interface GuardContext {
  key: string;
  checkpoint(attempt: ProviderAttempt): Promise<void>;
}

export async function runGuardedAiRequest<T>(opts: {
  db: GuardDb; companyId: string; userId: string; taskKey: string;
  idempotencyKey: string; fingerprint: unknown; providerKey: string;
  execute: (context: GuardContext) => Promise<T>;
  replay: (result: T) => T;
}): Promise<T> {
  if (!opts.companyId || !opts.userId || !opts.idempotencyKey) throw new AiRequestGuardError("missing_scope");
  const key = await aiRequestHash([opts.companyId, opts.userId, opts.taskKey, opts.idempotencyKey]);
  const owner = crypto.randomUUID();
  const providerKey = await aiRequestHash(["openrouter", opts.providerKey]);
  const { data, error } = await opts.db.rpc("ai_provider_request_claim", {
    p_key: key, p_company: opts.companyId, p_user: opts.userId, p_task: opts.taskKey,
    p_input_hash: await aiRequestHash(opts.fingerprint), p_owner: owner,
    p_provider_key: providerKey, p_legacy_key: opts.idempotencyKey,
  });
  if (error || !data || typeof data !== "object") throw new AiRequestGuardError("claim_unavailable");
  const claim = data as { state?: string; result?: T };
  if (claim.state === "completed" && claim.result) return opts.replay(claim.result);
  if (claim.state === "provider_cooldown") throw new AiProviderCreditError();
  if (claim.state !== "claimed") throw new AiRequestGuardError(claim.state ?? "invalid_claim");

  try {
    const result = await opts.execute({ key, checkpoint: async attempt => {
      const saved = await opts.db.rpc("ai_provider_request_checkpoint", { p_key: key, p_owner: owner, p_attempt: attempt });
      if (saved.error || saved.data !== true) throw new AiRequestGuardError("checkpoint_unavailable");
    } });
    const saved = await opts.db.rpc("ai_provider_request_finish", {
      p_key: key, p_owner: owner, p_result: result, p_failure: null, p_provider_blocked: false,
    });
    if (saved.error || saved.data !== true) throw new AiRequestGuardError("completion_unavailable");
    return result;
  } catch (error) {
    // If this also fails, the durable 'running' row still prevents another spend.
    try {
      await opts.db.rpc("ai_provider_request_finish", {
        p_key: key, p_owner: owner, p_result: null,
        p_failure: isProviderCreditError(error) ? "provider_credit" : "reconciliation_required",
        p_provider_blocked: isProviderCreditError(error),
      });
    } catch { /* Preserve the original error; never retry the provider here. */ }
    throw error;
  }
}
