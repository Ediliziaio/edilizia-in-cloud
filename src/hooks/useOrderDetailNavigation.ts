import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  orderDetailLocation,
  resolveOrderDetailDestination,
  resolveCantiereView,
  resolveEconomiaView,
  resolveMaterialiView,
  type OrderDetailDestination,
} from "@/lib/orders/detailNavigation";

export function useOrderDetailNavigation(ready: boolean) {
  const location = useLocation();
  const navigate = useNavigate();
  const navigation = useRef(location.pathname + location.search + location.hash);
  useLayoutEffect(() => {
    navigation.current = location.pathname + location.search + location.hash;
  }, [location.key, location.pathname, location.search, location.hash]);
  const { tab, section } = resolveOrderDetailDestination(
    location.search,
    location.hash,
  );
  const activeCantiereView = resolveCantiereView(location.search, section);
  const activeEconomiaView = resolveEconomiaView(location.search, section);
  const activeMaterialiView = resolveMaterialiView(location.search, section);
  const previousTab = useRef(tab);

  const navigateTo = useCallback(
    (destination: OrderDetailDestination) => {
      const next = {
        pathname: location.pathname,
        ...orderDetailLocation(location.search, destination),
      };
      const href = next.pathname + next.search + next.hash;
      // Radix fires both focus and mousedown when selecting a tab. Do not
      // push the same destination twice, otherwise browser Back appears stuck.
      if (navigation.current === href) return;
      navigation.current = href;
      navigate(next);
    },
    [location.pathname, location.search, navigate],
  );

  useEffect(() => {
    const changedArea = previousTab.current !== tab;
    previousTab.current = tab;
    if (
      !ready ||
      (!section && !new URLSearchParams(location.search).has("tab"))
    )
      return;
    // Wait for the active panel, not an arbitrary mobile/desktop timeout.
    // Le viste di economia e cantiere si caricano all'apertura: una sezione che
    // sta dentro una di loro compare qualche istante dopo, quindi la si cerca
    // a ogni fotogramma per al massimo 2 secondi.
    const inizio = performance.now();
    let frame = 0;
    const cerca = () => {
      if (section && !document.getElementById(section) && performance.now() - inizio < 2000) {
        frame = requestAnimationFrame(cerca);
        return;
      }
      // A tab change keeps the shared header, summary and quick actions in view.
      // Explicit section links still jump straight to the requested content.
      const target = section
        ? document.getElementById(section)
        : !changedArea && tab === "cantiere" && new URLSearchParams(location.search).has("vista_cantiere")
        ? document.getElementById("cantiere-workspace")
        : !changedArea && tab === "finanza" && new URLSearchParams(location.search).has("vista_economia")
        ? document.getElementById("economia-workspace")
        : !changedArea && tab === "articoli" && new URLSearchParams(location.search).has("vista_materiali")
        ? document.getElementById("materiali-workspace")
        : document.getElementById("order-detail-overview") ?? document.getElementById("order-detail-sections");
      // Legacy deep links can point inside a collapsed details element.
      if (target instanceof HTMLDetailsElement) target.open = true;
      let parent = target?.parentElement;
      while (parent) {
        if (parent instanceof HTMLDetailsElement) parent.open = true;
        parent = parent.parentElement;
      }
      target?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    };
    frame = requestAnimationFrame(cerca);
    return () => cancelAnimationFrame(frame);
  }, [ready, tab, section, location.key, location.search]);

  return { activeTab: tab, activeCantiereView, activeEconomiaView, activeMaterialiView, navigateTo };
}
