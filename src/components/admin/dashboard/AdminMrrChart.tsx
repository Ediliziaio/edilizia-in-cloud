import { memo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatCurrencyCompact } from "@/lib/formatters";
import { TrendingUp } from "lucide-react";
import { BrandTrendChart } from "@/components/admin/BrandTrendChart";

interface MrrChartData {
  month: string;
  mrr: number;
  nuove: number;
}

interface Props {
  data: MrrChartData[];
  currentMrr: number;
}

// Palette brand: blu (MRR, barre) + arancione (nuove aziende, linea su asse destro).
const C_MRR = "hsl(217 91% 60%)";
const C_NEW = "hsl(24 95% 53%)";

/**
 * Memo: dashboard admin re-renderizza al cambio filtro/periodo, ma
 * quando `data` e `currentMrr` restano invariati (array ref stabile)
 * evitiamo il re-compute recharts + re-render dell'intera chart.
 */
function AdminMrrChartImpl({ data, currentMrr }: Props) {
  const arr = currentMrr * 12;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-emerald-600" />
            <CardTitle className="text-base">MRR Pagante Trend</CardTitle>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">MRR pagante: </span>
              <span className="font-semibold">{formatCurrency(currentMrr)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">ARR: </span>
              <span className="font-semibold">{formatCurrency(arr)}</span>
            </div>
          </div>
        </div>
        <div className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: C_MRR }} /> MRR pagante</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: C_NEW }} /> Nuove aziende</span>
        </div>
      </CardHeader>
      <CardContent>
        {data.length > 0 ? (
          <BrandTrendChart
            data={data}
            xKey="month"
            height={260}
            bars={[{ key: "mrr", name: "MRR pagante", color: C_MRR }]}
            line={{ key: "nuove", name: "Nuove aziende", color: C_NEW, rightAxis: true }}
            yFormatter={(v) => formatCurrencyCompact(v)}
            rightFormatter={(v) => String(Math.round(v))}
            valueFormatter={(v, name) => (name === "Nuove aziende" ? String(Math.round(v)) : formatCurrency(v))}
          />
        ) : (
          <div className="flex items-center justify-center h-[260px] text-muted-foreground text-sm">
            Dati insufficienti per il grafico
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export const AdminMrrChart = memo(AdminMrrChartImpl);
