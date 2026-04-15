/**
 * ChartWidget — renderer unificato per chart_line / chart_bar / chart_area /
 * chart_pie. Usa Recharts + tailwind token colors.
 *
 * Design:
 *   • Header con titolo + sottotitolo opzionale
 *   • Palette condivisa PIE_COLORS per consistenza tra pie chart
 *   • Gradienti per area/line chart (primary ↘ trasparente)
 *   • Stati error/empty compatti con icona, non invasivi
 */
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
import { AlertTriangle, Inbox } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  DashboardWidget,
  ResolvedWidget,
  WidgetType,
} from "@/lib/dashboardBuilder/types";
import { formatShort, formatValue } from "../formatValue";
import { widgetLabel } from "@/lib/dashboardBuilder/widgetLabels";

interface Props {
  widget: DashboardWidget;
  resolved: ResolvedWidget | undefined;
}

function displayTitle(widget: DashboardWidget): string {
  const cfg = widget.config ?? {};
  if (cfg.title && cfg.title.trim()) return cfg.title.trim();
  if (cfg.metric) return cfg.metric;
  return widgetLabel(widget.type);
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

/** Stato di errore compatto — una card con icona + messaggio in riga. */
function ErrorState({ message }: { message: string }) {
  return (
    <div className="h-full w-full flex flex-col items-center justify-center gap-2 px-4 text-center">
      <div className="w-8 h-8 rounded-full bg-destructive/10 flex items-center justify-center">
        <AlertTriangle className="h-4 w-4 text-destructive" />
      </div>
      <p className="text-[11px] text-destructive/90 leading-snug line-clamp-3">
        {message}
      </p>
    </div>
  );
}

/** Stato vuoto: icona + messaggio, centrato verticalmente. */
function EmptyState() {
  return (
    <div className="h-full w-full flex flex-col items-center justify-center gap-2 text-center">
      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
        <Inbox className="h-4 w-4 text-muted-foreground" />
      </div>
      <p className="text-[11px] text-muted-foreground">Nessun dato nel periodo</p>
    </div>
  );
}

export function ChartWidget({ widget, resolved }: Props) {
  const cfg = widget.config ?? {};
  const title = displayTitle(widget);
  const data = resolved?.status === "ok" ? resolved.breakdown ?? [] : [];
  const error = resolved?.status === "error" ? resolved.error : null;
  const type = widget.type as WidgetType;
  // Gradiente unico per area/line – id stabile per evitare collisioni tra widget
  const gradId = `chart-grad-${widget.id.replace(/[^a-z0-9]/gi, "")}`;

  return (
    <Card className="h-full flex flex-col shadow-sm">
      <CardHeader className="pb-1 pt-3 px-4">
        <CardTitle className="text-sm font-semibold text-foreground/90">
          {title}
        </CardTitle>
        {cfg.subtitle && (
          <p className="text-[11px] text-muted-foreground">{cfg.subtitle}</p>
        )}
      </CardHeader>
      <CardContent className="flex-1 px-2 pb-2 pt-0 min-h-0">
        {error ? (
          <ErrorState message={error} />
        ) : data.length === 0 ? (
          <EmptyState />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {type === "chart_pie" ? (
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="label"
                  innerRadius="45%"
                  outerRadius="75%"
                  paddingAngle={2}
                  strokeWidth={1}
                  stroke="hsl(var(--background))"
                  label={(entry) => formatShort(entry.value as number)}
                >
                  {data.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v: number) => formatValue(v, cfg)}
                  contentStyle={{
                    borderRadius: 8,
                    border: "1px solid hsl(var(--border))",
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            ) : type === "chart_line" ? (
              <LineChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: -10 }}>
                <defs>
                  <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.9} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.6} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" opacity={0.25} vertical={false} />
                <XAxis
                  dataKey="label"
                  fontSize={11}
                  tickLine={false}
                  axisLine={{ stroke: "hsl(var(--border))" }}
                />
                <YAxis
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={formatShort}
                  width={50}
                />
                <Tooltip
                  formatter={(v: number) => formatValue(v, cfg)}
                  contentStyle={{
                    borderRadius: 8,
                    border: "1px solid hsl(var(--border))",
                    fontSize: 12,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke={`url(#${gradId})`}
                  strokeWidth={2.5}
                  dot={{ r: 3, strokeWidth: 2, fill: "hsl(var(--background))" }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            ) : type === "chart_area" ? (
              <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: -10 }}>
                <defs>
                  <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" opacity={0.25} vertical={false} />
                <XAxis
                  dataKey="label"
                  fontSize={11}
                  tickLine={false}
                  axisLine={{ stroke: "hsl(var(--border))" }}
                />
                <YAxis
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={formatShort}
                  width={50}
                />
                <Tooltip
                  formatter={(v: number) => formatValue(v, cfg)}
                  contentStyle={{
                    borderRadius: 8,
                    border: "1px solid hsl(var(--border))",
                    fontSize: 12,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2.5}
                  fill={`url(#${gradId})`}
                />
              </AreaChart>
            ) : (
              <BarChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: -10 }}>
                <defs>
                  <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={1} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.55} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" opacity={0.25} vertical={false} />
                <XAxis
                  dataKey="label"
                  fontSize={11}
                  tickLine={false}
                  axisLine={{ stroke: "hsl(var(--border))" }}
                />
                <YAxis
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={formatShort}
                  width={50}
                />
                <Tooltip
                  cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }}
                  formatter={(v: number) => formatValue(v, cfg)}
                  contentStyle={{
                    borderRadius: 8,
                    border: "1px solid hsl(var(--border))",
                    fontSize: 12,
                  }}
                />
                <Bar
                  dataKey="value"
                  fill={`url(#${gradId})`}
                  radius={[6, 6, 0, 0]}
                  maxBarSize={48}
                />
              </BarChart>
            )}
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
