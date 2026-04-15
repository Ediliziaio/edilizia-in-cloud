/**
 * DashboardBuilder — /azienda/dashboards/nuova | /azienda/dashboards/:id/modifica
 *
 * Builder visuale: canvas drag&drop (react-grid-layout) + pannello destro contestuale.
 * Pannello destro: palette widget quando nessun widget selezionato, config quando selezionato.
 * Salva tramite RPC save_dashboard.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Save,
  Loader2,
  AlertTriangle,
  LayoutGrid,
  ChevronDown,
  Settings2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import {
  useDashboard,
  useMetricCatalog,
  useResolveDashboard,
  useSaveDashboard,
} from "@/lib/dashboardBuilder/hooks";
import type {
  DashboardLayout,
  DashboardWidget,
  WidgetType,
} from "@/lib/dashboardBuilder/types";
import { WidgetPalette, type PaletteItem } from "@/components/dashboardBuilder/builder/WidgetPalette";
import { ConfigPanel } from "@/components/dashboardBuilder/builder/ConfigPanel";
import { BuilderGrid } from "@/components/dashboardBuilder/builder/BuilderGrid";
import { toast } from "@/hooks/use-toast";

function emptyLayout(): DashboardLayout {
  return { widgets: [], globalFilters: { period: "ytd" } };
}

function nextId(prefix: WidgetType) {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}`;
}

function findFreeSlot(widgets: DashboardWidget[]): { x: number; y: number } {
  const maxY = widgets.reduce((m, wd) => Math.max(m, wd.y + wd.h), 0);
  return { x: 0, y: maxY };
}

export default function DashboardBuilder() {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id && id !== "nuova";
  const navigate = useNavigate();
  const { isFeatureEnabled, isLoading: flagsLoading } = useFeatureFlags();

  const dash = useDashboard(isEdit ? id : undefined);
  const catalog = useMetricCatalog();
  const save = useSaveDashboard();

  const [name, setName] = useState("Nuova dashboard");
  const [description, setDescription] = useState("");
  const [scope, setScope] = useState<"personal" | "company">("personal");
  const [layout, setLayout] = useState<DashboardLayout>(emptyLayout);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [dirty, setDirty] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Hydrate from loaded dashboard
  useEffect(() => {
    if (!isEdit || !dash.data) return;
    setName(dash.data.dashboard.name);
    setDescription(dash.data.dashboard.description ?? "");
    setScope(dash.data.dashboard.scope === "company" ? "company" : "personal");
    setLayout(dash.data.version.layout ?? emptyLayout());
    setDirty(false);
  }, [isEdit, dash.data?.dashboard?.id, dash.data?.version?.version]);

  // When a widget is selected close settings collapsible to reveal config
  useEffect(() => {
    if (selectedId) setSettingsOpen(false);
  }, [selectedId]);

  const resolved = useResolveDashboard(isEdit ? id : null);

  const canvasRef = useRef<HTMLDivElement>(null);
  const [canvasWidth, setCanvasWidth] = useState(1024);
  useEffect(() => {
    if (!canvasRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setCanvasWidth(Math.max(400, e.contentRect.width));
    });
    ro.observe(canvasRef.current);
    return () => ro.disconnect();
  }, []);

  const selected = useMemo(
    () => layout.widgets.find((w) => w.id === selectedId) ?? null,
    [layout.widgets, selectedId],
  );

  const setWidgets = (updater: (prev: DashboardWidget[]) => DashboardWidget[]) => {
    setLayout((prev) => ({ ...prev, widgets: updater(prev.widgets) }));
    setDirty(true);
  };

  const addWidget = (item: PaletteItem) => {
    const slot = findFreeSlot(layout.widgets);
    const newW: DashboardWidget = {
      id: nextId(item.type),
      type: item.type,
      x: slot.x,
      y: slot.y,
      w: item.defaultSize.w,
      h: item.defaultSize.h,
      config: { title: item.label, ...(item.defaultConfig ?? {}) },
    };
    setWidgets((prev) => [...prev, newW]);
    setSelectedId(newW.id);
  };

  const updateSelected = (patch: Partial<DashboardWidget>) => {
    if (!selectedId) return;
    setWidgets((prev) =>
      prev.map((w) =>
        w.id === selectedId
          ? { ...w, ...patch, config: patch.config ? { ...(w.config ?? {}), ...patch.config } : w.config }
          : w,
      ),
    );
  };

  const deleteSelected = () => {
    if (!selectedId) return;
    setWidgets((prev) => prev.filter((w) => w.id !== selectedId));
    setSelectedId(null);
  };

  const handleSave = async () => {
    try {
      const result = await save.mutateAsync({
        dashboardId: isEdit ? id : null,
        name,
        description: description || null,
        scope,
        icon: "layout-dashboard",
        layout,
        note: note || null,
      });
      setDirty(false);
      toast({ title: "Dashboard salvata", description: `Versione v${result.version}` });
      if (!isEdit) {
        navigate(`/azienda/dashboards/${result.dashboard_id}/modifica`, { replace: true });
      }
    } catch (e) {
      toast({
        title: "Errore nel salvataggio",
        description: (e as Error).message,
        variant: "destructive",
      });
    }
  };

  // ── Loading / gate states ────────────────────────────────────
  if (flagsLoading) {
    return (
      <div className="p-6">
        <div className="h-7 w-48 bg-muted animate-pulse rounded" />
      </div>
    );
  }
  if (!isFeatureEnabled("dashboard_builder_v1")) return <Navigate to="/azienda" replace />;
  if (isEdit && dash.error) {
    return (
      <div className="p-6 max-w-3xl mx-auto space-y-3">
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5" />
          <span>Errore: {(dash.error as Error).message}</span>
        </div>
        <Button asChild variant="outline">
          <Link to="/azienda/dashboards">Torna</Link>
        </Button>
      </div>
    );
  }
  if (isEdit && dash.isLoading) {
    return (
      <div className="p-6">
        <div className="h-7 w-48 bg-muted animate-pulse rounded" />
      </div>
    );
  }
  if (isEdit && dash.data && !dash.data.can_edit) {
    return <Navigate to={`/azienda/dashboards/${id}`} replace />;
  }

  // ── Main render ──────────────────────────────────────────────
  return (
    <div className="flex flex-col h-[calc(100vh-0px)] min-h-0 bg-background">
      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="flex items-center gap-2 border-b bg-background px-3 py-2 shrink-0 z-10">
        {/* Back */}
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground hover:text-foreground shrink-0"
        >
          <Link to={isEdit ? `/azienda/dashboards/${id}` : "/azienda/dashboards"}>
            <ArrowLeft className="h-4 w-4" />
            Esci
          </Link>
        </Button>

        <div className="h-5 w-px bg-border shrink-0" />

        {/* Dashboard name — inline editable */}
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <Input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setDirty(true);
            }}
            className="h-8 font-semibold text-sm border-transparent bg-transparent px-1.5 hover:border-border focus-visible:border-border focus-visible:ring-0 max-w-xs min-w-[120px]"
            placeholder="Nome dashboard"
          />
          {dirty && (
            <span
              className="w-2 h-2 rounded-full bg-amber-400 shrink-0 ring-2 ring-amber-400/30"
              title="Modifiche non salvate"
            />
          )}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Save */}
        <Button
          onClick={handleSave}
          disabled={save.isPending || !name.trim()}
          size="sm"
          className="gap-1.5 shrink-0"
        >
          {save.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          Salva modifiche
        </Button>
      </header>

      {/* ── Body ───────────────────────────────────────────────── */}
      <div className="flex-1 flex min-h-0">
        {/* Canvas */}
        <main
          className="flex-1 overflow-auto min-h-0"
          style={{ background: "hsl(var(--muted) / 0.3)" }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setSelectedId(null);
          }}
        >
          <div ref={canvasRef} className="p-6 min-h-full">
            {layout.widgets.length === 0 ? (
              <div
                className="flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed border-border/50 text-center"
                style={{ minHeight: "calc(100vh - 180px)" }}
              >
                <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <LayoutGrid className="h-7 w-7 text-primary/60" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground/60">Nessun widget</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Seleziona un widget dal pannello di destra per aggiungerlo
                  </p>
                </div>
              </div>
            ) : (
              <BuilderGrid
                widgets={layout.widgets}
                resolved={resolved.data?.widgets}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onLayoutChange={(next) => {
                  setWidgets(() => next);
                }}
                width={canvasWidth}
              />
            )}
          </div>
        </main>

        {/* ── Right Panel ────────────────────────────────────────── */}
        <aside className="w-80 border-l flex flex-col bg-background shrink-0 min-h-0">
          {selected ? (
            /* Config mode: widget selected */
            <ConfigPanel
              widget={selected}
              catalog={catalog.data ?? []}
              onChange={updateSelected}
              onDelete={deleteSelected}
              onBack={() => setSelectedId(null)}
            />
          ) : (
            /* Palette mode: no widget selected */
            <>
              {/* Dashboard settings — collapsible */}
              <Collapsible open={settingsOpen} onOpenChange={setSettingsOpen}>
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors border-b"
                  >
                    <span className="flex items-center gap-1.5">
                      <Settings2 className="h-3.5 w-3.5" />
                      Impostazioni dashboard
                    </span>
                    <ChevronDown
                      className={`h-3.5 w-3.5 transition-transform ${settingsOpen ? "rotate-180" : ""}`}
                    />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="p-4 space-y-3 border-b bg-muted/5">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Visibilità</Label>
                      <Select
                        value={scope}
                        onValueChange={(v) => {
                          setScope(v as "personal" | "company");
                          setDirty(true);
                        }}
                      >
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="personal">Personale</SelectItem>
                          <SelectItem value="company">Condivisa (tutta l'azienda)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Descrizione</Label>
                      <Textarea
                        value={description}
                        onChange={(e) => {
                          setDescription(e.target.value);
                          setDirty(true);
                        }}
                        rows={2}
                        placeholder="Descrizione opzionale"
                        className="text-sm resize-none"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Nota versione</Label>
                      <Input
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Opzionale (es. v1.2 — aggiunto KPI vendite)"
                        className="h-8 text-sm"
                      />
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>

              {/* Widget palette */}
              <div className="flex-1 overflow-hidden flex flex-col min-h-0">
                <WidgetPalette onAdd={addWidget} />
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
