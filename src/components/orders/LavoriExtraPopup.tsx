/**
 * «Lavori extra e varianti» accanto ad «Assegna» nelle Lavorazioni (06/11/2026, Florin): un popup al posto del
 * salto a Economia → Documenti. Dentro c'è la stessa sezione delle varianti (bozza, PDF, link di firma, stato);
 * quando il cliente accetta, il lavoro extra diventa una fase con le sue sottofasi (variante_crea_lavori).
 */
import { useState } from "react";
import { GitBranch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { OdVSection } from "./OdVSection";
import type { VariationContext } from "./VariationEditor";

export function LavoriExtraPopup({ orderId, companyId, context, onOpenDocuments, className }: {
  orderId: string;
  companyId: string;
  context?: VariationContext;
  onOpenDocuments?: () => void;
  className?: string;
}) {
  const [aperto, setAperto] = useState(false);
  return (
    <>
      <Button size="sm" variant="outline" className={className ?? "min-h-9 font-semibold"} onClick={() => setAperto(true)}>
        <GitBranch className="mr-1 h-4 w-4" />Lavori extra
      </Button>
      <Dialog open={aperto} onOpenChange={setAperto}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>Lavori extra e varianti</DialogTitle>
            <DialogDescription>
              Prepari il lavoro extra, lo mandi al cliente da firmare; quando lo accetta diventa una fase delle Lavorazioni, con le sue sottofasi, e il contratto della commessa sale dell'importo.
            </DialogDescription>
          </DialogHeader>
          {aperto && <OdVSection key={orderId} orderId={orderId} companyId={companyId} context={context} onOpenDocuments={onOpenDocuments ? () => { setAperto(false); onOpenDocuments(); } : undefined} />}
        </DialogContent>
      </Dialog>
    </>
  );
}
