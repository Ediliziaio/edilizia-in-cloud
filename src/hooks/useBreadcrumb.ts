import { useLocation } from "react-router-dom";
import { useMemo } from "react";
import { macroAreas } from "@/lib/sidebarConfig";
import { Settings, Euro } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface BreadcrumbResult {
  area: string | null;
  areaIcon: LucideIcon | null;
  page: string | null;
  pageUrl: string | null;
}

const tipoLabels: Record<string, string> = {
  fattura: "Fatture",
  proforma: "Pro forma",
  nota_credito: "Note di Credito",
  ddt: "DDT",
  preventivo: "Preventivi",
  cestino: "Cestino",
};

export function useBreadcrumb(): BreadcrumbResult {
  const { pathname, search } = useLocation();

  return useMemo(() => {
    // Settings pages — special case
    if (pathname.startsWith("/azienda/impostazioni")) {
      return {
        area: "Impostazioni",
        areaIcon: Settings,
        page: null,
        pageUrl: null,
      };
    }

    // Documenti page with ?tipo= query param
    if (pathname === "/azienda/documenti") {
      const params = new URLSearchParams(search);
      const tipo = params.get("tipo");
      return {
        area: "Finanza",
        areaIcon: Euro,
        page: tipo ? tipoLabels[tipo] ?? "Fatture" : "Fatture",
        pageUrl: "/azienda/documenti",
      };
    }

    // Sort by URL length descending so more specific routes match first
    for (const area of macroAreas) {
      const sortedItems = [...area.items].sort((a, b) => b.url.length - a.url.length);
      for (const item of sortedItems) {
        if (pathname === item.url || pathname.startsWith(item.url + "/")) {
          return {
            area: area.title,
            areaIcon: area.icon,
            page: item.title,
            pageUrl: item.url,
          };
        }
      }
    }

    return { area: null, areaIcon: null, page: null, pageUrl: null };
  }, [pathname, search]);
}
