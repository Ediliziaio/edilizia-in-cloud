/**
 * FeaturePreviewBanner — v8.6.63
 *
 * Banner mostrato in cima alla pagina quando una feature è in preview/demo.
 *
 * Migliorato UX:
 *  - Gradient ambra + icona Sparkles con shimmer animato
 *  - "Modalità Demo · {feature}" + descrizione contestuale
 *  - CTA primaria "Sblocca ora" + secondaria "Scopri di più"
 *  - Bullet list breve (3 punti) compatta sotto
 *  - Legge prop diretti OPPURE FeaturePreviewContext (provider pattern)
 *  - Compact mode per pagine dense
 */
import { useState } from "react";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { useFeaturePreviewContextOptional } from "./useFeaturePreview";
import { Button } from "@/components/ui/button";
import { Sparkles, Check, ChevronDown, ChevronUp } from "lucide-react";
import { UnlockFeatureDialog } from "./UnlockFeatureDialog";

interface Props {
  /** Se non fornito, legge dal FeaturePreviewProvider. */
  featureKey?: string;
  featureLabel?: string;
  description?: string;
  benefits?: string[];
  /** Mostra solo titolo + CTA, nasconde benefit. */
  compact?: boolean;
}

export function FeaturePreviewBanner({
  featureKey: keyProp,
  featureLabel: labelProp,
  description: descProp,
  benefits: benefitsProp,
  compact = false,
}: Props) {
  const ctx = useFeaturePreviewContextOptional();
  const featureKey = keyProp ?? ctx?.featureKey;
  const featureLabel = labelProp ?? ctx?.featureLabel ?? "questa funzione";
  const description = descProp ?? ctx?.description;
  const benefits = benefitsProp ?? ctx?.benefits ?? [];

  // Preferenza: context (può avere forcePreview); fallback su useFeatureAccess
  const directAccess = useFeatureAccess(featureKey ?? "");
  const isPreview = ctx?.isPreview ?? directAccess.isPreview;

  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);

  if (!isPreview || !featureKey) return null;

  return (
    <>
      <div className="rounded-xl border border-amber-200/80 bg-gradient-to-br from-amber-50 via-orange-50/60 to-amber-50 dark:border-amber-900/60 dark:from-amber-950/30 dark:via-orange-950/20 dark:to-amber-950/30 shadow-sm mb-4 overflow-hidden">
        <div className="p-3 sm:p-4 flex items-start gap-3 flex-wrap">
          {/* Icona con shimmer */}
          <div className="relative h-10 w-10 rounded-xl bg-gradient-to-br from-amber-300 to-orange-400 flex items-center justify-center shrink-0 shadow-sm">
            <Sparkles className="h-5 w-5 text-white" />
            <span className="absolute inset-0 rounded-xl bg-white/30 animate-pulse" aria-hidden="true" />
          </div>

          {/* Testo */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-sm text-amber-900 dark:text-amber-100">
                Modalità Demo · {featureLabel}
              </p>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-200 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 uppercase tracking-wide">
                Preview
              </span>
            </div>
            <p className="text-xs text-amber-800 dark:text-amber-200/80 mt-0.5">
              {description ?? "Esplora liberamente l'interfaccia. Per salvare, integrare o generare contenuti contatta il tuo consulente."}
            </p>
          </div>

          {/* CTA primaria */}
          <Button
            size="sm"
            className="bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white shadow-sm shrink-0"
            onClick={() => setOpen(true)}
          >
            <Sparkles className="h-3.5 w-3.5 mr-1" />
            Sblocca ora
          </Button>
        </div>

        {/* Benefits — collassabile in compact mode */}
        {!compact && benefits.length > 0 && (
          <div className="border-t border-amber-200/60 dark:border-amber-900/40 bg-white/40 dark:bg-black/10">
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="w-full px-3 sm:px-4 py-2 flex items-center justify-between text-xs text-amber-900 dark:text-amber-200 hover:bg-white/40 dark:hover:bg-black/20 transition-colors"
              aria-expanded={expanded}
            >
              <span className="font-medium">
                Cosa otterrai sbloccando · {benefits.length} vantaggi
              </span>
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
            {expanded && (
              <ul className="px-4 pb-3 pt-1 grid sm:grid-cols-2 gap-x-4 gap-y-1.5">
                {benefits.map((b, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs text-amber-900 dark:text-amber-200">
                    <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <UnlockFeatureDialog
        open={open}
        onOpenChange={setOpen}
        featureKey={featureKey}
        featureLabel={featureLabel}
        description={description}
        benefits={benefits}
      />
    </>
  );
}
