/**
 * promptBuilder.ts — MP-02 Master Prompt Builder
 *
 * Sessione 4 / MP-02 — Centralizza la composizione del system prompt per
 * tutte le edge function AI (silvio-chat, ai-orchestrator, ai-quote-supreme,
 * ai-document-analyzer). Sostituisce la concatenazione inline + buildSystemPrompt
 * con un'unica funzione che gestisce TUTTI i layer:
 *
 *   1. Constitutional preamble (preambolo.ts esistente)
 *   2. Persona base prompt (potenzialmente A/B variant)
 *   3. User context (role, company, lingua)
 *   4. Memory context (preferenze utente, info ricorrenti)
 *   5. RAG context (top-K chunks pre-iniettati con marker [S1]...)
 *   6. Citation enforcement rules (se RAG attivo)
 *   7. Structured output rules (se tier balanced/premium)
 *
 * A/B test (MP-05): se persona ha un proposal in `in_test`, in base al
 * traffic_pct decide se servire la variant proposta o quella attuale.
 * Assegnazione deterministica: hash(session_id + persona_key) % 100.
 *
 * USO TIPICO:
 *   const built = await buildPersonaPrompt(supabase, {
 *     personaKey: "silvio",
 *     basePrompt: persona.system_prompt,
 *     personaVersion: persona.system_prompt_version,
 *     recommendedTierKey: persona.recommended_tier_key,
 *     userContext: "...",
 *     memoryContext: "...",
 *     ragContextBlock: "[KB] ...",
 *     ragSourcesCount: 4,
 *     sessionId: channel_id,        // per stable A/B bucket assignment
 *     companyId,
 *   });
 *   // → { systemPrompt, preamboloVersion, abVariantId, useStructured }
 */
import { buildSystemPrompt, loadActivePreambolo } from "./preambolo.ts";
import { CITATION_FORMAT_RULES } from "./citationValidator.ts";
import { STRUCTURED_OUTPUT_SYSTEM_RULES, shouldUseStructured } from "./structuredOutput.ts";
import {
  GENERAL_EXECUTION_PLAYBOOKS,
  TOOL_SELECTION_AND_RESULT_PLAYBOOK,
  getPersonaExecutionPlaybook,
} from "./executionPlaybooks.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;

export interface BuildPersonaPromptArgs {
  /** Chiave persona (silvio, cfo, hr, ...) */
  personaKey: string;
  /** Prompt base persona (system_prompt da DB ai_personas) */
  basePrompt: string;
  /** Versione corrente del prompt persona */
  personaVersion?: number | null;
  /** Tier consigliato dal persona record (per attivare structured output) */
  recommendedTierKey?: string | null;
  /** Blocco contesto utente (role, lingua, company info) */
  userContext?: string;
  /** Blocco memoria utente (preferenze, info ricorrenti) */
  memoryContext?: string;
  /** Blocco RAG iniettato (con marker [S1]...) */
  ragContextBlock?: string;
  /** Quante source RAG ci sono (per attivare CITATION_FORMAT_RULES) */
  ragSourcesCount?: number;
  /** ID sessione/channel per assegnazione A/B deterministica */
  sessionId?: string | null;
  /** Company id (per A/B scoped per tenant) */
  companyId?: string | null;
  /** User id usato dalla RPC ai_get_prompt_variant per fallback bucket */
  userId?: string | null;
  /**
   * AI Test Lab — quando il demo user forza un modello debole (es. Ministral 3B/8B,
   * Llama 8B, Gemma 2B), disabilita lo structured output a livello di system prompt.
   * Senza questo flag il blocco STRUCTURED_OUTPUT_SYSTEM_RULES viene comunque
   * iniettato nel prompt → il modello produce JSON crudo visibile all'utente.
   */
  disableStructuredOutput?: boolean;
}

export interface BuildEnrichedSystemPromptArgs extends BuildPersonaPromptArgs {
  supabase: SupabaseClient;
}

export interface BuiltPersonaPrompt {
  systemPrompt: string;
  preamboloVersion: number | null;
  /** Se != null, sta venendo servito un proposal A/B in_test */
  abVariantId: string | null;
  /** True se attivo structured output (tier balanced/premium + no tool calls) */
  useStructured: boolean;
  /** Versione effettiva del prompt persona (variant se A/B, altrimenti la base) */
  effectivePersonaVersion: number | null;
  /** ID test A/B servito dalla RPC ai_get_prompt_variant, se disponibile */
  abTestId: string | null;
  /** True se il prompt effettivo arriva dal ramo variant del test */
  abVariantServed: boolean;
}

interface ProposalRow {
  id: string;
  persona_key: string;
  proposed_prompt: string;
  test_traffic_pct: number;
  status: string;
}

// Cache locale dei proposal in test (TTL 60s)
let _propCache: { data: ProposalRow[]; fetchedAt: number } | null = null;
const PROP_CACHE_TTL_MS = 60_000;

function buildRuntimeContextBlock(now = new Date()): string {
  let formattedRome = now.toISOString();
  try {
    formattedRome = new Intl.DateTimeFormat("it-IT", {
      timeZone: "Europe/Rome",
      dateStyle: "full",
      timeStyle: "short",
    }).format(now);
  } catch {
    // Intl can fail in constrained runtimes; ISO is still safer than no date.
  }

  return [
    "# CONTESTO TEMPORALE OPERATIVO",
    `- Data/ora corrente: ${formattedRome} (Europe/Rome).`,
    "- Usa questa data per interpretare oggi, domani, ieri, prossimo mese, prossima settimana e scadenze.",
    "- Non usare anni o mesi impliciti se il dato aziendale/tool indica date diverse: dichiara sempre il perimetro temporale.",
  ].join("\n");
}

async function loadInTestProposals(supabase: SupabaseClient): Promise<ProposalRow[]> {
  const now = Date.now();
  if (_propCache && now - _propCache.fetchedAt < PROP_CACHE_TTL_MS) {
    return _propCache.data;
  }
  try {
    const { data, error } = await supabase
      .from("ai_persona_prompt_proposals")
      .select("id, persona_key, proposed_prompt, test_traffic_pct, status")
      .eq("status", "in_test");
    if (error) {
      console.warn("[promptBuilder] proposals load error:", error.message);
      _propCache = { data: [], fetchedAt: now };
      return [];
    }
    _propCache = { data: (data ?? []) as ProposalRow[], fetchedAt: now };
    return _propCache.data;
  } catch (e) {
    console.warn("[promptBuilder] proposals exception:", e instanceof Error ? e.message : e);
    _propCache = { data: [], fetchedAt: now };
    return [];
  }
}

/**
 * Hash deterministico stabile (FNV-1a 32 bit) per assegnazione bucket A/B.
 */
function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function pickAbVariant(
  proposals: ProposalRow[],
  personaKey: string,
  sessionId: string | null,
  companyId: string | null,
): ProposalRow | null {
  const candidates = proposals.filter((p) => p.persona_key === personaKey);
  if (candidates.length === 0) return null;
  // Se ci sono multiple proposal in test per la stessa persona, ne testiamo solo una alla volta:
  // prendiamo la prima in ordine di id (deterministico). Sistema future-proof.
  const proposal = candidates[0];
  const bucketKey = `${companyId ?? "_"}::${sessionId ?? "_"}::${personaKey}::${proposal.id}`;
  const bucket = fnv1a(bucketKey) % 100;
  return bucket < proposal.test_traffic_pct ? proposal : null;
}

interface PromptVariantRuntime {
  prompt: string | null;
  testId: string | null;
  isVariant: boolean;
}

async function loadRuntimePromptVariant(
  supabase: SupabaseClient,
  args: BuildPersonaPromptArgs,
): Promise<PromptVariantRuntime | null> {
  if (!args.companyId || !args.sessionId) return null;

  try {
    const { data, error } = await supabase.rpc("ai_get_prompt_variant", {
      p_persona_key: args.personaKey,
      p_company_id: args.companyId,
      p_user_id: args.userId ?? null,
      p_session_id: args.sessionId,
    });
    if (error) {
      console.warn("[promptBuilder] prompt variant RPC error:", error.message);
      return null;
    }

    const row = (data ?? {}) as Record<string, unknown>;
    const prompt = typeof row.prompt === "string" && row.prompt.trim().length > 0
      ? row.prompt
      : null;
    return {
      prompt,
      testId: typeof row.test_id === "string" ? row.test_id : null,
      isVariant: row.variant === true,
    };
  } catch (e) {
    console.warn("[promptBuilder] prompt variant RPC exception:", e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * Funzione master per costruire il system prompt persona-aware con A/B test.
 */
export async function buildPersonaPrompt(
  supabase: SupabaseClient,
  args: BuildPersonaPromptArgs,
): Promise<BuiltPersonaPrompt> {
  // ── 1) Determina se servire variant A/B ─────────────────────────────────
  const runtimeVariant = await loadRuntimePromptVariant(supabase, args);
  if (runtimeVariant?.prompt) {
    const ragCount = args.ragSourcesCount ?? 0;
    const citationRulesBlock = ragCount > 0 ? CITATION_FORMAT_RULES : "";
    const useStructured = !args.disableStructuredOutput
      && shouldUseStructured(args.recommendedTierKey ?? null);
    const structuredRulesBlock = useStructured ? STRUCTURED_OUTPUT_SYSTEM_RULES : "";
    const personaWithContext = [
      runtimeVariant.prompt,
      buildRuntimeContextBlock(),
      args.userContext ?? "",
      GENERAL_EXECUTION_PLAYBOOKS,
      TOOL_SELECTION_AND_RESULT_PLAYBOOK,
      getPersonaExecutionPlaybook(args.personaKey),
      args.memoryContext ?? "",
      args.ragContextBlock ?? "",
      citationRulesBlock,
      structuredRulesBlock,
    ].filter(Boolean).join("\n\n");
    const { prompt: systemPrompt, preamboloVersion } = await buildSystemPrompt(supabase, personaWithContext);

    return {
      systemPrompt,
      preamboloVersion,
      abVariantId: runtimeVariant.isVariant ? runtimeVariant.testId : null,
      useStructured,
      effectivePersonaVersion: runtimeVariant.isVariant ? null : (args.personaVersion ?? null),
      abTestId: runtimeVariant.testId,
      abVariantServed: runtimeVariant.isVariant,
    };
  }

  // Fallback retrocompatibile: se la RPC MP-05 non è disponibile o non ha test
  // attivi, usa la tabella proposals storica.
  const proposals = await loadInTestProposals(supabase);
  const abVariant = pickAbVariant(proposals, args.personaKey, args.sessionId ?? null, args.companyId ?? null);
  const personaPrompt = abVariant ? abVariant.proposed_prompt : args.basePrompt;

  // ── 2) Citation rules (solo se RAG iniettato) ─────────────────────────
  const ragCount = args.ragSourcesCount ?? 0;
  const citationRulesBlock = ragCount > 0 ? CITATION_FORMAT_RULES : "";

  // ── 3) Structured output (tier balanced/premium) ──────────────────────
  // AI Test Lab: se il demo user forza un modello debole (Ministral, Gemma 2B,
  // Llama 8B, etc.), bypassiamo lo structured output a livello di prompt.
  const useStructured = !args.disableStructuredOutput
    && shouldUseStructured(args.recommendedTierKey ?? null);
  const structuredRulesBlock = useStructured ? STRUCTURED_OUTPUT_SYSTEM_RULES : "";

  // ── 4) Compose persona-with-context ───────────────────────────────────
  const personaWithContext = [
    personaPrompt,
    buildRuntimeContextBlock(),
    args.userContext ?? "",
    GENERAL_EXECUTION_PLAYBOOKS,
    TOOL_SELECTION_AND_RESULT_PLAYBOOK,
    getPersonaExecutionPlaybook(args.personaKey),
    args.memoryContext ?? "",
    args.ragContextBlock ?? "",
    citationRulesBlock,
    structuredRulesBlock,
  ].filter(Boolean).join("\n\n");

  // ── 5) Antepone preambolo costituzionale ──────────────────────────────
  const { prompt: systemPrompt, preamboloVersion } = await buildSystemPrompt(supabase, personaWithContext);

  return {
    systemPrompt,
    preamboloVersion,
    abVariantId: abVariant?.id ?? null,
    useStructured,
    effectivePersonaVersion: abVariant ? null : (args.personaVersion ?? null),
    abTestId: null,
    abVariantServed: Boolean(abVariant),
  };
}

/**
 * Entry point esplicito richiesto da MP-02. Incapsula supabase negli opts
 * così le edge function non devono conoscere i singoli layer del prompt.
 */
export async function buildEnrichedSystemPrompt(
  opts: BuildEnrichedSystemPromptArgs,
): Promise<BuiltPersonaPrompt> {
  const { supabase, ...args } = opts;
  return buildPersonaPrompt(supabase, args);
}

/**
 * Per testing/debugging: invalida la cache dei proposal forzando reload.
 */
export function invalidatePromptBuilderCache(): void {
  _propCache = null;
}

// Re-export comodo per chiamanti
export { loadActivePreambolo, buildSystemPrompt };
