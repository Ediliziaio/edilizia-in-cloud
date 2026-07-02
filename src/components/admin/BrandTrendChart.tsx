/**
 * BrandTrendChart — grafico andamento in stile Cruscotto Aziendale: barre a
 * gradiente (1-2 serie) + linea morbida opzionale con area sfumata e dot, tutto
 * animato (Recharts). Riutilizzabile su qualsiasi dashboard admin per un trend
 * temporale coerente col brand.
 *
 *   <BrandTrendChart
 *     data={rows} xKey="mese" height={240}
 *     bars={[{ key: "venduto", name: "Venduto", color: "hsl(217 91% 60%)" }]}
 *     line={{ key: "cassa", name: "Cassa", color: "hsl(160 84% 39%)" }}
 *     yFormatter={(v) => `${Math.round(v/1000)}k`} />
 */
import { useId } from "react";
import {
  ResponsiveContainer, ComposedChart, Bar, Line, Area, XAxis, YAxis,
  CartesianGrid, Tooltip as RechartsTooltip,
} from "recharts";

interface Serie {
  key: string;
  name: string;
  color: string; // hsl(...) o hex
  /** Se true la linea usa un asse Y secondario a destra (per una metrica di scala diversa dalle barre). */
  rightAxis?: boolean;
}

interface BrandTrendChartProps {
  data: Record<string, unknown>[];
  xKey: string;
  bars: Serie[];
  line?: Serie;
  height?: number;
  /** Formatter dei tick dell'asse sinistro (barre). */
  yFormatter?: (v: number) => string;
  /** Formatter dei tick dell'asse destro (linea), se line.rightAxis. */
  rightFormatter?: (v: number) => string;
  /** Formatter dei valori nel tooltip; riceve anche il nome serie per formattare diversamente (€ vs conteggio). */
  valueFormatter?: (v: number, name: string) => string;
}

export function BrandTrendChart({
  data,
  xKey,
  bars,
  line,
  height = 240,
  yFormatter = (v) => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : String(Math.round(v))),
  rightFormatter = (v) => String(Math.round(v)),
  valueFormatter,
}: BrandTrendChartProps) {
  const uid = useId().replace(/:/g, "");
  const fmt = valueFormatter ?? ((v: number) => v.toLocaleString("it-IT"));
  const dualAxis = !!line?.rightAxis;
  const lineAxis = dualAxis ? "right" : "left";

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: dualAxis ? 4 : 6, left: -12, bottom: 0 }}>
        <defs>
          {bars.map((b) => (
            <linearGradient key={b.key} id={`${uid}-${b.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={b.color} stopOpacity={0.95} />
              <stop offset="100%" stopColor={b.color} stopOpacity={0.5} />
            </linearGradient>
          ))}
          {line && (
            <linearGradient id={`${uid}-${line.key}-area`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={line.color} stopOpacity={0.22} />
              <stop offset="100%" stopColor={line.color} stopOpacity={0.02} />
            </linearGradient>
          )}
        </defs>
        <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="hsl(var(--border))" />
        <XAxis dataKey={xKey} tickLine={false} axisLine={false} fontSize={11} stroke="hsl(var(--muted-foreground))" tickMargin={8} interval="preserveStartEnd" />
        <YAxis yAxisId="left" tickLine={false} axisLine={false} fontSize={10} stroke="hsl(var(--muted-foreground))" tickMargin={6} width={40} tickFormatter={(v) => yFormatter(Number(v))} />
        {dualAxis && (
          <YAxis yAxisId="right" orientation="right" tickLine={false} axisLine={false} fontSize={10} stroke={line!.color} tickMargin={6} width={32} tickFormatter={(v) => rightFormatter(Number(v))} />
        )}
        <RechartsTooltip
          cursor={{ fill: "hsl(var(--muted) / 0.4)" }}
          contentStyle={{ fontSize: 12, borderRadius: 10, border: "1px solid hsl(var(--border))", background: "hsl(var(--popover))" }}
          labelStyle={{ fontWeight: 600, color: "hsl(var(--foreground))" }}
          formatter={(value: number | string, name: string) => [fmt(Number(value), String(name)), name]}
        />
        {bars.map((b) => (
          <Bar key={b.key} yAxisId="left" dataKey={b.key} name={b.name} fill={`url(#${uid}-${b.key})`} radius={[6, 6, 0, 0]} maxBarSize={26} animationDuration={700} />
        ))}
        {line && (
          <Area
            yAxisId={lineAxis}
            type="monotone"
            dataKey={line.key}
            name={`${line.name} area`}
            stroke="transparent"
            fill={`url(#${uid}-${line.key}-area)`}
            legendType="none"
            tooltipType="none"
            animationDuration={700}
          />
        )}
        {line && (
          <Line
            yAxisId={lineAxis}
            type="monotone"
            dataKey={line.key}
            name={line.name}
            stroke={line.color}
            strokeWidth={2.5}
            dot={{ r: 3, fill: "hsl(var(--background))", stroke: line.color, strokeWidth: 2 }}
            activeDot={{ r: 5, fill: line.color, stroke: "hsl(var(--background))", strokeWidth: 2 }}
            animationDuration={900}
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
