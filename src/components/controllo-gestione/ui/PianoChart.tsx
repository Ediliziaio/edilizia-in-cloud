import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid,
} from "recharts";
import type { PianoPeriodo } from "@/hooks/controlloGestione/usePianoIndustriale";
import { formatCurrency, formatCurrencyCompact } from "@/lib/formatters";

interface PianoChartProps {
  periodi: PianoPeriodo[];
}

export function PianoChart({ periodi }: PianoChartProps) {
  const data = periodi.map((p) => ({
    anno: String(p.anno),
    ricavi: p.ricavi,
    ebitda: p.ebitda,
    utile: p.utile,
    rating: p.rating_score ?? null,
  }));

  return (
    <div className="h-[360px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 16, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="anno" tick={{ fontSize: 12 }} />
          <YAxis
            yAxisId="left"
            tick={{ fontSize: 11 }}
            tickFormatter={(v: number) => formatCurrencyCompact(v)}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            domain={[0, 100]}
            tick={{ fontSize: 11 }}
          />
          <Tooltip
            formatter={(value: number, name: string) => {
              if (name === "Rating") return [`${Math.round(value)} / 100`, name];
              return [formatCurrency(value), name];
            }}
            contentStyle={{ borderRadius: 8, fontSize: 12 }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar yAxisId="left" dataKey="ricavi" name="Ricavi" fill="hsl(210, 90%, 55%)" radius={[4, 4, 0, 0]} />
          <Line yAxisId="left" type="monotone" dataKey="ebitda" name="EBITDA"
            stroke="hsl(25, 95%, 55%)" strokeWidth={2} dot={{ r: 3 }} />
          <Line yAxisId="left" type="monotone" dataKey="utile" name="Utile"
            stroke="hsl(142, 70%, 40%)" strokeWidth={2} dot={{ r: 3 }} />
          <Line yAxisId="right" type="monotone" dataKey="rating" name="Rating"
            stroke="hsl(280, 70%, 55%)" strokeWidth={2} strokeDasharray="4 4" dot={{ r: 3 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
