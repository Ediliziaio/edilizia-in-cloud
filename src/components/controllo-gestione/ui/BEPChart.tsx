import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { useId, useMemo } from "react";
import { usePreferisceMenoMovimento } from "@/hooks/usePreferisceMenoMovimento";
import {
  COLORI_GRAFICO, TESTO_ASSE, TooltipScheda, defsGrafico, testoLegenda, euroAsse, idSvg,
} from "@/components/charts/grafici/comune";
import { useCEMensile, useCEMensileDettaglio } from "@/hooks/controlloGestione/useCEriclassificato";
import { ChartSkeleton } from "@/components/controllo-gestione/skeletons/ChartSkeleton";
import { ErrorBlock } from "@/components/controllo-gestione/ui/ErrorBlock";
import { EmptyState } from "@/components/controllo-gestione/ui/EmptyState";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

interface BEPChartProps {
  anno: number;
}

const MESI_BREVI = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];
const COSTO_CODES = ["03", "04", "05", "06", "07", "08", "09", "10", "11", "14", "15"];

export function BEPChart({ anno }: BEPChartProps) {
  const t = useT();
  const id = idSvg(useId());
  const fermo = usePreferisceMenoMovimento();
  const primary = useCEMensile(anno);
  const fallback = useCEMensileDettaglio(anno);

  const fallbackData = useMemo(() => {
    if (!fallback.data?.mesi?.length) return [];
    let ricaviCum = 0;
    let costiCum = 0;
    return fallback.data.mesi.map((mese) => {
      const getValue = (codice: string) =>
        mese.voci.find((voce) => voce.codice === codice)?.valore ?? 0;
      ricaviCum += getValue("01");
      costiCum += COSTO_CODES.reduce((acc, codice) => acc + getValue(codice), 0);
      return {
        mese: mese.mese,
        ricavi_cum: ricaviCum,
        costi_totali_cum: costiCum,
        bep_cum: null as null,
      };
    });
  }, [fallback.data]);

  const data = primary.data?.length ? primary.data : fallbackData;
  const isLoading = primary.isLoading && fallback.isLoading;
  const isError = primary.isError && fallback.isError;

  if (isLoading) return <ChartSkeleton />;
  if (isError) {
    return (
      <ErrorBlock
        onRetry={() => {
          void primary.refetch();
          void fallback.refetch();
        }}
      />
    );
  }
  if (!data || data.length === 0) {
    return (
      <EmptyState
        title={t("Nessun dato mensile")}
        description={t("Non ho registrazioni per il {anno}. Verifica le scritture in Prima Nota.", { anno: String(anno ?? "") })}
      />
    );
  }

  const chartData = data.map((r) => ({
    mese: MESI_BREVI[r.mese - 1] ?? String(r.mese),
    ricavi_cum: r.ricavi_cum,
    costi_totali_cum: r.costi_totali_cum,
    bep_cum: r.bep_cum,
  }));

  return (
    <div className="h-[360px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData} margin={{ top: 16, right: 12, bottom: 4, left: 0 }} barCategoryGap="22%">
          {defsGrafico(id, { ricavi: COLORI_GRAFICO.blu })}
          <CartesianGrid fill={`url(#${id}-punti)`} vertical={false} stroke="hsl(var(--border))" strokeDasharray="4 6" />
          <XAxis dataKey="mese" tick={TESTO_ASSE} axisLine={false} tickLine={false} tickMargin={8} />
          <YAxis tick={TESTO_ASSE} axisLine={false} tickLine={false} width={64} tickFormatter={euroAsse} />
          <Tooltip
            cursor={{ fill: "hsl(var(--muted))", fillOpacity: 0.5 }}
            content={(p) => <TooltipScheda active={p.active} payload={p.payload as never} label={p.label} />}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} formatter={testoLegenda} />
          <Bar
            dataKey="ricavi_cum"
            name={t("Ricavi cumulati")}
            fill={`url(#${id}-barra-ricavi)`}
            radius={[6, 6, 2, 2]}
            maxBarSize={40}
            isAnimationActive={!fermo}
            animationDuration={800}
          />
          <Line
            type="monotone"
            dataKey="costi_totali_cum"
            name={t("Costi cumulati")}
            stroke={COLORI_GRAFICO.arancio}
            strokeWidth={2.5}
            filter={`url(#${id}-ombra)`}
            dot={false}
            activeDot={{ r: 5, strokeWidth: 2, stroke: "hsl(var(--background))", fill: COLORI_GRAFICO.arancio }}
            isAnimationActive={!fermo}
            animationDuration={900}
            animationBegin={200}
          />
          <Line
            type="monotone"
            dataKey="bep_cum"
            name={t("Soglia BEP")}
            stroke={COLORI_GRAFICO.verde}
            strokeWidth={2}
            strokeDasharray="6 4"
            dot={false}
            isAnimationActive={!fermo}
            animationDuration={900}
            animationBegin={350}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
