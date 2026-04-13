/**
 * DashboardTabBar — Navigazione a tab tra le 3 dashboard
 *
 * - Super admin / Admin → vede tutte e 3 le tab
 * - Staff → vede solo le tab per cui ha i permessi
 * - 1 sola tab visibile → la barra si nasconde (nulla da scegliere)
 */

import { useLocation, Link } from "react-router-dom";
import { usePermissions } from "@/hooks/usePermissions";
import { LayoutGrid, HardHat, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface DashboardDef {
  id: string;
  label: string;
  shortLabel: string;
  url: string;
  icon: React.ElementType;
  permKey: "canViewCruscotto" | "canViewDashboard" | "canViewMarketingDashboard";
}

const DASHBOARDS: DashboardDef[] = [
  {
    id: "cruscotto",
    label: "Cruscotto Aziendale",
    shortLabel: "Cruscotto",
    url: "/azienda/cruscotto/aziendale",
    icon: LayoutGrid,
    permKey: "canViewCruscotto",
  },
  {
    id: "gestione",
    label: "Dashboard Gestione",
    shortLabel: "Gestione",
    url: "/azienda",
    icon: HardHat,
    permKey: "canViewDashboard",
  },
  {
    id: "marketing",
    label: "Dashboard Marketing",
    shortLabel: "Marketing",
    url: "/azienda/marketing",
    icon: TrendingUp,
    permKey: "canViewMarketingDashboard",
  },
];

function isActiveRoute(pathname: string, dashUrl: string): boolean {
  // Exact match for /azienda (index)
  if (dashUrl === "/azienda") {
    return pathname === "/azienda" || pathname === "/azienda/";
  }
  return pathname.startsWith(dashUrl);
}

export function DashboardTabBar() {
  const permissions = usePermissions();
  const location = useLocation();

  if (permissions.isLoading) return null;

  // Filter visible dashboards based on permissions
  const visible = DASHBOARDS.filter(
    (d) => permissions.isAdmin || permissions[d.permKey]
  );

  // Se c'è solo 1 dashboard visibile, non mostrare la barra
  if (visible.length <= 1) return null;

  return (
    <div className="flex items-center gap-0.5 sm:gap-1 p-0.5 sm:p-1 rounded-lg bg-muted/50 border border-border/50 print:hidden overflow-x-auto">
      {visible.map((dash) => {
        const Icon = dash.icon;
        const isActive = isActiveRoute(location.pathname, dash.url);

        return (
          <Link
            key={dash.id}
            to={dash.url}
            className={cn(
              "flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 rounded-md text-[11px] sm:text-xs font-medium transition-all whitespace-nowrap flex-shrink-0",
              "hover:bg-background/80",
              isActive
                ? "bg-background shadow-sm text-foreground border border-border/60"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className={cn("h-3.5 w-3.5", isActive && "text-primary")} />
            <span className="hidden md:inline">{dash.label}</span>
            <span className="md:hidden">{dash.shortLabel}</span>
          </Link>
        );
      })}
    </div>
  );
}
