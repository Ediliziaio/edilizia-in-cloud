import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  Area,
  AreaChart,
  Pie,
  PieChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  DashboardWidget,
  ResolvedWidget,
  WidgetType,
} from "@/lib/dashboardBuilder/types";
import { formatShort, formatValue } from "../formatValue";

interface Props {
  widget: DashboardWidget;
  resolved: ResolvedWidget | undefined;
}

const PIE_COLORS = [
  "hsl(var(--primary))",
  "hsl(173 58% 39%)",
  "hsl(12 76% 61%)",
  "hsl(197 37% 24%)",
  "hsl(43 74% 66%)",
  "hsl(27 87% 67%)",
  "hsl(280 60% 55%)",
  "hsl(340 75% 55%)",
];

export function ChartWidget({ widget, resolved }: Props) {
  const cfg = widget.config ?? {};
  const title = cfg.title ?? cfg.metric ?? widget.id;
  const data = resolved?.status === "ok" ? resolved.breakdown ?? [] : [];
  const error = resolved?.status === "error" ? resolved.error : null;
  const type = widget.type as WidgetType;

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {cfg.subtitle && (
          <p className="text-[11px] text-muted-foreground">{cfg.subtitle}</p>
        )}
      </CardHeader>
      <CardContent className="flex-1 p-2 min-h-0">
        {error ? (
          <p className="text-xs text-destructive p-2">Errore: {error}</p>
        ) : data.length === 0 ? (
          <p className="text-xs text-muted-foreground p-2">Nessun dato</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {type === "chart_pie" ? (
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="label"
                  innerRadius="40%"
                  outerRadius="70%"
                  paddingAngle={2}
                  label={(entry) => formatShort(entry.value as number)}
                >
                  {data.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v: number) => formatValue(v, cfg)}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            ) : type === "chart_line" ? (
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="label" fontSize={11} />
                <YAxis fontSize={11} tickFormatter={formatShort} />
                <Tooltip formatter={(v: number) => formatValue(v, cfg)} />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </LineChart>
            ) : type === "chart_area" ? (
              <AreaChart data={data}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="label" fontSize={11} />
                <YAxis fontSize={11} tickFormatter={formatShort} />
                <Tooltip formatter={(v: number) => formatValue(v, cfg)} />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="hsl(var(--primary))"
                  fill="hsl(var(--primary))"
                  fillOpacity={0.3}
                />
              </AreaChart>
            ) : (
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="label" fontSize={11} />
                <YAxis fontSize={11} tickFormatter={formatShort} />
                <Tooltip formatter={(v: number) => formatValue(v, cfg)} />
                <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            )}
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
