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

import { checkPaymentMethod } from "./requirePaymentMethod.ts";

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
  /**
   * Cache risposte (audit AI 2026-06) — SOLO per task deterministici
   * (es. bank_categorize, fattura_classify): stesso input → stessa risposta.
   * Se settato (>0) e companyId presente: lookup su ai_response_cache prima
   * di chiamare il modello (hit = zero costo, zero addebito) e write-behind
   * della risposta con TTL in giorni. Scoped per company. Best-effort:
   * qualsiasi errore cache non blocca la chiamata normale.
   */
  cacheTtlDays?: number;
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
  /** Tentativi falliti precedenti al successo (per AI Test Lab diagnostic). */
  failedAttempts?: Array<{ model: string; error: string }>;
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
// ─── AI Test Lab — Demo Azienda gating helpers ──────────────────────────────
// I tracciamenti granulari + override modelli sono attivi SOLO per la company
// demo. Tutto il resto del codebase non è toccato.
const AI_TEST_LAB_DEMO_COMPANY_ID = '778a2c76-1253-49f2-a5e8-283363ac3e29';

/** Legge l'override modello settato dall'utente demo dalla tabella
 *  `ai_demo_default_models` (per cron/trigger background che non passano forceModel). */
async function loadDemoDefaultModel(
  supabase: SupabaseClient,
  companyId: string | null | undefined,
  taskKey: string,
): Promise<string | null> {
  if (companyId !== AI_TEST_LAB_DEMO_COMPANY_ID) return null;
  try {
    const { data } = await supabase
      .from('ai_demo_default_models')
      .select('model_id')
      .eq('company_id', companyId)
      .eq('task_key', taskKey)
      .maybeSingle();
    return (data as { model_id?: string } | null)?.model_id ?? null;
  } catch (e) {
    console.warn('[aiRouter] loadDemoDefaultModel skip:', e instanceof Error ? e.message : e);
    return null;
  }
}

/** Scrive una riga su `ai_test_runs` per la company demo.
 *  Best-effort: ogni errore è loggato ma non blocca la chiamata AI. */
async function writeTestRun(
  supabase: SupabaseClient,
  args: {
    companyId: string | null | undefined;
    userId: string | null | undefined;
    feature: string;
    taskKey: string;
    personaKey?: string | null;
    modelId: string;
    forcedByUser: boolean;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    latencyMs: number;
    generationId?: string | null;
    promptExcerpt?: string | null;
    responseExcerpt?: string | null;
    error?: string | null;
  },
): Promise<void> {
  if (args.companyId !== AI_TEST_LAB_DEMO_COMPANY_ID) return;
  try {
    const provider = args.modelId.split('/')[0] ?? 'unknown';
    await supabase.from('ai_test_runs').insert({
      company_id: args.companyId,
      user_id: args.userId ?? null,
      feature: args.feature,
      task_key: args.taskKey,
      persona_key: args.personaKey ?? null,
      model_id: args.modelId,
      provider,
      forced_by_user: args.forcedByUser,
      input_tokens: args.inputTokens,
      output_tokens: args.outputTokens,
      cost_usd: args.costUsd,
      latency_ms: args.latencyMs,
      openrouter_generation_id: args.generationId ?? null,
      prompt_excerpt: args.promptExcerpt?.slice(0, 300) ?? null,
      response_excerpt: args.responseExcerpt?.slice(0, 300) ?? null,
      error: args.error ?? null,
    });
  } catch (e) {
    console.warn('[aiRouter] ai_test_runs insert skip:', e instanceof Error ? e.message : e);
  }
}

/** Verifica quota giornaliera per evitare bill-shock sulla demo. */
async function checkDemoDailyQuota(
  supabase: SupabaseClient,
  companyId: string | null | undefined,
): Promise<{ ok: boolean; remaining?: number; cap?: number }> {
  if (companyId !== AI_TEST_LAB_DEMO_COMPANY_ID) return { ok: true };
  try {
    const { data: quotaRow } = await supabase
      .from('ai_test_quota')
      .select('daily_calls_cap')
      .eq('company_id', companyId)
      .maybeSingle();
    const cap = Number((quotaRow as { daily_calls_cap?: number } | null)?.daily_calls_cap ?? 200);
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count } = await supabase
      .from('ai_test_runs')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .gte('created_at', since);
    const used = count ?? 0;
    if (used >= cap) {
      return { ok: false, remaining: 0, cap };
    }
    return { ok: true, remaining: cap - used, cap };
  } catch {
    return { ok: true };
  }
}

async function loadConfig(supabase: SupabaseClient, taskKey: string): Promise<RouterConfig> {
  const { data, error } = await supabase.rpc("get_ai_router_config", { p_task_key: taskKey });
  if (error || !data) {
    return {
      task_key: taskKey,
      primary_model: "openai/gpt-4o-mini",
      // Audit AI 2026-06: era ["openrouter/auto"] — delega la scelta a
      // OpenRouter che può selezionare modelli premium (costo imprevedibile,
      // 10-40x i tier economici). Catena deterministica e cheap, allineata
      // alla migration 20260610180000.
      fallback_models: ["meta-llama/llama-3.3-70b-instruct", "anthropic/claude-haiku-4.5"],
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

/**
 * Rapporto caratteri/token per la stima pre-chiamata. Misurato sui prompt reali
 * della piattaforma (italiano + schemi tool JSON): ~3.6 char per token. Volutamente
 * piu' prudente del /4 usato altrove per le stime a posteriori — qui sottostimare
 * significa lasciar passare una chiamata che poi sfonda il saldo.
 */
const PRECHECK_CHARS_PER_TOKEN = 3.6;

/** Dimensione in caratteri di quello che verra' spedito al modello. */
function payloadChars(messages: AiRouterMessage[], tools?: Array<unknown>): number {
  let chars = 0;
  for (const m of messages) {
    chars += typeof m.content === "string"
      ? m.content.length
      : JSON.stringify(m.content ?? "").length;
  }
  // Gli schemi tool pesano quanto il testo: per Silvio col catalogo pieno sono
  // ~125 KB, cioe' la voce dominante dell'input. Ignorarli falserebbe la stima.
  if (tools?.length) chars += JSON.stringify(tools).length;
  return chars;
}

/**
 * Precheck saldo azienda PRIMA di chiamare OpenRouter.
 * Con `tierKey` + token stimati la stima viene calcolata dentro l'RPC con gli
 * STESSI prezzi che usera' charge_ai_call (override per-azienda inclusi):
 * una sola fonte di verita', nessun round-trip aggiuntivo. Senza, l'RPC
 * ricade sulla costante passata in `estimatedCostEur`.
 */
async function precheckCredit(
  supabase: SupabaseClient,
  companyId: string,
  estimatedCostEur: number,
  tierKey?: string | null,
  tokensIn?: number | null,
  tokensOut?: number | null,
): Promise<{ ok: boolean; reason?: string; message?: string }> {
  try {
    let { data, error } = await supabase.rpc("precheck_ai_credit", {
      p_company_id: companyId,
      p_estimated_cost_eur: estimatedCostEur,
      p_tier_key: tierKey ?? null,
      p_tokens_in: tokensIn ?? null,
      p_tokens_out: tokensOut ?? null,
    });
    // Ordine di rilascio indifferente: se la migration della stima non e'
    // ancora applicata, in prod esiste solo la firma a 2 argomenti e PostgREST
    // risponde PGRST202 ("function not found"). Senza questo fallback il
    // precheck fallirebbe e — con fail-open disattivo — bloccherebbe OGNI
    // chiamata AI finche' la migration non parte. Riproviamo alla vecchia
    // maniera: stima meno precisa, servizio in piedi.
    if (error && (error.code === "PGRST202" || /function|schema cache/i.test(error.message ?? ""))) {
      console.warn("[aiRouter] precheck_ai_credit senza stima da token (migration non applicata?), fallback a 2 argomenti");
      ({ data, error } = await supabase.rpc("precheck_ai_credit", {
        p_company_id: companyId,
        p_estimated_cost_eur: estimatedCostEur,
      }));
    }
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

  // ── Reasoning models detection ──
  // Questi modelli fanno "chain-of-thought" interno prima di rispondere.
  // Se non disabilitato, l'attesa è 30-120s e il budget max_tokens viene
  // mangiato dal reasoning → content="". Per testing chat normale, forziamo
  // reasoning_effort: "low" (o "minimal" per OpenAI) per ottenere risposta rapida.
  const REASONING_MODELS = [
    // Moonshot Kimi (K2.6 / K2-thinking)
    /^moonshotai\/kimi-k2\.6/,
    /^moonshotai\/kimi-k2-thinking/,
    // OpenAI o-series (o1, o3, o4 incluse mini/preview)
    /^openai\/o[1-9]/,
    // OpenAI GPT-5 family — TUTTI tranne le varianti -chat (che sono fast non-reasoning)
    /^openai\/gpt-5(?!\.[0-9]+-chat)(?!-chat)(?:[\b-]|$)/i,
    /^openai\/gpt-5\.[0-9]+(?!-chat)/i,
    // Anthropic extended thinking (Sonnet/Opus 4+ con :thinking)
    /^anthropic\/.*-thinking/i,
    /^anthropic\/claude-(?:opus|sonnet)-4(?:\.5)?:thinking/i,
    // DeepSeek R1 reasoning family
    /^deepseek\/deepseek-r1/i,
    /^deepseek\/.*-reasoner/i,
    // Qwen QwQ + Qwen3 thinking
    /^qwen\/qwq/i,
    /^qwen\/qwen3.*-thinking/i,
    // xAI Grok thinking
    /^x-ai\/grok-(?:3|4).*-(?:thinking|reasoning|mini)/i,
    /^x-ai\/grok.*-thinking/i,
    // Google Gemini thinking variants
    /^google\/gemini-.*-thinking/i,
    // Z.AI GLM thinking
    /^z-ai\/glm-.*-thinking/i,
    // Catch-all suffix patterns
    /\/.*-thinking/i,
    /\/.*-reasoning/i,
    /\/.*-reasoner/i,
  ];
  const isReasoningModel = REASONING_MODELS.some((re) => re.test(model));

  // ── Modelli che NON accettano temperature custom ──
  // OpenAI o-series + GPT-5 reasoning richiedono temperature=1 (default) o assenza.
  // Inviare temperature=0.3 ritorna 400 "Unsupported value: temperature".
  const SKIP_TEMPERATURE_PATTERNS = [
    /^openai\/o[1-9]/,             // o1, o3, o4
    /^openai\/gpt-5(?!\.[0-9]+-chat)(?!-chat)(?:[\b-]|$)/i,  // gpt-5, gpt-5-mini, gpt-5-pro, gpt-5-nano (NON -chat)
    /^openai\/gpt-5\.[0-9]+(?!-chat)/i,   // gpt-5.1 NON -chat
  ];
  const skipTemperature = SKIP_TEMPERATURE_PATTERNS.some((re) => re.test(model));

  // ── Reasoning models: bump max_tokens per evitare content="" ──
  // Il reasoning interno consuma 1000-3000 token DEL budget max_tokens.
  // Se max_tokens=2000 e reasoning ne usa 1800 → content="" → fallback inutile.
  // Per reasoning models alziamo a 6000 per lasciare ≥3000 per la risposta.
  const effectiveMaxTokens = params.max_tokens
    ?? (isReasoningModel ? 6000 : 2000);

  // ── Prompt caching Anthropic ──
  // Il system prompt è grande e in larga parte statico per persona (preambolo +
  // playbook + regole). Su Anthropic aggiungiamo breakpoint cache_control
  // "ephemeral" sul system → ~90% di sconto sugli input token in cache, enorme
  // nei loop-tool (silvio fa fino a 12 iterazioni col solito system).
  //
  // Token-opt (audit 2026-06): il caller può inviare PIÙ messaggi system
  // consecutivi in testa (es. silvio-chat: [statico, dinamico]). Su Anthropic
  // ogni blocco riceve il suo breakpoint (max 4): il blocco statico resta in
  // cache anche TRA messaggi diversi della stessa conversazione, mentre prima
  // il RAG/memoria dinamico in coda bustava la cache a ogni messaggio. Sugli
  // altri provider (che rifiutano il content-array e/o i system multipli) i
  // blocchi vengono fusi in un'unica stringa system → comportamento identico.
  // NON muta l'array in ingresso (riusato dal loop di fallback su altri modelli).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let finalMessages: any[] = messages;
  // Kill-switch: imposta AI_PROMPT_CACHE_DISABLED=true per disattivare al volo
  // (senza redeploy) se un provider dovesse rifiutare il formato content-array.
  const promptCacheEnabled = Deno.env.get("AI_PROMPT_CACHE_DISABLED") !== "true";
  let leadingSystemCount = 0;
  while (
    leadingSystemCount < messages.length &&
    messages[leadingSystemCount]?.role === "system" &&
    typeof messages[leadingSystemCount]?.content === "string"
  ) {
    leadingSystemCount++;
  }
  const totalSystemLen = messages
    .slice(0, leadingSystemCount)
    .reduce((acc, m) => acc + (m.content as string).length, 0);
  if (
    promptCacheEnabled &&
    model.startsWith("anthropic/") &&
    leadingSystemCount >= 1 &&
    totalSystemLen > 800
  ) {
    // Max 4 breakpoint cache_control per richiesta Anthropic: i system oltre
    // il 4° vengono fusi nel 4° (caso teorico, oggi i caller ne mandano 1-2).
    const sysMsgs = messages.slice(0, leadingSystemCount);
    const capped = sysMsgs.length > 4
      ? [...sysMsgs.slice(0, 3), { role: "system", content: sysMsgs.slice(3).map((m) => m.content).join("\n\n") }]
      : sysMsgs;
    finalMessages = [
      ...capped.map((m) => ({
        role: "system",
        content: [{ type: "text", text: m.content, cache_control: { type: "ephemeral" } }],
      })),
      ...messages.slice(leadingSystemCount),
    ];
  } else if (leadingSystemCount > 1) {
    // Provider non-Anthropic (o cache disabilitata): un solo system string,
    // formato universalmente accettato.
    finalMessages = [
      {
        role: "system",
        content: messages.slice(0, leadingSystemCount).map((m) => m.content).join("\n\n"),
      },
      ...messages.slice(leadingSystemCount),
    ];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body: Record<string, any> = {
    model,
    messages: finalMessages,
    max_tokens: effectiveMaxTokens,
  };
  if (!skipTemperature) {
    body.temperature = params.temperature ?? 0.3;
  }
  if (params.top_p != null && !skipTemperature) body.top_p = params.top_p;
  if (params.tools) body.tools = params.tools;
  if (params.tool_choice) body.tool_choice = params.tool_choice;
  // Contabilita reale (audit 2026-09-03): senza questo flag OpenRouter NON
  // ritorna ne' `usage.cost` ne' `prompt_tokens_details.cached_tokens`. Il
  // router lo dava per scontato e cadeva sempre nella stima da tier: il costo
  // scritto su ai_router_usage_log era un listino, non la spesa vera, e la
  // cache non era misurabile. Non costa nulla richiederlo.
  body.usage = { include: true };
  if (responseFormat) body.response_format = responseFormat;

  // ── Reasoning effort low → riduce latenza + libera budget per content ──
  // OpenRouter accetta `reasoning: { effort: "minimal"|"low"|"medium"|"high" }`.
  // OpenAI o-series + gpt-5 supportano "minimal"; gli altri partono da "low".
  if (isReasoningModel) {
    const isOpenAIReasoner = /^openai\/(?:o[1-9]|gpt-5)/i.test(model);
    body.reasoning = { effort: isOpenAIReasoner ? "minimal" : "low" };
  }

  // FIX 2 (C1): timeout differenziato.
  // - 30s default (Anthropic/OpenAI/Google standard)
  // - 50s per slow models non-reasoning (DeepSeek, Llama)
  // - 120s per reasoning models (Kimi K2.6 thinking, o1/o3, GPT-5)
  // Edge Function Supabase ha cap ~150s totale → 120s lascia margine.
  const SLOW_MODEL_PROVIDERS = ["deepseek", "x-ai", "meta-llama", "qwen", "thudm", "z-ai"];
  const isSlowModel = SLOW_MODEL_PROVIDERS.some((p) => model.startsWith(`${p}/`));
  const FETCH_TIMEOUT_MS = isReasoningModel ? 120_000 : (isSlowModel ? 50_000 : 30_000);
  // Retry su errori TRANSITORI (timeout / 429 / 5xx) prima di passare al modello
  // di fallback. I reasoning model hanno già budget 120s → 1 solo tentativo per
  // non sforare il cap edge (~150s); i modelli veloci ne fanno fino a 2 con
  // backoff breve. Gli errori 4xx (≠429) NON si ritentano (config/input errati).
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const MAX_ATTEMPTS = isReasoningModel ? 1 : 2;
  let lastErr: Error | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
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
      const errMsg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
      const isTimeout = /abort|timeout/i.test(errMsg);
      lastErr = isTimeout
        ? new Error(`OpenRouter timeout (>${FETCH_TIMEOUT_MS / 1000}s) — modello ${model} non risponde`)
        : new Error(`OpenRouter network error: ${errMsg.slice(0, 300)}`);
      if (attempt < MAX_ATTEMPTS) { await sleep(300 * attempt + Math.floor(Math.random() * 250)); continue; }
      throw lastErr;
    }

    if (!res.ok) {
      const errText = await res.text();
      lastErr = new Error(`OpenRouter ${res.status}: ${errText.slice(0, 500)}`);
      const retriable = res.status === 429 || res.status >= 500;
      if (retriable && attempt < MAX_ATTEMPTS) { await sleep(450 * attempt + Math.floor(Math.random() * 300)); continue; }
      throw lastErr;
    }

    const durationMs = Date.now() - start;
    const data = await res.json();
    if (data.error) {
      const em = data.error.message ?? JSON.stringify(data.error);
      lastErr = new Error(`OpenRouter error: ${em}`);
      // alcuni provider rispondono 200 con un errore transitorio nel body
      if (/rate|overload|temporar|timeout|unavailable/i.test(String(em)) && attempt < MAX_ATTEMPTS) {
        await sleep(450 * attempt); continue;
      }
      throw lastErr;
    }
    return { data, durationMs };
  }
  throw lastErr ?? new Error(`OpenRouter: tentativi esauriti per ${model}`);
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
    /** Token di input riletti dalla cache del provider (costano ~10%). */
    cachedTokens?: number;
    /** Token di input scritti in cache in questa chiamata (costano ~125%). */
    cacheWriteTokens?: number;
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
      cached_tokens: entry.cachedTokens ?? 0,
      cache_write_tokens: entry.cacheWriteTokens ?? 0,
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
 * Estrazione tollerante di JSON da una risposta del modello. Gestisce i casi
 * tipici: JSON puro, JSON dentro un fence ```json ... ```, o JSON preceduto/
 * seguito da prosa. Ritorna il valore parsato oppure `undefined` se non è
 * recuperabile alcun JSON valido. Usata per decidere se ritentare su un altro
 * modello quando il chiamante ha chiesto un output strutturato.
 */
function extractJson(text: string): unknown | undefined {
  if (!text) return undefined;
  const raw = text.trim();
  // 1) parse diretto
  try { return JSON.parse(raw); } catch { /* continua */ }
  // 2) fence ```json ... ``` oppure ``` ... ```
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    try { return JSON.parse(fence[1].trim()); } catch { /* continua */ }
  }
  // 3) primo blocco bilanciato { ... } oppure [ ... ] (string-aware)
  const start = raw.search(/[[{]/);
  if (start >= 0) {
    const open = raw[start];
    const close = open === "{" ? "}" : "]";
    let depth = 0, inStr = false, esc = false;
    for (let i = start; i < raw.length; i++) {
      const ch = raw[i];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === "\\") esc = true;
        else if (ch === '"') inStr = false;
      } else if (ch === '"') inStr = true;
      else if (ch === open) depth++;
      else if (ch === close) {
        depth--;
        if (depth === 0) {
          try { return JSON.parse(raw.slice(start, i + 1)); } catch { return undefined; }
        }
      }
    }
  }
  return undefined;
}

/**
 * Entry point principale: completa un task usando il router OpenRouter.
 * Tenta primary_model, poi fallback_models in ordine. Logga sempre.
 */
/** SHA-256 hex di una stringa (per le chiavi della cache risposte). */
async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

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

  // ── Cache risposte per task deterministici (opt-in, audit AI 2026-06) ──
  // PRIMA di precheck credito/budget: un hit non costa nulla, quindi non
  // deve nemmeno richiedere saldo disponibile.
  let cacheInputHash: string | null = null;
  if ((opts.cacheTtlDays ?? 0) > 0 && opts.companyId) {
    try {
      cacheInputHash = await sha256Hex(
        `${opts.taskKey}|${JSON.stringify(opts.messages)}|${JSON.stringify(opts.responseFormat ?? null)}`,
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: hit } = await (opts.supabase as any)
        .from("ai_response_cache")
        .select("id, output_content, model_used, hits")
        .eq("task_key", opts.taskKey)
        .eq("company_id", opts.companyId)
        .eq("input_hash", cacheInputHash)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();
      if (hit?.output_content) {
        // Contatore hit best-effort (fire-and-forget).
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        void (opts.supabase as any)
          .from("ai_response_cache")
          .update({ hits: (hit.hits ?? 0) + 1 })
          .eq("id", hit.id)
          .then(() => undefined, () => undefined);
        return {
          content: hit.output_content,
          rawResponse: { cached: true },
          modelUsed: hit.model_used ?? "cache",
          usedPrimary: true,
          fallbackIndex: 0,
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          costUsd: 0,
          costRealEur: 0,
          costBilledEur: 0,
          marginEur: 0,
          durationMs: 0,
          chargeSkipped: true,
          prechargeReason: "cache_hit",
        };
      }
    } catch (cacheErr) {
      // Tabella assente (migration non applicata) o errore transitorio:
      // procedi con la chiamata normale.
      console.warn("[aiRouter] cache lookup skipped:", (cacheErr as Error)?.message ?? cacheErr);
      cacheInputHash = null;
    }
  }

  const baseConfig = await loadConfig(opts.supabase, opts.taskKey);

  // ── AI Test Lab — Demo Azienda override automatico ─────────────────────
  // Se la chiamata viene dalla demo company E non ha già un forceModel
  // esplicito, leggi `ai_demo_default_models` per task_key (impostato
  // dall'utente demo nella dashboard AI Test Lab). Permette ai cron/trigger
  // di rispettare la scelta dell'utente senza modificare ogni edge function.
  let effectiveForceModel = opts.forceModel;
  let isDemoForced = !!opts.forceModel && opts.companyId === AI_TEST_LAB_DEMO_COMPANY_ID;
  if (!effectiveForceModel && opts.companyId === AI_TEST_LAB_DEMO_COMPANY_ID) {
    const demoOverride = await loadDemoDefaultModel(opts.supabase, opts.companyId, opts.taskKey);
    if (demoOverride) {
      effectiveForceModel = demoOverride;
      isDemoForced = false; // override silenzioso da preferenza, non scelto in chat
    }
  }

  // ── AI Test Lab — Quota di sicurezza giornaliera (demo only) ───────────
  if (opts.companyId === AI_TEST_LAB_DEMO_COMPANY_ID) {
    const quota = await checkDemoDailyQuota(opts.supabase, opts.companyId);
    if (!quota.ok) {
      throw new AiRouterError(
        `AI Test Lab quota giornaliera raggiunta (${quota.cap} chiamate/24h). Riprova domani o aumenta cap in ai_test_quota.`,
        opts.taskKey,
        [],
      );
    }
  }

  // Quando forceModel è impostato (sistema o demo user), il modello scelto va
  // come primary. I fallback restano disponibili: se il modello sceltofallisce,
  // proviamo gli altri. La trasparenza è garantita lato UI: il footer
  // AIRunFooter mostra `last_model_id` (modello effettivamente usato) e
  // l'app evidenzia mismatch tra "richiesto" e "usato".
  const config = effectiveForceModel
    ? {
        ...baseConfig,
        primary_model: effectiveForceModel,
        fallback_models: [baseConfig.primary_model, ...baseConfig.fallback_models]
          .filter((model, index, arr) => model && model !== effectiveForceModel && arr.indexOf(model) === index),
        is_default: baseConfig.is_default,
      }
    : baseConfig;

  // Merge params: config default + override esplicito
  const params: AiRouterParams = { ...config.default_params, ...(opts.params ?? {}) };

  const modelsToTry = Array.from(new Set([config.primary_model, ...config.fallback_models].filter(Boolean)));
  const attempts: Array<{ model: string; error: string }> = [];

  // ───────────────────────────────────────────────────────────────────────
  // PRECHECK CREDIT (se company_id presente e non skipCharge)
  // ───────────────────────────────────────────────────────────────────────
  const skipCharge = opts.skipCharge === true;
  const fxUsdToEur = opts.fxUsdToEur ?? Number(Deno.env.get("AI_FX_USD_EUR") ?? "0.92");
  const idempotencyKey = opts.idempotencyKey ?? generateIdempotencyKey(opts.taskKey);

  if (!skipCharge && opts.companyId) {
    // Gate "carta obbligatoria": l'AI a consumo richiede un metodo di pagamento valido.
    // La Demo Azienda è esente (gestito dentro checkPaymentMethod).
    const pmGate = await checkPaymentMethod(opts.supabase, opts.companyId);
    if (!pmGate.allowed) {
      throw new AiRouterError(
        pmGate.message ?? "Registra una carta di pagamento aziendale per usare l'AI.",
        opts.taskKey,
        [],
      );
    }
    // Stima pre-chiamata: token del payload reale (messaggi + schemi tool) e
    // budget di output effettivo. E' il caso PEGGIORE — max_tokens e' il tetto
    // che il modello non puo' superare — quindi la stima non sottostima mai.
    // Se il chiamante ha gia' dichiarato `estimatedCostEur`, la sua ha la
    // precedenza e i token non vengono passati.
    const estCost = opts.estimatedCostEur ?? 0.10;
    const stimaEsplicita = opts.estimatedCostEur != null;
    const estTokensIn = stimaEsplicita
      ? null
      : Math.ceil(payloadChars(opts.messages, params.tools) / PRECHECK_CHARS_PER_TOKEN);
    const estTokensOut = stimaEsplicita ? null : (params.max_tokens ?? 2000);
    const precheck = await precheckCredit(
      opts.supabase,
      opts.companyId,
      estCost,
      stimaEsplicita ? null : config.tier_key,
      estTokensIn,
      estTokensOut,
    );
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

    // ─────────────────────────────────────────────────────────────────────
    // MP-PRICE-01 — Budget AI per piano (soft cap → downgrade modello;
    // hard cap → block o require_topup). Best-effort: se RPC mancante,
    // procede senza cap (back-compat).
    // ─────────────────────────────────────────────────────────────────────
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: budget } = await (opts.supabase as any)
        .rpc("check_company_budget_v2", { p_company_id: opts.companyId });

      if (budget && typeof budget === "object") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const b = budget as any;
        const capStatus: string = String(b.effective_cap_status ?? b.cap_status ?? "ok");
        const onSoftCap: string = String(b.on_soft_cap ?? "downgrade_models");
        const onHardCap: string = String(b.on_hard_cap ?? "require_topup");

        if (capStatus === "hard_cap") {
          if (onHardCap === "block") {
            throw new AiRouterError(
              `Budget AI mensile esaurito (hard cap raggiunto). Upgrade piano o top-up necessario.`,
              opts.taskKey,
              [],
            );
          }
          if (onHardCap === "require_topup") {
            throw new AiRouterError(
              `Budget AI esaurito. Effettua un top-up dalle impostazioni AI per continuare.`,
              opts.taskKey,
              [],
            );
          }
          // 'auto_charge': continua, addebito gestito da auto-topup-trigger separato
        } else if (capStatus === "soft_cap") {
          if (onSoftCap === "block") {
            throw new AiRouterError(
              `Budget AI: soft cap raggiunto (${b.effective_usage_pct}%). Upgrade piano per continuare.`,
              opts.taskKey,
              [],
            );
          }
          if (onSoftCap === "downgrade_models" && config.fallback_models.length > 0) {
            // Downgrade automatico a modello economico (primo fallback)
            console.warn(
              `[aiRouter] soft cap raggiunto per company ${opts.companyId} (${b.effective_usage_pct}%) — downgrade da ${config.primary_model} a ${config.fallback_models[0]}`,
            );
            // Riordina modelsToTry: il fallback diventa primario, altri restano come fallback
            const downgraded = config.fallback_models[0];
            modelsToTry.length = 0;
            modelsToTry.push(downgraded, ...config.fallback_models.slice(1));
            // primary_model originale resta come ultimo fallback (best-effort se downgrade fail)
            modelsToTry.push(config.primary_model);
            const dedupedModels = Array.from(new Set(modelsToTry.filter(Boolean)));
            modelsToTry.length = 0;
            modelsToTry.push(...dedupedModels);
          }
          // 'notify_only': continua senza modifiche
        }
      }
    } catch (e) {
      // Se è AiRouterError dei cap, propaga; altrimenti ignora (back-compat)
      if (e instanceof AiRouterError) throw e;
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes("function") && !msg.includes("does not exist")) {
        console.warn("[aiRouter] checkBudgetAndRoute warning:", msg);
      }
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
      // ── Empty content guard ──
      // Reasoning models possono ritornare 200 OK con content="" se il budget
      // max_tokens è stato consumato dal reasoning interno (specie GPT-5/o3).
      // Se non c'è né content né tool_calls, è un fallimento → trigger fallback.
      const hasToolCalls = Array.isArray(choice.message?.tool_calls)
        && choice.message.tool_calls.length > 0;
      if (!content.trim() && !hasToolCalls) {
        const finishReason = choice.finish_reason ?? "unknown";
        throw new Error(
          `Empty content from model (finish_reason=${finishReason}, completion_tokens=${data.usage?.completion_tokens ?? 0}). Likely reasoning budget exhausted.`,
        );
      }
      // ── Structured-output guard (repair via fallback) ──
      // Se il chiamante ha chiesto un output JSON e il modello restituisce testo
      // non parsabile (anche dopo strip di fence/prosa), trattalo come fallimento
      // e passa al modello SUCCESSIVO. Solo se restano fallback: sull'ultimo
      // modello si restituisce comunque il content (back-compat, mai peggio di prima).
      const _rf = opts.responseFormat as { type?: string } | undefined;
      const _wantsJson = !!_rf && (_rf.type === "json_object" || _rf.type === "json_schema");
      if (_wantsJson && content.trim() && !hasToolCalls && i < modelsToTry.length - 1
          && extractJson(content) === undefined) {
        throw new Error("Structured output non-JSON dal modello — retry su modello di fallback");
      }
      const usage = data.usage ?? {};
      const promptTokens = usage.prompt_tokens ?? 0;
      const completionTokens = usage.completion_tokens ?? 0;
      const totalTokens = usage.total_tokens ?? promptTokens + completionTokens;
      // ── Token letti/scritti in cache (audit 2026-09-03) ──────────────────
      // Prima si logvaga solo prompt_tokens, e quel numero non distingue un
      // token pagato pieno da uno riletto dalla cache a un decimo del prezzo:
      // il breakpoint cache_control sui system poteva essere rotto da mesi
      // senza che nessuno se ne accorgesse. OpenRouter espone il conteggio in
      // `usage.prompt_tokens_details.cached_tokens` (nomi diversi a seconda
      // del provider a monte, quindi li proviamo tutti) e i token SCRITTI in
      // cache in `cache_creation_input_tokens`.
      const usageDetails = usage.prompt_tokens_details ?? {};
      const cachedTokens = Number(
        usageDetails.cached_tokens ??
          usage.cache_read_input_tokens ??
          usageDetails.cache_read_input_tokens ??
          0,
      ) || 0;
      const cacheWriteTokens = Number(
        usage.cache_creation_input_tokens ??
          usageDetails.cache_creation_input_tokens ??
          0,
      ) || 0;
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
        cachedTokens, cacheWriteTokens,
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

      // ── AI Test Lab — scrittura granulare per Demo Azienda ────────────
      // Best-effort: ogni errore qui non blocca il return della risposta.
      await writeTestRun(opts.supabase, {
        companyId: opts.companyId,
        userId: opts.userId,
        feature: opts.taskKey, // feature == taskKey by default; UI può sovrascrivere
        taskKey: opts.taskKey,
        personaKey: opts.personaKey,
        modelId: model,
        forcedByUser: isDemoForced,
        inputTokens: promptTokens,
        outputTokens: completionTokens,
        costUsd,
        latencyMs: durationMs,
        generationId: (data as { id?: string })?.id ?? null,
        promptExcerpt: typeof opts.messages?.[opts.messages.length - 1]?.content === 'string'
          ? (opts.messages[opts.messages.length - 1].content as string)
          : null,
        responseExcerpt: typeof content === 'string' ? content : null,
      });

      // Write-behind cache risposte (solo task opt-in con companyId, vedi
      // cacheTtlDays). Best-effort: errori non bloccano la risposta.
      if (cacheInputHash && (opts.cacheTtlDays ?? 0) > 0 && opts.companyId && content.trim()) {
        try {
          const expiresAt = new Date(Date.now() + (opts.cacheTtlDays as number) * 86400_000).toISOString();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (opts.supabase as any).from("ai_response_cache").upsert(
            {
              task_key: opts.taskKey,
              company_id: opts.companyId,
              input_hash: cacheInputHash,
              output_content: content,
              model_used: model,
              expires_at: expiresAt,
            },
            { onConflict: "task_key,company_id,input_hash" },
          );
        } catch (cacheWriteErr) {
          console.warn("[aiRouter] cache write skipped:", (cacheWriteErr as Error)?.message ?? cacheWriteErr);
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
        failedAttempts: attempts.length > 0 ? [...attempts] : undefined,
      };
    } catch (e) {
      if (e instanceof AiRouterBillingError) {
        throw e;
      }
      const errMsg = (e as Error).message ?? String(e);
      attempts.push({ model, error: errMsg });
      // Log esteso per AI Test Lab demo — utile per diagnosticare modelli che falliscono
      // (es. Gemini 3.1 preview, Kimi reasoning, modelli nuovi non supportati)
      const isDemo = opts.companyId === AI_TEST_LAB_DEMO_COMPANY_ID;
      console.warn(
        `[aiRouter] task=${opts.taskKey} model=${model} attempt ${i+1}/${modelsToTry.length} FAILED:`,
        errMsg.slice(0, 500),
      );
      if (isDemo) {
        console.warn(`[aiRouter][AI-TEST-LAB] modello richiesto fallito: ${model} | errore: ${errMsg.slice(0, 300)}`);
      }
      // Backoff con jitter prima del fallback, SOLO su errori transitori
      // (rate-limit/overload/timeout): senza pausa il modello successivo —
      // spesso sullo stesso provider via OpenRouter — incassava lo stesso
      // rate-limit a catena. Errori "di modello" (4xx, schema) non aspettano.
      if (i < modelsToTry.length - 1 && /rate|overload|temporar|timeout|unavailable|429|5\d\d/i.test(errMsg)) {
        await new Promise((r) => setTimeout(r, 350 * (i + 1) + Math.floor(Math.random() * 300)));
      }
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

  // Nel messaggio va anche l'ULTIMO errore reale: "tutti i modelli falliti"
  // da solo suona come "l'AI è rotta", mentre la causa vera (es. OpenRouter
  // 402 saldo esaurito, chiave revocata) resta actionable solo se la si vede.
  const lastErr = attempts[attempts.length - 1]?.error?.slice(0, 220);
  throw new AiRouterError(
    `Tutti i modelli falliti per task '${opts.taskKey}' (${modelsToTry.length} tentativi)${lastErr ? ` — ultimo errore: ${lastErr}` : ""}`,
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
