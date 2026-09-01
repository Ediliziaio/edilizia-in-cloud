/**
 * ListinoManutenzione — barra filtri condivisa.
 *
 * Replica il pattern UX della pagina "Manodopera e Servizi" (SettingsTariffe),
 * redesign incluso: niente Card attorno ai filtri (solo ~40px in più prima
 * della tabella), controlli h-9 su una riga, e chip + conteggio + "Azzera"
 * fusi in un'unica riga che compare SOLO a filtri attivi (i totali stanno già
 * nei badge dei sub-tab). Usata dai 3 sub-tab (Impianti / Interventi / Tariffe)
 * così che l'esperienza resti identica a quella del listino manodopera.
 */
import type { ReactNode } from "react";
import { Search, X, FilterX } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export interface FilterChip {
  key: string;
  label: string;
  onRemove: () => void;
}

interface Props {
  search: string;
  onSearchChange: (v: string) => void;
  searchPlaceholder?: string;
  /** Select di filtro (renderizzati dopo la ricerca). */
  filters?: ReactNode;
  /** Azione primaria, es. il pulsante "Nuovo …" (allineata a destra). */
  actions?: ReactNode;
  chips: FilterChip[];
  shownCount: number;
  totalCount: number;
  /** [singolare, plurale] per l'etichetta del conteggio. */
  unit?: [string, string];
  hasActiveFilters: boolean;
  onReset: () => void;
}

export function ListinoFilterBar({
  search,
  onSearchChange,
  searchPlaceholder = "Cerca…",
  filters,
  actions,
  chips,
  shownCount,
  totalCount,
  unit = ["voce", "voci"],
  hasActiveFilters,
  onReset,
}: Props) {
  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="h-9 pl-9"
          />
        </div>
        {filters}
        {actions && <div className="md:ml-auto shrink-0">{actions}</div>}
      </div>

      {hasActiveFilters && totalCount > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          {chips.map((c) => (
            <Badge
              key={c.key}
              variant="secondary"
              className="gap-1 py-0.5 pl-2 pr-1 font-normal"
            >
              <span className="max-w-[220px] truncate">{c.label}</span>
              <button
                type="button"
                onClick={c.onRemove}
                aria-label={`Rimuovi filtro: ${c.label}`}
                className="ml-0.5 rounded-sm p-0.5 hover:bg-muted-foreground/20"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          <span className="ml-1">
            <span className="font-medium text-foreground">{shownCount}</span>{" "}
            {shownCount === 1 ? unit[0] : unit[1]}
            {shownCount !== totalCount && ` su ${totalCount} totali`}
          </span>
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={onReset}>
            <FilterX className="h-3.5 w-3.5 mr-1" />Azzera filtri
          </Button>
        </div>
      )}
    </div>
  );
}
