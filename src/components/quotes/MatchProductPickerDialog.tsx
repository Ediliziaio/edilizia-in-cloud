/**
 * MatchProductPickerDialog — picker globale del listino aziendale per
 * abbinare manualmente una voce di preventivo (estratta da AI o creata a mano)
 * a un articolo/famiglia del listino.
 *
 * Riusa useCatalogItems({ categoriaId: undefined }) → search globale su
 * famiglie + articoli del catalogo company. Debounce 200ms.
 *
 * Sul select chiama onSelect(item) col CatalogItem completo, così il chiamante
 * può estrarre id, source, prezzo_base_vendita, nome, ecc.
 */
import { useEffect, useState } from "react";
import { Search, Package } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/formatters";
import { useCatalogItems } from "@/hooks/useCatalogItems";
import type { CatalogItem } from "@/types/catalogItem";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Stringa iniziale da pre-compilare nel campo search (es. descrizione_grezza AI). */
  initialQuery?: string;
  /** Callback quando l'utente seleziona un item del listino. Il dialog si chiude poi. */
  onSelect: (item: CatalogItem) => void;
}

function formatPriceHint(item: CatalogItem): string {
  const mod = item.modalita_prezzo;
  if (mod === "mq") return `${formatCurrency(item.prezzo_base_vendita)}/mq`;
  if (mod === "griglia" || mod === "misura_libera")
    return `da ${formatCurrency(item.prezzo_base_vendita)}`;
  return `${formatCurrency(item.prezzo_base_vendita)}/${item.unit_of_measure || "pz"}`;
}

export function MatchProductPickerDialog({ open, onOpenChange, initialQuery = "", onSelect }: Props) {
  const [searchRaw, setSearchRaw] = useState(initialQuery);
  const [searchDebounced, setSearchDebounced] = useState(initialQuery);

  // Reset/seed query quando l'utente apre il dialog su una voce diversa
  useEffect(() => {
    if (open) {
      setSearchRaw(initialQuery);
      setSearchDebounced(initialQuery);
    }
  }, [open, initialQuery]);

  // Debounce 200ms
  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(searchRaw), 200);
    return () => clearTimeout(t);
  }, [searchRaw]);

  const { items, isLoading } = useCatalogItems({
    categoriaId: undefined, // search globale, ignora categoria
    search: searchDebounced,
  });

  const handleSelect = (item: CatalogItem) => {
    onSelect(item);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl w-[96vw] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            Abbina dal listino
          </DialogTitle>
          <DialogDescription>
            Cerca un articolo o una famiglia nel tuo listino aziendale. Cliccando lo abbini alla
            voce del preventivo: nome, prezzo unitario e id verranno aggiornati.
          </DialogDescription>
        </DialogHeader>

        <div className="sticky top-0 bg-background pt-1 pb-2 z-10">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchRaw}
              onChange={(e) => setSearchRaw(e.target.value)}
              placeholder="Cerca per nome, descrizione, SKU…"
              className="pl-9"
              autoFocus
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto pr-1">
          {isLoading ? (
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-md border border-dashed p-8 text-center">
              <Package className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {searchDebounced.trim()
                  ? "Nessun prodotto corrisponde alla ricerca."
                  : "Inizia a digitare per cercare."}
              </p>
              {!searchDebounced.trim() && items.length === 0 ? null : null}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {items.map((item) => (
                <button
                  key={`${item.source}-${item.id}`}
                  type="button"
                  onClick={() => handleSelect(item)}
                  className="group flex items-start gap-3 rounded-lg border bg-card p-3 text-left transition hover:border-primary hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded-md bg-muted">
                    {item.immagine_url ? (
                      <img
                        src={item.immagine_url}
                        alt={item.nome}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <Package className="h-6 w-6 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="truncate text-sm font-medium">{item.nome}</div>
                      <Badge
                        variant={item.source === "family" ? "default" : "secondary"}
                        className="shrink-0 text-[10px] uppercase"
                      >
                        {item.source === "family" ? "Famiglia" : "Articolo"}
                      </Badge>
                    </div>
                    {item.descrizione && (
                      <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                        {item.descrizione}
                      </div>
                    )}
                    <div className="mt-1 text-xs font-medium">{formatPriceHint(item)}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default MatchProductPickerDialog;
