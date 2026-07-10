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

/**
 * Anello di progresso (donut) per capacità/quota — es. "inviate oggi / cap".
 * SVG puro, nessuna dipendenza, colore per tono.
 */
export function OutreachRing({
  value,
  max,
  size = 56,
  stroke = 6,
  tone = "orange",
  centerTop,
  centerBottom,
}: {
  value: number;
  max: number;
  size?: number;
  stroke?: number;
  tone?: "orange" | "emerald" | "blue" | "amber";
  centerTop?: string;
  centerBottom?: string;
}) {
  const pct = max > 0 ? Math.min(1, value / max) : 0;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const toneColor = {
    orange: "#f97316",
    emerald: "#10b981",
    blue: "#3b82f6",
    amber: "#f59e0b",
  }[tone];
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-muted" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          stroke={toneColor}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          style={{ transition: "stroke-dashoffset .5s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        {centerTop && <span className="text-sm font-bold tabular-nums">{centerTop}</span>}
        {centerBottom && <span className="text-[9px] text-muted-foreground">{centerBottom}</span>}
      </div>
    </div>
  );
}
