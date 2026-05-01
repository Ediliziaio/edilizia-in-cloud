/**
 * DashboardsList — /azienda/dashboards
 *
 * Elenca tutte le dashboard custom disponibili all'utente (mie + condivise dalla company).
 * Richiede feature flag `dashboard_builder_v1` attivo.
 */
import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { Plus, LayoutDashboard, Lock, Users, Clock, Sparkles, Star } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import {
  useDashboards,
  useDashboardTemplates,
  useMetricCatalog,
} from "@/lib/dashboardBuilder/hooks";
import { NewDashboardDialog } from "@/components/dashboardBuilder/NewDashboardDialog";
import { DashboardCardMenu } from "@/components/dashboardBuilder/DashboardCardMenu";
import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";

// Prefetch del bundle del builder: appena l'utente apre la lista iniziamo a
// scaricare il chunk così quando clicca "Nuova" parte istantaneo.
function prefetchBuilder() {
  import("@/pages/azienda/dashboards/DashboardBuilder").catch(() => {});
}

export default function DashboardsList() {
  const { isFeatureEnabled, isLoading: flagsLoading } = useFeatureFlags();
  const { data, isLoading, error } = useDashboards();
  const [dialogOpen, setDialogOpen] = useState(false);

  // Warm-up: catalog + template + chunk JS del builder.
  useMetricCatalog();
  useDashboardTemplates();
  useEffect(() => {
    // Defer al prossimo idle per non competere con il rendering iniziale.
    const id = typeof window !== "undefined" && "requestIdleCallback" in window
      ? (window as unknown as { requestIdleCallback: (cb: () => void) => number })
          .requestIdleCallback(prefetchBuilder)
      : window.setTimeout(prefetchBuilder, 300);
    return () => {
      if (typeof window !== "undefined" && "cancelIdleCallback" in window) {
        (window as unknown as { cancelIdleCallback: (id: number) => void })
          .cancelIdleCallback(id as number);
      } else {
        window.clearTimeout(id as number);
      }
    };
  }, []);

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

  const openNewDialog = () => setDialogOpen(true);

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-5 shadow-sm sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-amber-400 text-white shadow-[0_4px_12px_rgba(249,115,22,0.3)]">
              <LayoutDashboard className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-semibold leading-tight tracking-tight text-slate-900 sm:text-2xl">Dashboard</h1>
              <p className="mt-0.5 text-sm text-slate-500">
                Le tue dashboard personalizzate con KPI, grafici e tabelle operative.
              </p>
            </div>
          </div>
          <Button
            onMouseEnter={prefetchBuilder}
            onFocus={prefetchBuilder}
            onClick={openNewDialog}
            className="self-start sm:self-auto"
          >
            <Plus className="h-4 w-4 mr-2" />
            Nuova dashboard
          </Button>
        </div>
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
          <CardContent className="p-10 text-center space-y-4">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Sparkles className="h-7 w-7 text-primary" />
            </div>
            <div className="space-y-1 max-w-md mx-auto">
              <p className="font-semibold text-base">Crea la tua prima dashboard</p>
              <p className="text-sm text-muted-foreground">
                Scegli un template predefinito (Vendite, Finanza, Cantieri, Executive)
                e personalizzalo, oppure parti da un canvas vuoto.
              </p>
            </div>
            <Button onClick={openNewDialog} size="lg">
              <Plus className="h-4 w-4 mr-2" /> Crea dashboard
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.map((d) => (
            <div
              key={d.id}
              className="group relative rounded-xl border bg-card hover:border-primary/60 hover:shadow-sm transition-all flex flex-col"
            >
              {/* Menu azioni — posizionato in overlay sopra la card */}
              <div className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                <DashboardCardMenu dashboard={d} canEdit={d.can_edit} />
              </div>

              <Link
                to={`/azienda/dashboards/${d.id}`}
                className="flex-1 flex flex-col gap-3 p-4"
              >
                <div className="flex items-start justify-between gap-2 pr-8">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold truncate group-hover:text-primary transition-colors flex items-center gap-1.5">
                      {d.is_default && (
                        <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400 shrink-0" />
                      )}
                      <span className="truncate">{d.name}</span>
                    </h3>
                    {d.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                        {d.description}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground flex-wrap mt-auto">
                  {d.scope === "personal" ? (
                    <span className="inline-flex items-center gap-1">
                      <Lock className="h-3 w-3" /> Personale
                    </span>
                  ) : d.scope === "company" ? (
                    <span className="inline-flex items-center gap-1">
                      <Users className="h-3 w-3" /> Condivisa
                    </span>
                  ) : (
                    <Badge variant="outline" className="text-[10px] h-4 px-1">
                      {d.scope}
                    </Badge>
                  )}
                  <span>·</span>
                  <span>v{d.current_version ?? 1}</span>
                  <span>·</span>
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatDistanceToNow(new Date(d.updated_at), {
                      addSuffix: true,
                      locale: it,
                    })}
                  </span>
                </div>
              </Link>
            </div>
          ))}
        </div>
      )}

      {/* Template picker dialog */}
      <NewDashboardDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
