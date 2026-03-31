/**
 * CruscottoHub — Navigazione unificata tra le 3 dashboard disponibili
 *
 * Comportamento:
 * - 0 dashboard visibili → messaggio "nessun accesso"
 * - 1 dashboard visibile → redirect immediato (zero click sprecati)
 * - 2–3 dashboard visibili → griglia di card selezionabili
 */

import { Navigate, Link } from "react-router-dom";
import { usePermissions } from "@/hooks/usePermissions";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LayoutGrid, HardHat, TrendingUp, ArrowRight } from "lucide-react";

const DASHBOARDS = [
  {
    title: "Cruscotto Aziendale",
    description: "KPI strategici, cash flow, marketing e operazioni",
    url: "/azienda/cruscotto/aziendale",
    icon: LayoutGrid,
    permKey: "canViewCruscotto" as const,
  },
  {
    title: "Dashboard Gestione",
    description: "Ordini, cantieri, magazzino e scadenze operative",
    url: "/azienda",
    icon: HardHat,
    permKey: "canViewDashboard" as const,
  },
  {
    title: "Dashboard Marketing",
    description: "Pipeline, lead, opportunità e performance commerciale",
    url: "/azienda/marketing",
    icon: TrendingUp,
    permKey: "canViewMarketingDashboard" as const,
  },
];

export default function CruscottoHub() {
  const permissions = usePermissions();

  // During loading keep rendering the hub (avoids flicker/premature redirect)
  const visibleDashboards = permissions.isLoading
    ? DASHBOARDS
    : DASHBOARDS.filter((d) => permissions[d.permKey]);

  // 0 dashboard — messaggio di accesso negato
  if (!permissions.isLoading && visibleDashboards.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-center px-4">
        <LayoutGrid className="h-10 w-10 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground max-w-xs">
          Non hai accesso a nessuna dashboard. Contatta l&apos;amministratore.
        </p>
      </div>
    );
  }

  // 1 dashboard — redirect diretto, nessun hub intermedio
  if (!permissions.isLoading && visibleDashboards.length === 1) {
    return <Navigate to={visibleDashboards[0].url} replace />;
  }

  // 2–3 dashboard — hub con card
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Cruscotto</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Seleziona la dashboard che vuoi visualizzare
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {visibleDashboards.map((dash) => {
          const Icon = dash.icon;
          return (
            <Link key={dash.url} to={dash.url} className="group">
              <Card className="h-full transition-all duration-150 hover:shadow-md hover:border-primary/40 cursor-pointer group-hover:bg-primary/5">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground/40 transition-transform duration-150 group-hover:translate-x-1 group-hover:text-primary mt-1" />
                  </div>
                  <CardTitle className="text-base mt-3">{dash.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-xs leading-relaxed">
                    {dash.description}
                  </CardDescription>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
