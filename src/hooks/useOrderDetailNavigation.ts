import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  orderDetailLocation,
  resolveOrderDetailDestination,
  resolveCantiereView,
  resolveEconomiaView,
  resolveMaterialiView,
  resolveCostiView,
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
  const activeCostiView = resolveCostiView(location.search, section);
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
      // Cambio scheda senza destinazione: la pagina NON torna in cima (07/11/2026: da
      // metà pagina ogni clic su una scheda riportava alla testata). Se la barra delle
      // schede è al suo posto non si muove niente; se sei sceso nel contenuto e la barra
      // è appiccicata in alto, la si riporta al suo posto naturale: la scheda nuova
      // comincia subito sotto, dall'inizio, senza risalire fino ai numeri della commessa.
      const vistaInterna = !changedArea && (
        (tab === "cantiere" && new URLSearchParams(location.search).has("vista_cantiere"))
        || (tab === "finanza" && new URLSearchParams(location.search).has("vista_economia"))
        || (tab === "articoli" && new URLSearchParams(location.search).has("vista_materiali"))
        || (tab === "costi" && new URLSearchParams(location.search).has("vista_costi")));
      if (!section && !vistaInterna) {
        const area = document.getElementById("order-detail-sections")?.parentElement;
        if (area && area.getBoundingClientRect().top < 0) area.scrollIntoView({ behavior: "auto", block: "start" });
        return;
      }
      // Explicit section links still jump straight to the requested content.
      const target = section
        ? document.getElementById(section)
        : !changedArea && tab === "cantiere" && new URLSearchParams(location.search).has("vista_cantiere")
        ? document.getElementById("cantiere-workspace")
        : !changedArea && tab === "finanza" && new URLSearchParams(location.search).has("vista_economia")
        ? document.getElementById("economia-workspace")
        : !changedArea && tab === "articoli" && new URLSearchParams(location.search).has("vista_materiali")
        ? document.getElementById("materiali-workspace")
        : !changedArea && tab === "costi" && new URLSearchParams(location.search).has("vista_costi")
        ? document.getElementById("costi-workspace")
        : null;
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

  return { activeTab: tab, activeCantiereView, activeEconomiaView, activeMaterialiView, activeCostiView, navigateTo };
}
