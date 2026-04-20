/**
 * AddItemDialog — Preventivatore Unificato (Sprint A §4.3).
 *
 * Dialog a tre stadi dietro il feature flag `PREVENTIVATORE_UNIFIED_V1`.
 * Sostituisce i 5 bottoni legacy (Wizard serramenti / Articolo / Tariffa /
 * Riga libera / Aggiungi bundle) con un unico entry point a UX lineare:
 *
 *   Stadio 1 · Macrocategoria → CategoryGrid
 *   Stadio 2 · Prodotto       → ProductPicker
 *   Stadio 3 · Configurazione → ProductConfigurator (dispatcher family|article)
 *
 * Il contratto verso QuoteBuilder rimane uguale a prima: callback
 * `onAddItems(items, nextSortOrder)` che il builder usa per appendere le
 * righe al preventivo. Il parent NON vede né il concetto di "famiglia vs
 * articolo" né quello di "posa linked": entrambi sono risolti qui dentro
 * tramite `ConfiguredItem.parent_temp_id` (persistito come `parent_item_id`
 * al SAVE — v. Step 9 masterprompt).
 *
 * Le azioni "Riga libera / Sconto / Subtotale" sono esposte allo Stadio 1
 * tramite i secondary buttons di CategoryGrid, che delegano ai callback
 * opzionali del dialog. Se il QuoteBuilder non li fornisce, non vengono
 * mostrati.
 */
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CategoryGrid } from "./CategoryGrid";
import { ProductPicker } from "./ProductPicker";
import { ProductConfigurator } from "./configurators/ProductConfigurator";
import type { TariffaPro } from "@/hooks/usePreventivoCosti";
import type {
  CatalogCategory,
  CatalogItem,
  ConfiguredItem,
} from "@/types/catalogItem";

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
  /** Secondary actions Stadio 1 — se omesse, il bottone non viene mostrato. */
  onAddFreeLine?: () => void;
  onAddDiscount?: () => void;
  onAddSubtotal?: () => void;
}

export function AddItemDialog({
  open,
  onClose,
  tariffe,
  currentSortOrder,
  onAddItems,
  onAddFreeLine,
  onAddDiscount,
  onAddSubtotal,
}: AddItemDialogProps) {
  const [stage, setStage] = useState<AddItemStage>(1);
  const [category, setCategory] = useState<CatalogCategory | null>(null);
  const [item, setItem] = useState<CatalogItem | null>(null);

  function reset(): void {
    setStage(1);
    setCategory(null);
    setItem(null);
  }

  function handleClose(): void {
    reset();
    onClose();
  }

  function handleSelectCategory(cat: CatalogCategory): void {
    setCategory(cat);
    setItem(null);
    setStage(2);
  }

  function handleSelectItem(it: CatalogItem): void {
    setItem(it);
    setStage(3);
  }

  function handleBackFromPicker(): void {
    setCategory(null);
    setItem(null);
    setStage(1);
  }

  function handleBackFromConfigurator(): void {
    setItem(null);
    setStage(2);
  }

  function handleAddItems(items: ConfiguredItem[], nextSortOrder: number): void {
    onAddItems(items, nextSortOrder);
    handleClose();
  }

  /** Wrappa le azioni meta Stadio 1 per chiudere il dialog dopo il click. */
  function handleSecondary(action: (() => void) | undefined): (() => void) | undefined {
    if (!action) return undefined;
    return () => {
      action();
      handleClose();
    };
  }

  const stageLabel =
    stage === 1
      ? "Scegli una macrocategoria per iniziare."
      : stage === 2
      ? "Scegli il prodotto."
      : "Configura il prodotto.";

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Aggiungi voce al preventivo</DialogTitle>
          <DialogDescription>{stageLabel}</DialogDescription>
        </DialogHeader>

        {stage === 1 && (
          <CategoryGrid
            onSelectCategory={handleSelectCategory}
            onAddFreeLine={handleSecondary(onAddFreeLine)}
            onAddDiscount={handleSecondary(onAddDiscount)}
            onAddSubtotal={handleSecondary(onAddSubtotal)}
          />
        )}

        {stage === 2 && category && (
          <ProductPicker
            category={category}
            onBack={handleBackFromPicker}
            onSelectItem={handleSelectItem}
          />
        )}

        {stage === 3 && item && (
          <ProductConfigurator
            item={item}
            tariffe={tariffe}
            currentSortOrder={currentSortOrder}
            onBack={handleBackFromConfigurator}
            onAddItems={handleAddItems}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

export default AddItemDialog;
