import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { X, FilterX } from "lucide-react";

interface ActiveFilter {
  key: string;
  label: string;
  value: string;
  onClear: () => void;
}

interface CompanyActiveFiltersProps {
  filters: ActiveFilter[];
  totalCount: number;
  filteredCount: number;
  onClearAll: () => void;
}

export function CompanyActiveFilters({ filters, totalCount, filteredCount, onClearAll }: CompanyActiveFiltersProps) {
  const activeFilters = filters.filter((f) => f.value !== "all" && f.value !== "");
  if (activeFilters.length === 0) return null;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs text-muted-foreground">
        {filteredCount} di {totalCount} aziende
      </span>
      <span className="text-muted-foreground/30">|</span>
      {activeFilters.map((filter) => (
        <Badge
          key={filter.key}
          variant="secondary"
          className="gap-1 pr-1 text-xs font-normal"
        >
          <span className="text-muted-foreground">{filter.label}:</span>
          <span className="font-medium">{filter.value}</span>
          <button
            onClick={filter.onClear}
            className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20 transition-colors"
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
      {activeFilters.length > 1 && (
        <Button variant="ghost" size="sm" className="h-6 text-xs gap-1 text-muted-foreground" onClick={onClearAll}>
          <FilterX className="h-3 w-3" /> Rimuovi tutti
        </Button>
      )}
    </div>
  );
}
