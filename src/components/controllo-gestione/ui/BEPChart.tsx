import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { useMemo } from "react";
import { useCEMensile, useCEMensileDettaglio } from "@/hooks/controlloGestione/useCEriclassificato";
import { formatCurrency, formatCurrencyCompact } from "@/lib/formatters";
import { ChartSkeleton } from "@/components/controllo-gestione/skeletons/ChartSkeleton";
import { ErrorBlock } from "@/components/controllo-gestione/ui/ErrorBlock";
import { EmptyState } from "@/components/controllo-gestione/ui/EmptyState";

interface BEPChartProps {
  anno: number;
}

const MESI_BREVI = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];
const COSTO_CODES = ["03", "04", "05", "06", "07", "08", "09", "10", "11", "14", "15"];

export function BEPChart({ anno }: BEPChartProps) {
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
        bep_cum: null,
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
        title="Nessun dato mensile"
        description={`Non ho registrazioni per il ${anno}. Verifica le scritture in Prima Nota.`}
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
        <ComposedChart data={chartData} margin={{ top: 16, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="mese" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => formatCurrencyCompact(v)} />
          <Tooltip
            formatter={(value: number) => formatCurrency(value)}
            labelClassName="text-xs"
            contentStyle={{ borderRadius: 8, fontSize: 12 }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="ricavi_cum" name="Ricavi cumulati" fill="hsl(210, 90%, 55%)" radius={[4, 4, 0, 0]} />
          <Line
            type="monotone"
            dataKey="costi_totali_cum"
            name="Costi cumulati"
            stroke="hsl(25, 95%, 55%)"
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="bep_cum"
            name="Soglia BEP"
            stroke="hsl(142, 70%, 40%)"
            strokeWidth={2}
            strokeDasharray="6 4"
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
