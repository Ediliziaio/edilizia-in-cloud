// _shared/ai-provider/domainRewriter.ts
//
// Meta-prompt rewriter GENERICO per-dominio.
//
// Perche' esiste: il rewriter degli infissi (metaPromptRewriter.ts) e' la leva
// di qualita' documentata come "path UNICO" — un LLM testuale trasforma il
// config strutturato in prosa breve, perche' i modelli immagine (gpt-image-1)
// sono addestrati su caption naturali, non su blocchi di regole da 25KB. Ma
// quel rewriter e' interamente cablato sul mondo serramenti (openings,
// cassonetto, sash, hinge): non riusabile per bagno o ristrutturazione.
//
// Qui la stessa chain-logic (chain modelli, validazione lunghezza, coverage
// check, logging, fallback→null) e' estratta e resa parametrica: ogni dominio
// fornisce un RewriterProfile con il proprio system prompt, il proprio
// compactor del config e la propria validazione. metaPromptRewriter.ts NON
// viene toccato: infissi resta identico, questo modulo serve i nuovi domini.

import { callOpenRouter } from "./openrouter.ts";
import type { ChatMessage } from "./types.ts";

// Stessa chain degli infissi: OpenAI via OpenRouter, deterministico.
const REWRITER_MODELS_CHAIN = ["openai/gpt-4o-mini", "openai/gpt-4o"];

export interface RewriterProfile {
  /** Nome dominio per i log (es. "bathroom", "room"). */
  domain: string;
  /** System prompt: e' il single source of truth delle regole del dominio. */
  systemPrompt: string;
  /** Riduce il config completo a cio' che serve davvero al rewriter. */
  compact: (config: unknown) => Record<string, unknown>;
  /**
   * Verifica che la prosa copra i token critici del config. Ritorna l'elenco
   * dei mancanti (→ fallback ai blocchi) o null se tutto presente.
   * Opzionale: senza validate, si accetta qualunque prosa non vuota.
   */
  validate?: (prose: string, compact: Record<string, unknown>) => string[] | null;
}

export interface DomainRewriteArgs {
  config: unknown;
  metadata: {
    task_kind: string;
    company_id?: string | null;
    session_id?: string | null;
  };
}

export interface DomainRewriteResult {
  userPrompt: string;
  modelUsed: string;
  latencyMs: number;
}

/**
 * Trasforma un config strutturato in un brief in prosa naturale, usando il
 * profilo di dominio. Ritorna null se tutti i modelli falliscono o se la prosa
 * non supera la validazione — il caller fa fallback al prompt a blocchi.
 */
export async function rewriteDomainPrompt(
  args: DomainRewriteArgs,
  profile: RewriterProfile,
): Promise<DomainRewriteResult | null> {
  const t0 = Date.now();
  const compact = profile.compact(args.config);
  const userPromptForRewriter = JSON.stringify(compact, null, 2);

  const messages: ChatMessage[] = [
    { role: "system", content: profile.systemPrompt },
    {
      role: "user",
      content: `Generate the render brief for this configuration:\n\n${userPromptForRewriter}`,
    },
  ];

  const log = (lvl: "info" | "warn", extra: Record<string, unknown>) =>
    console[lvl === "info" ? "log" : "warn"](JSON.stringify({
      lvl,
      fn: "domainRewriter",
      domain: profile.domain,
      session_id: args.metadata.session_id,
      ...extra,
    }));

  let lastError: Error | null = null;
  for (const model of REWRITER_MODELS_CHAIN) {
    try {
      const result = await callOpenRouter(
        {
          model,
          messages: messages as unknown[],
          temperature: 0,
          max_tokens: 1200,
        },
        {
          task_kind: args.metadata.task_kind,
          company_id: args.metadata.company_id,
        },
      );

      const prose = (result.content ?? "").trim();
      if (!prose || prose.length < 200) {
        lastError = new Error(`Empty or too-short response from ${model} (${prose.length} chars)`);
        continue;
      }

      const validationErr = profile.validate?.(prose, compact) ?? null;
      if (validationErr && validationErr.length > 0) {
        log("warn", { model, msg: "coverage_validation_failed", missing: validationErr, prose_length: prose.length });
        lastError = new Error(`Validation failed: missing ${validationErr.join(", ")}`);
        continue;
      }

      log("info", { model: result.model, msg: "prompt_generated", prose_length: prose.length, latency_ms: Date.now() - t0 });
      return { userPrompt: prose, modelUsed: result.model, latencyMs: Date.now() - t0 };
    } catch (e) {
      lastError = e as Error;
      log("warn", { model, msg: "call_failed", error: String(lastError.message ?? lastError) });
    }
  }

  log("warn", { msg: "all_models_failed_fallback_to_blocks", last_error: String(lastError?.message ?? "") });
  return null;
}
