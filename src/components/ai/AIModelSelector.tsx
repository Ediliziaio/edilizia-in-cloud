/**
 * AIModelSelector — dropdown stile Canva/ChatGPT per scegliere il modello AI.
 *
 * Visibile solo per Demo Azienda (l'hook useAIModelSelector ritorna
 * showSelector=false altrimenti, e il componente render null).
 *
 * UI:
 *  ┌──────────────────────────────────┐
 *  │ 🟠 Kimi K2 ⌄                    │
 *  └──────────────────────────────────┘
 *  Click → popover con:
 *  - Lista modelli con icona provider, label, costo stimato/chiamata
 *  - Badge "consigliato" sul recommended
 *  - Check sul modello attivo
 */
import { useState } from 'react';
import { ChevronDown, Check, Sparkles, Loader2, RefreshCw } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { formatCost, type AIModelMeta } from '@/lib/ai/openrouter-models';
import { ProviderIcon } from '@/components/ai/ProviderIcon';

interface Props {
  models: AIModelMeta[];
  selectedModel: string;
  onSelect: (modelId: string) => void;
  loading?: boolean;
  onRefresh?: () => void;
  /** Stile compatto: solo pillola, senza chevron grande. */
  compact?: boolean;
  /** Mostra costo medio per chiamata sotto il label nel trigger. */
  showCost?: boolean;
}

export function AIModelSelector({
  models,
  selectedModel,
  onSelect,
  loading = false,
  onRefresh,
  compact = false,
  showCost = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const selected = models.find((m) => m.id === selectedModel) ?? null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700',
            'hover:bg-slate-50 hover:border-slate-300 transition-colors',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400',
            open && 'border-orange-400 ring-2 ring-orange-100',
          )}
          aria-label="Seleziona modello AI"
          title={selected ? `Modello: ${selected.label}` : 'Seleziona modello'}
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />
          ) : selected ? (
            <ProviderIcon provider={selected.provider} className="h-3.5 w-3.5" />
          ) : (
            <Sparkles className="h-3.5 w-3.5 text-orange-500" />
          )}
          <span className={cn('truncate', compact ? 'max-w-[110px]' : 'max-w-[140px]')}>
            {selected ? selected.label : 'Modello'}
          </span>
          {showCost && selected?.estimatedCostPerCall !== undefined && (
            <span className="text-[10px] text-slate-400 font-mono">
              ~{formatCost(selected.estimatedCostPerCall)}
            </span>
          )}
          <ChevronDown className="h-3 w-3 text-slate-400" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="top"
        sideOffset={6}
        className="w-[340px] p-0 border-slate-200 shadow-2xl rounded-xl overflow-hidden flex flex-col"
        style={{ maxHeight: 'min(70vh, 480px)' }}
      >
        <div className="px-3 py-2 border-b bg-gradient-to-br from-orange-50 to-amber-50 shrink-0 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-800">Modelli AI · Test Lab</p>
            <p className="text-[10px] text-slate-500">
              Costo stimato per chiamata (1.5k in / 800 out token)
            </p>
          </div>
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              className="p-1.5 rounded-md hover:bg-white text-slate-500 hover:text-orange-600 transition-colors"
              title="Ricarica lista modelli"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            </button>
          )}
        </div>
        <div className="overflow-y-auto p-1.5 flex-1 min-h-0">
          {models.length === 0 && !loading ? (
            <p className="text-xs text-slate-400 text-center py-4">
              Nessun modello disponibile. Verifica OPENROUTER_API_KEY.
            </p>
          ) : (
            models.map((m) => {
              const active = m.id === selectedModel;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    onSelect(m.id);
                    setOpen(false);
                  }}
                  className={cn(
                    'w-full flex items-start gap-2 px-2 py-1.5 rounded-md text-left transition-colors',
                    active ? 'bg-orange-50 text-orange-900' : 'hover:bg-slate-50 text-slate-700',
                  )}
                >
                  <ProviderIcon provider={m.provider} className="h-4 w-4 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[12px] font-medium truncate">{m.label}</span>
                      {m.recommended && (
                        <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-orange-300 text-orange-700 bg-orange-50">
                          ⭐ V1
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-slate-500">{m.providerLabel}</span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        ~{formatCost(m.estimatedCostPerCall)}
                      </span>
                      {m.contextLength > 0 && (
                        <span className="text-[10px] text-slate-400">
                          {(m.contextLength / 1000).toFixed(0)}k ctx
                        </span>
                      )}
                    </div>
                  </div>
                  {active && <Check className="h-3.5 w-3.5 mt-0.5 text-orange-600 shrink-0" />}
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
