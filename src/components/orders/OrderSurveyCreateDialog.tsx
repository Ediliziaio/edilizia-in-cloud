import { lazy, Suspense, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import type { OrderSurveyContext } from "@/lib/surveys/orderVisits";
const SurveyCreateForm = lazy(() => import("@/pages/azienda/sopralluoghi/NuovoSopralluogo").then(m => ({default:m.SurveyCreateForm})));

export function OrderSurveyCreateDialog({ companyId, commessa, onClose, onCreated }: {
  companyId: string; commessa: OrderSurveyContext; onClose: () => void; onCreated: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  return <Dialog open onOpenChange={open => {if (!open && !busy) onClose();}}>
    <DialogContent className="flex h-[94dvh] max-h-[94dvh] w-[96vw] max-w-6xl flex-col overflow-hidden p-0 [&>button]:z-30">
      <DialogHeader className="sr-only"><DialogTitle>Nuovo sopralluogo della commessa</DialogTitle><DialogDescription>Modello, cliente già collegato, cantiere e dati del sopralluogo.</DialogDescription></DialogHeader>
      <div className="min-h-0 flex-1 overflow-y-auto"><Suspense fallback={<p role="status" className="p-6 text-sm text-muted-foreground">Apro il nuovo sopralluogo…</p>}>
        <SurveyCreateForm companyId={companyId} commessa={commessa} onCreated={onCreated} onCancel={onClose} onBusyChange={setBusy} />
      </Suspense></div>
    </DialogContent>
  </Dialog>;
}
