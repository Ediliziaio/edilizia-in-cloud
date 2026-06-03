/**
 * SilvioInfographicBlock — "infografica" data-driven dentro la chat di Silvio.
 * L'AI emette un blocco ```infografica``` con JSON; la UI rende una card brandizzata
 * con titolo, griglia di KPI (valore + delta) e, opzionalmente, un grafico.
 *
 * Spec:
 * {
 *   "title": "Andamento Q1 2026",
 *   "subtitle": "vs Q1 2025",                     // opzionale
 *   "accent": "#16A34A",                          // opzionale (colore header)
 *   "stats": [
 *     { "label":"Fatturato", "value":128000, "unit":"€", "delta":12, "trend":"up" },
 *     { "label":"Commesse", "value":34, "delta":-3, "trend":"down" },
 *     { "label":"Margine", "value":22, "unit":"%", "trend":"flat" }
 *   ],
 *   "chart": { ...spec SilvioChartBlock... },      // opzionale
 *   "footnote": "Dati al 31/03"                    // opzionale
 * }
 *
 * Caricato in lazy da ChatMarkdown.
 */
import { lazy, Suspense } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

const SilvioChartBlock = lazy(() => import("./SilvioChartBlock"));

interface Stat {
  label: string;
  value: number | string;
  unit?: string;
  delta?: number;
  trend?: "up" | "down" | "flat";
  hint?: string;
}
export interface InfographicSpec {
  title?: string;
  subtitle?: string;
  accent?: string;
  stats?: Stat[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  chart?: any;
  footnote?: string;
}

const fmtVal = (v: unknown, unit?: string) => {
  const n = typeof v === "number" ? v : parseFloat(String(v));
  if (!isFinite(n)) return String(v ?? "");
  const s = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 }).format(n);
  return unit === "€" ? `€ ${s}` : unit ? `${s} ${unit}` : s;
};

function DeltaChip({ delta, trend }: { delta?: number; trend?: Stat["trend"] }) {
  const dir = trend || (typeof delta === "number" ? (delta > 0 ? "up" : delta < 0 ? "down" : "flat") : undefined);
  if (!dir) return null;
  const Icon = dir === "up" ? TrendingUp : dir === "down" ? TrendingDown : Minus;
  const cls = dir === "up" ? "text-emerald-600 bg-emerald-50" : dir === "down" ? "text-red-600 bg-red-50" : "text-slate-500 bg-slate-100";
  return (
    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold ${cls}`}>
      <Icon className="h-3 w-3" />
      {typeof delta === "number" ? `${delta > 0 ? "+" : ""}${delta}%` : ""}
    </span>
  );
}

export default function SilvioInfographicBlock({ spec }: { spec: InfographicSpec }) {
  if (!spec || (!spec.stats?.length && !spec.chart)) {
    return <div className="my-2 px-3 py-4 rounded-md border border-dashed border-slate-300 bg-slate-50 text-xs text-slate-500 text-center">Infografica non disponibile (dati mancanti).</div>;
  }
  const accent = spec.accent || "#F97316";
  const stats = spec.stats || [];
  return (
    <figure className="my-3 rounded-xl border border-slate-200 overflow-hidden bg-white">
      {(spec.title || spec.subtitle) && (
        <div className="px-4 py-2.5 text-white" style={{ background: `linear-gradient(135deg, ${accent}, ${accent}cc)` }}>
          {spec.title && <div className="text-sm font-bold leading-tight">{spec.title}</div>}
          {spec.subtitle && <div className="text-[11px] opacity-90">{spec.subtitle}</div>}
        </div>
      )}
      {stats.length > 0 && (
        <div className={`grid gap-px bg-slate-100 ${stats.length >= 4 ? "grid-cols-2 sm:grid-cols-4" : stats.length === 3 ? "grid-cols-3" : stats.length === 2 ? "grid-cols-2" : "grid-cols-1"}`}>
          {stats.map((s, i) => (
            <div key={i} className="bg-white px-3 py-2.5">
              <div className="text-[10px] uppercase tracking-wide text-slate-500 truncate">{s.label}</div>
              <div className="flex items-baseline gap-1.5 mt-0.5 flex-wrap">
                <span className="text-lg font-bold text-slate-900 tabular-nums">{fmtVal(s.value, s.unit)}</span>
                <DeltaChip delta={s.delta} trend={s.trend} />
              </div>
              {s.hint && <div className="text-[10px] text-slate-400 mt-0.5 truncate">{s.hint}</div>}
            </div>
          ))}
        </div>
      )}
      {spec.chart && (
        <div className="px-3 pb-1">
          <Suspense fallback={<div className="my-2 h-[200px] rounded-lg bg-slate-50 animate-pulse" />}>
            <SilvioChartBlock spec={spec.chart} />
          </Suspense>
        </div>
      )}
      {spec.footnote && <figcaption className="px-4 py-1.5 text-[10px] text-slate-400 border-t border-slate-100">{spec.footnote}</figcaption>}
    </figure>
  );
}
