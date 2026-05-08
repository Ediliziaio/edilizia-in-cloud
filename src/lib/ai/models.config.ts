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
export const DEMO_COMPANY_ID = '778a2c76-1253-49f2-a5e8-283363ac3e29';
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
 * NOTA: gli ID OpenRouter cambiano ogni tanto (versioning). Usiamo regex
 * con prefisso provider/famiglia in modo da catturare le versioni minori
 * senza modifiche di codice.
 */
export const OPENROUTER_ALLOWED_PATTERNS: AllowedPattern[] = [
  // ⭐ PRIORITARIO V1 — Kimi K2 (Moonshot AI)
  { pattern: /^moonshotai\/kimi-/, type: 'text', priority: 1, recommended: true, providerLabel: 'Moonshot' },

  // Anthropic — default attuale + premium
  { pattern: /^anthropic\/claude-(sonnet|haiku|opus)-4(\.5|\.6)?/, type: 'text', priority: 2, providerLabel: 'Anthropic' },
  { pattern: /^anthropic\/claude-(sonnet|haiku|opus)-3(\.5|\.7)?/, type: 'text', priority: 3, providerLabel: 'Anthropic' },

  // OpenAI — economici e flagship
  { pattern: /^openai\/gpt-(4o|4\.1|4-turbo)/, type: 'text', priority: 4, providerLabel: 'OpenAI' },
  { pattern: /^openai\/o[1-4]-(mini|preview)?/, type: 'text', priority: 5, providerLabel: 'OpenAI' },

  // Google — Gemini Flash è imbattibile sul costo
  { pattern: /^google\/gemini-(2\.5|2\.0|1\.5)-(flash|pro)/, type: 'text', priority: 6, providerLabel: 'Google' },

  // DeepSeek — alternativa low-cost
  { pattern: /^deepseek\/deepseek-(v3|r1|chat)/, type: 'text', priority: 7, providerLabel: 'DeepSeek' },

  // X-AI Grok — ragionamento
  { pattern: /^x-ai\/grok-[2-9]/, type: 'text', priority: 8, providerLabel: 'xAI' },

  // Meta Llama — opzione open
  { pattern: /^meta-llama\/llama-(3\.3|3\.1|4)/, type: 'text', priority: 9, providerLabel: 'Meta' },

  // Mistral — opzione europea
  { pattern: /^mistralai\/(mistral|mixtral|ministral)/, type: 'text', priority: 10, providerLabel: 'Mistral' },
];

/**
 * Verifica server-side che un model_id sia accettabile.
 * Usato sia nel hook FE (per filtrare la lista OpenRouter) sia nelle edge function
 * (per validare body.model in arrivo dall'UI).
 */
export function isModelAllowed(modelId: string | null | undefined): boolean {
  if (!modelId) return false;
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
