import {X} from "lucide-react";
import {Button} from "@/components/ui/button";

export interface OrderFilterChip {key: string; label: string; remove: () => void}
export function OrdersActiveFilters({filters, onReset}: {filters: OrderFilterChip[]; onReset: () => void}) {
  if (!filters.length) return null;
  return <div aria-label="Filtri attivi" className="orders-active-filters rounded-lg bg-slate-50 p-2">
    <span className="text-xs text-slate-600">Filtri attivi:</span>
    {filters.map(filter => <Button key={filter.key} type="button" variant="outline" size="sm" className="h-auto min-h-8 bg-white"
      onClick={filter.remove} aria-label={`Rimuovi filtro ${filter.label}`}>
      {filter.label} <X className="ml-1 h-3 w-3" aria-hidden="true" />
    </Button>)}
    <Button type="button" variant="ghost" size="sm" onClick={onReset}>Azzera filtri</Button>
  </div>;
}
