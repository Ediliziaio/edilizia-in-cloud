import { useState } from "react";
import { Check, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ProductPicker } from "./ProductPicker";
import { ProductConfigurator } from "./configurators/ProductConfigurator";
import type { TariffaPro } from "@/hooks/usePreventivoCosti";
import type { CatalogItem, ConfiguredItem } from "@/types/catalogItem";

export interface AddItemDialogProps {
  open: boolean;
  onClose: () => void;
  tariffe: TariffaPro[];
  currentSortOrder: number;
  onAddItems: (items: ConfiguredItem[], nextSortOrder: number) => void;
  onAddFreeLine?: () => void;
  onAddDiscount?: () => void;
  onAddSubtotal?: () => void;
}

/** Il catalogo rimane montato durante la configurazione per conservare ricerca e filtro. */
export function AddItemDialog({ open, onClose, tariffe, currentSortOrder, onAddItems, onAddFreeLine, onAddDiscount, onAddSubtotal }: AddItemDialogProps) {
  const [item, setItem] = useState<CatalogItem | null>(null);
  const [keepAdding, setKeepAdding] = useState(true);
  const [addedCount, setAddedCount] = useState(0);
  const [lastAdded, setLastAdded] = useState("");

  function handleClose() {
    setItem(null);
    setAddedCount(0);
    setLastAdded("");
    onClose();
  }

  function handleAddItems(configured: ConfiguredItem[], nextSortOrder: number) {
    onAddItems(configured, nextSortOrder);
    if (!keepAdding) {
      handleClose();
      return;
    }
    setLastAdded(item?.nome ?? "Prodotto");
    setAddedCount((count) => count + 1);
    setItem(null);
  }

  return (
    <Dialog open={open} onOpenChange={(value) => { if (!value) handleClose(); }}>
      {/* Telefono: nel catalogo il foglio ha un'altezza fissa (la lista non salta
          mentre si scrive); nella configurazione è alto quanto serve. */}
      <DialogContent className={cn("max-w-3xl max-h-[90vh] overflow-y-auto p-4 sm:p-6 max-sm:top-auto max-sm:bottom-0 max-sm:translate-y-0 max-sm:max-h-[85vh] max-sm:rounded-t-2xl max-sm:rounded-b-none", !item && "max-sm:h-[88dvh] max-sm:max-h-[88dvh] max-sm:content-start")}>
        {/* min-w-0: un nome di prodotto lungo (titolo su una riga) allargava la griglia del foglio oltre lo schermo. */}
        <DialogHeader className="text-left max-sm:min-w-0">
          {/* Telefono: in configurazione il titolo è il nome del prodotto (sotto non si ripete). */}
          <DialogTitle className="max-sm:truncate max-sm:pr-8">{item ? <><span className="max-sm:hidden">Configura il prodotto</span><span className="sm:hidden">{item.nome}</span></> : "Prodotti e lavorazioni"}</DialogTitle>
          <DialogDescription className="max-sm:sr-only">{item ? "Imposta quantità e varianti, verifica il prezzo e la posa." : "Cerca in tutto il catalogo oppure filtra per categoria. Aggiungi più prodotti senza uscire."}</DialogDescription>
        </DialogHeader>
        {lastAdded && <p role="status" className="flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800 max-sm:px-3 max-sm:py-2 max-sm:text-xs"><Check className="h-4 w-4 shrink-0" />{lastAdded} aggiunto · {addedCount} {addedCount === 1 ? "prodotto inserito" : "prodotti inseriti"}</p>}
        {open && <div hidden={!!item}><ProductPicker onSelectItem={setItem} /></div>}
        {item && (
          <>
            <ProductConfigurator key={`${item.source}-${item.id}`} item={item} tariffe={tariffe} currentSortOrder={currentSortOrder} onBack={() => setItem(null)} onAddItems={handleAddItems} confirmLabel={keepAdding ? "Aggiungi e continua" : "Aggiungi e chiudi"} />
            <label className="flex items-center gap-2 text-sm text-muted-foreground max-sm:text-xs">
              <input type="checkbox" checked={keepAdding} onChange={(e) => setKeepAdding(e.target.checked)} className="accent-orange-500" />
              Continua ad aggiungere prodotti
            </label>
          </>
        )}
        {/* Telefono: riga libera, sconto e subtotale stanno già nel preventivo; «Torna
            al preventivo» è la X. Resta «Fatto» dopo aver aggiunto qualcosa. */}
        {!item && <div className={cn("flex flex-wrap items-center gap-2 border-t pt-3 max-sm:sticky max-sm:bottom-0 max-sm:-mx-4 max-sm:bg-background max-sm:px-4 max-sm:pb-1", !addedCount && "max-sm:hidden")}>
          {onAddFreeLine && <Button variant="outline" size="sm" className="max-sm:hidden" onClick={() => { onAddFreeLine(); handleClose(); }}><Plus className="mr-1 h-4 w-4" />Riga libera</Button>}
          {onAddDiscount && <Button variant="ghost" size="sm" className="max-sm:hidden" onClick={() => { onAddDiscount(); handleClose(); }}>Sconto</Button>}
          {onAddSubtotal && <Button variant="ghost" size="sm" className="max-sm:hidden" onClick={() => { onAddSubtotal(); handleClose(); }}>Subtotale</Button>}
          <Button className="ml-auto max-sm:w-full" onClick={handleClose}>{addedCount ? "Fatto, torna al preventivo" : "Torna al preventivo"}</Button>
        </div>}
      </DialogContent>
    </Dialog>
  );
}

export default AddItemDialog;
