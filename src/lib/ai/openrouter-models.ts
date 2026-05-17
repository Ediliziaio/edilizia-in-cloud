/**
 * OpenRouter models fetcher con cache + fallback DB.
 *
 * Strategia:
 *  1. Prova a leggere `ai_model_catalog` (tabella locale, sincronizzata via
 *     edge `sync-openrouter-catalog` ogni 24h). Se trova ≥ 1 row → usa quella.
 *  2. Se la tabella è vuota (es. azienda nuova senza sync), fallback su
 *     `GET https://openrouter.ai/api/v1/models` (endpoint pubblico, no auth).
 *  3. Cache in-memory con TTL 30 min (per non rifetchare ad ogni mount UI).
 *
 * Filtra il risultato applicando OPENROUTER_ALLOWED_PATTERNS.
 */
import { supabase } from '@/integrations/supabase/client';
import { fetchWithTimeout } from '@/lib/utils/fetchWithTimeout';
import {
  OPENROUTER_ALLOWED_PATTERNS,
  OPENROUTER_EXCLUDE_PATTERNS,
  parseProvider,
  modelPriority,
  PROVIDER_LABELS,
  type ModelType,
} from '@/lib/ai/models.config';

export interface AIModelMeta {
  id: string;                  // 'moonshotai/kimi-k2'
  label: string;               // 'Kimi K2'
  provider: string;            // 'moonshotai'
  providerLabel: string;       // 'Moonshot'
  type: ModelType;
  pricing: {
    promptUsdPer1M: number;    // costo input per 1M token (USD)
    completionUsdPer1M: number; // costo output per 1M token (USD)
  };
  contextLength: number;
  recommended?: boolean;
  /** Costo medio per chiamata stimato (es. 1500 in / 800 out token) */
  estimatedCostPerCall?: number;
}

interface CatalogRow {
  model_id: string;
  provider: string | null;
  display_name: string | null;
  context_length: number | null;
  pricing_input_usd_1m: number | null;
  pricing_output_usd_1m: number | null;
  whitelisted: boolean | null;
  status: string | null;
}

interface OpenRouterApiModel {
  id: string;
  name?: string;
  pricing?: {
    prompt?: string | number;     // USD per token (es. "0.0000005")
    completion?: string | number;
  };
  context_length?: number;
  architecture?: { modality?: string };
}

const CACHE_TTL_MS = 30 * 60 * 1000;
const ESTIMATED_INPUT_TOKENS = 1500;
const ESTIMATED_OUTPUT_TOKENS = 800;

let _cache: { data: AIModelMeta[]; fetchedAt: number } | null = null;

function isAllowed(id: string, type: ModelType): boolean {
  // Esclusioni first
  if (OPENROUTER_EXCLUDE_PATTERNS.some((re) => re.test(id))) return false;
  return OPENROUTER_ALLOWED_PATTERNS.some((p) => p.type === type && p.pattern.test(id));
}

function buildLabel(id: string, displayName?: string | null): string {
  if (displayName && displayName.trim().length > 0) return displayName;
  // Fallback: parse da id "moonshotai/kimi-k2" → "Kimi K2"
  const tail = id.split('/').slice(1).join('/');
  return tail
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function isRecommended(id: string): boolean {
  const match = OPENROUTER_ALLOWED_PATTERNS.find((p) => p.pattern.test(id));
  return match?.recommended === true;
}

function estimateCostPerCall(promptPer1M: number, completionPer1M: number): number {
  return (
    (promptPer1M * ESTIMATED_INPUT_TOKENS) / 1_000_000 +
    (completionPer1M * ESTIMATED_OUTPUT_TOKENS) / 1_000_000
  );
}

function fromCatalogRow(row: CatalogRow): AIModelMeta | null {
  if (!isAllowed(row.model_id, 'text')) return null;
  if (row.status === 'unavailable') return null;
  const provider = row.provider ?? parseProvider(row.model_id);
  const promptPer1M = Number(row.pricing_input_usd_1m ?? 0);
  const completionPer1M = Number(row.pricing_output_usd_1m ?? 0);
  return {
    id: row.model_id,
    label: buildLabel(row.model_id, row.display_name),
    provider,
    providerLabel: PROVIDER_LABELS[provider] ?? provider,
    type: 'text',
    pricing: { promptUsdPer1M: promptPer1M, completionUsdPer1M: completionPer1M },
    contextLength: row.context_length ?? 0,
    recommended: isRecommended(row.model_id),
    estimatedCostPerCall: estimateCostPerCall(promptPer1M, completionPer1M),
  };
}

function fromApiModel(m: OpenRouterApiModel): AIModelMeta | null {
  if (!isAllowed(m.id, 'text')) return null;
  // OpenRouter pricing è espresso in $/token (numero molto piccolo) → convertiamo a $/1M
  const promptPerToken = Number(m.pricing?.prompt ?? 0);
  const completionPerToken = Number(m.pricing?.completion ?? 0);
  const promptPer1M = promptPerToken * 1_000_000;
  const completionPer1M = completionPerToken * 1_000_000;
  const provider = parseProvider(m.id);
  return {
    id: m.id,
    label: buildLabel(m.id, m.name),
    provider,
    providerLabel: PROVIDER_LABELS[provider] ?? provider,
    type: 'text',
    pricing: { promptUsdPer1M: promptPer1M, completionUsdPer1M: completionPer1M },
    contextLength: m.context_length ?? 0,
    recommended: isRecommended(m.id),
    estimatedCostPerCall: estimateCostPerCall(promptPer1M, completionPer1M),
  };
}

function sortModels(models: AIModelMeta[]): AIModelMeta[] {
  return [...models].sort((a, b) => {
    // Recommended sempre in cima
    if (a.recommended && !b.recommended) return -1;
    if (!a.recommended && b.recommended) return 1;
    // Poi per priorità del pattern
    const pa = modelPriority(a.id);
    const pb = modelPriority(b.id);
    if (pa !== pb) return pa - pb;
    // Tie-breaker: costo crescente (più economico prima)
    return (a.estimatedCostPerCall ?? 0) - (b.estimatedCostPerCall ?? 0);
  });
}

/**
 * Fetcher principale. Cache in-memory 30 min.
 *
 * Strategia FIX 9/5: edge function `get-openrouter-models` come PRIMA fonte
 * (server-side, no CORS issue), API OpenRouter direct come SECONDA, DB
 * `ai_model_catalog` come FALLBACK ultimo.
 *
 * Storia bug:
 *   - Pre 8/5: DB primario → solo 5-6 modelli WHITELIST hardcoded visibili
 *   - 8/5:     API OpenRouter primario → ma fetch browser fallisce silenzioso
 *              per CORS preflight bloccato (Lovable preview / ad-blocker) →
 *              cade nel DB fallback povero → UI mostra di nuovo solo 6 modelli
 *   - 9/5:     edge proxy primario → niente CORS, cache CDN 30min, ~300 modelli
 */
export async function fetchAvailableModels(opts?: { forceRefresh?: boolean }): Promise<AIModelMeta[]> {
  const now = Date.now();
  if (!opts?.forceRefresh && _cache && now - _cache.fetchedAt < CACHE_TTL_MS) {
    return _cache.data;
  }

  // 1) Prova edge function proxy (server-side, no CORS issue)
  try {
    const { data, error } = await supabase.functions.invoke<{ models?: OpenRouterApiModel[]; count?: number }>(
      'get-openrouter-models',
    );
    if (!error && data && Array.isArray(data.models) && data.models.length > 0) {
      const apiModels = data.models
        .map(fromApiModel)
        .filter((m): m is AIModelMeta => m !== null);
      if (apiModels.length > 0) {
        const sorted = sortModels(apiModels);
        _cache = { data: sorted, fetchedAt: now };
        console.info(`[openrouter-models] edge proxy: ${data.count} raw → ${apiModels.length} filtered`);
        return sorted;
      }
    } else if (error) {
      console.warn('[openrouter-models] edge proxy error:', error.message);
    }
  } catch (e) {
    console.warn('[openrouter-models] edge proxy invoke failed:', e);
  }

  // 2) Fallback: API pubblica OpenRouter direct (potrebbe fallire per CORS)
  try {
    const res = await fetchWithTimeout('https://openrouter.ai/api/v1/models', {
      timeoutMs: 10_000,
      context: 'openrouter.models.list',
    });
    if (res.ok) {
      const json = await res.json() as { data?: OpenRouterApiModel[] };
      const apiModels = (json.data ?? [])
        .map(fromApiModel)
        .filter((m): m is AIModelMeta => m !== null);
      if (apiModels.length > 0) {
        const sorted = sortModels(apiModels);
        _cache = { data: sorted, fetchedAt: now };
        console.info(`[openrouter-models] direct API fallback: ${apiModels.length} models`);
        return sorted;
      }
    } else {
      console.warn(`[openrouter-models] direct API HTTP ${res.status}, fallback to DB`);
    }
  } catch (e) {
    console.warn('[openrouter-models] direct API fetch failed, fallback to DB:', e);
  }

  // 2) Fallback ai_model_catalog (locale, sincronizzato da edge sync-openrouter-catalog)
  try {
    const { data, error } = await supabase
      .from('ai_model_catalog')
      .select('model_id, provider, display_name, context_length, pricing_input_usd_1m, pricing_output_usd_1m, whitelisted, status')
      .in('status', ['active'])
      .order('provider', { ascending: true });

    if (!error && Array.isArray(data) && data.length > 0) {
      const filtered = data
        .map((r) => fromCatalogRow(r as CatalogRow))
        .filter((m): m is AIModelMeta => m !== null);
      if (filtered.length > 0) {
        const sorted = sortModels(filtered);
        _cache = { data: sorted, fetchedAt: now };
        return sorted;
      }
    }
  } catch (e) {
    console.warn('[openrouter-models] DB fallback failed:', e);
  }

  // Last-ditch: array vuoto (UI nasconde il selettore)
  console.error('[openrouter-models] both API and DB returned no models');
  return [];
}

/** Per testing/debug: invalida la cache. */
export function invalidateModelsCache(): void {
  _cache = null;
}

/** Formatta costo per UI: "$0.012" o "<$0.001". */
export function formatCost(usd: number | null | undefined): string {
  if (!usd || usd <= 0) return '$0.000';
  if (usd < 0.001) return '<$0.001';
  if (usd < 1) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

/** Formatta tempo: "2.3s" o "350ms". */
export function formatLatency(ms: number | null | undefined): string {
  if (!ms || ms <= 0) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
