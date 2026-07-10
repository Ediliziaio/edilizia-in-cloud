/**
 * Primitive grafiche condivise del cockpit Outreach — piccole, theme-aware,
 * costruite sui token del design system (nessun colore hard-coded fuori palette).
 * Usate da Analytics (trend invii) e dal Motore (mini-sparkline).
 */
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface TrendPoint {
  /** etichetta asse X già formattata (es. "lun 8") */
  label: string;
  value: number;
}

/**
 * Mini area-chart per una serie temporale (es. invii negli ultimi 7 giorni).
 * Gradiente arancione (colore motore), niente griglia pesante, tooltip pulito.
 */
export function OutreachTrend({
  data,
  height = 64,
  color = "#f97316", // orange-500 = colore "motore"
  ariaLabel,
}: {
  data: TrendPoint[];
  height?: number;
  color?: string;
  ariaLabel?: string;
}) {
  const id = `oatrend-${color.replace("#", "")}`;
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div style={{ height }} role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: "currentColor" }}
            className="text-muted-foreground"
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis hide domain={[0, max]} />
          <Tooltip
            cursor={{ stroke: color, strokeOpacity: 0.2 }}
            contentStyle={{
              borderRadius: 8,
              border: "1px solid hsl(var(--border))",
              background: "hsl(var(--card))",
              color: "hsl(var(--foreground))",
              fontSize: 12,
              boxShadow: "0 4px 12px rgba(0,0,0,.08)",
            }}
            labelStyle={{ color: "hsl(var(--muted-foreground))", fontSize: 11 }}
            formatter={(v: number) => [v.toLocaleString("it-IT"), "inviate"]}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            fill={`url(#${id})`}
            dot={false}
            activeDot={{ r: 3, fill: color }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

