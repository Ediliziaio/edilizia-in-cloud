import type {
  DashboardLayout,
  DashboardWidget,
  ResolveDashboardResult,
  ResolvedWidget,
} from "@/lib/dashboardBuilder/types";
import { KpiCard } from "./widgets/KpiCard";
import { ChartWidget } from "./widgets/ChartWidget";
import { TableWidget } from "./widgets/TableWidget";
import { GaugeWidget, ProgressWidget } from "./widgets/ProgressWidget";
import { DividerWidget, TextWidget } from "./widgets/TextWidget";

interface Props {
  layout: DashboardLayout;
  resolved?: ResolveDashboardResult["widgets"];
  className?: string;
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
      return (
        <div className="h-full flex items-center justify-center text-xs text-muted-foreground border border-dashed rounded-md">
          Widget sconosciuto: {(widget as DashboardWidget).type}
        </div>
      );
  }
}

export function DashboardRenderer({
  layout,
  resolved,
  className,
  rowHeight = 80,
  columns = 12,
}: Props) {
  const widgets = layout?.widgets ?? [];

  if (widgets.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-sm text-muted-foreground border border-dashed rounded-lg">
        Nessun widget in questa dashboard
      </div>
    );
  }

  return (
    <div
      className={className}
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        gridAutoRows: `${rowHeight}px`,
        gap: "1rem",
      }}
    >
      {widgets.map((widget) => {
        const x = Math.max(0, Math.min(columns - 1, widget.x ?? 0));
        const w = Math.max(1, Math.min(columns - x, widget.w ?? 1));
        const y = Math.max(0, widget.y ?? 0);
        const h = Math.max(1, widget.h ?? 1);
        const resolvedWidget = resolved?.[widget.id];
        return (
          <div
            key={widget.id}
            style={{
              gridColumn: `${x + 1} / span ${w}`,
              gridRow: `${y + 1} / span ${h}`,
              minHeight: 0,
              minWidth: 0,
            }}
          >
            {renderWidget(widget, resolvedWidget)}
          </div>
        );
      })}
    </div>
  );
}
