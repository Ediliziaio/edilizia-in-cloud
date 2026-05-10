/**
 * Sparkline — mini-chart inline SVG ultra-leggero (no recharts overhead).
 *
 * Usato nelle row espandibili AI Usage Monitor / Test Lab per dare al super_admin
 * un colpo d'occhio sul trend giornaliero (ultimi N giorni) senza dover
 * espandere la riga.
 *
 * Pattern preso da Linear / GitHub: ~24px alto, color-coded (emerald se trend
 * crescente verso il basso = costo che cala è "buono"; rose se costo che sale).
 *
 * NB: il significato di "buono" dipende dal contesto. Per AI cost vogliamo
 * trend in calo (costo che scende = bene). Per quality rating vorremmo l'opposto.
 * Quindi accettiamo `trendDirection: 'lower-is-better' | 'higher-is-better'`.
 */
import { useMemo } from "react";

export interface SparklinePoint {
  date: string; // YYYY-MM-DD
  value: number;
}

interface Props {
  data: SparklinePoint[];
  width?: number;
  height?: number;
  /** Tema colore: 'cost' = lower-is-better, 'quality' = higher-is-better */
  trendDirection?: "lower-is-better" | "higher-is-better";
  /** Mostra last value sotto in piccolo */
  showLastValue?: boolean;
  /** Formatter per il last value (default: toFixed(2)) */
  formatValue?: (v: number) => string;
  /** Tooltip prefix in title attribute (es. "Costo del giorno") */
  tooltipPrefix?: string;
  /** Classe extra sul wrapper */
  className?: string;
}

export function Sparkline({
  data,
  width = 80,
  height = 24,
  trendDirection = "lower-is-better",
  showLastValue = false,
  formatValue,
  tooltipPrefix,
  className,
}: Props) {
  const { path, lastY, color, lastVal, trendPct } = useMemo(() => {
    if (data.length === 0) {
      return { path: "", lastY: height / 2, color: "var(--muted-foreground)", lastVal: 0, trendPct: 0 };
    }
    const values = data.map((d) => d.value);
    const max = Math.max(...values, 0.0001); // evita div by zero
    const min = Math.min(...values);
    const range = max - min || 0.0001;
    const stepX = data.length > 1 ? width / (data.length - 1) : 0;

    // Normalize: 0 (max) → 0px (alto), max → height (basso). Padding 2px top/bottom
    const yOf = (v: number) => height - 2 - ((v - min) / range) * (height - 4);

    let pathStr = "";
    data.forEach((d, i) => {
      const x = i * stepX;
      const y = yOf(d.value);
      pathStr += i === 0 ? `M ${x.toFixed(1)} ${y.toFixed(1)}` : ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
    });

    const lastVal = values[values.length - 1];
    const firstVal = values[0];

    // Trend: ultimi 50% vs primi 50% per evitare rumore single-day
    const half = Math.floor(data.length / 2);
    const firstHalfAvg = half > 0 ? values.slice(0, half).reduce((s, v) => s + v, 0) / half : firstVal;
    const secondHalfAvg = half > 0 ? values.slice(half).reduce((s, v) => s + v, 0) / (values.length - half) : lastVal;
    const trendPct = firstHalfAvg > 0 ? ((secondHalfAvg - firstHalfAvg) / firstHalfAvg) * 100 : 0;

    // Color logic
    let color = "rgb(100 116 139)"; // slate-500 default (trend neutro)
    if (Math.abs(trendPct) > 5) {
      const isUpward = trendPct > 0;
      const isGood = trendDirection === "higher-is-better" ? isUpward : !isUpward;
      color = isGood ? "rgb(16 185 129)" : "rgb(244 63 94)"; // emerald-500 / rose-500
    }

    return { path: pathStr, lastY: yOf(lastVal), color, lastVal, trendPct };
  }, [data, width, height, trendDirection]);

  if (data.length === 0) {
    return (
      <div
        className={`flex items-center justify-center text-[10px] text-muted-foreground ${className ?? ""}`}
        style={{ width, height }}
      >
        —
      </div>
    );
  }

  const fmt = formatValue ?? ((v: number) => v.toFixed(2));
  const trendLabel = Math.abs(trendPct) > 5
    ? `${trendPct > 0 ? "+" : ""}${trendPct.toFixed(0)}%`
    : "stabile";
  const titleText = tooltipPrefix
    ? `${tooltipPrefix}: ${fmt(lastVal)} (trend: ${trendLabel})`
    : `Ultimo: ${fmt(lastVal)} · Trend: ${trendLabel}`;

  return (
    <div
      className={`inline-flex items-center gap-1.5 ${className ?? ""}`}
      title={titleText}
    >
      <svg width={width} height={height} role="img" aria-label={titleText}>
        {/* Linea trend */}
        <path
          d={path}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Dot finale */}
        <circle
          cx={(data.length - 1) * (data.length > 1 ? width / (data.length - 1) : 0)}
          cy={lastY}
          r={2}
          fill={color}
        />
      </svg>
      {showLastValue && (
        <span className="text-[10px] font-mono text-muted-foreground tabular-nums">
          {fmt(lastVal)}
        </span>
      )}
    </div>
  );
}
