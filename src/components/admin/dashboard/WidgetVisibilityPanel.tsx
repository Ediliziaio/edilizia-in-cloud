import { Eye, EyeOff, RotateCcw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { DashboardWidget } from "@/components/admin/dashboard/DashboardWidgetLayout";

interface WidgetVisibilityPanelProps {
  widgets: DashboardWidget[];
  isSaving?: boolean;
  onToggle: (id: string) => void;
  onSave: () => void;
  onReset: () => void;
}

const CATEGORY_LABELS: Record<DashboardWidget["category"], string> = {
  kpi: "KPI",
  charts: "Grafici",
  tables: "Tabelle",
  alerts: "Alert",
};

export function WidgetVisibilityPanel({
  widgets,
  isSaving = false,
  onToggle,
  onSave,
  onReset,
}: WidgetVisibilityPanelProps) {
  const visibleCount = widgets.filter((w) => w.visible).length;
  const categories = (
    ["kpi", "charts", "tables", "alerts"] as DashboardWidget["category"][]
  ).filter((cat) => widgets.some((w) => w.category === cat));

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Visibilità Widget</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {visibleCount} di {widgets.length} widget visibili
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={onReset}
            className="h-7 gap-1 text-xs"
          >
            <RotateCcw className="h-3 w-3" />
            Reset
          </Button>
          <Button
            size="sm"
            onClick={onSave}
            disabled={isSaving}
            className="h-7 gap-1 text-xs"
          >
            <Save className="h-3 w-3" />
            {isSaving ? "Salvataggio..." : "Salva layout"}
          </Button>
        </div>
      </div>

      <Separator />

      {/* Widget groups */}
      <div className="space-y-4 max-h-[400px] overflow-y-auto pr-1">
        {categories.map((cat) => {
          const catWidgets = widgets.filter((w) => w.category === cat);
          return (
            <div key={cat}>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                {CATEGORY_LABELS[cat]}
              </p>
              <div className="space-y-1">
                {catWidgets.map((w) => (
                  <div
                    key={w.id}
                    className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {w.visible ? (
                        <Eye className="h-3 w-3 text-muted-foreground shrink-0" />
                      ) : (
                        <EyeOff className="h-3 w-3 text-muted-foreground/50 shrink-0" />
                      )}
                      <span
                        className={`text-sm truncate ${!w.visible ? "text-muted-foreground/60" : ""}`}
                      >
                        {w.label}
                      </span>
                      {w.span === 2 && (
                        <Badge
                          variant="secondary"
                          className="text-[9px] h-4 shrink-0"
                        >
                          Full
                        </Badge>
                      )}
                    </div>
                    <Switch
                      checked={w.visible}
                      onCheckedChange={() => onToggle(w.id)}
                      className="shrink-0 ml-2"
                    />
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
