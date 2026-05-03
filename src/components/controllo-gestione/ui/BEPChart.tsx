import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { useCEMensile } from "@/hooks/controlloGestione/useCEriclassificato";
import { formatCurrency, formatCurrencyCompact } from "@/lib/formatters";
import { ChartSkeleton } from "@/components/controllo-gestione/skeletons/ChartSkeleton";
import { ErrorBlock } from "@/components/controllo-gestione/ui/ErrorBlock";
import { EmptyState } from "@/components/controllo-gestione/ui/EmptyState";

interface BEPChartProps {
  anno: number;
}

const MESI_BREVI = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];

export function BEPChart({ anno }: BEPChartProps) {
  const { data, isLoading, isError, refetch } = useCEMensile(anno);

  if (isLoading) return <ChartSkeleton />;
  if (isError) return <ErrorBlock onRetry={() => refetch()} />;
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
