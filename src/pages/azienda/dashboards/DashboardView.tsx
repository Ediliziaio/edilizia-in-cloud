/**
 * DashboardView — /azienda/dashboards/:id
 *
 * Visualizza una dashboard custom: carica meta + layout corrente, risolve le
 * metriche in batch via RPC `resolve_dashboard`, e renderizza i widget.
 *
 * Controlli header:
 *   • Torna alla lista
 *   • Period override (preset + date range custom)
 *   • Aggiorna (refetch resolve)
 *   • Stampa / esporta PDF (via window.print + stylesheet print:)
 *   • Menu azioni (duplica / rinomina / default / scope / elimina) — solo se canEdit
 *   • Modifica (link al builder)
 */
import { useCallback, useEffect, useMemo } from "react";
import { Link, Navigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Pencil,
  RefreshCw,
  AlertTriangle,
  Printer,
  CalendarRange,
  Filter,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import { useDashboard, useResolveDashboard } from "@/lib/dashboardBuilder/hooks";
import { DashboardRenderer } from "@/components/dashboardBuilder/DashboardRenderer";
import { DashboardCardMenu } from "@/components/dashboardBuilder/DashboardCardMenu";
import type {
  DashboardListItem,
  PeriodPreset,
  WidgetFilter,
} from "@/lib/dashboardBuilder/types";
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
  { value: "custom", label: "Intervallo personalizzato" },
];

const VALID_PERIODS = new Set<string>(PERIODS.map((p) => p.value));

export default function DashboardView() {
  const { id } = useParams<{ id: string }>();
  const { isFeatureEnabled, isLoading: flagsLoading } = useFeatureFlags();
  const [searchParams, setSearchParams] = useSearchParams();

  // ── Persisted state via URL search params ──────────────────────
  const rawPeriod = searchParams.get("period") ?? "";
  const period = (VALID_PERIODS.has(rawPeriod) ? rawPeriod : "") as
    | PeriodPreset
    | "";
  const customFrom = searchParams.get("from") ?? "";
  const customTo = searchParams.get("to") ?? "";

  const updateParam = useCallback(
    (patch: Record<string, string | null>) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          Object.entries(patch).forEach(([k, v]) => {
            if (v == null || v === "") next.delete(k);
            else next.set(k, v);
          });
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const setPeriod = useCallback(
    (v: PeriodPreset | "") => {
      // Quando il periodo cambia, svuotiamo le date custom se non è custom
      if (v === "custom") {
        updateParam({ period: v });
      } else {
        updateParam({ period: v || null, from: null, to: null });
      }
    },
    [updateParam],
  );
  const setCustomFrom = useCallback(
    (v: string) => updateParam({ from: v || null }),
    [updateParam],
  );
  const setCustomTo = useCallback(
    (v: string) => updateParam({ to: v || null }),
    [updateParam],
  );

  const override = useMemo<WidgetFilter | null>(() => {
    if (!period) return null;
    if (period === "custom") {
      if (!customFrom || !customTo) return null;
      return { period: "custom", from: customFrom, to: customTo };
    }
    return { period };
  }, [period, customFrom, customTo]);

  const dash = useDashboard(id);
  const resolved = useResolveDashboard(id, override);

  // ── Keyboard shortcuts: R refresh, P print, Esc clear filters ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // ignora se l'utente sta digitando in un input
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        resolved.refetch();
      } else if (e.key === "p" || e.key === "P") {
        e.preventDefault();
        window.print();
      } else if (e.key === "Escape" && period) {
        setPeriod("");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [resolved, period, setPeriod]);

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

  // Shim dashboard → DashboardListItem per riusare DashboardCardMenu.
  // is_owner non è noto qui, ma il menu guarda solo canEdit e scope.
  const dashForMenu: DashboardListItem | null = meta
    ? {
        id: meta.id,
        name: meta.name,
        description: meta.description,
        scope: meta.scope,
        icon: meta.icon,
        is_default: meta.is_default,
        is_owner: canEdit,
        can_edit: canEdit,
        current_version: dash.data?.version?.version ?? null,
        versions_count: dash.data?.versions_count ?? 0,
        updated_at: meta.updated_at,
        created_at: meta.created_at,
      }
    : null;

  // ── FilterBar state derivati ────────────────────────────────────
  const periodLabel = PERIODS.find((p) => p.value === period)?.label;
  const hasCustomRange = period === "custom" && customFrom && customTo;
  const hasActiveFilters = Boolean(period);
  const resetFilters = () => setPeriod("");

  return (
    <div className="p-4 md:p-6 max-w-[1600px] mx-auto space-y-4 print:p-0 print:max-w-none">
      <div className="flex items-center justify-between gap-3 flex-wrap print:hidden">
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
              <p className="text-xs text-muted-foreground truncate">
                {meta.description}
              </p>
            )}
          </div>
          {dash.data?.version && (
            <Badge variant="secondary" className="shrink-0">
              v{dash.data.version.version}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => resolved.refetch()}
            disabled={resolved.isFetching}
            title="Aggiorna dati (R)"
          >
            <RefreshCw
              className={`h-4 w-4 mr-1 ${resolved.isFetching ? "animate-spin" : ""}`}
            />
            Aggiorna
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => window.print()}
            title="Stampa o salva come PDF (P)"
          >
            <Printer className="h-4 w-4 mr-1" /> Stampa
          </Button>

          {dashForMenu && <DashboardCardMenu dashboard={dashForMenu} canEdit={canEdit} />}

          {canEdit && (
            <Button asChild size="sm">
              <Link to={`/azienda/dashboards/${id}/modifica`}>
                <Pencil className="h-4 w-4 mr-1" /> Modifica
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* ── FilterBar ──────────────────────────────────────────── */}
      <div className="rounded-xl border bg-card/40 backdrop-blur-sm px-3 py-2 flex items-center gap-2 flex-wrap print:hidden">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground shrink-0 pl-1">
          <Filter className="h-3.5 w-3.5" />
          Filtri
        </div>

        <Select
          value={period || "none"}
          onValueChange={(v) => {
            if (v === "none") {
              setPeriod("");
            } else {
              setPeriod(v as PeriodPreset);
            }
          }}
        >
          <SelectTrigger className="w-[200px] h-8 text-xs">
            <SelectValue placeholder="Periodo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Periodo widget (default)</SelectItem>
            {PERIODS.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {period === "custom" && (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 text-xs">
                <CalendarRange className="h-3.5 w-3.5 mr-1" />
                {customFrom && customTo
                  ? `${customFrom} → ${customTo}`
                  : "Seleziona date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-3 space-y-2" align="start">
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-muted-foreground">
                  Dal
                </label>
                <Input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-muted-foreground">
                  Al
                </label>
                <Input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  min={customFrom || undefined}
                  className="h-8 text-sm"
                />
              </div>
            </PopoverContent>
          </Popover>
        )}

        {/* Chip "applicato" */}
        {hasActiveFilters && (
          <div className="flex items-center gap-1.5 ml-1">
            <Badge
              variant="secondary"
              className="h-7 px-2 text-[11px] font-medium gap-1"
            >
              <span className="text-muted-foreground">Periodo:</span>
              <span>
                {period === "custom"
                  ? hasCustomRange
                    ? `${customFrom} → ${customTo}`
                    : "Personalizzato"
                  : periodLabel ?? period}
              </span>
              <button
                type="button"
                onClick={resetFilters}
                className="ml-1 -mr-1 text-muted-foreground hover:text-foreground"
                aria-label="Rimuovi filtro periodo"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          </div>
        )}

        <div className="flex-1" />

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={resetFilters}
            className="h-7 text-[11px] text-muted-foreground hover:text-foreground"
          >
            Reimposta
          </Button>
        )}
      </div>

      {/* Header ridotto visibile solo in stampa */}
      <div className="hidden print:block mb-4 pb-2 border-b">
        <h1 className="text-lg font-semibold">{meta?.name ?? "Dashboard"}</h1>
        {meta?.description && (
          <p className="text-xs text-muted-foreground">{meta.description}</p>
        )}
        <p className="text-[10px] text-muted-foreground mt-1">
          Generato il {new Date().toLocaleString("it-IT")}
          {period && " · Periodo: " + (PERIODS.find((p) => p.value === period)?.label ?? period)}
        </p>
      </div>

      {dash.error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5" />
          <span>Errore nel caricamento: {(dash.error as Error).message}</span>
        </div>
      ) : dash.isLoading || !layout ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="h-32 rounded-xl border bg-muted/40 animate-pulse"
            />
          ))}
        </div>
      ) : (
        <DashboardRenderer layout={layout} resolved={resolved.data?.widgets} />
      )}
    </div>
  );
}
