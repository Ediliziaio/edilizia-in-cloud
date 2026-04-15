/**
 * DashboardBuilder — /azienda/dashboards/nuova | /azienda/dashboards/:id/modifica
 *
 * Builder visuale GHL-like:
 *   - Canvas drag&drop (react-grid-layout) con preview live in-memory
 *   - Palette widget categorizzata con ricerca
 *   - ConfigPanel contestuale (widget selezionato)
 *   - Undo/redo (⌘Z / ⌘⇧Z), duplica widget (⌘D), elimina (Canc),
 *     salva (⌘S), deseleziona (Esc)
 *   - Auto-save debounced (solo in edit mode, 2s)
 *   - Global period selector (override su tutti i widget)
 *   - Preview viewport toggle (mobile/tablet/desktop)
 *
 * Persistenza: RPC save_dashboard (append nuova versione).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Save,
  Loader2,
  AlertTriangle,
  LayoutGrid,
  ChevronDown,
  Settings2,
  Undo2,
  Redo2,
  Copy,
  Smartphone,
  Monitor,
  Tablet,
  Eye,
  Sparkles,
  Calendar,
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
  useSaveDashboard,
} from "@/lib/dashboardBuilder/hooks";
import { useResolveLayoutLive } from "@/lib/dashboardBuilder/useResolveLayoutLive";
import type {
  DashboardLayout,
  DashboardWidget,
  PeriodPreset,
  WidgetType,
} from "@/lib/dashboardBuilder/types";
import { WidgetPalette, type PaletteItem } from "@/components/dashboardBuilder/builder/WidgetPalette";
import { ConfigPanel } from "@/components/dashboardBuilder/builder/ConfigPanel";
import { BuilderGrid } from "@/components/dashboardBuilder/builder/BuilderGrid";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

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

const PERIOD_OPTS: Array<{ value: PeriodPreset; label: string }> = [
  { value: "this_month", label: "Questo mese" },
  { value: "last_month", label: "Mese scorso" },
  { value: "this_quarter", label: "Trimestre corrente" },
  { value: "last_quarter", label: "Trimestre scorso" },
  { value: "ytd", label: "Anno in corso" },
  { value: "last_year", label: "Anno scorso" },
  { value: "last_7_days", label: "Ultimi 7 giorni" },
  { value: "last_30_days", label: "Ultimi 30 giorni" },
  { value: "last_90_days", label: "Ultimi 90 giorni" },
];

// ─────────────────────────────────────────────────────────────────
// Undo/redo reducer sul layout
// ─────────────────────────────────────────────────────────────────

interface LayoutHistory {
  past: DashboardLayout[];
  present: DashboardLayout;
  future: DashboardLayout[];
}

const HISTORY_LIMIT = 50;

function useLayoutHistory(initial: DashboardLayout) {
  const [state, setState] = useState<LayoutHistory>({
    past: [],
    present: initial,
    future: [],
  });

  const set = useCallback((next: DashboardLayout, commit = true) => {
    setState((h) => {
      if (!commit) return { ...h, present: next };
      if (JSON.stringify(h.present) === JSON.stringify(next)) return h;
      const past = [...h.past, h.present].slice(-HISTORY_LIMIT);
      return { past, present: next, future: [] };
    });
  }, []);

  const reset = useCallback((next: DashboardLayout) => {
    setState({ past: [], present: next, future: [] });
  }, []);

  const undo = useCallback(() => {
    setState((h) => {
      if (h.past.length === 0) return h;
      const prev = h.past[h.past.length - 1];
      return {
        past: h.past.slice(0, -1),
        present: prev,
        future: [h.present, ...h.future].slice(0, HISTORY_LIMIT),
      };
    });
  }, []);

  const redo = useCallback(() => {
    setState((h) => {
      if (h.future.length === 0) return h;
      const [next, ...rest] = h.future;
      return {
        past: [...h.past, h.present].slice(-HISTORY_LIMIT),
        present: next,
        future: rest,
      };
    });
  }, []);

  return {
    layout: state.present,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    set,
    reset,
    undo,
    redo,
  };
}

// ─────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────

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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [dirty, setDirty] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [previewMode, setPreviewMode] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [viewerPreview, setViewerPreview] = useState(false); // nasconde chrome/outline

  const history = useLayoutHistory(emptyLayout());
  const { layout, canUndo, canRedo, set: setLayout, reset: resetLayout, undo, redo } = history;

  // Hydrate from loaded dashboard
  useEffect(() => {
    if (!isEdit || !dash.data) return;
    setName(dash.data.dashboard.name);
    setDescription(dash.data.dashboard.description ?? "");
    setScope(dash.data.dashboard.scope === "company" ? "company" : "personal");
    resetLayout(dash.data.version.layout ?? emptyLayout());
    setDirty(false);
  }, [isEdit, dash.data?.dashboard?.id, dash.data?.version?.version, resetLayout]);

  // When a widget is selected close settings collapsible to reveal config
  useEffect(() => {
    if (selectedId) setSettingsOpen(false);
  }, [selectedId]);

  // Live preview: risolve tutti i widget in-memory (ogni volta che il layout
  // cambia) anche per dashboard non salvate.
  const live = useResolveLayoutLive({ layout, enabled: true });

  const canvasRef = useRef<HTMLDivElement>(null);
  const [canvasMeasuredWidth, setCanvasMeasuredWidth] = useState(1024);
  useEffect(() => {
    if (!canvasRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries)
        setCanvasMeasuredWidth(Math.max(400, e.contentRect.width));
    });
    ro.observe(canvasRef.current);
    return () => ro.disconnect();
  }, []);

  // Canvas width in base alla preview selezionata
  const previewWidth =
    previewMode === "mobile" ? 390 : previewMode === "tablet" ? 768 : canvasMeasuredWidth;

  const selected = useMemo(
    () => layout.widgets.find((w) => w.id === selectedId) ?? null,
    [layout.widgets, selectedId],
  );

  const setWidgets = useCallback(
    (updater: (prev: DashboardWidget[]) => DashboardWidget[]) => {
      setLayout({ ...layout, widgets: updater(layout.widgets) });
      setDirty(true);
    },
    [layout, setLayout],
  );

  const setGlobalPeriod = useCallback(
    (period: PeriodPreset) => {
      setLayout({
        ...layout,
        globalFilters: { ...(layout.globalFilters ?? {}), period },
      });
      setDirty(true);
    },
    [layout, setLayout],
  );

  const addWidget = useCallback(
    (item: PaletteItem) => {
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
    },
    [layout.widgets, setWidgets],
  );

  const updateSelected = useCallback(
    (patch: Partial<DashboardWidget>) => {
      if (!selectedId) return;
      setWidgets((prev) =>
        prev.map((w) =>
          w.id === selectedId
            ? {
                ...w,
                ...patch,
                config: patch.config
                  ? { ...(w.config ?? {}), ...patch.config }
                  : w.config,
              }
            : w,
        ),
      );
    },
    [selectedId, setWidgets],
  );

  const duplicateWidget = useCallback(
    (widgetId: string) => {
      const src = layout.widgets.find((w) => w.id === widgetId);
      if (!src) return;
      const slot = findFreeSlot(layout.widgets);
      const clone: DashboardWidget = {
        ...src,
        id: nextId(src.type),
        x: slot.x,
        y: slot.y,
        config: src.config ? { ...src.config } : undefined,
      };
      setWidgets((prev) => [...prev, clone]);
      setSelectedId(clone.id);
    },
    [layout.widgets, setWidgets],
  );

  const deleteWidget = useCallback(
    (widgetId: string) => {
      setWidgets((prev) => prev.filter((w) => w.id !== widgetId));
      if (selectedId === widgetId) setSelectedId(null);
    },
    [selectedId, setWidgets],
  );

  const deleteSelected = useCallback(() => {
    if (!selectedId) return;
    deleteWidget(selectedId);
  }, [deleteWidget, selectedId]);

  const duplicateSelected = useCallback(() => {
    if (!selectedId) return;
    duplicateWidget(selectedId);
  }, [duplicateWidget, selectedId]);

  const handleSave = useCallback(async () => {
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
  }, [description, id, isEdit, layout, name, navigate, note, save, scope]);

  // ── Auto-save (solo edit mode, debounce 3s) ─────────────────────
  const lastSavedRef = useRef<string>("");
  useEffect(() => {
    if (!isEdit) return;
    if (!dirty) return;
    if (!name.trim()) return;

    const payload = JSON.stringify({ name, description, scope, layout });
    if (payload === lastSavedRef.current) return;

    const timer = window.setTimeout(() => {
      lastSavedRef.current = payload;
      handleSave();
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [dirty, isEdit, name, description, scope, layout, handleSave]);

  // ── Keyboard shortcuts ──────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      // Ignora quando scrivi in input/textarea/select (tranne Esc)
      const isTyping =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);

      const mod = e.metaKey || e.ctrlKey;

      // Esc: deseleziona sempre
      if (e.key === "Escape") {
        if (selectedId) {
          e.preventDefault();
          setSelectedId(null);
        }
        return;
      }

      if (isTyping) return;

      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (!save.isPending && name.trim()) handleSave();
        return;
      }
      if (mod && e.shiftKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        redo();
        return;
      }
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undo();
        return;
      }
      if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        duplicateSelected();
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedId) {
          e.preventDefault();
          deleteSelected();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [duplicateSelected, deleteSelected, handleSave, name, redo, save.isPending, selectedId, undo]);

  // ── Beforeunload warning se dirty ───────────────────────────────
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

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

  const widgetsCount = layout.widgets.length;
  const globalPeriod = (layout.globalFilters?.period as PeriodPreset | undefined) ?? "ytd";

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
        <div className="flex items-center gap-1.5 min-w-0">
          <Input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setDirty(true);
            }}
            className="h-8 font-semibold text-sm border-transparent bg-transparent px-1.5 hover:border-border focus-visible:border-border focus-visible:ring-0 max-w-xs min-w-[160px]"
            placeholder="Nome dashboard"
          />
          {dirty ? (
            <span
              className="w-2 h-2 rounded-full bg-amber-400 shrink-0 ring-2 ring-amber-400/30"
              title={isEdit ? "Salvataggio automatico in corso…" : "Modifiche non salvate"}
            />
          ) : isEdit ? (
            <span
              className="w-2 h-2 rounded-full bg-emerald-500 shrink-0 ring-2 ring-emerald-500/20"
              title="Salvato"
            />
          ) : null}
        </div>

        <div className="h-5 w-px bg-border shrink-0 ml-1" />

        {/* Undo / Redo */}
        <div className="flex items-center gap-0.5 shrink-0">
          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0"
            onClick={undo}
            disabled={!canUndo}
            title="Annulla (⌘Z)"
          >
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0"
            onClick={redo}
            disabled={!canRedo}
            title="Ripristina (⌘⇧Z)"
          >
            <Redo2 className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0"
            onClick={duplicateSelected}
            disabled={!selectedId}
            title="Duplica widget (⌘D)"
          >
            <Copy className="h-4 w-4" />
          </Button>
        </div>

        <div className="h-5 w-px bg-border shrink-0" />

        {/* Global period selector */}
        <div className="flex items-center gap-1.5 shrink-0">
          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
          <Select value={globalPeriod} onValueChange={(v) => setGlobalPeriod(v as PeriodPreset)}>
            <SelectTrigger className="h-8 text-xs w-[160px] border-dashed">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIOD_OPTS.map((p) => (
                <SelectItem key={p.value} value={p.value} className="text-xs">
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Preview viewport toggle */}
        <div className="hidden md:flex items-center rounded-md border bg-muted/30 p-0.5 shrink-0">
          <button
            type="button"
            onClick={() => setPreviewMode("desktop")}
            className={cn(
              "h-7 w-7 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground transition-colors",
              previewMode === "desktop" && "bg-background text-foreground shadow-sm",
            )}
            title="Desktop"
          >
            <Monitor className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setPreviewMode("tablet")}
            className={cn(
              "h-7 w-7 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground transition-colors",
              previewMode === "tablet" && "bg-background text-foreground shadow-sm",
            )}
            title="Tablet"
          >
            <Tablet className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setPreviewMode("mobile")}
            className={cn(
              "h-7 w-7 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground transition-colors",
              previewMode === "mobile" && "bg-background text-foreground shadow-sm",
            )}
            title="Mobile"
          >
            <Smartphone className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Viewer toggle */}
        <Button
          size="sm"
          variant={viewerPreview ? "secondary" : "ghost"}
          onClick={() => setViewerPreview((v) => !v)}
          className="h-8 gap-1.5 shrink-0"
          title="Anteprima utente"
        >
          <Eye className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Anteprima</span>
        </Button>

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
          Salva
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
          <div className="flex justify-center min-h-full">
            <div
              ref={canvasRef}
              className={cn(
                "p-6 min-h-full flex-1 transition-[max-width] duration-200",
                previewMode === "mobile" && "max-w-[420px]",
                previewMode === "tablet" && "max-w-[820px]",
                previewMode === "desktop" && "max-w-none",
              )}
            >
              {layout.widgets.length === 0 ? (
                <div
                  className="flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed border-border/50 text-center"
                  style={{ minHeight: "calc(100vh - 180px)" }}
                >
                  <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                    <LayoutGrid className="h-7 w-7 text-primary/60" />
                  </div>
                  <div className="max-w-sm">
                    <p className="text-sm font-medium text-foreground/70">Canvas vuoto</p>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      Scegli un widget dal pannello a destra. Puoi trascinare, ridimensionare e
                      configurare ogni elemento — le modifiche si vedono in tempo reale.
                    </p>
                    <p className="text-[11px] text-muted-foreground/70 mt-3 inline-flex items-center gap-1.5">
                      <Sparkles className="h-3 w-3" />
                      Scorciatoie: ⌘Z annulla · ⌘D duplica · Canc elimina · ⌘S salva
                    </p>
                  </div>
                </div>
              ) : (
                <BuilderGrid
                  widgets={layout.widgets}
                  resolved={live.widgets}
                  selectedId={viewerPreview ? null : selectedId}
                  onSelect={viewerPreview ? () => {} : setSelectedId}
                  onLayoutChange={(next) => {
                    setWidgets(() => next);
                  }}
                  onDuplicate={viewerPreview ? undefined : duplicateWidget}
                  onDelete={viewerPreview ? undefined : deleteWidget}
                  width={previewWidth - 48}
                  readonly={viewerPreview}
                />
              )}
            </div>
          </div>
        </main>

        {/* ── Right Panel ────────────────────────────────────────── */}
        {!viewerPreview && (
          <aside className="w-80 border-l flex flex-col bg-background shrink-0 min-h-0">
            {selected ? (
              /* Config mode: widget selected */
              <ConfigPanel
                widget={selected}
                catalog={catalog.data ?? []}
                onChange={updateSelected}
                onDelete={deleteSelected}
                onDuplicate={duplicateSelected}
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
                            <SelectItem value="company">
                              Condivisa (tutta l'azienda)
                            </SelectItem>
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
                      <div className="text-[11px] text-muted-foreground pt-1 flex items-center justify-between">
                        <span>Widget: <strong>{widgetsCount}</strong></span>
                        {live.isFetching && (
                          <span className="inline-flex items-center gap-1">
                            <Loader2 className="h-3 w-3 animate-spin" /> aggiornamento…
                          </span>
                        )}
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
        )}
      </div>
    </div>
  );
}
