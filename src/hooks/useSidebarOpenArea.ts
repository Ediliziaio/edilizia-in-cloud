import { useEffect, useState } from "react";

/** La navigazione apre la propria area; i click manuali restano validi fino alla prossima route. */
export function useSidebarOpenArea(
  pathname: string,
  activeAreaId: string | null,
) {
  const [selection, setSelection] = useState(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem("sidebar_open_area");
    } catch {
      /* storage non disponibile */
    }
    return { pathname, activeAreaId, openAreaId: activeAreaId ?? stored };
  });
  const routeChanged =
    selection.pathname !== pathname || selection.activeAreaId !== activeAreaId;
  const openAreaId = routeChanged
    ? (activeAreaId ?? selection.openAreaId)
    : selection.openAreaId;
  if (routeChanged) setSelection({ pathname, activeAreaId, openAreaId });

  useEffect(() => {
    try {
      localStorage.setItem("sidebar_open_area", openAreaId ?? "");
    } catch {
      /* storage non disponibile */
    }
  }, [openAreaId]);

  const setOpenAreaId = (id: string | null) =>
    setSelection({ pathname, activeAreaId, openAreaId: id });
  return [openAreaId, setOpenAreaId] as const;
}
