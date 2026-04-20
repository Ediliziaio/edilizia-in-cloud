/**
 * AddItemDialog — entry point unificato del Preventivatore Unificato (Sprint A).
 *
 * Dialog a tre stadi:
 *   Stadio 1 = Macrocategoria  (CategoryGrid)
 *   Stadio 2 = Prodotto        (ProductPicker)
 *   Stadio 3 = Configurazione  (ProductConfigurator → Family/Article)
 *
 * Al Step 1 questo file è uno STUB: espone l'API che QuoteBuilder userà,
 * ma renderizza solo un placeholder "Coming soon". La UX attuale resta
 * intatta dietro il feature flag `PREVENTIVATORE_UNIFIED_V1` spento.
 * Gli stadi reali arrivano negli Step 5-7 del masterprompt.
 */
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { TariffaPro } from "@/hooks/usePreventivoCosti";
import type { ConfiguredItem } from "@/types/catalogItem";

export type AddItemStage = 1 | 2 | 3;

export interface AddItemDialogProps {
  open: boolean;
  onClose: () => void;
  /** Tariffe (posa/trasporto/…) già caricate dal QuoteBuilder. */
  tariffe: TariffaPro[];
  /** sort_order di partenza per i nuovi item (= items.length nel builder). */
  currentSortOrder: number;
  /** Callback quando l'utente conferma l'aggiunta di uno o più item. */
  onAddItems: (items: ConfiguredItem[], nextSortOrder: number) => void;
}

export function AddItemDialog({
  open,
  onClose,
}: AddItemDialogProps) {
  const [stage] = useState<AddItemStage>(1);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Aggiungi voce al preventivo</DialogTitle>
          <DialogDescription>
            {stage === 1 && "Scegli una macrocategoria per iniziare."}
            {stage === 2 && "Scegli il prodotto."}
            {stage === 3 && "Configura il prodotto."}
          </DialogDescription>
        </DialogHeader>
        {/*
          STEP 1 (Sprint A): stub — gli stadi reali sono negli Step 5-7.
          Il dialog viene montato solo quando il flag è ON (vedi QuoteBuilder).
        */}
        <div className="py-8 text-center text-sm text-muted-foreground">
          Preventivatore unificato — in costruzione (Step {stage} di 3).
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default AddItemDialog;
