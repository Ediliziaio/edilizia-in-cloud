/**
 * ListinoManutenzione — barra filtri condivisa.
 *
 * Replica il pattern UX della pagina "Manodopera e Servizi" (SettingsTariffe):
 * una Card con ricerca a sinistra, slot per i select di filtro, slot azioni
 * (es. "Nuovo …"), chip di filtro rimovibili e riga conteggio + "Azzera filtri".
 * Usata dai 3 sub-tab del listino manutenzione (Impianti / Interventi / Tariffe)
 * così che l'esperienza sia identica a quella del listino manodopera.
 */
import type { ReactNode } from "react";
import { Search, X, FilterX } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
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
    <Card>
      <CardContent className="pt-4 pb-4">
        <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
              className="pl-9"
            />
          </div>
          {filters}
          {actions && <div className="md:ml-auto shrink-0">{actions}</div>}
        </div>

        {chips.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
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
          </div>
        )}

        {totalCount > 0 && (
          <div className="mt-3 flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>
              <span className="font-medium text-foreground">{shownCount}</span>{" "}
              {shownCount === 1 ? unit[0] : unit[1]}
              {shownCount !== totalCount && ` su ${totalCount} totali`}
            </span>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onReset}>
                <FilterX className="h-3.5 w-3.5 mr-1" />Azzera filtri
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
