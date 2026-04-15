/**
 * CruscottoDashboardPage — /azienda/cruscotto
 *
 * Landing page per le dashboard personalizzate. Il selettore dropdown è
 * fornito da DashboardSelectorBar (condiviso con le pagine standard).
 *
 * URL: /azienda/cruscotto?d=<dashboardId>
 */
import { useState, useMemo } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { Plus, Pencil, RefreshCw, LayoutGrid, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DashboardRenderer } from "@/components/dashboardBuilder/DashboardRenderer";
import { DashboardSelectorBar } from "@/components/dashboard/DashboardSelectorBar";
import {
  useDashboards,
  useResolveDashboard,
  useDashboard,
} from "@/lib/dashboardBuilder/hooks";
import type { PeriodPreset, WidgetFilter } from "@/lib/dashboardBuilder/types";
import { cn } from "@/lib/utils";

const PERIODS: Array<{ value: PeriodPreset; label: string }> = [
  { value: "this_month",   label: "Questo mese"      },
  { value: "last_month",   label: "Mese scorso"       },
  { value: "this_quarter", label: "Questo trimestre"  },
  { value: "last_quarter", label: "Trimestre scorso"  },
  { value: "ytd",          label: "Anno in corso"     },
  { value: "last_year",    label: "Anno scorso"       },
  { value: "last_7_days",  label: "Ultimi 7 giorni"   },
  { value: "last_30_days", label: "Ultimi 30 giorni"  },
  { value: "last_90_days", label: "Ultimi 90 giorni"  },
];

export default function CruscottoDashboardPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const { data: dashboards = [], isLoading: dashLoading } = useDashboards();
  const [period, setPeriod] = useState<PeriodPreset | "">("");

  // ── Dashboard attiva ──────────────────────────────────────────────────────
  const defaultDash = dashboards.find((d) => d.is_default);
  const paramId = searchParams.get("d");

  const activeDashId = useMemo(() => {
    if (paramId && dashboards.some((d) => d.id === paramId)) return paramId;
    if (defaultDash) return defaultDash.id;
    return dashboards[0]?.id ?? null;
  }, [paramId, dashboards, defaultDash]);

  const activeDash = dashboards.find((d) => d.id === activeDashId) ?? null;

  const selectDash = (id: string) => {
    setSearchParams((prev) => { prev.set("d", id); return prev; }, { replace: true });
    setPeriod("");
  };

  // ── Dati dashboard attiva ─────────────────────────────────────────────────
  const override = useMemo<WidgetFilter | null>(() => (period ? { period } : null), [period]);
  const dash = useDashboard(activeDashId);
  const resolved = useResolveDashboard(activeDashId, override);

  const layout  = dash.data?.version?.layout;
  const canEdit = dash.data?.can_edit ?? false;

  // ── Loading ───────────────────────────────────────────────────────────────
  if (dashLoading) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-3 px-4 py-2.5 border-b bg-background shrink-0">
          <div className="h-9 w-14 rounded-lg bg-muted animate-pulse" />
          <div className="h-5 w-40 rounded bg-muted animate-pulse" />
        </div>
        <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-32 rounded-xl bg-muted/40 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  // ── Azioni destra barra ───────────────────────────────────────────────────
  const barActions = activeDashId ? (
    <>
      <Select
        value={period || "none"}
        onValueChange={(v) => setPeriod(v === "none" ? "" : (v as PeriodPreset))}
      >
        <SelectTrigger className="h-8 w-[155px] text-xs">
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
        className="h-8"
        onClick={() => resolved.refetch()}
        disabled={resolved.isFetching}
      >
        <RefreshCw className={cn("h-3.5 w-3.5", resolved.isFetching && "animate-spin")} />
      </Button>

      {canEdit && (
        <Button asChild size="sm" className="h-8 gap-1.5">
          <Link to={`/azienda/dashboards/${activeDashId}/modifica`}>
            <Pencil className="h-3.5 w-3.5" />
            Modifica
          </Link>
        </Button>
      )}
    </>
  ) : undefined;

  // ── Vista ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full min-h-0">
      <DashboardSelectorBar
        title={activeDash?.name ?? "Dashboard"}
        activeDashId={activeDashId}
        onSelectCustomDash={selectDash}
        actions={barActions}
      />

      {/* Contenuto */}
      <div className="flex-1 overflow-auto p-4 md:p-6">
        {dashboards.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-6 py-24 text-center px-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
              <LayoutGrid className="h-8 w-8 text-muted-foreground/50" />
            </div>
            <div className="space-y-2">
              <h2 className="text-lg font-semibold">Nessuna dashboard</h2>
              <p className="text-sm text-muted-foreground max-w-xs">
                Crea la tua prima dashboard personalizzata per vedere i dati che contano.
              </p>
            </div>
            <Button onClick={() => navigate("/azienda/cruscotto/gestisci")} className="gap-2">
              <Plus className="h-4 w-4" />
              Aggiungi dashboard
            </Button>
          </div>
        ) : !activeDashId ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
            <LayoutGrid className="h-10 w-10 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">Seleziona una dashboard dal menu</p>
          </div>
        ) : dash.error ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 flex items-start gap-2 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            Errore nel caricamento: {(dash.error as Error).message}
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
    </div>
  );
}
