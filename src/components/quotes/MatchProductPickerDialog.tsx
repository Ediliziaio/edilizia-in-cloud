/**
 * MatchProductPickerDialog — picker globale del listino aziendale per
 * abbinare manualmente una voce di preventivo (estratta da AI o creata a mano)
 * a un articolo/famiglia del listino.
 *
 * UX ottimizzata (sprint UX):
 *   - Sheet laterale destro (no Dialog nested → non chiude il parent)
 *   - Search testuale con debounce 200ms su tutto il listino
 *   - Filtri macrocategoria → categoria (chip cliccabili, gerarchici)
 *   - Filtro tipo: Tutto | Solo famiglie | Solo articoli
 *   - Risultati raggruppati per categoria con header sticky
 *   - Auto-suggestion iniziale: pre-compila search con descrizione voce
 *   - Empty state con call-to-action a creare articolo nel listino
 */
import { useEffect, useMemo, useState } from "react";
import { Search, Package, X, Sparkles } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatCurrency } from "@/lib/formatters";
import { useCatalogItems } from "@/hooks/useCatalogItems";
import { useCatalogCategories } from "@/hooks/useCatalogCategories";
import { useCatalogMacrocategories } from "@/hooks/useCatalogMacrocategories";
import type { CatalogItem } from "@/types/catalogItem";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Stringa iniziale da pre-compilare nel campo search (es. descrizione_grezza AI). */
  initialQuery?: string;
  /** Callback quando l'utente seleziona un item del listino. Il dialog si chiude poi. */
  onSelect: (item: CatalogItem) => void;
}

type SourceFilter = "all" | "family" | "article";

function formatPriceHint(item: CatalogItem): string {
  const mod = item.modalita_prezzo;
  if (mod === "mq") return `${formatCurrency(item.prezzo_base_vendita)}/mq`;
  if (mod === "griglia" || mod === "misura_libera")
    return `da ${formatCurrency(item.prezzo_base_vendita)}`;
  return `${formatCurrency(item.prezzo_base_vendita)}/${item.unit_of_measure || "pz"}`;
}

export function MatchProductPickerDialog({ open, onOpenChange, initialQuery = "", onSelect }: Props) {
  // ── Search ─────────────────────────────────────────────────────────────────
  const [searchRaw, setSearchRaw] = useState(initialQuery);
  const [searchDebounced, setSearchDebounced] = useState(initialQuery);

  // ── Filtri ────────────────────────────────────────────────────────────────
  const [macroId, setMacroId] = useState<string | null>(null);
  const [categoriaId, setCategoriaId] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");

  // Reset quando si apre il dialog su una voce diversa
  useEffect(() => {
    if (open) {
      setSearchRaw(initialQuery);
      setSearchDebounced(initialQuery);
      setMacroId(null);
      setCategoriaId(null);
      setSourceFilter("all");
    }
  }, [open, initialQuery]);

  // Debounce 200ms
  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(searchRaw), 200);
    return () => clearTimeout(t);
  }, [searchRaw]);

  // ── Data ──────────────────────────────────────────────────────────────────
  const { data: macros = [] } = useCatalogMacrocategories();
  const { data: allCategorie = [] } = useCatalogCategories();
  // Performance: nascondiamo i risultati finché l'utente non ha attivato
  // almeno un filtro (search o categoria). Riduce noise iniziale + carica
  // mentale quando il listino ha 500+ articoli.
  const hasFilter =
    !!searchDebounced.trim() ||
    !!categoriaId ||
    !!macroId ||
    sourceFilter !== "all";
  const { items: allItems, isLoading } = useCatalogItems({
    categoriaId: categoriaId ?? undefined,
    search: searchDebounced,
  });

  // Categorie filtrate per macrocategoria selezionata
  const visibleCategorie = useMemo(
    () => (macroId ? allCategorie.filter((c) => c.macrocategoria_id === macroId) : allCategorie),
    [allCategorie, macroId],
  );

  // Items filtrati per source + macrocategoria (extra filter client-side)
  const filteredItems = useMemo(() => {
    // Nascondi risultati se l'utente non ha ancora attivato filtri:
    // riduce noise iniziale (lista da 500+ articoli senza orientamento).
    if (!hasFilter) return [];
    let items = allItems;
    if (sourceFilter !== "all") {
      items = items.filter((i) => i.source === sourceFilter);
    }
    if (macroId && !categoriaId) {
      // Filtro per macrocategoria: tieni solo items la cui categoria sta nelle visibleCategorie
      const allowedCatIds = new Set(visibleCategorie.map((c) => c.id));
      items = items.filter((i) => i.categoria_id && allowedCatIds.has(i.categoria_id));
    }
    return items;
  }, [allItems, sourceFilter, macroId, categoriaId, visibleCategorie, hasFilter]);

  // Raggruppa risultati per categoria (per header sticky)
  const grouped = useMemo(() => {
    const map = new Map<string, { categoria_nome: string; items: CatalogItem[] }>();
    for (const item of filteredItems) {
      const catId = item.categoria_id ?? "_none";
      const catName = catId === "_none"
        ? "Senza categoria"
        : (allCategorie.find((c) => c.id === catId)?.nome ?? "Categoria");
      if (!map.has(catId)) map.set(catId, { categoria_nome: catName, items: [] });
      map.get(catId)!.items.push(item);
    }
    return [...map.values()];
  }, [filteredItems, allCategorie]);

  const handleSelect = (item: CatalogItem) => {
    onSelect(item);
    onOpenChange(false);
  };

  const clearAllFilters = () => {
    setSearchRaw("");
    setSearchDebounced("");
    setMacroId(null);
    setCategoriaId(null);
    setSourceFilter("all");
  };

  const hasActiveFilters = !!(searchDebounced.trim() || macroId || categoriaId || sourceFilter !== "all");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-3xl flex flex-col gap-0 p-0"
        onInteractOutside={(e) => e.preventDefault()}
      >
        {/* ── HEADER FISSO ─────────────────────────────────────────────── */}
        <SheetHeader className="px-6 pt-6 pb-3 border-b shrink-0">
          <SheetTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            Abbina al listino
          </SheetTitle>
          <SheetDescription>
            Trova un articolo o una famiglia del catalogo aziendale e cliccalo per abbinarlo
            alla voce.
          </SheetDescription>
        </SheetHeader>

        {/* ── SEARCH + FILTRI ─────────────────────────────────────────── */}
        <div className="px-6 pt-3 pb-2 space-y-3 border-b shrink-0 bg-muted/30">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchRaw}
              onChange={(e) => setSearchRaw(e.target.value)}
              placeholder="Cerca per nome, descrizione, SKU…"
              className="pl-9 pr-9"
              autoFocus
            />
            {searchRaw ? (
              <button
                type="button"
                onClick={() => setSearchRaw("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Cancella ricerca"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>

          {/* Macrocategorie (chip): solo se >1 disponibile */}
          {macros.length > 1 ? (
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                Macrocategoria
              </div>
              <div className="flex flex-wrap gap-1.5">
                <FilterChip
                  active={macroId === null}
                  onClick={() => {
                    setMacroId(null);
                    setCategoriaId(null);
                  }}
                  label="Tutte"
                />
                {macros.map((m) => (
                  <FilterChip
                    key={m.id}
                    active={macroId === m.id}
                    onClick={() => {
                      setMacroId(m.id);
                      setCategoriaId(null);
                    }}
                    label={m.nome}
                    badge={m.count_products > 0 ? `${m.count_products}` : undefined}
                    color={m.colore}
                  />
                ))}
              </div>
            </div>
          ) : null}

          {/* Categorie (chip): filtrate dalla macrocat selezionata */}
          {visibleCategorie.length > 0 ? (
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                Categoria
              </div>
              <div className="flex flex-wrap gap-1.5">
                <FilterChip
                  active={categoriaId === null}
                  onClick={() => setCategoriaId(null)}
                  label="Tutte"
                />
                {visibleCategorie.slice(0, 30).map((c) => (
                  <FilterChip
                    key={c.id}
                    active={categoriaId === c.id}
                    onClick={() => setCategoriaId(c.id)}
                    label={c.nome}
                    badge={c.total > 0 ? `${c.total}` : undefined}
                    color={c.colore}
                  />
                ))}
              </div>
            </div>
          ) : null}

          {/* Tipo (famiglia / articolo) */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Tipo</span>
            <div className="inline-flex rounded-md border bg-background p-0.5">
              {(["all", "family", "article"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSourceFilter(s)}
                  className={`px-2.5 py-0.5 text-[11px] rounded-sm transition ${
                    sourceFilter === s
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {s === "all" ? "Tutto" : s === "family" ? "Famiglie" : "Articoli"}
                </button>
              ))}
            </div>
            {hasActiveFilters ? (
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto h-6 text-[10px]"
                onClick={clearAllFilters}
              >
                <X className="h-3 w-3 mr-1" /> Reset filtri
              </Button>
            ) : null}
          </div>

          {/* Riepilogo risultati */}
          <div className="text-[10px] text-muted-foreground">
            {isLoading ? "Caricamento…" : `${filteredItems.length} prodott${filteredItems.length === 1 ? "o" : "i"} trovat${filteredItems.length === 1 ? "o" : "i"}`}
          </div>
        </div>

        {/* ── LISTA RISULTATI ─────────────────────────────────────────── */}
        <ScrollArea className="flex-1">
          <div className="px-6 py-3">
            {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : grouped.length === 0 ? (
              <EmptyState hasQuery={!!searchDebounced.trim()} />
            ) : (
              <div className="space-y-4">
                {grouped.map((group) => (
                  <div key={group.categoria_nome}>
                    <div className="sticky top-0 bg-background/95 backdrop-blur-sm py-1 mb-1.5 z-10 flex items-center gap-2 text-[10px] uppercase tracking-wide text-muted-foreground border-b">
                      <span className="font-semibold">{group.categoria_nome}</span>
                      <span className="opacity-60">· {group.items.length}</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {group.items.map((item) => (
                        <ProductCard key={`${item.source}-${item.id}`} item={item} onSelect={handleSelect} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────────────────────

interface FilterChipProps {
  active: boolean;
  onClick: () => void;
  label: string;
  badge?: string;
  color?: string | null;
}

function FilterChip({ active, onClick, label, badge, color }: FilterChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] border transition ${
        active
          ? "bg-primary text-primary-foreground border-primary shadow-sm"
          : "bg-background hover:bg-accent border-border text-foreground"
      }`}
      style={
        active && color
          ? { backgroundColor: color, borderColor: color, color: "white" }
          : undefined
      }
    >
      <span className="truncate max-w-[140px]">{label}</span>
      {badge ? (
        <span
          className={`text-[9px] px-1 rounded ${
            active ? "bg-white/20" : "bg-muted text-muted-foreground"
          }`}
        >
          {badge}
        </span>
      ) : null}
    </button>
  );
}

interface ProductCardProps {
  item: CatalogItem;
  onSelect: (item: CatalogItem) => void;
}

function ProductCard({ item, onSelect }: ProductCardProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      className="group flex items-start gap-3 rounded-lg border bg-card p-2.5 text-left transition hover:border-primary hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring"
    >
      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md bg-muted">
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
            className="shrink-0 text-[9px] uppercase"
          >
            {item.source === "family" ? "Famiglia" : "Articolo"}
          </Badge>
        </div>
        {item.descrizione ? (
          <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
            {item.descrizione}
          </div>
        ) : null}
        <div className="mt-1 text-xs font-medium text-foreground/80">{formatPriceHint(item)}</div>
      </div>
    </button>
  );
}

function EmptyState({ hasQuery }: { hasQuery: boolean }) {
  return (
    <div className="rounded-md border border-dashed p-8 text-center">
      <Package className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">
        {hasQuery
          ? "Nessun prodotto corrisponde ai filtri."
          : "Inizia a digitare o seleziona una categoria."}
      </p>
      {hasQuery ? (
        <a
          href="/azienda/impostazioni/listino"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          <Sparkles className="h-3 w-3" />
          Apri il listino e crea questo prodotto
        </a>
      ) : null}
    </div>
  );
}

export default MatchProductPickerDialog;
