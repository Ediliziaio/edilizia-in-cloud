// Shared ledger helper for provider calls that cannot go through aiRouter
// yet (for example Whisper transcription and embedding/image APIs).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;

export interface DirectAiChargeArgs {
  supabase: SupabaseClient;
  idempotencyKey: string;
  companyId: string;
  userId: string | null;
  taskKey: string;
  tierKey: string;
  modelUsed: string;
  personaKey?: string | null;
  tokensIn?: number;
  tokensOut?: number;
  costRealUsd: number;
  durationMs?: number;
  metadata?: Record<string, unknown>;
}

export interface PlatformAiLogArgs {
  supabase: SupabaseClient;
  operationKey: string;
  provider: string;
  modelUsed: string;
  userId?: string | null;
  tokensIn?: number;
  tokensOut?: number;
  costRealUsd?: number;
  durationMs?: number;
  status?: "success" | "error" | "timeout";
  errorMessage?: string | null;
  metadata?: Record<string, unknown>;
}

export async function buildStableAiIdempotencyKey(prefix: string, parts: unknown[]): Promise<string> {
  const normalized = JSON.stringify(parts, (_key, value) => {
    if (typeof value === "bigint") return value.toString();
    if (value instanceof Date) return value.toISOString();
    return value;
  });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalized));
  const hash = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `${prefix}_${hash}`;
}

export async function chargeDirectAiCall(args: DirectAiChargeArgs): Promise<Record<string, unknown>> {
  const { data, error } = await args.supabase.rpc("charge_ai_call", {
    p_idempotency_key: args.idempotencyKey,
    p_company_id: args.companyId,
    p_user_id: args.userId,
    p_task_key: args.taskKey,
    p_tier_key: args.tierKey,
    p_model_used: args.modelUsed,
    p_used_primary: true,
    p_fallback_index: 0,
    p_persona_key: args.personaKey ?? null,
    p_tokens_in: args.tokensIn ?? 0,
    p_tokens_out: args.tokensOut ?? 0,
    p_cost_real_usd: args.costRealUsd,
    p_fx_usd_to_eur: Number(Deno.env.get("AI_FX_USD_EUR") ?? "0.92"),
    p_status: "success",
    p_error_message: null,
    p_duration_ms: args.durationMs ?? null,
    p_metadata: args.metadata ?? {},
  });

  if (error) {
    const failOpen = Deno.env.get("AI_DIRECT_ALLOW_CHARGE_FAIL_OPEN") === "true";
    if (failOpen) {
      console.warn("[directAiLedger] charge_ai_call failed open:", error.message);
      return { charge_failed_open: true, error: error.message };
    }
    throw new Error(`AI ledger charge failed: ${error.message}`);
  }

  return (data ?? {}) as Record<string, unknown>;
}

export async function logPlatformAiCall(args: PlatformAiLogArgs): Promise<void> {
  const { error } = await args.supabase.from("platform_ai_usage_log").insert({
    operation_key: args.operationKey,
    provider: args.provider,
    model_used: args.modelUsed,
    tokens_in: args.tokensIn ?? 0,
    tokens_out: args.tokensOut ?? 0,
    cost_real_usd: args.costRealUsd ?? 0,
    duration_ms: args.durationMs ?? null,
    status: args.status ?? "success",
    error_message: args.errorMessage ?? null,
    user_id: args.userId ?? null,
    metadata: args.metadata ?? {},
  });

  if (error) {
    const failOpen = Deno.env.get("AI_PLATFORM_ALLOW_LOG_FAIL_OPEN") === "true";
    if (failOpen) {
      console.warn("[directAiLedger] platform_ai_usage_log failed open:", error.message);
      return;
    }
    throw new Error(`Platform AI usage log failed: ${error.message}`);
  }
}

export function estimateWhisperCostUsd(durationSeconds: number | null | undefined): number {
  const seconds = Math.max(1, Number(durationSeconds ?? 0));
  return (seconds / 60) * 0.006;
}

export function estimateEmbeddingUsage(input: string | string[]): { tokens: number; costUsd: number } {
  const text = Array.isArray(input) ? input.join("\n") : input;
  // Conservative approximation for Latin text. The provider returns no usage
  // on some embedding endpoints, so we estimate to keep ledger coverage.
  const tokens = Math.max(1, Math.ceil(text.length / 4));
  const pricePerMillion = Number(Deno.env.get("AI_EMBEDDING_3_SMALL_USD_PER_1M_TOKENS") ?? "0.02");
  const costUsd = Math.max(0.000001, (tokens / 1_000_000) * pricePerMillion);
  return { tokens, costUsd };
}

export function estimateTokenCostUsd(args: {
  provider: string;
  inputTokens?: number | null;
  outputTokens?: number | null;
  fallbackCostUsd?: number;
}): number {
  const provider = args.provider.toLowerCase();
  const defaults = provider.includes("anthropic")
    ? { input: 3, output: 15 }
    : provider.includes("gemini") || provider.includes("google")
      ? { input: 1.25, output: 10 }
      : provider.includes("openai")
        ? { input: 5, output: 15 }
        : { input: 1, output: 3 };

  const envPrefix = provider.includes("anthropic")
    ? "ANTHROPIC"
    : provider.includes("gemini") || provider.includes("google")
      ? "GEMINI"
      : provider.includes("openai")
        ? "OPENAI"
        : "DIRECT_AI";

  const inputPrice = Number(Deno.env.get(`AI_${envPrefix}_USD_PER_1M_INPUT_TOKENS`) ?? defaults.input);
  const outputPrice = Number(Deno.env.get(`AI_${envPrefix}_USD_PER_1M_OUTPUT_TOKENS`) ?? defaults.output);
  const inputTokens = Math.max(0, Number(args.inputTokens ?? 0));
  const outputTokens = Math.max(0, Number(args.outputTokens ?? 0));
  const tokenCost = (inputTokens / 1_000_000) * inputPrice + (outputTokens / 1_000_000) * outputPrice;

  if (tokenCost > 0) return Math.max(0.000001, tokenCost);
  return Math.max(0.000001, Number(args.fallbackCostUsd ?? 0.01));
}
