/**
 * AddItemDialog — Preventivatore Unificato (Sprint A §4.3 + fix gerarchia).
 *
 * Dialog a quattro stadi dietro il feature flag `PREVENTIVATORE_UNIFIED_V1`.
 * Sostituisce i 5 bottoni legacy (Wizard serramenti / Articolo / Tariffa /
 * Riga libera / Aggiungi bundle) con un unico entry point a UX gerarchico:
 *
 *   Stadio 1 · Macrocategoria  → MacrocategoryGrid (es. "PIU' LUCE")
 *   Stadio 2 · Categoria       → CategoryGrid filtrata per macrocat
 *   Stadio 3 · Prodotto        → ProductPicker
 *   Stadio 4 · Configurazione  → ProductConfigurator (dispatcher family|article)
 *
 * Auto-skip rules per non costringere doppi click inutili:
 *   • Se esiste 1 sola macrocategoria → salta lo Stadio 1 e va a Stadio 2.
 *   • Se la company NON ha proprio macrocategorie → resta sul vecchio flow
 *     (Categoria diretta come Stadio 1).
 *
 * Il contratto verso QuoteBuilder rimane uguale: callback `onAddItems(items,
 * nextSortOrder)`. Il parent NON vede il livello macrocat: è solo UX.
 */
import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CategoryGrid } from "./CategoryGrid";
import { MacrocategoryGrid } from "./MacrocategoryGrid";
import { ProductPicker } from "./ProductPicker";
import { ProductConfigurator } from "./configurators/ProductConfigurator";
import { useCatalogMacrocategories } from "@/hooks/useCatalogMacrocategories";
import type { TariffaPro } from "@/hooks/usePreventivoCosti";
import type {
  CatalogCategory,
  CatalogItem,
  CatalogMacrocategory,
  ConfiguredItem,
} from "@/types/catalogItem";

export type AddItemStage = 1 | 2 | 3 | 4;

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
  const { data: macros, isLoading: macrosLoading } = useCatalogMacrocategories();

  const [stage, setStage] = useState<AddItemStage>(1);
  const [macro, setMacro] = useState<CatalogMacrocategory | null>(null);
  const [category, setCategory] = useState<CatalogCategory | null>(null);
  const [item, setItem] = useState<CatalogItem | null>(null);

  // ── Auto-skip Stadio 1 quando c'è ≤1 macrocategoria ───────────────────
  // Se NON ci sono macrocategorie → flow legacy: parto da Stadio 2 senza filtro
  // Se c'è 1 sola macrocat → la pre-seleziono e parto da Stadio 2 con filtro
  useEffect(() => {
    if (!open || macrosLoading) return;
    if (stage !== 1) return;
    if (macro) return;
    const list = macros ?? [];
    if (list.length === 0) {
      // Nessuna macrocat: legacy mode — categorie tutte assieme
      setMacro(null);
      setStage(2);
    } else if (list.length === 1) {
      setMacro(list[0]);
      setStage(2);
    }
  }, [open, macrosLoading, macros, stage, macro]);

  function reset(): void {
    setStage(1);
    setMacro(null);
    setCategory(null);
    setItem(null);
  }

  function handleClose(): void {
    reset();
    onClose();
  }

  function handleSelectMacro(m: CatalogMacrocategory): void {
    setMacro(m);
    setCategory(null);
    setItem(null);
    setStage(2);
  }

  function handleBackFromCategoryGrid(): void {
    // Se l'utente ha solo 1 macrocategoria non possiamo "tornare indietro" a una
    // schermata vuota: in quel caso chiudiamo. Altrimenti torniamo a Stadio 1.
    const list = macros ?? [];
    if (list.length <= 1) {
      handleClose();
      return;
    }
    setMacro(null);
    setCategory(null);
    setItem(null);
    setStage(1);
  }

  function handleSelectCategory(cat: CatalogCategory): void {
    setCategory(cat);
    setItem(null);
    setStage(3);
  }

  function handleSelectItem(it: CatalogItem): void {
    setItem(it);
    setStage(4);
  }

  function handleBackFromPicker(): void {
    setCategory(null);
    setItem(null);
    setStage(2);
  }

  function handleBackFromConfigurator(): void {
    setItem(null);
    setStage(3);
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
      ? macro
        ? `Scegli una categoria di "${macro.nome}".`
        : "Scegli una categoria."
      : stage === 3
      ? "Scegli il prodotto."
      : "Configura il prodotto.";

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-4 sm:p-6 max-sm:top-auto max-sm:bottom-0 max-sm:translate-y-0 max-sm:max-h-[85vh] max-sm:rounded-t-2xl max-sm:rounded-b-none">
        <DialogHeader className="text-left">
          <DialogTitle className="text-base sm:text-lg">Aggiungi voce al preventivo</DialogTitle>
          <DialogDescription>{stageLabel}</DialogDescription>
        </DialogHeader>

        {stage === 1 && (
          <MacrocategoryGrid
            onSelectMacrocategory={handleSelectMacro}
            onAddFreeLine={handleSecondary(onAddFreeLine)}
            onAddDiscount={handleSecondary(onAddDiscount)}
            onAddSubtotal={handleSecondary(onAddSubtotal)}
          />
        )}

        {stage === 2 && (
          <CategoryGrid
            macrocategory={macro}
            onBack={macro ? handleBackFromCategoryGrid : undefined}
            onSelectCategory={handleSelectCategory}
            onAddFreeLine={handleSecondary(onAddFreeLine)}
            onAddDiscount={handleSecondary(onAddDiscount)}
            onAddSubtotal={handleSecondary(onAddSubtotal)}
          />
        )}

        {stage === 3 && category && (
          <ProductPicker
            category={category}
            onBack={handleBackFromPicker}
            onSelectItem={handleSelectItem}
          />
        )}

        {stage === 4 && item && (
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
