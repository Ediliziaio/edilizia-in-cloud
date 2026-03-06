import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { TableHead } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { SortConfig } from "@/hooks/useTableSort";

interface SortableTableHeadProps {
  column: string;
  label: string;
  sortConfig: SortConfig | null;
  onSort: (column: string) => void;
  className?: string;
}

export function SortableTableHead({ column, label, sortConfig, onSort, className }: SortableTableHeadProps) {
  const isActive = sortConfig?.column === column;
  const Icon = isActive
    ? sortConfig.direction === "asc" ? ArrowUp : ArrowDown
    : ArrowUpDown;

  const justifyClass = className?.includes("text-right")
    ? "justify-end"
    : className?.includes("text-center")
    ? "justify-center"
    : "justify-start";

  return (
    <TableHead
      className={cn("cursor-pointer select-none hover:bg-muted/50 transition-colors", className)}
      onClick={() => onSort(column)}
    >
      <div className={cn("flex items-center gap-1", justifyClass)}>
        <span>{label}</span>
        <Icon className={cn("h-3.5 w-3.5 shrink-0", isActive ? "text-foreground" : "text-muted-foreground/50")} />
      </div>
    </TableHead>
  );
}
