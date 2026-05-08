/**
 * AIRunFooter — riga compatta sotto un messaggio AI demo che mostra:
 *   ⏱ 2.3s · 🟠 Kimi K2 · $0.012
 *
 * Visibile solo per Demo Azienda (gated dal hook useAIModelSelector).
 * I dati vengono dalla riga `ai_test_runs` corrispondente al messaggio
 * (matched per `openrouter_generation_id` o per `created_at` close enough).
 */
import { Clock, DollarSign, Star, AlertTriangle } from 'lucide-react';
import { ProviderIcon } from '@/components/ai/ProviderIcon';
import { formatCost, formatLatency } from '@/lib/ai/openrouter-models';
import { parseProvider, PROVIDER_LABELS } from '@/lib/ai/models.config';
import { cn } from '@/lib/utils';

export interface AIRunMeta {
  model_id: string;
  latency_ms?: number | null;
  cost_usd?: number | null;
  input_tokens?: number | null;
  output_tokens?: number | null;
  user_rating?: number | null;
  /** Modello richiesto dall'utente nel selettore. Se diverso da model_id → fallback. */
  requested_model_id?: string | null;
}

interface Props {
  meta: AIRunMeta | null | undefined;
  /** Compact = solo costo+latency. Default = costo + latency + provider icon + label. */
  compact?: boolean;
  className?: string;
  onRate?: (rating: number) => void;
}

export function AIRunFooter({ meta, compact = false, className, onRate }: Props) {
  if (!meta) return null;
  const provider = parseProvider(meta.model_id);
  const providerLabel = PROVIDER_LABELS[provider] ?? provider;
  const labelTail = meta.model_id.split('/').slice(1).join('/').replace(/-/g, ' ');
  const modelLabel = labelTail.replace(/\b\w/g, (c) => c.toUpperCase());

  // Detection fallback automatico: se l'utente ha richiesto un modello via
  // selettore UI ma aiRouter ha usato un fallback, evidenziamo la differenza.
  const isFallback =
    !!meta.requested_model_id && meta.requested_model_id !== meta.model_id;
  const requestedTail = meta.requested_model_id
    ? meta.requested_model_id.split('/').slice(1).join('/').replace(/-/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase())
    : null;

  return (
    <div
      className={cn(
        'mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px]',
        isFallback ? 'text-amber-700' : 'text-slate-400',
        className,
      )}
    >
      {isFallback && requestedTail && (
        <span
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200 font-semibold"
          title={`Hai richiesto ${meta.requested_model_id} ma è fallito → fallback automatico a ${meta.model_id}`}
        >
          <AlertTriangle className="h-2.5 w-2.5" />
          Fallback: {requestedTail} non disponibile
        </span>
      )}
      <span className="inline-flex items-center gap-0.5" title="Tempo di risposta">
        <Clock className="h-2.5 w-2.5" />
        {formatLatency(meta.latency_ms)}
      </span>
      {meta.cost_usd !== null && meta.cost_usd !== undefined && (
        <span className="inline-flex items-center gap-0.5" title="Costo OpenRouter">
          <DollarSign className="h-2.5 w-2.5" />
          {formatCost(meta.cost_usd)}
        </span>
      )}
      {!compact && (
        <span
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px]"
          title={`${providerLabel} · ${meta.model_id}`}
        >
          <ProviderIcon provider={provider} className="h-2.5 w-2.5" />
          <span className="font-medium">{modelLabel}</span>
        </span>
      )}
      {meta.input_tokens !== null && meta.input_tokens !== undefined && (
        <span className="text-[10px] text-slate-400 font-mono" title="Token in / out">
          {meta.input_tokens}↗{meta.output_tokens ?? 0}
        </span>
      )}
      {onRate && (
        <span className="ml-auto inline-flex items-center gap-0.5">
          {[1, 2, 3, 4, 5].map((n) => {
            const filled = (meta.user_rating ?? 0) >= n;
            return (
              <button
                key={n}
                type="button"
                onClick={() => onRate(n)}
                className="hover:scale-110 transition-transform"
                title={`Valuta ${n}/5`}
                aria-label={`Valuta ${n} stelle`}
              >
                <Star
                  className={cn(
                    'h-3 w-3',
                    filled ? 'fill-amber-400 text-amber-400' : 'text-slate-300',
                  )}
                />
              </button>
            );
          })}
        </span>
      )}
    </div>
  );
}
