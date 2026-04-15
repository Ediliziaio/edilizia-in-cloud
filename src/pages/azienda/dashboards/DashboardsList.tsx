/**
 * DashboardsList — /azienda/dashboards
 *
 * Elenca tutte le dashboard custom disponibili all'utente (mie + condivise dalla company).
 * Richiede feature flag `dashboard_builder_v1` attivo.
 */
import { Link, Navigate } from "react-router-dom";
import { Plus, LayoutDashboard, Lock, Users, Clock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import { useDashboards } from "@/lib/dashboardBuilder/hooks";
import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";

export default function DashboardsList() {
  const { isFeatureEnabled, isLoading: flagsLoading } = useFeatureFlags();
  const { data, isLoading, error } = useDashboards();

  if (flagsLoading) {
    return (
      <div className="p-6">
        <div className="h-7 w-48 bg-muted rounded animate-pulse" />
      </div>
    );
  }

  if (!isFeatureEnabled("dashboard_builder_v1")) {
    return <Navigate to="/azienda" replace />;
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <LayoutDashboard className="h-6 w-6 text-primary" />
            Dashboard
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Le tue dashboard personalizzate con KPI, grafici e tabelle.
          </p>
        </div>
        <Button asChild>
          <Link to="/azienda/dashboards/nuova">
            <Plus className="h-4 w-4 mr-2" />
            Nuova dashboard
          </Link>
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 rounded-xl border bg-muted/40 animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <Card>
          <CardContent className="p-6 text-sm text-destructive">
            Errore nel caricamento: {String((error as Error).message ?? error)}
          </CardContent>
        </Card>
      ) : !data || data.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center space-y-3">
            <LayoutDashboard className="h-10 w-10 mx-auto text-muted-foreground" />
            <div>
              <p className="font-medium">Nessuna dashboard</p>
              <p className="text-sm text-muted-foreground">
                Crea la tua prima dashboard per iniziare a monitorare i KPI.
              </p>
            </div>
            <Button asChild>
              <Link to="/azienda/dashboards/nuova">
                <Plus className="h-4 w-4 mr-2" /> Crea dashboard
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.map((d) => (
            <Link
              key={d.id}
              to={`/azienda/dashboards/${d.id}`}
              className="group rounded-xl border bg-card hover:border-primary/60 hover:shadow-sm transition-all p-4 flex flex-col gap-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold truncate group-hover:text-primary transition-colors">
                    {d.name}
                  </h3>
                  {d.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                      {d.description}
                    </p>
                  )}
                </div>
                {d.is_default && <Badge variant="secondary" className="shrink-0">Default</Badge>}
              </div>
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground flex-wrap mt-auto">
                {d.scope === "personal" ? (
                  <span className="inline-flex items-center gap-1"><Lock className="h-3 w-3" /> Personale</span>
                ) : (
                  <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" /> Condivisa</span>
                )}
                <span>·</span>
                <span>v{d.current_version ?? 1}</span>
                <span>·</span>
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatDistanceToNow(new Date(d.updated_at), { addSuffix: true, locale: it })}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
