/**
 * FeaturePreviewBanner — v8.6.62
 *
 * Banner sticky in cima alla pagina che avvisa l'utente che sta navigando
 * una feature in modalità DEMO. Click sul CTA apre UnlockFeatureDialog.
 *
 * Render condizionato dall'access level: appare solo se isPreview=true.
 */
import { useState } from "react";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import { UnlockFeatureDialog } from "./UnlockFeatureDialog";

interface Props {
  featureKey: string;
  /** Nome user-friendly (es. "Render AI"). */
  featureLabel: string;
  /** Descrizione breve (es. "Genera render fotorealistici da foto"). */
  description?: string;
}

export function FeaturePreviewBanner({ featureKey, featureLabel, description }: Props) {
  const { isPreview } = useFeatureAccess(featureKey);
  const [open, setOpen] = useState(false);

  if (!isPreview) return null;

  return (
    <>
      <div className="rounded-xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 dark:border-amber-900/50 dark:from-amber-950/30 dark:to-orange-950/30 p-3 sm:p-4 flex items-start gap-3 flex-wrap mb-4">
        <div className="h-9 w-9 rounded-full bg-amber-200 dark:bg-amber-900/50 flex items-center justify-center shrink-0">
          <Sparkles className="h-5 w-5 text-amber-700 dark:text-amber-200" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-amber-900 dark:text-amber-100">
            Modalità Demo · {featureLabel}
          </p>
          <p className="text-xs text-amber-800 dark:text-amber-200/80 mt-0.5">
            {description ?? "Puoi esplorare la funzione liberamente. Per usarla davvero (salvare, integrare, generare) sblocca contattando il consulente."}
          </p>
        </div>
        <Button
          size="sm"
          className="bg-amber-600 hover:bg-amber-700 text-white shrink-0"
          onClick={() => setOpen(true)}
        >
          Sblocca ora
        </Button>
      </div>

      <UnlockFeatureDialog
        open={open}
        onOpenChange={setOpen}
        featureKey={featureKey}
        featureLabel={featureLabel}
      />
    </>
  );
}
