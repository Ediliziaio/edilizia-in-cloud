/** Request-local limits. Never shared between tenants or persisted as billing truth. */
export class AiTurnLimitError extends Error {
  constructor(public reason: "time" | "attempts" | "tokens" | "cost") {
    super(`AI turn limit: ${reason}`);
    this.name = "AiTurnLimitError";
  }
}

export interface AiTurnLimits {
  durationMs: number;
  maxAttempts: number;
  maxReservedOutputTokens: number;
  maxEstimatedInputTokens: number;
  /** Stop starting more calls after this OBSERVED spend, not a guaranteed price cap. */
  stopAfterObservedUsd: number;
}

const DEFAULT_LIMITS: AiTurnLimits = {
  durationMs: 110_000,
  maxAttempts: 14,
  maxReservedOutputTokens: 48_000,
  maxEstimatedInputTokens: 240_000,
  stopAfterObservedUsd: 1,
};

const nonNegative = (n: unknown): number => typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : 0;

export class AiTurnControl {
  readonly startedAt: number;
  readonly deadlineAt: number;
  readonly limits: AiTurnLimits;
  private attempts = 0;
  private reservations = 0;
  private estimatedInput = 0;
  private input = 0;
  private output = 0;
  private cached = 0;
  private cacheWrites = 0;
  private reasoning = 0;
  private costUsd = 0;
  private billedEur = 0;
  private usageResponses = 0;
  private costResponses = 0;
  private firstTextMs: number | null = null;
  private excluded = new Set<string>(["embeddings", "tool_internal_ai", "background_memory"]);
  private recorded = new Set<number>();

  constructor(limits: Partial<AiTurnLimits> = {}, private now: () => number = Date.now) {
    this.limits = { ...DEFAULT_LIMITS, ...limits };
    for (const value of Object.values(this.limits)) {
      if (!Number.isFinite(value) || value <= 0) throw new Error("Invalid AI turn limits");
    }
    this.startedAt = now();
    this.deadlineAt = this.startedAt + this.limits.durationMs;
  }

  remainingMs(): number { return Math.max(0, this.deadlineAt - this.now()); }

  assertCanStart(): void {
    if (this.remainingMs() < 1_000) throw new AiTurnLimitError("time");
    if (this.attempts >= this.limits.maxAttempts) throw new AiTurnLimitError("attempts");
    if (this.costUsd >= this.limits.stopAfterObservedUsd) throw new AiTurnLimitError("cost");
  }

  /** Reserve every HTTP attempt, including retries whose final usage might be lost. */
  beginAttempt(inputCharacters: number, outputTokens: number): number {
    this.assertCanStart();
    const estimated = Math.ceil(nonNegative(inputCharacters) / 3);
    const output = nonNegative(outputTokens);
    if (this.reservations + output > this.limits.maxReservedOutputTokens ||
        this.estimatedInput + estimated > this.limits.maxEstimatedInputTokens) {
      throw new AiTurnLimitError("tokens");
    }
    this.reservations += output;
    this.estimatedInput += estimated;
    return ++this.attempts;
  }

  recordUsage(attempt: number, raw: unknown): void {
    if (this.recorded.has(attempt) || !raw || typeof raw !== "object") return;
    this.recorded.add(attempt);
    const u = raw as Record<string, unknown>;
    if ([u.prompt_tokens, u.completion_tokens].every(n => typeof n === "number" && Number.isFinite(n) && n >= 0)) this.usageResponses++;
    this.input += nonNegative(u.prompt_tokens);
    this.output += nonNegative(u.completion_tokens);
    const details = (u.prompt_tokens_details ?? {}) as Record<string, unknown>;
    const completion = (u.completion_tokens_details ?? {}) as Record<string, unknown>;
    this.cached += nonNegative(details.cached_tokens ?? u.cache_read_input_tokens);
    this.cacheWrites += nonNegative(details.cache_write_tokens ?? u.cache_creation_input_tokens ?? details.cache_creation_input_tokens);
    this.reasoning += nonNegative(completion.reasoning_tokens);
    if (typeof u.cost === "number" && Number.isFinite(u.cost) && u.cost >= 0) {
      this.costResponses++;
      this.costUsd += u.cost;
    }
  }

  recordBilled(eur: number): void { this.billedEur += nonNegative(eur); }
  /** Server persistence latency, not browser paint time or provider TTFT. */
  markStoredText(): void { this.firstTextMs ??= Math.max(0, this.now() - this.startedAt); }
  exclude(scope: string): void { this.excluded.add(scope); }

  snapshot() {
    return {
      scope: "chat_and_classifier" as const,
      elapsed_ms: Math.max(0, this.now() - this.startedAt),
      first_stored_text_ms: this.firstTextMs,
      provider_attempts: this.attempts,
      input_tokens: this.input,
      output_tokens: this.output,
      cached_input_tokens: this.cached,
      cache_write_tokens: this.cacheWrites,
      reasoning_tokens: this.reasoning,
      reported_cost_usd: this.costUsd,
      billed_cost_eur: this.billedEur,
      usage_complete: this.usageResponses === this.attempts,
      provider_cost_complete: this.costResponses === this.attempts,
      excluded_scopes: [...this.excluded],
      reserved_output_tokens: this.reservations,
      estimated_input_tokens: this.estimatedInput,
    };
  }
}
