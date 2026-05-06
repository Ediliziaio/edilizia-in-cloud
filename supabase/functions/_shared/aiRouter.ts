/**
 * aiRouter — Shared lib per chiamare AI tramite OpenRouter con routing
 * intelligente per task + logging + fallback automatico.
 *
 * Uso tipico:
 *   import { aiRouterComplete } from "../_shared/aiRouter.ts";
 *
 *   const result = await aiRouterComplete({
 *     supabase,                      // client Supabase admin
 *     taskKey: "listino_extract",    // chiave task pre-configurata
 *     messages: [                    // OpenAI-compatible
 *       { role: "system", content: "..." },
 *       { role: "user", content: "..." }
 *     ],
 *     companyId,                     // opzionale, per attribuzione
 *     userId,                        // opzionale
 *     // override opzionali:
 *     params: { temperature: 0.0 },
 *     responseFormat: { type: "json_object" },
 *   });
 *
 *   // result.content       — testo risposta
 *   // result.modelUsed     — modello che ha risposto (puo' essere fallback)
 *   // result.tokensTotal   — token totali
 *   // result.costUsd       — costo stimato
 *   // result.usedPrimary   — boolean: true se primary, false se fallback
 *
 * Architettura:
 *   1. Carica config da ai_router_config WHERE task_key = taskKey
 *   2. Tenta primary_model
 *   3. Se errore (rate limit, timeout, modello giu'), prova fallback_models in ordine
 *   4. Logga su ai_router_usage_log SEMPRE (success o error)
 *   5. Ritorna risultato + metadati
 *
 * Configurazione richiesta (Supabase secrets):
 *   - OPENROUTER_API_KEY: chiave API OpenRouter (sk-or-v1-...)
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;

export interface AiRouterMessage {
  role: "system" | "user" | "assistant" | "tool";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  content: string | Array<any>; // string OR multimodal content (vision)
  name?: string;
  tool_call_id?: string;
}

export interface AiRouterParams {
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tools?: Array<any>;
  tool_choice?: "auto" | "none" | { type: "function"; function: { name: string } };
}

export interface AiRouterCompleteOptions {
  supabase: SupabaseClient;
  taskKey: string;
  messages: AiRouterMessage[];
  /** Override params della config (es. temperature ad-hoc) */
  params?: AiRouterParams;
  /** OpenAI-style response format: {type: "json_object"} o {type: "json_schema", schema: ...} */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  responseFormat?: any;
  companyId?: string | null;
  userId?: string | null;
  /** Se vuoi forzare un modello specifico (override config) */
  forceModel?: string;
  /**
   * Idempotency key UNICA per questa chiamata (es. hash di session_id+message_id).
   * Se presente, charge_ai_call NON addebita doppio in caso di retry.
   * Se assente, viene generata automaticamente da timestamp+random (idempotency garantita SOLO entro singola chiamata).
   */
  idempotencyKey?: string;
  /** Persona AI che ha originato la chiamata (Fase 2). Default null. */
  personaKey?: string | null;
  /** Se true, salta charge_ai_call (es. per task system internal). Default false. */
  skipCharge?: boolean;
  /** Stima costo EUR per precheck. Default 0.10€ (sufficiente per ~95% chiamate). */
  estimatedCostEur?: number;
  /** Cambio USD→EUR. Default 0.92 (configurabile via env). */
  fxUsdToEur?: number;
}

export interface AiRouterCompleteResult {
  content: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rawResponse: any;
  modelUsed: string;
  usedPrimary: boolean;
  fallbackIndex: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  costRealEur: number;
  costBilledEur: number;
  marginEur: number;
  durationMs: number;
  /** ID del record nel ai_call_ledger (audit trail) */
  ledgerId?: string;
  /** True se il charge è stato saltato (skipCharge=true o errore precheck) */
  chargeSkipped?: boolean;
  /** Reason del precheck failure se chargeSkipped */
  prechargeReason?: string;
}

/** Errore custom con metadati per debug. */
export class AiRouterError extends Error {
  constructor(
    message: string,
    public taskKey: string,
    public attempts: Array<{ model: string; error: string }>,
  ) {
    super(message);
    this.name = "AiRouterError";
  }
}

class AiRouterBillingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiRouterBillingError";
  }
}

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

interface RouterConfig {
  task_key: string;
  primary_model: string;
  fallback_models: string[];
  default_params: AiRouterParams;
  tier_key: string;
  is_default?: boolean;
}

/** Carica config router per un task — sempre safe (default fallback). */
async function loadConfig(supabase: SupabaseClient, taskKey: string): Promise<RouterConfig> {
  const { data, error } = await supabase.rpc("get_ai_router_config", { p_task_key: taskKey });
  if (error || !data) {
    return {
      task_key: taskKey,
      primary_model: "openai/gpt-4o-mini",
      fallback_models: ["openrouter/auto"],
      default_params: { temperature: 0.3, max_tokens: 2000 },
      tier_key: "t2_vision",
      is_default: true,
    };
  }
  return {
    task_key: data.task_key,
    primary_model: data.primary_model,
    fallback_models: Array.isArray(data.fallback_models) ? data.fallback_models : [],
    default_params: data.default_params ?? {},
    tier_key: data.tier_key ?? "t1_economic",
    is_default: data.is_default,
  };
}

/**
 * Genera una idempotency key cryptographically secure se non fornita.
 * FIX 3 (C2): Math.random() era PRNG non crittografico — due retry paralleli
 * potevano collidere. crypto.getRandomValues garantisce unicità anche sotto
 * concorrenza estrema (probabilità collisione 2^-96).
 */
function generateIdempotencyKey(taskKey: string): string {
  const ts = Date.now();
  // 16 byte (128 bit) di entropia crittografica → encoded in base36
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  // Converti i byte in stringa base36 (compatto ma sicuro)
  let rand = "";
  for (let i = 0; i < bytes.length; i++) {
    rand += bytes[i].toString(36).padStart(2, "0");
  }
  return `${taskKey}_${ts}_${rand}`;
}

/**
 * Charge atomico al wallet azienda. Best-effort: se fallisce non blocca la risposta
 * (la chiamata AI è già avvenuta), ma logga error per audit.
 */
async function chargeAiCall(
  supabase: SupabaseClient,
  args: {
    idempotencyKey: string;
    companyId: string | null;
    userId: string | null;
    taskKey: string;
    tierKey: string;
    modelUsed: string;
    usedPrimary: boolean;
    fallbackIndex: number;
    personaKey: string | null;
    tokensIn: number;
    tokensOut: number;
    costRealUsd: number;
    fxUsdToEur: number;
    status: "success" | "error" | "timeout";
    errorMessage?: string;
    durationMs?: number;
    metadata?: Record<string, unknown>;
  },
): Promise<{
  ledgerId?: string;
  costRealEur: number;
  costBilledEur: number;
  marginEur: number;
} | null> {
  if (!args.companyId) return null; // task senza tenant: nessun charge

  try {
    const { data, error } = await supabase.rpc("charge_ai_call", {
      p_idempotency_key: args.idempotencyKey,
      p_company_id: args.companyId,
      p_user_id: args.userId,
      p_task_key: args.taskKey,
      p_tier_key: args.tierKey,
      p_model_used: args.modelUsed,
      p_used_primary: args.usedPrimary,
      p_fallback_index: args.fallbackIndex,
      p_persona_key: args.personaKey,
      p_tokens_in: args.tokensIn,
      p_tokens_out: args.tokensOut,
      p_cost_real_usd: args.costRealUsd,
      p_fx_usd_to_eur: args.fxUsdToEur,
      p_status: args.status,
      p_error_message: args.errorMessage ?? null,
      p_duration_ms: args.durationMs ?? null,
      p_metadata: args.metadata ?? {},
    });
    if (error) {
      console.error("[aiRouter] charge_ai_call RPC error:", error);
      return null;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = data as any;
    return {
      ledgerId: r?.ledger_id,
      costRealEur: Number(r?.cost_real_eur ?? 0),
      costBilledEur: Number(r?.cost_billed_eur ?? 0),
      marginEur: Number(r?.margin_eur ?? 0),
    };
  } catch (e) {
    console.error("[aiRouter] charge_ai_call threw:", e);
    return null;
  }
}

/** Precheck saldo azienda PRIMA di chiamare OpenRouter. */
async function precheckCredit(
  supabase: SupabaseClient,
  companyId: string,
  estimatedCostEur: number,
): Promise<{ ok: boolean; reason?: string; message?: string }> {
  try {
    const { data, error } = await supabase.rpc("precheck_ai_credit", {
      p_company_id: companyId,
      p_estimated_cost_eur: estimatedCostEur,
    });
    if (error) {
      const failOpen = Deno.env.get("AI_ROUTER_ALLOW_PRECHECK_FAIL_OPEN") === "true";
      console.warn("[aiRouter] precheck error:", error.message);
      return failOpen
        ? { ok: true }
        : { ok: false, reason: "precheck_error", message: "Verifica credito AI non disponibile" };
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = data as any;
    return {
      ok: !!r?.ok,
      reason: r?.reason,
      message: r?.message,
    };
  } catch (e) {
    const failOpen = Deno.env.get("AI_ROUTER_ALLOW_PRECHECK_FAIL_OPEN") === "true";
    console.warn("[aiRouter] precheck threw:", e);
    return failOpen
      ? { ok: true }
      : { ok: false, reason: "precheck_exception", message: "Verifica credito AI non disponibile" };
  }
}

/** Chiama OpenRouter una volta con un modello specifico. */
async function callOpenRouter(
  apiKey: string,
  model: string,
  messages: AiRouterMessage[],
  params: AiRouterParams,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  responseFormat?: any,
): Promise<{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
  durationMs: number;
}> {
  const start = Date.now();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body: Record<string, any> = {
    model,
    messages,
    temperature: params.temperature ?? 0.3,
    max_tokens: params.max_tokens ?? 2000,
  };
  if (params.top_p != null) body.top_p = params.top_p;
  if (params.tools) body.tools = params.tools;
  if (params.tool_choice) body.tool_choice = params.tool_choice;
  if (responseFormat) body.response_format = responseFormat;

  // FIX 2 (C1): timeout 30s su fetch OpenRouter — evita hang infinito che
  // blocca la edge function fino al timeout Vercel/Supabase (è 25-60s default).
  // Usiamo AbortSignal.timeout (Deno >= 1.30 + Edge Functions Supabase).
  const FETCH_TIMEOUT_MS = 30_000;
  let res: Response;
  try {
    res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        // OpenRouter rankings (best practice — qualifica il traffico)
        "HTTP-Referer": "https://www.ediliziaincloud.com",
        "X-Title": "Edilizia in Cloud",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (fetchErr) {
    // AbortError (timeout) o network error → re-throw con messaggio chiaro
    const errMsg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
    if (errMsg.includes("aborted") || errMsg.includes("timeout") || errMsg.includes("abort")) {
      throw new Error(`OpenRouter timeout (>${FETCH_TIMEOUT_MS / 1000}s) — modello ${model} non risponde`);
    }
    throw new Error(`OpenRouter network error: ${errMsg.slice(0, 300)}`);
  }

  const durationMs = Date.now() - start;

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenRouter ${res.status}: ${errText.slice(0, 500)}`);
  }

  const data = await res.json();
  if (data.error) {
    throw new Error(`OpenRouter error: ${data.error.message ?? JSON.stringify(data.error)}`);
  }
  return { data, durationMs };
}

/** Logga su ai_router_usage_log (best-effort, non blocca su errore). */
async function logUsage(
  supabase: SupabaseClient,
  entry: {
    taskKey: string;
    modelUsed: string;
    usedPrimary: boolean;
    fallbackIndex: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    costUsd: number;
    durationMs: number;
    companyId?: string | null;
    userId?: string | null;
    status: "success" | "error" | "timeout";
    errorMessage?: string;
  },
) {
  try {
    await supabase.from("ai_router_usage_log").insert({
      task_key: entry.taskKey,
      model_used: entry.modelUsed,
      used_primary: entry.usedPrimary,
      fallback_index: entry.fallbackIndex,
      prompt_tokens: entry.promptTokens,
      completion_tokens: entry.completionTokens,
      total_tokens: entry.totalTokens,
      cost_usd: entry.costUsd,
      duration_ms: entry.durationMs,
      company_id: entry.companyId ?? null,
      user_id: entry.userId ?? null,
      status: entry.status,
      error_message: entry.errorMessage ?? null,
    });
  } catch (e) {
    console.warn("[aiRouter] logUsage failed:", e);
  }
}

async function estimateWholesaleCostUsd(
  supabase: SupabaseClient,
  tierKey: string,
  promptTokens: number,
  completionTokens: number,
  fxUsdToEur: number,
): Promise<number> {
  try {
    const { data, error } = await supabase
      .from("ai_pricing_tiers")
      .select("cost_per_1m_input_eur, cost_per_1m_output_eur")
      .eq("tier_key", tierKey)
      .eq("enabled", true)
      .maybeSingle();
    if (error || !data) return 0;
    const costEur =
      (promptTokens / 1_000_000) * Number(data.cost_per_1m_input_eur ?? 0) +
      (completionTokens / 1_000_000) * Number(data.cost_per_1m_output_eur ?? 0);
    return fxUsdToEur > 0 ? costEur / fxUsdToEur : costEur / 0.92;
  } catch (e) {
    console.warn("[aiRouter] estimateWholesaleCostUsd failed:", e);
    return 0;
  }
}

/**
 * Entry point principale: completa un task usando il router OpenRouter.
 * Tenta primary_model, poi fallback_models in ordine. Logga sempre.
 */
export async function aiRouterComplete(
  opts: AiRouterCompleteOptions,
): Promise<AiRouterCompleteResult> {
  const apiKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!apiKey) {
    throw new AiRouterError(
      "OPENROUTER_API_KEY non configurata su Supabase secrets",
      opts.taskKey,
      [],
    );
  }

  const baseConfig = await loadConfig(opts.supabase, opts.taskKey);
  const config = opts.forceModel
    ? {
        ...baseConfig,
        primary_model: opts.forceModel,
        fallback_models: [baseConfig.primary_model, ...baseConfig.fallback_models]
          .filter((model, index, arr) => model && model !== opts.forceModel && arr.indexOf(model) === index),
        is_default: baseConfig.is_default,
      }
    : baseConfig;

  // Merge params: config default + override esplicito
  const params: AiRouterParams = { ...config.default_params, ...(opts.params ?? {}) };

  const modelsToTry = [config.primary_model, ...config.fallback_models];
  const attempts: Array<{ model: string; error: string }> = [];

  // ───────────────────────────────────────────────────────────────────────
  // PRECHECK CREDIT (se company_id presente e non skipCharge)
  // ───────────────────────────────────────────────────────────────────────
  const skipCharge = opts.skipCharge === true;
  const fxUsdToEur = opts.fxUsdToEur ?? Number(Deno.env.get("AI_FX_USD_EUR") ?? "0.92");
  const idempotencyKey = opts.idempotencyKey ?? generateIdempotencyKey(opts.taskKey);

  if (!skipCharge && opts.companyId) {
    const estCost = opts.estimatedCostEur ?? 0.10;
    const precheck = await precheckCredit(opts.supabase, opts.companyId, estCost);
    if (!precheck.ok) {
      // Logga il rifiuto come error nel ledger (no addebito) e propaga errore
      await chargeAiCall(opts.supabase, {
        idempotencyKey,
        companyId: opts.companyId,
        userId: opts.userId ?? null,
        taskKey: opts.taskKey,
        tierKey: config.tier_key,
        modelUsed: config.primary_model,
        usedPrimary: true,
        fallbackIndex: 0,
        personaKey: opts.personaKey ?? null,
        tokensIn: 0,
        tokensOut: 0,
        costRealUsd: 0,
        fxUsdToEur,
        status: "error",
        errorMessage: `precheck_failed: ${precheck.reason} — ${precheck.message}`,
        durationMs: 0,
        metadata: { precheck: precheck },
      });
      throw new AiRouterError(
        `Credito insufficiente o bloccato: ${precheck.message ?? precheck.reason ?? "unknown"}`,
        opts.taskKey,
        [],
      );
    }
  }

  for (let i = 0; i < modelsToTry.length; i++) {
    const model = modelsToTry[i];
    try {
      const { data, durationMs } = await callOpenRouter(
        apiKey,
        model,
        opts.messages,
        params,
        opts.responseFormat,
      );

      const choice = data.choices?.[0];
      if (!choice) throw new Error("No choices in response");
      const content = choice.message?.content ?? "";
      const usage = data.usage ?? {};
      const promptTokens = usage.prompt_tokens ?? 0;
      const completionTokens = usage.completion_tokens ?? 0;
      const totalTokens = usage.total_tokens ?? promptTokens + completionTokens;
      // OpenRouter ritorna `usage.cost` in USD se disponibile; se manca, stimiamo dal tier wholesale.
      const reportedCostUsd = Number(usage.cost ?? 0);
      const costUsd = reportedCostUsd > 0
        ? reportedCostUsd
        : await estimateWholesaleCostUsd(opts.supabase, config.tier_key, promptTokens, completionTokens, fxUsdToEur);

      // Log analytical (legacy)
      await logUsage(opts.supabase, {
        taskKey: opts.taskKey,
        modelUsed: model,
        usedPrimary: i === 0,
        fallbackIndex: i,
        promptTokens, completionTokens, totalTokens, costUsd,
        durationMs,
        companyId: opts.companyId,
        userId: opts.userId,
        status: "success",
      });

      // Charge atomico al wallet (immutable ledger + scala saldo)
      let ledgerId: string | undefined;
      let costRealEur = 0;
      let costBilledEur = 0;
      let marginEur = 0;
      let chargeSkipped = skipCharge || !opts.companyId;

      if (!skipCharge && opts.companyId) {
        const charge = await chargeAiCall(opts.supabase, {
          idempotencyKey,
          companyId: opts.companyId,
          userId: opts.userId ?? null,
          taskKey: opts.taskKey,
          tierKey: config.tier_key,
          modelUsed: model,
          usedPrimary: i === 0,
          fallbackIndex: i,
          personaKey: opts.personaKey ?? null,
          tokensIn: promptTokens,
          tokensOut: completionTokens,
          costRealUsd: costUsd,
          fxUsdToEur,
          status: "success",
          durationMs,
          metadata: { task: opts.taskKey },
        });
        if (charge) {
          ledgerId = charge.ledgerId;
          costRealEur = charge.costRealEur;
          costBilledEur = charge.costBilledEur;
          marginEur = charge.marginEur;
        } else {
          const chargeFailOpen = Deno.env.get("AI_ROUTER_ALLOW_CHARGE_FAIL_OPEN") === "true";
          if (!chargeFailOpen) {
            throw new AiRouterBillingError(
              "AI billing ledger unavailable after provider success; response blocked to avoid unbilled AI usage",
            );
          }
          // FIX 17 (A2): chargeFailOpen=true → la response viene servita ma il
          // charge_ai_call ha fallito. Inseriamo direttamente nel ledger con
          // status='unbilled_fail_open' per audit + revenue assurance.
          try {
            const fxRate = fxUsdToEur;
            const costRealEurApprox = costUsd * fxRate;
            const { error: directInsErr } = await opts.supabase
              .from("ai_call_ledger")
              .insert({
                idempotency_key: `${idempotencyKey}_failopen`,
                company_id: opts.companyId,
                user_id: opts.userId ?? null,
                task_key: opts.taskKey,
                tier_key: config.tier_key,
                model_used: model,
                used_primary: i === 0,
                fallback_index: i,
                persona_key: opts.personaKey ?? null,
                tokens_in: promptTokens,
                tokens_out: completionTokens,
                cost_real_usd: costUsd,
                cost_real_eur: costRealEurApprox,
                cost_billed_eur: 0,
                fx_usd_to_eur: fxRate,
                applied_markup_pct: 0,
                status: "unbilled_fail_open",
                error_message: "charge_ai_call RPC failed but fail-open enabled",
                duration_ms: durationMs,
                metadata: { task: opts.taskKey, fail_open: true },
              });
            if (directInsErr) {
              console.error("[aiRouter] direct ledger insert (unbilled_fail_open) failed:", directInsErr.message);
            }
          } catch (directInsThrow) {
            console.error("[aiRouter] direct ledger insert threw:", directInsThrow);
          }
          chargeSkipped = true;
        }
      } else if (skipCharge && opts.companyId) {
        // FIX 17 (A1): skipCharge=true ma c'è un companyId → log informazionale
        // nel ledger con status='skipped' per audit completo.
        try {
          const fxRate = fxUsdToEur;
          const costRealEurApprox = costUsd * fxRate;
          await opts.supabase.from("ai_call_ledger").insert({
            idempotency_key: `${idempotencyKey}_skipped`,
            company_id: opts.companyId,
            user_id: opts.userId ?? null,
            task_key: opts.taskKey,
            tier_key: config.tier_key,
            model_used: model,
            used_primary: i === 0,
            fallback_index: i,
            persona_key: opts.personaKey ?? null,
            tokens_in: promptTokens,
            tokens_out: completionTokens,
            cost_real_usd: costUsd,
            cost_real_eur: costRealEurApprox,
            cost_billed_eur: 0,
            fx_usd_to_eur: fxRate,
            applied_markup_pct: 0,
            status: "skipped",
            duration_ms: durationMs,
            metadata: { task: opts.taskKey, skip_reason: "skipCharge=true" },
          });
        } catch (skipInsErr) {
          console.warn("[aiRouter] skipped ledger insert (non-blocking):", skipInsErr);
        }
      }

      return {
        content,
        rawResponse: data,
        modelUsed: model,
        usedPrimary: i === 0,
        fallbackIndex: i,
        promptTokens, completionTokens, totalTokens, costUsd,
        costRealEur, costBilledEur, marginEur,
        durationMs,
        ledgerId,
        chargeSkipped,
      };
    } catch (e) {
      if (e instanceof AiRouterBillingError) {
        throw e;
      }
      const errMsg = (e as Error).message ?? String(e);
      attempts.push({ model, error: errMsg });
      console.warn(`[aiRouter] task=${opts.taskKey} model=${model} attempt ${i+1}/${modelsToTry.length} failed:`, errMsg);
      // Continua con il prossimo fallback
    }
  }

  // Tutti i tentativi falliti → log error e throw
  const errorMessage = attempts.map(a => `${a.model}: ${a.error}`).join(" | ").slice(0, 1000);
  await logUsage(opts.supabase, {
    taskKey: opts.taskKey,
    modelUsed: modelsToTry[modelsToTry.length - 1] ?? "unknown",
    usedPrimary: false,
    fallbackIndex: modelsToTry.length - 1,
    promptTokens: 0, completionTokens: 0, totalTokens: 0, costUsd: 0,
    durationMs: 0,
    companyId: opts.companyId,
    userId: opts.userId,
    status: "error",
    errorMessage,
  });

  // Insert ledger entry (status=error, billed=0). Tracciabilità ma nessun addebito.
  if (!skipCharge && opts.companyId) {
    await chargeAiCall(opts.supabase, {
      idempotencyKey,
      companyId: opts.companyId,
      userId: opts.userId ?? null,
      taskKey: opts.taskKey,
      tierKey: config.tier_key,
      modelUsed: modelsToTry[modelsToTry.length - 1] ?? "unknown",
      usedPrimary: false,
      fallbackIndex: modelsToTry.length - 1,
      personaKey: opts.personaKey ?? null,
      tokensIn: 0,
      tokensOut: 0,
      costRealUsd: 0,
      fxUsdToEur,
      status: "error",
      errorMessage,
      durationMs: 0,
      metadata: { all_attempts_failed: true, attempts },
    });
  }

  throw new AiRouterError(
    `Tutti i modelli falliti per task '${opts.taskKey}' (${modelsToTry.length} tentativi)`,
    opts.taskKey,
    attempts,
  );
}

/** Helper di convenienza per task semplici (system + user prompt). */
export async function aiRouterPrompt(opts: {
  supabase: SupabaseClient;
  taskKey: string;
  systemPrompt: string;
  userPrompt: string;
  params?: AiRouterParams;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  responseFormat?: any;
  companyId?: string | null;
  userId?: string | null;
}): Promise<AiRouterCompleteResult> {
  return aiRouterComplete({
    supabase: opts.supabase,
    taskKey: opts.taskKey,
    messages: [
      { role: "system", content: opts.systemPrompt },
      { role: "user", content: opts.userPrompt },
    ],
    params: opts.params,
    responseFormat: opts.responseFormat,
    companyId: opts.companyId,
    userId: opts.userId,
  });
}
