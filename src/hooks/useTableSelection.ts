import { useCallback, useMemo, useState } from "react";

/**
 * useTableSelection — stato di selezione multipla per le tabelle (Set di id).
 * Riusabile: toggle riga, select-all sui soli id VISIBILI (post-filtro),
 * indeterminate quando la selezione è parziale.
 */
export function useTableSelection() {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  /** Seleziona/deseleziona tutti gli id passati (tipicamente i filtrati). */
  const toggleAll = useCallback((ids: string[]) => {
    setSelected((prev) => {
      const allSelected = ids.length > 0 && ids.every((id) => prev.has(id));
      if (allSelected) {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      }
      return new Set([...prev, ...ids]);
    });
  }, []);

  const clear = useCallback(() => setSelected(new Set()), []);
  const isSelected = useCallback((id: string) => selected.has(id), [selected]);

  return useMemo(
    () => ({ selected, count: selected.size, toggle, toggleAll, clear, isSelected }),
    [selected, toggle, toggleAll, clear, isSelected],
  );
}
