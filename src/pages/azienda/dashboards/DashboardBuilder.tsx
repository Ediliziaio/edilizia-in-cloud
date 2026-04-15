/**
 * DashboardBuilder — /azienda/dashboards/nuova | /azienda/dashboards/:id/modifica
 *
 * Builder visuale: palette + grid drag&drop (react-grid-layout) + config panel.
 * Salva come nuova versione tramite RPC save_dashboard.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Save, Loader2, AlertTriangle } from "lucide-react";
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

function findFreeSlot(widgets: DashboardWidget[], w: number, h: number, cols = 12): { x: number; y: number } {
  // Place at the bottom-most free row, left-aligned
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

  // Hydrate from loaded dashboard
  useEffect(() => {
    if (!isEdit || !dash.data) return;
    setName(dash.data.dashboard.name);
    setDescription(dash.data.dashboard.description ?? "");
    setScope((dash.data.dashboard.scope === "company" ? "company" : "personal"));
    setLayout(dash.data.version.layout ?? emptyLayout());
    setDirty(false);
  }, [isEdit, dash.data?.dashboard?.id, dash.data?.version?.version]);

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
    const slot = findFreeSlot(layout.widgets, item.defaultSize.w, item.defaultSize.h);
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

  if (flagsLoading) return <div className="p-6"><div className="h-7 w-48 bg-muted animate-pulse rounded" /></div>;
  if (!isFeatureEnabled("dashboard_builder_v1")) return <Navigate to="/azienda" replace />;
  if (isEdit && dash.error) {
    return (
      <div className="p-6 max-w-3xl mx-auto space-y-3">
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5" />
          <span>Errore: {(dash.error as Error).message}</span>
        </div>
        <Button asChild variant="outline"><Link to="/azienda/dashboards">Torna</Link></Button>
      </div>
    );
  }
  if (isEdit && dash.isLoading) {
    return <div className="p-6"><div className="h-7 w-48 bg-muted animate-pulse rounded" /></div>;
  }
  if (isEdit && dash.data && !dash.data.can_edit) {
    return <Navigate to={`/azienda/dashboards/${id}`} replace />;
  }

  return (
    <div className="flex flex-col h-[calc(100vh-0px)] min-h-0">
      {/* Header */}
      <div className="flex items-center gap-3 border-b bg-background px-3 py-2 flex-wrap">
        <Button asChild variant="ghost" size="sm">
          <Link to={isEdit ? `/azienda/dashboards/${id}` : "/azienda/dashboards"}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Esci
          </Link>
        </Button>
        <Input
          value={name}
          onChange={(e) => { setName(e.target.value); setDirty(true); }}
          className="w-64 h-9 font-medium"
          placeholder="Nome dashboard"
        />
        <Select value={scope} onValueChange={(v) => { setScope(v as "personal" | "company"); setDirty(true); }}>
          <SelectTrigger className="w-[140px] h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="personal">Personale</SelectItem>
            <SelectItem value="company">Condivisa</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="w-48 h-9 text-xs"
          placeholder="Nota versione (opz.)"
        />
        <Button onClick={handleSave} disabled={save.isPending || !name.trim()}>
          {save.isPending ? (
            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-1" />
          )}
          Salva {dirty && <span className="ml-1 text-primary-foreground/70">•</span>}
        </Button>
      </div>

      {/* Body */}
      <div className="flex-1 flex min-h-0">
        {/* Left: palette */}
        <aside className="w-56 border-r overflow-auto bg-muted/20 shrink-0">
          <WidgetPalette onAdd={addWidget} />
          <div className="p-3 border-t space-y-2">
            <Label className="text-xs">Descrizione dashboard</Label>
            <Textarea
              value={description}
              onChange={(e) => { setDescription(e.target.value); setDirty(true); }}
              rows={3}
              placeholder="Opzionale"
              className="text-xs"
            />
          </div>
        </aside>

        {/* Center: grid */}
        <main className="flex-1 overflow-auto bg-muted/5">
          <div ref={canvasRef} className="p-4">
            {layout.widgets.length === 0 ? (
              <div className="flex items-center justify-center h-64 text-sm text-muted-foreground border border-dashed rounded-lg">
                Aggiungi widget dalla palette a sinistra
              </div>
            ) : (
              <BuilderGrid
                widgets={layout.widgets}
                resolved={resolved.data?.widgets}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onLayoutChange={(next) => { setWidgets(() => next); }}
                width={canvasWidth}
              />
            )}
          </div>
        </main>

        {/* Right: config */}
        <aside className="w-72 border-l overflow-hidden bg-muted/10 shrink-0">
          {selected ? (
            <ConfigPanel
              widget={selected}
              catalog={catalog.data ?? []}
              onChange={updateSelected}
              onDelete={deleteSelected}
            />
          ) : (
            <div className="p-4 text-xs text-muted-foreground">
              Seleziona un widget per configurarlo.
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
