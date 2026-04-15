import GridLayout, { type Layout } from "react-grid-layout";
import type { DashboardWidget, ResolvedWidget, WidgetType } from "@/lib/dashboardBuilder/types";

const WIDGET_LABELS: Record<WidgetType, string> = {
  kpi_card: "Scheda KPI",
  chart_line: "Grafico linea",
  chart_bar: "Grafico barre",
  chart_area: "Grafico area",
  chart_pie: "Grafico torta",
  table: "Tabella dati",
  progress: "Barra progresso",
  gauge: "Indicatore",
  text_markdown: "Testo libero",
  divider: "Separatore",
};
import { KpiCard } from "../widgets/KpiCard";
import { ChartWidget } from "../widgets/ChartWidget";
import { TableWidget } from "../widgets/TableWidget";
import { GaugeWidget, ProgressWidget } from "../widgets/ProgressWidget";
import { DividerWidget, TextWidget } from "../widgets/TextWidget";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

interface Props {
  widgets: DashboardWidget[];
  resolved?: Record<string, ResolvedWidget>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onLayoutChange: (next: DashboardWidget[]) => void;
  width: number;
  rowHeight?: number;
  columns?: number;
}

function renderWidget(widget: DashboardWidget, resolved: ResolvedWidget | undefined) {
  switch (widget.type) {
    case "kpi_card":
      return <KpiCard widget={widget} resolved={resolved} />;
    case "chart_line":
    case "chart_bar":
    case "chart_pie":
    case "chart_area":
      return <ChartWidget widget={widget} resolved={resolved} />;
    case "table":
      return <TableWidget widget={widget} resolved={resolved} />;
    case "progress":
      return <ProgressWidget widget={widget} resolved={resolved} />;
    case "gauge":
      return <GaugeWidget widget={widget} resolved={resolved} />;
    case "text_markdown":
      return <TextWidget widget={widget} />;
    case "divider":
      return <DividerWidget widget={widget} />;
    default:
      return null;
  }
}

export function BuilderGrid({
  widgets,
  resolved,
  selectedId,
  onSelect,
  onLayoutChange,
  width,
  rowHeight = 80,
  columns = 12,
}: Props) {
  const layout: Layout[] = widgets.map((w) => ({
    i: w.id,
    x: w.x,
    y: w.y,
    w: w.w,
    h: w.h,
    minW: 1,
    minH: 1,
  }));

  const handleLayoutChange = (next: Layout[]) => {
    const byId = new Map(widgets.map((w) => [w.id, w]));
    const updated = next
      .map((l) => {
        const w = byId.get(l.i);
        if (!w) return null;
        return { ...w, x: l.x, y: l.y, w: l.w, h: l.h };
      })
      .filter(Boolean) as DashboardWidget[];
    onLayoutChange(updated);
  };

  return (
    <div
      className="min-h-full"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onSelect(null);
      }}
    >
      <GridLayout
        className="layout"
        layout={layout}
        cols={columns}
        rowHeight={rowHeight}
        width={width}
        margin={[12, 12]}
        containerPadding={[0, 0]}
        onLayoutChange={handleLayoutChange}
        draggableCancel=".no-drag"
        compactType={null}
        preventCollision={false}
      >
        {widgets.map((w) => {
          const isSelected = w.id === selectedId;
          return (
            <div
              key={w.id}
              onMouseDown={(e) => {
                e.stopPropagation();
                onSelect(w.id);
              }}
              className={`group relative rounded-xl transition-all ${
                isSelected
                  ? "ring-2 ring-primary ring-offset-2 ring-offset-background shadow-md"
                  : "hover:ring-1 hover:ring-primary/30 hover:shadow-sm"
              }`}
            >
              <div className="absolute inset-0 pointer-events-none" />
              <div className="absolute top-1.5 left-1.5 z-10 text-[10px] px-2 py-0.5 rounded-full bg-primary/90 text-white opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none font-medium">
                {WIDGET_LABELS[w.type] ?? w.type}
              </div>
              <div className="h-full w-full overflow-hidden">
                {renderWidget(w, resolved?.[w.id])}
              </div>
            </div>
          );
        })}
      </GridLayout>
    </div>
  );
}
