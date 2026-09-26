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
import { ArrowLeft, ChevronRight, Package, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { useCatalogItems } from "@/hooks/useCatalogItems";
import { useCatalogCategories } from "@/hooks/useCatalogCategories";
import { useIsMobile } from "@/hooks/use-mobile";
import type { CatalogCategory, CatalogItem } from "@/types/catalogItem";

interface ProductPickerProps {
  category?: CatalogCategory | null;
  onBack?: () => void;
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
  const [categoryFilter, setCategoryFilter] = useState("");
  const { data: categories = [] } = useCatalogCategories();
  // Telefono: niente tastiera aperta da sola, copriva metà del catalogo.
  const isMobile = useIsMobile();

  // Debounce 200ms per evitare re-filter ad ogni keystroke
  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(searchRaw), 200);
    return () => clearTimeout(t);
  }, [searchRaw]);

  const { items, isLoading, error } = useCatalogItems({
    categoriaId: category?.id ?? (categoryFilter || null),
    search: searchDebounced,
  });

  return (
    <div className="space-y-3">
      {onBack && <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Categorie
        </Button>
        <span className="text-sm text-muted-foreground">›</span>
        <span className="text-sm font-medium">{category?.nome ?? "Tutti i prodotti"}</span>
      </div>}

      <div className="sticky top-0 z-10 bg-background pb-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchRaw}
            onChange={(e) => setSearchRaw(e.target.value)}
            placeholder="Cerca prodotto, codice o marca…"
            aria-label="Cerca nel catalogo prodotti"
            className="pl-9"
            autoFocus={!isMobile}
          />
        </div>
        {/* Telefono: le categorie sono pillole su una riga che scorre; la
            tendina chiedeva due tocchi e nascondeva le scelte. */}
        {!category && categories.length > 0 && (
          <div className="-mx-4 mt-2 flex gap-1.5 overflow-x-auto px-4 scrollbar-none sm:hidden" aria-label="Categorie">
            {[{ id: "", nome: "Tutte" }, ...categories].map((cat) => {
              const attiva = categoryFilter === cat.id;
              return (
                <button
                  key={cat.id || "tutte"}
                  type="button"
                  onClick={() => setCategoryFilter(cat.id)}
                  aria-pressed={attiva}
                  className={cn(
                    "tap-compact h-8 shrink-0 rounded-full border px-3 text-xs font-medium transition-colors",
                    attiva ? "border-slate-900 bg-slate-900 text-white" : "border-border bg-background text-slate-700",
                  )}
                >
                  {cat.nome}
                </button>
              );
            })}
          </div>
        )}
        {!category && (
          <div className="mt-3 flex items-center gap-3 max-sm:hidden">
            <select aria-label="Filtra per categoria" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="h-9 min-w-0 flex-1 rounded-md border bg-background px-3 text-sm">
              <option value="">Tutte le categorie</option>
              {categories.map((cat) => <option key={cat.id} value={cat.id}>{cat.nome}</option>)}
            </select>
            <span className="shrink-0 text-xs text-muted-foreground" aria-live="polite">{isLoading ? "Caricamento…" : `${items.length} prodotti`}</span>
          </div>
        )}
      </div>

      {error ? (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">Il catalogo non è disponibile. Chiudi e riprova tra poco; puoi comunque inserire una riga libera.</p>
      ) : isLoading ? (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full max-sm:h-12" />
          ))}
        </div>
      ) : items.length === 0 ? (
        // Telefono: una riga di testo, niente icona né link alle impostazioni.
        <div className="rounded-md border border-dashed p-8 text-center max-sm:border-0 max-sm:p-4">
          <Package className="mx-auto mb-3 h-10 w-10 text-muted-foreground max-sm:hidden" />
          <p className="text-sm text-muted-foreground">
            {searchDebounced
              ? "Nessun prodotto corrisponde alla ricerca."
              : "Nessun prodotto in questa categoria."}
          </p>
          {!searchDebounced && (
            <a
              href="/azienda/impostazioni/listino"
              className="mt-2 inline-block text-sm font-medium text-primary hover:underline max-sm:hidden"
            >
              Crea il primo prodotto
            </a>
          )}
        </div>
      ) : (
        // Telefono: righe (foto piccola, nome, marca e prezzo su una riga);
        // le schede con foto grande e descrizione ne mostravano quattro.
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 max-sm:gap-0 max-sm:divide-y max-sm:divide-border max-sm:overflow-hidden max-sm:rounded-lg max-sm:border">
          {items.map((item) => (
            <button
              key={`${item.source}-${item.id}`}
              type="button"
              onClick={() => onSelectItem(item)}
              className="group flex items-start gap-3 rounded-lg border bg-card p-3 text-left transition hover:border-primary hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring tap-compact max-sm:items-center max-sm:gap-2.5 max-sm:rounded-none max-sm:border-0 max-sm:px-3 max-sm:py-2"
            >
              <div className="h-20 w-20 shrink-0 overflow-hidden rounded-md bg-muted max-sm:h-10 max-sm:w-10">
                {item.immagine_url ? (
                  <img
                    src={item.immagine_url}
                    alt={item.nome}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <Package className="h-8 w-8 text-muted-foreground max-sm:h-4 max-sm:w-4" />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="line-clamp-2 text-sm font-medium max-sm:line-clamp-1 max-sm:text-[13px]">{item.nome}</div>
                  <Badge
                    variant={item.source === "family" ? "default" : "secondary"}
                    className="shrink-0 text-[10px] uppercase max-sm:hidden"
                  >
                    {item.source === "family" ? "Configurabile" : "Prodotto"}
                  </Badge>
                </div>
                {item.source === "article" && (item.marca || item.sku) && <p className="mt-1 text-xs text-muted-foreground max-sm:hidden">{[item.marca, item.sku].filter(Boolean).join(" · ")}</p>}
                {item.descrizione && (
                  <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground max-sm:hidden">
                    {item.descrizione}
                  </div>
                )}
                <div className="mt-1 text-xs font-medium max-sm:hidden">{formatPriceHint(item)}</div>
                <div className="truncate text-[11px] text-muted-foreground sm:hidden">
                  {[item.source === "article" ? item.marca : null, formatPriceHint(item)].filter(Boolean).join(" · ")}
                </div>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground sm:hidden" aria-hidden />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default ProductPicker;
