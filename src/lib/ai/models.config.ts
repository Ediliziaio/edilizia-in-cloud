/**
 * AI Models config — allow-list per AI Test Lab Demo Azienda.
 *
 * Solo i modelli che matchano questi pattern sono mostrati nel selettore UI
 * ed accettati dalle edge function. Permette di aggiungere/rimuovere modelli
 * senza deploy: basta aggiornare i regex.
 *
 * I prezzi vengono letti DINAMICAMENTE da OpenRouter (`/api/v1/models`)
 * o dalla cache `ai_model_catalog` sincronizzata via edge `sync-openrouter-catalog`.
 * Niente pricing tables hardcoded.
 */

/**
 * Demo gating constants.
 *
 * Per evitare leak in altri tenant, il selettore + l'instrumentazione
 * `ai_test_runs` vengono attivati SOLO quando entrambe le condizioni sono vere:
 *  - active company id = DEMO_COMPANY_ID
 *  - utente loggato email = DEMO_USER_EMAIL
 */
// Re-export dalla constants/ centralizzata per evitare drift.
// Storico: il valore era duplicato qui e in CompanyLayout.tsx → centralizzato
// in src/lib/constants/demoCompany.ts.
export { DEMO_COMPANY_ID } from '@/lib/constants/demoCompany';
export const DEMO_USER_EMAIL = 'demo@azienda.srl';

export type ModelType = 'text' | 'image';

export interface AllowedPattern {
  pattern: RegExp;
  type: ModelType;
  /** Priorità ordinamento (1 = top). */
  priority: number;
  /** Se true, mostrato come "consigliato" in UI. */
  recommended?: boolean;
  /** Label del provider per UI (icona + nome). */
  providerLabel?: string;
}

/**
 * Allow-list V1 (TEXT only — image gen NON è via OpenRouter).
 *
 * Strategia: pattern catch-all per provider (es. `^moonshotai\/`) per
 * mostrare TUTTI i modelli del provider. Modelli prioritari (es. Kimi K2)
 * hanno pattern specifici con priority più alta + recommended=true.
 *
 * NOTA: gli ID OpenRouter cambiano ogni tanto (versioning). Usiamo regex
 * sufficientemente larghi da catturare nuove versioni senza modifiche di codice.
 */
export const OPENROUTER_ALLOWED_PATTERNS: AllowedPattern[] = [
  // ⭐ PRIORITARIO V1 — Kimi K2 (Moonshot AI) — recommended
  { pattern: /^moonshotai\/kimi-/, type: 'text', priority: 1, recommended: true, providerLabel: 'Moonshot' },

  // Catch-all per provider top — qualunque modello del provider è ammesso
  { pattern: /^moonshotai\//, type: 'text', priority: 2, providerLabel: 'Moonshot' },
  { pattern: /^anthropic\//, type: 'text', priority: 3, providerLabel: 'Anthropic' },
  { pattern: /^openai\//, type: 'text', priority: 4, providerLabel: 'OpenAI' },
  { pattern: /^google\/gemini/, type: 'text', priority: 5, providerLabel: 'Google' },
  { pattern: /^google\/gemma/, type: 'text', priority: 6, providerLabel: 'Google' },
  { pattern: /^deepseek\//, type: 'text', priority: 7, providerLabel: 'DeepSeek' },
  { pattern: /^x-ai\//, type: 'text', priority: 8, providerLabel: 'xAI' },
  { pattern: /^meta-llama\//, type: 'text', priority: 9, providerLabel: 'Meta' },
  { pattern: /^mistralai\//, type: 'text', priority: 10, providerLabel: 'Mistral' },
  { pattern: /^cohere\//, type: 'text', priority: 11, providerLabel: 'Cohere' },
  { pattern: /^qwen\//, type: 'text', priority: 12, providerLabel: 'Qwen' },
  { pattern: /^perplexity\//, type: 'text', priority: 13, providerLabel: 'Perplexity' },
  { pattern: /^nvidia\//, type: 'text', priority: 14, providerLabel: 'NVIDIA' },
  { pattern: /^microsoft\//, type: 'text', priority: 15, providerLabel: 'Microsoft' },
  { pattern: /^amazon\/nova/, type: 'text', priority: 16, providerLabel: 'Amazon' },
  { pattern: /^liquid\//, type: 'text', priority: 17, providerLabel: 'Liquid' },
  { pattern: /^inflection\//, type: 'text', priority: 18, providerLabel: 'Inflection' },
  { pattern: /^thudm\//, type: 'text', priority: 19, providerLabel: 'THUDM' },
  { pattern: /^z-ai\//, type: 'text', priority: 20, providerLabel: 'Z.ai' },
];

/**
 * Filtri esclusivi: modelli da NON mostrare anche se matchano i pattern.
 * Esclude modelli "pesanti" non utili per chat business o variant deprecate.
 */
export const OPENROUTER_EXCLUDE_PATTERNS: RegExp[] = [
  /:free$/i,                             // free tier (rate-limited, instabili)
  /-vision$/i,                            // vision-only standalone (no chat)
  /-instruct-v1$/i,                       // versioni v1 vecchie
  /^.*\/.*-(extended|self-moderated)$/i, // varianti speciali
  /^perplexity\/llama/i,                  // duplicato meta-llama
];

export const PROVIDER_LABELS_EXTRA: Record<string, string> = {
  qwen: 'Qwen',
  perplexity: 'Perplexity',
  nvidia: 'NVIDIA',
  microsoft: 'Microsoft',
  amazon: 'Amazon',
  liquid: 'Liquid',
  inflection: 'Inflection',
  thudm: 'THUDM',
  'z-ai': 'Z.ai',
};

/**
 * Verifica server-side che un model_id sia accettabile.
 * Usato sia nel hook FE (per filtrare la lista OpenRouter) sia nelle edge function
 * (per validare body.model in arrivo dall'UI).
 */
export function isModelAllowed(modelId: string | null | undefined): boolean {
  if (!modelId) return false;
  // Esclusioni first
  if (OPENROUTER_EXCLUDE_PATTERNS.some((re) => re.test(modelId))) return false;
  return OPENROUTER_ALLOWED_PATTERNS.some((p) => p.pattern.test(modelId));
}

/**
 * Trova la priorità di un modello (1=top). Default 99 se non matcha alcuno.
 */
export function modelPriority(modelId: string): number {
  const match = OPENROUTER_ALLOWED_PATTERNS.find((p) => p.pattern.test(modelId));
  return match?.priority ?? 99;
}

/**
 * Estrae il provider da un model_id OpenRouter.
 * Es. 'moonshotai/kimi-k2' → 'moonshotai'
 */
export function parseProvider(modelId: string): string {
  return modelId.split('/')[0] ?? 'unknown';
}

/**
 * Etichetta human-readable per provider.
 */
export const PROVIDER_LABELS: Record<string, string> = {
  moonshotai: 'Moonshot',
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  google: 'Google',
  deepseek: 'DeepSeek',
  'x-ai': 'xAI',
  'meta-llama': 'Meta',
  mistralai: 'Mistral',
  cohere: 'Cohere',
  qwen: 'Qwen',
  perplexity: 'Perplexity',
  nvidia: 'NVIDIA',
  microsoft: 'Microsoft',
  amazon: 'Amazon',
  liquid: 'Liquid',
  inflection: 'Inflection',
  thudm: 'THUDM',
  'z-ai': 'Z.ai',
};

/**
 * Default modelli per ogni feature/task in caso il selettore non sia attivo.
 * Coerente con i primary_model della tabella ai_router_config.
 */
export const DEFAULT_MODELS: Record<string, string> = {
  silvio_chat: 'anthropic/claude-haiku-4.5',
  ai_orchestrator: 'anthropic/claude-haiku-4.5',
  ai_council: 'anthropic/claude-sonnet-4.5',
  silvio_execute: 'anthropic/claude-haiku-4.5',
  ai_summarize: 'google/gemini-2.5-flash',
  doc_router: 'google/gemini-2.5-flash',
};
