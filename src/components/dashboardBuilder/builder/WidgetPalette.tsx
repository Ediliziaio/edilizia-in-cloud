import { useState } from "react";
import {
  BarChart3,
  LineChart,
  PieChart,
  AreaChart,
  Table2,
  Gauge,
  CircleDot,
  Type,
  Minus,
  Hash,
} from "lucide-react";
import type { WidgetType } from "@/lib/dashboardBuilder/types";

interface PaletteItem {
  type: WidgetType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  defaultSize: { w: number; h: number };
  defaultConfig?: Record<string, unknown>;
}

const ITEMS: PaletteItem[] = [
  { type: "kpi_card", label: "KPI Card", icon: Hash, defaultSize: { w: 3, h: 2 } },
  { type: "chart_line", label: "Grafico linea", icon: LineChart, defaultSize: { w: 6, h: 4 } },
  { type: "chart_bar", label: "Grafico barre", icon: BarChart3, defaultSize: { w: 6, h: 4 } },
  { type: "chart_area", label: "Grafico area", icon: AreaChart, defaultSize: { w: 6, h: 4 } },
  { type: "chart_pie", label: "Grafico torta", icon: PieChart, defaultSize: { w: 4, h: 4 } },
  { type: "table", label: "Tabella", icon: Table2, defaultSize: { w: 6, h: 4 } },
  { type: "progress", label: "Progress bar", icon: CircleDot, defaultSize: { w: 3, h: 2 } },
  { type: "gauge", label: "Gauge", icon: Gauge, defaultSize: { w: 3, h: 4 } },
  { type: "text_markdown", label: "Testo", icon: Type, defaultSize: { w: 6, h: 2 } },
  { type: "divider", label: "Separatore", icon: Minus, defaultSize: { w: 12, h: 1 } },
];

interface Props {
  onAdd: (item: PaletteItem) => void;
}

export function WidgetPalette({ onAdd }: Props) {
  const [hover, setHover] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-1 p-2">
      <p className="text-[11px] uppercase font-semibold text-muted-foreground tracking-wide px-2 pt-1 pb-2">
        Widget disponibili
      </p>
      {ITEMS.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.type}
            type="button"
            onMouseEnter={() => setHover(item.type)}
            onMouseLeave={() => setHover(null)}
            onClick={() => onAdd(item)}
            className={`flex items-center gap-2 px-2 py-2 rounded-md text-sm text-left transition-colors border ${
              hover === item.type ? "bg-accent border-primary/40" : "border-transparent hover:bg-accent/50"
            }`}
          >
            <Icon className="h-4 w-4 text-primary shrink-0" />
            <span className="truncate">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export type { PaletteItem };
