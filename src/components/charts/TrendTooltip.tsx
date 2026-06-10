/**
 * TrendTooltip — tooltip ricco per i trend mensili delle dashboard.
 * Per ogni serie mostra valore formattato + badge delta % vs punto
 * precedente (↑ verde / ↓ rosso; invertibile per i costi, dove "su" è male).
 */
import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";

export interface TrendTooltipSeries {
  /** dataKey recharts della serie */
  key: string;
  label: string;
  /** colore del pallino legenda (o funzione del valore, es. cassa +/−) */
  color: string | ((value: number) => string);
  formatter: (value: number) => string;
  /** true per serie "costo": delta in aumento = rosso */
  invertDelta?: boolean;
  /** colore del testo valore in funzione del segno (es. cassa) */
  valueColor?: (value: number) => string | undefined;
}

interface TrendTooltipProps {
  // iniettati da recharts
  active?: boolean;
  label?: string | number;
  payload?: Array<{ dataKey?: string | number; value?: number | string }>;
  // nostri
  data: Array<Record<string, unknown>>;
  xKey: string;
  series: TrendTooltipSeries[];
}

export function TrendTooltip({ active, label, payload, data, xKey, series }: TrendTooltipProps) {
  if (!active || !payload?.length) return null;

  const idx = data.findIndex((d) => d[xKey] === label);
  const prev = idx > 0 ? data[idx - 1] : null;

  return (
    <div className="min-w-[190px] rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-[0_12px_30px_rgba(15,23,42,0.12)]">
      <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-400">{String(label)}</div>
      <div className="space-y-1.5">
        {series.map((s) => {
          const row = payload.find((p) => p.dataKey === s.key);
          if (!row || row.value == null) return null;
          const value = Number(row.value);
          const dotColor = typeof s.color === "function" ? s.color(value) : s.color;

          const prevValue = prev ? Number(prev[s.key] ?? 0) : null;
          const delta =
            prevValue !== null && prevValue !== 0
              ? ((value - prevValue) / Math.abs(prevValue)) * 100
              : null;
          const deltaGood = delta !== null && (s.invertDelta ? delta <= 0 : delta >= 0);

          return (
            <div key={s.key} className="flex items-center justify-between gap-3 text-xs">
              <span className="flex items-center gap-1.5 text-slate-500">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: dotColor }} />
                {s.label}
              </span>
              <span className="flex items-center gap-1.5">
                <span
                  className="font-semibold tabular-nums text-slate-900"
                  style={{ color: s.valueColor?.(value) }}
                >
                  {s.formatter(value)}
                </span>
                {delta !== null && Number.isFinite(delta) && (
                  <span
                    className={cn(
                      "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums",
                      deltaGood ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600",
                    )}
                  >
                    {delta >= 0 ? <ArrowUp className="h-2.5 w-2.5" /> : <ArrowDown className="h-2.5 w-2.5" />}
                    {Math.abs(delta) > 999 ? ">999" : Math.abs(delta).toFixed(0)}%
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>
      {prev === null && (
        <p className="mt-1.5 text-[10px] text-slate-400">Primo mese del periodo — nessun confronto</p>
      )}
    </div>
  );
}
