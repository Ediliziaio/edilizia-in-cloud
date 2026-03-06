import { useState, useMemo, useCallback } from "react";

export interface SortConfig {
  column: string;
  direction: "asc" | "desc";
}

export function useTableSort<T>(
  items: T[],
  accessors: Record<string, (item: T) => string | number | Date | null | undefined>
) {
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);

  const toggleSort = useCallback((column: string) => {
    setSortConfig(prev => {
      if (!prev || prev.column !== column) return { column, direction: "asc" };
      if (prev.direction === "asc") return { column, direction: "desc" };
      return null; // reset
    });
  }, []);

  const sortedItems = useMemo(() => {
    if (!sortConfig) return items;
    const accessor = accessors[sortConfig.column];
    if (!accessor) return items;

    return [...items].sort((a, b) => {
      const valA = accessor(a);
      const valB = accessor(b);

      if (valA == null && valB == null) return 0;
      if (valA == null) return 1;
      if (valB == null) return -1;

      let cmp = 0;
      if (valA instanceof Date && valB instanceof Date) {
        cmp = valA.getTime() - valB.getTime();
      } else if (typeof valA === "number" && typeof valB === "number") {
        cmp = valA - valB;
      } else {
        cmp = String(valA).localeCompare(String(valB), "it", { sensitivity: "base" });
      }

      return sortConfig.direction === "asc" ? cmp : -cmp;
    });
  }, [items, sortConfig, accessors]);

  return { sortConfig, toggleSort, sortedItems };
}
