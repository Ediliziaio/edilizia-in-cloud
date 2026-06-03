/**
 * SilvioChartBlock — rende un grafico dentro la chat di Silvio a partire da
 * uno "spec" JSON che l'AI emette in un blocco ```chart```.
 *
 * Spec supportato (semplice e tollerante):
 * {
 *   "type": "bar" | "line" | "area" | "pie" | "donut",
 *   "title": "Fatturato per mese (€)",
 *   "xKey": "mese",                                  // default "label"
 *   "series": [{ "name":"Fatturato", "key":"valore", "color":"#F97316" }],
 *   "data": [{ "mese":"Gen", "valore":12000 }, ...],
 *   "unit": "€"                                       // opzionale, per tooltip
 * }
 * Shorthand singola serie / pie:
 *   { "type":"pie", "title":"…", "data":[{ "label":"A", "value":40 }, …] }
 *
 * Caricato in lazy da ChatMarkdown → recharts entra nel bundle solo quando
 * un grafico viene davvero mostrato.
 */
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, AreaChart, Area,
  PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";

const PALETTE = [
  "#F97316", "#2563EB", "#16A34A", "#7C3AED", "#DB2777",
  "#0891B2", "#CA8A04", "#DC2626", "#0EA5E9", "#64748B",
];

interface Serie { name: string; key: string; color?: string }
export interface ChartSpec {
  type?: "bar" | "line" | "area" | "pie" | "donut";
  title?: string;
  xKey?: string;
  valueKey?: string;
  series?: Serie[];
  data?: Array<Record<string, unknown>>;
  unit?: string;
}

const fmt = (v: unknown, unit?: string) => {
  const n = typeof v === "number" ? v : parseFloat(String(v));
  if (!isFinite(n)) return String(v ?? "");
  const s = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 }).format(n);
  return unit === "€" ? `€ ${s}` : unit ? `${s} ${unit}` : s;
};

function Empty({ msg }: { msg: string }) {
  return <div className="my-2 px-3 py-4 rounded-md border border-dashed border-slate-300 bg-slate-50 text-xs text-slate-500 text-center">{msg}</div>;
}

export default function SilvioChartBlock({ spec }: { spec: ChartSpec }) {
  if (!spec || !Array.isArray(spec.data) || spec.data.length === 0) {
    return <Empty msg="Grafico non disponibile (dati mancanti)." />;
  }
  const type = spec.type || "bar";
  const xKey = spec.xKey || "label";
  const unit = spec.unit;
  const series: Serie[] = (spec.series && spec.series.length)
    ? spec.series
    : [{ name: spec.title || "Valore", key: spec.valueKey || "value" }];
  const color = (i: number, s?: Serie) => s?.color || PALETTE[i % PALETTE.length];
  const data = spec.data as Array<Record<string, number | string>>;

  const tooltip = (
    <Tooltip
      formatter={(v: unknown, name: string) => [fmt(v, unit), name]}
      contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
    />
  );
  const axes = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
      <XAxis dataKey={xKey} tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={{ stroke: "#e2e8f0" }} />
      <YAxis tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} width={48}
        tickFormatter={(v) => fmt(v, unit)} />
    </>
  );

  return (
    <figure className="my-3 rounded-lg border border-slate-200 bg-white p-3">
      {spec.title && <figcaption className="text-xs font-semibold text-slate-700 mb-2">{spec.title}</figcaption>}
      <div style={{ width: "100%", height: 240 }}>
        <ResponsiveContainer width="100%" height="100%">
          {type === "pie" || type === "donut" ? (
            <PieChart>
              {tooltip}
              <Pie
                data={data}
                dataKey={series[0].key}
                nameKey={xKey}
                cx="50%" cy="50%"
                innerRadius={type === "donut" ? 50 : 0}
                outerRadius={85}
                label={(e: { name?: string; value?: number }) => e.name ?? ""}
                labelLine={false}
              >
                {data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
              </Pie>
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          ) : type === "line" ? (
            <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              {axes}{tooltip}
              {series.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
              {series.map((s, i) => (
                <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={color(i, s)} strokeWidth={2} dot={false} />
              ))}
            </LineChart>
          ) : type === "area" ? (
            <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              {axes}{tooltip}
              {series.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
              {series.map((s, i) => (
                <Area key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={color(i, s)} fill={color(i, s)} fillOpacity={0.18} strokeWidth={2} />
              ))}
            </AreaChart>
          ) : (
            <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              {axes}{tooltip}
              {series.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
              {series.map((s, i) => (
                <Bar key={s.key} dataKey={s.key} name={s.name} fill={color(i, s)} radius={[4, 4, 0, 0]} />
              ))}
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
