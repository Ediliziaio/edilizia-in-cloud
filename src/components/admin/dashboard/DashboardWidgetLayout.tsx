import { useState, useEffect, useCallback } from "react";
import {
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Eye, RotateCcw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { useWidgetLayoutPersistence } from "@/hooks/useWidgetLayoutPersistence";

export interface DashboardWidget {
  id: string;
  label: string;
  category: "kpi" | "charts" | "tables" | "alerts";
  visible: boolean;
  span: 1 | 2; // 1 = half width, 2 = full width
}

const STORAGE_KEY = "adminDashboardLayout";

export const DEFAULT_WIDGETS: DashboardWidget[] = [
  { id: "stat-cards", label: "KPI Principali", category: "kpi", visible: true, span: 2 },
  { id: "growth-analytics", label: "Growth Analytics", category: "charts", visible: true, span: 2 },
  { id: "command-center", label: "Centro operativo", category: "kpi", visible: true, span: 2 },
  { id: "revenue-kpis", label: "Revenue Intelligence", category: "kpi", visible: true, span: 2 },
  { id: "saas-metrics", label: "Metriche SaaS (ARPU/LTV/CAC)", category: "kpi", visible: true, span: 2 },
  { id: "mrr-reconciliation", label: "Riconciliazione MRR Stripe", category: "kpi", visible: true, span: 1 },
  { id: "dunning", label: "Dunning", category: "alerts", visible: true, span: 1 },
  { id: "consumption", label: "Consumo tool a costo", category: "kpi", visible: true, span: 1 },
  { id: "health-summary", label: "Health Summary", category: "alerts", visible: true, span: 1 },
  { id: "system-health", label: "System Health", category: "tables", visible: true, span: 2 },
  { id: "mrr-chart", label: "MRR Chart", category: "charts", visible: true, span: 2 },
  { id: "mrr-movements", label: "MRR Movements", category: "charts", visible: true, span: 1 },
  { id: "revenue-sector", label: "Revenue per Settore", category: "charts", visible: true, span: 1 },
  { id: "feature-usage", label: "Feature Usage", category: "charts", visible: true, span: 1 },
  { id: "upsell-alerts", label: "Upsell Alerts", category: "alerts", visible: true, span: 1 },
  { id: "churn-alerts", label: "Churn Alerts", category: "alerts", visible: true, span: 1 },
  { id: "revenue-forecast", label: "Revenue Forecast", category: "charts", visible: true, span: 2 },
  { id: "cohort-revenue", label: "Cohort Retention", category: "charts", visible: true, span: 2 },
  { id: "addon-summary", label: "Addon Attivi", category: "kpi", visible: false, span: 1 },
  { id: "trial-intelligence", label: "Trial Intelligence", category: "tables", visible: true, span: 2 },
  { id: "revenue-forecast-v2", label: "Previsione Ricavi 30/60/90gg", category: "charts", visible: false, span: 2 },
  { id: "cohort-analysis", label: "Cohort Analysis", category: "charts", visible: false, span: 2 },
  { id: "nps-survey", label: "NPS Survey", category: "alerts", visible: false, span: 1 },
];

function isLegacyLayout(layout: DashboardWidget[]): boolean {
  const ids = new Set(layout.map((w) => w.id));
  return (
    ids.has("recent-companies") ||
    ids.has("recent-activity") ||
    !ids.has("command-center")
  );
}

function loadLayoutFromStorage(): DashboardWidget[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return DEFAULT_WIDGETS;
    const parsed = JSON.parse(saved) as DashboardWidget[];
    if (isLegacyLayout(parsed)) return DEFAULT_WIDGETS;
    const savedMap = new Map(parsed.map((w) => [w.id, w]));
    return DEFAULT_WIDGETS.map((dw) => {
      const savedWidget = savedMap.get(dw.id);
      return savedWidget
        ? { ...dw, visible: savedWidget.visible, span: savedWidget.span }
        : dw;
    }).sort((a, b) => {
      const ai = parsed.findIndex((p) => p.id === a.id);
      const bi = parsed.findIndex((p) => p.id === b.id);
      if (ai === -1 && bi === -1) return 0;
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
  } catch {
    return DEFAULT_WIDGETS;
  }
}

function mergeWithDefaults(persisted: DashboardWidget[]): DashboardWidget[] {
  if (isLegacyLayout(persisted)) return DEFAULT_WIDGETS;
  const savedMap = new Map(persisted.map((w) => [w.id, w]));
  return DEFAULT_WIDGETS.map((dw) => {
    const savedWidget = savedMap.get(dw.id);
    return savedWidget
      ? { ...dw, visible: savedWidget.visible, span: savedWidget.span }
      : dw;
  }).sort((a, b) => {
    const ai = persisted.findIndex((p) => p.id === a.id);
    const bi = persisted.findIndex((p) => p.id === b.id);
    if (ai === -1 && bi === -1) return 0;
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

export function useDashboardLayout(userId?: string) {
  const {
    layout: persistedLayout,
    isLoading: layoutLoading,
    isSaving,
    saveLayout: persistSave,
    saveNow: persistSaveNow,
    resetLayout: persistReset,
  } = useWidgetLayoutPersistence(userId, DEFAULT_WIDGETS);

  // Starts from localStorage for instant render, syncs from DB when loaded
  const [widgets, setWidgets] = useState<DashboardWidget[]>(loadLayoutFromStorage);

  // Sync widgets from DB once persistence layer loads
  useEffect(() => {
    if (layoutLoading || persistedLayout === null) return;
    setWidgets(mergeWithDefaults(persistedLayout));
  }, [persistedLayout, layoutLoading]);

  const updateWidgets = useCallback(
    (updater: (prev: DashboardWidget[]) => DashboardWidget[]) => {
      setWidgets((prev) => {
        const next = updater(prev);
        persistSave(next);
        return next;
      });
    },
    [persistSave]
  );

  const toggleVisibility = useCallback(
    (id: string) => {
      updateWidgets((prev) =>
        prev.map((w) => (w.id === id ? { ...w, visible: !w.visible } : w))
      );
    },
    [updateWidgets]
  );

  const reorder = useCallback(
    (activeId: string, overId: string) => {
      updateWidgets((prev) => {
        const oldIndex = prev.findIndex((w) => w.id === activeId);
        const newIndex = prev.findIndex((w) => w.id === overId);
        return arrayMove(prev, oldIndex, newIndex);
      });
    },
    [updateWidgets]
  );

  const resetLayout = useCallback((): void => {
    persistReset().catch((err: unknown) =>
      console.error("Errore reset layout:", err)
    );
  }, [persistReset]);

  // Salva immediatamente (bypass debounce) — per il pulsante "Salva layout"
  const saveNow = useCallback((): void => {
    setWidgets((current) => {
      persistSaveNow(current);
      return current;
    });
  }, [persistSaveNow]);

  return { widgets, isSaving, toggleVisibility, reorder, resetLayout, saveNow };
}

// --- Sortable Widget Wrapper ---
export function SortableWidget({
  id,
  children,
  span,
}: {
  id: string;
  children: React.ReactNode;
  span: 1 | 2;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative group ${span === 2 ? "md:col-span-2" : ""}`}
    >
      {/* Drag handle: nascosta su mobile (DnD non attivo) e a11y-friendly */}
      <button
        {...attributes}
        {...listeners}
        type="button"
        aria-label="Sposta widget"
        className="hidden md:flex absolute top-2 left-2 z-10 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity cursor-grab active:cursor-grabbing bg-background/80 backdrop-blur-sm rounded-md p-1 border shadow-sm"
      >
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </button>
      {children}
    </div>
  );
}

// --- Widget Configurator Popover ---
export function WidgetConfigurator({
  widgets,
  isSaving,
  onToggle,
  onReset,
  onSave,
}: {
  widgets: DashboardWidget[];
  isSaving?: boolean;
  onToggle: (id: string) => void;
  onReset: () => void;
  onSave?: () => void;
}) {
  const categories = [
    { key: "kpi", label: "KPI" },
    { key: "charts", label: "Grafici" },
    { key: "tables", label: "Tabelle" },
    { key: "alerts", label: "Alert" },
  ];

  const visibleCount = widgets.filter((w) => w.visible).length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Eye className="h-4 w-4" />
          <span className="hidden sm:inline">Widget</span>
          <Badge variant="secondary" className="text-xs">
            {visibleCount}/{widgets.length}
          </Badge>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="end">
        <div className="p-3 border-b flex items-center justify-between">
          <p className="text-sm font-medium">Configura Widget</p>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={onReset}
              className="h-7 gap-1 text-xs"
            >
              <RotateCcw className="h-3 w-3" /> Reset
            </Button>
            {onSave && (
              <Button
                size="sm"
                onClick={onSave}
                disabled={isSaving}
                className="h-7 gap-1 text-xs"
              >
                <Save className="h-3 w-3" />
                {isSaving ? "Salvataggio..." : "Salva layout"}
              </Button>
            )}
          </div>
        </div>
        <div className="p-2 max-h-[320px] overflow-y-auto space-y-3">
          {categories.map((cat) => {
            const catWidgets = widgets.filter((w) => w.category === cat.key);
            if (catWidgets.length === 0) return null;
            return (
              <div key={cat.key}>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-1 mb-1">
                  {cat.label}
                </p>
                {catWidgets.map((w) => (
                  <div
                    key={w.id}
                    className="flex items-center justify-between py-1 px-1"
                  >
                    <span className="text-sm">{w.label}</span>
                    <Switch
                      checked={w.visible}
                      onCheckedChange={() => onToggle(w.id)}
                    />
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
