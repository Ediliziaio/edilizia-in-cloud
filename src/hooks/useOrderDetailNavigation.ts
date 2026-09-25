import { useCallback, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  orderDetailLocation,
  resolveOrderDetailDestination,
  type OrderDetailDestination,
} from "@/lib/orders/detailNavigation";

export function useOrderDetailNavigation(ready: boolean) {
  const location = useLocation();
  const navigate = useNavigate();
  const { tab, section } = resolveOrderDetailDestination(
    location.search,
    location.hash,
  );

  const navigateTo = useCallback(
    (destination: OrderDetailDestination) => {
      navigate({
        pathname: location.pathname,
        ...orderDetailLocation(location.search, destination),
      });
    },
    [location.pathname, location.search, navigate],
  );

  useEffect(() => {
    if (
      !ready ||
      (!section && !new URLSearchParams(location.search).has("tab"))
    )
      return;
    // Wait for the active panel, not an arbitrary mobile/desktop timeout.
    const frame = requestAnimationFrame(() => {
      // A tab change keeps the shared header, summary and quick actions in view.
      // Explicit section links still jump straight to the requested content.
      const target = section
        ? document.getElementById(section)
        : document.getElementById("order-detail-overview") ?? document.getElementById("order-detail-sections");
      // Legacy deep links can point inside a collapsed details element.
      let parent = target?.parentElement;
      while (parent) {
        if (parent instanceof HTMLDetailsElement) parent.open = true;
        parent = parent.parentElement;
      }
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => cancelAnimationFrame(frame);
  }, [ready, tab, section, location.key, location.search]);

  return { activeTab: tab, navigateTo };
}
