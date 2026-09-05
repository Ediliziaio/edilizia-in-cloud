/**
 * ProductPicker — Stadio 2 del Preventivatore Unificato (Sprint A §4.6).
 *
 * Mostra i prodotti della categoria selezionata come griglia di card
 * (famiglie + articoli fusi dall'hook `useCatalogItems`). Search testuale
 * con debounce 200ms, breadcrumb in alto per tornare allo Stadio 1.
 *
 * Il badge "Famiglia"/"Articolo" è puramente informativo: non blocca il
 * flusso e non cambia comportamento. Serve agli utenti esperti che vogliono
 * sapere da quale fonte viene il prodotto.
 */
import { useEffect, useState } from "react";
import { ArrowLeft, Package, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/formatters";
import { useCatalogItems } from "@/hooks/useCatalogItems";
import type { CatalogCategory, CatalogItem } from "@/types/catalogItem";

interface ProductPickerProps {
  category: CatalogCategory;
  onBack: () => void;
  onSelectItem: (item: CatalogItem) => void;
}

/** Formatta il prezzo base in base alla modalità (€ pz vs €/mq vs "da €"). */
function formatPriceHint(item: CatalogItem): string {
  const mod = item.modalita_prezzo;
  if (mod === "mq") return `${formatCurrency(item.prezzo_base_vendita)}/mq`;
  if (mod === "griglia" || mod === "misura_libera") {
    // Le famiglie a griglia hanno spesso prezzo base 0: «da 0,00 €» confonde,
    // il prezzo lo dà il configuratore in base alle misure.
    if (!item.prezzo_base_vendita || Number(item.prezzo_base_vendita) <= 0) return "prezzo a misura";
    return `da ${formatCurrency(item.prezzo_base_vendita)}`;
  }
  return `${formatCurrency(item.prezzo_base_vendita)}/${item.unit_of_measure || "pz"}`;
}

export function ProductPicker({ category, onBack, onSelectItem }: ProductPickerProps) {
  const [searchRaw, setSearchRaw] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");

  // Debounce 200ms per evitare re-filter ad ogni keystroke
  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(searchRaw), 200);
    return () => clearTimeout(t);
  }, [searchRaw]);

  const { items, isLoading } = useCatalogItems({
    categoriaId: category.id,
    search: searchDebounced,
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Categorie
        </Button>
        <span className="text-sm text-muted-foreground">›</span>
        <span className="text-sm font-medium">{category.nome}</span>
      </div>

      <div className="sticky top-0 z-10 bg-background pb-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchRaw}
            onChange={(e) => setSearchRaw(e.target.value)}
            placeholder="Cerca per nome, descrizione o SKU…"
            className="pl-9"
            autoFocus
          />
        </div>
      </div>

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
            {searchDebounced
              ? "Nessun prodotto corrisponde alla ricerca."
              : "Nessun prodotto in questa categoria."}
          </p>
          {!searchDebounced && (
            <a
              href="/azienda/impostazioni/listino"
              className="mt-2 inline-block text-sm font-medium text-primary hover:underline"
            >
              Crea il primo prodotto
            </a>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {items.map((item) => (
            <button
              key={`${item.source}-${item.id}`}
              type="button"
              onClick={() => onSelectItem(item)}
              className="group flex items-start gap-3 rounded-lg border bg-card p-3 text-left transition hover:border-primary hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <div className="h-20 w-20 shrink-0 overflow-hidden rounded-md bg-muted">
                {item.immagine_url ? (
                  <img
                    src={item.immagine_url}
                    alt={item.nome}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <Package className="h-8 w-8 text-muted-foreground" />
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
  );
}

export default ProductPicker;
