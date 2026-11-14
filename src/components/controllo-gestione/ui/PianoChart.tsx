import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid,
} from "recharts";
import type { PianoPeriodo } from "@/hooks/controlloGestione/usePianoIndustriale";
import { formatCurrency } from "@/lib/formatters";
import { formatEuroBreve } from "@/lib/controlloGestione/indiciBanca";
import { useId } from "react";
import { usePreferisceMenoMovimento } from "@/hooks/usePreferisceMenoMovimento";
import { COLORI_GRAFICO, TESTO_ASSE, TooltipScheda, defsGrafico, testoLegenda, idSvg } from "@/components/controllo-gestione/ui/grafici/comune";

interface PianoChartProps {
  periodi: PianoPeriodo[];
}

export function PianoChart({ periodi }: PianoChartProps) {
  const id = idSvg(useId());
  const fermo = usePreferisceMenoMovimento();
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
        <ComposedChart data={data} margin={{ top: 16, right: 12, bottom: 4, left: 0 }} barCategoryGap="28%">
          {defsGrafico(id, { ricavi: COLORI_GRAFICO.blu })}
          <CartesianGrid yAxisId="left" fill={`url(#${id}-punti)`} vertical={false} stroke="hsl(var(--border))" strokeDasharray="4 6" />
          <XAxis dataKey="anno" tick={TESTO_ASSE} axisLine={false} tickLine={false} tickMargin={8} />
          <YAxis
            yAxisId="left"
            tick={TESTO_ASSE}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => formatEuroBreve(v)}
            width={84}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            domain={[0, 100]}
            tick={TESTO_ASSE}
            axisLine={false}
            tickLine={false}
            width={32}
          />
          <Tooltip
            cursor={{ fill: "hsl(var(--muted))", fillOpacity: 0.5 }}
            content={(p) => (
              <TooltipScheda
                active={p.active}
                payload={p.payload as never}
                label={p.label}
                formato={(v, nome) => (nome === "Rating (punti su 100)" ? `${Math.round(v)} su 100` : formatCurrency(v))}
              />
            )}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} formatter={testoLegenda} />
          <Bar yAxisId="left" dataKey="ricavi" name="Ricavi" fill={`url(#${id}-barra-ricavi)`} radius={[6, 6, 2, 2]}
            maxBarSize={48} isAnimationActive={!fermo} animationDuration={800} />
          <Line yAxisId="left" type="monotone" dataKey="ebitda" name="Margine operativo lordo"
            stroke={COLORI_GRAFICO.arancio} strokeWidth={2.5} filter={`url(#${id}-ombra)`}
            dot={{ r: 3, strokeWidth: 0, fill: COLORI_GRAFICO.arancio }} isAnimationActive={!fermo} animationDuration={900} animationBegin={150} />
          <Line yAxisId="left" type="monotone" dataKey="utile" name="Utile netto"
            stroke={COLORI_GRAFICO.verde} strokeWidth={2.5} filter={`url(#${id}-ombra)`}
            dot={{ r: 3, strokeWidth: 0, fill: COLORI_GRAFICO.verde }} isAnimationActive={!fermo} animationDuration={900} animationBegin={300} />
          <Line yAxisId="right" type="monotone" dataKey="rating" name="Rating (punti su 100)"
            stroke={COLORI_GRAFICO.viola} strokeWidth={2} strokeDasharray="4 4"
            dot={{ r: 3, strokeWidth: 0, fill: COLORI_GRAFICO.viola }} isAnimationActive={!fermo} animationDuration={900} animationBegin={450} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
