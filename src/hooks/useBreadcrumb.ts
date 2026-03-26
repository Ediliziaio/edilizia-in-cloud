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

    // Flatten all items across all areas, sort globally by URL length descending
    // so more specific routes always win (e.g. /azienda/prima-nota beats /azienda)
    const allCandidates = macroAreas.flatMap((area) =>
      area.items.map((item) => ({ area, item }))
    ).sort((a, b) => b.item.url.length - a.item.url.length);

    for (const { area, item } of allCandidates) {
      if (pathname === item.url || pathname.startsWith(item.url + "/")) {
        return {
          area: area.title,
          areaIcon: area.icon,
          page: item.title,
          pageUrl: item.url,
        };
      }
    }

    return { area: null, areaIcon: null, page: null, pageUrl: null };
  }, [pathname, search]);
}
