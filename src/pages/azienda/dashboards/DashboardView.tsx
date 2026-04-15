/**
 * DashboardView — /azienda/dashboards/:id
 *
 * Visualizza una dashboard custom: carica meta + layout corrente, risolve le
 * metriche in batch via RPC `resolve_dashboard`, e renderizza i widget.
 */
import { useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { ArrowLeft, Pencil, RefreshCw, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import { useDashboard, useResolveDashboard } from "@/lib/dashboardBuilder/hooks";
import { DashboardRenderer } from "@/components/dashboardBuilder/DashboardRenderer";
import type { PeriodPreset, WidgetFilter } from "@/lib/dashboardBuilder/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const PERIODS: Array<{ value: PeriodPreset; label: string }> = [
  { value: "this_month", label: "Questo mese" },
  { value: "last_month", label: "Mese scorso" },
  { value: "this_quarter", label: "Questo trimestre" },
  { value: "last_quarter", label: "Trimestre scorso" },
  { value: "ytd", label: "Anno in corso" },
  { value: "last_year", label: "Anno scorso" },
  { value: "last_7_days", label: "Ultimi 7 giorni" },
  { value: "last_30_days", label: "Ultimi 30 giorni" },
  { value: "last_90_days", label: "Ultimi 90 giorni" },
];

export default function DashboardView() {
  const { id } = useParams<{ id: string }>();
  const { isFeatureEnabled, isLoading: flagsLoading } = useFeatureFlags();
  const [period, setPeriod] = useState<PeriodPreset | "">("");

  const override = useMemo<WidgetFilter | null>(
    () => (period ? { period } : null),
    [period],
  );

  const dash = useDashboard(id);
  const resolved = useResolveDashboard(id, override);

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

  if (!id) return <Navigate to="/azienda/dashboards" replace />;

  const meta = dash.data?.dashboard;
  const layout = dash.data?.version?.layout;
  const canEdit = dash.data?.can_edit ?? false;

  return (
    <div className="p-4 md:p-6 max-w-[1600px] mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <Button asChild variant="ghost" size="sm">
            <Link to="/azienda/dashboards">
              <ArrowLeft className="h-4 w-4 mr-1" /> Dashboard
            </Link>
          </Button>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold truncate">
              {dash.isLoading ? "Caricamento…" : meta?.name ?? "Dashboard"}
            </h1>
            {meta?.description && (
              <p className="text-xs text-muted-foreground truncate">{meta.description}</p>
            )}
          </div>
          {dash.data?.version && (
            <Badge variant="secondary" className="shrink-0">
              v{dash.data.version.version}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Select value={period || "none"} onValueChange={(v) => setPeriod(v === "none" ? "" : (v as PeriodPreset))}>
            <SelectTrigger className="w-[180px] h-9">
              <SelectValue placeholder="Periodo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Periodo widget</SelectItem>
              {PERIODS.map((p) => (
                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => resolved.refetch()}
            disabled={resolved.isFetching}
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${resolved.isFetching ? "animate-spin" : ""}`} />
            Aggiorna
          </Button>
          {canEdit && (
            <Button asChild size="sm">
              <Link to={`/azienda/dashboards/${id}/modifica`}>
                <Pencil className="h-4 w-4 mr-1" /> Modifica
              </Link>
            </Button>
          )}
        </div>
      </div>

      {dash.error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5" />
          <span>Errore nel caricamento: {(dash.error as Error).message}</span>
        </div>
      ) : dash.isLoading || !layout ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-32 rounded-xl border bg-muted/40 animate-pulse" />
          ))}
        </div>
      ) : (
        <DashboardRenderer layout={layout} resolved={resolved.data?.widgets} />
      )}
    </div>
  );
}
