import { memo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, Cell } from "recharts";
import type { FinanceData } from "@/hooks/useCruscottoData";
import { safeNumber } from "@/lib/numberUtils";
import { fmtCur } from "@/components/marketing/dashboard/utils";
import { cn } from "@/lib/utils";

interface Props { finance: FinanceData; isLoading: boolean; dataError?: unknown }

/**
 * Le scadenze del mese: rate da incassare, costi da pagare, la differenza.
 *
 * Fino all'08/11/2026 il riquadro aveva tredici voci. Le altre stavano già
 * altrove nel Cruscotto con un nome diverso, e due cifre simili con due nomi
 * fanno pensare a due problemi: gli incassi registrati del mese (in cima),
 * gli arretrati (lo scaduto, in cima e per età), i residui su tutte le
 * scadenze (gli incassi attesi a 30/60/90 giorni), il margine del periodo
 * (Commesse e margini) e i giorni di copertura, calcolati qui in un secondo
 * modo accanto a «I numeri che comandano».
 */
export const FinanzaCashFlow = memo(function FinanzaCashFlow({ finance, isLoading, dataError }: Props) {
  const rows = [
    { name: "Rate attese", value: safeNumber(finance.thisMonthIncome), fill: "hsl(142, 76%, 36%)" },
    { name: "Costi aperti", value: safeNumber(finance.thisMonthOutflow), fill: "hsl(0, 84%, 60%)" },
    { name: "Differenza", value: safeNumber(finance.cashFlowNet), fill: finance.cashFlowNet >= 0 ? "hsl(142, 76%, 36%)" : "hsl(0, 84%, 60%)" },
  ];
  if (dataError) return <div role="alert" className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive">Dati finanziari non disponibili. Usa Riprova nell’avviso in alto per ricaricarli.</div>;
  return (
    <div className="grid grid-cols-1 items-start gap-3 xl:grid-cols-2">
      <div className="xl:col-span-2">
        <h3 className="text-sm font-semibold text-muted-foreground">Scadenze aperte · mese corrente</h3>
        <p className="text-xs text-muted-foreground">Rate e costi ancora da regolare nel mese. La differenza non è il saldo di cassa. Rate IVA inclusa; costi con l’IVA registrata.</p>
      </div>
      <Card className="min-w-0">
        <CardHeader className="p-3 pb-2"><CardTitle className="text-base">Previsione sulle scadenze del mese</CardTitle></CardHeader>
        <CardContent className="p-3 pt-0 space-y-3">
          {isLoading ? <Skeleton className="h-28 w-full" /> : <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Metric label="Rate commesse da incassare" value={fmtCur(finance.thisMonthIncome)} />
              <Metric label="Costi da pagare" value={fmtCur(finance.thisMonthOutflow)} />
              <Metric label="Differenza prevista" value={fmtCur(finance.cashFlowNet)} tone={finance.cashFlowNet < 0 ? "text-destructive" : "text-emerald-600"} />
            </div>
            {!!finance.costsMissingVatCount && <p className="text-xs text-amber-700">{finance.costsMissingVatCount} costi aperti senza aliquota IVA: è incluso l’importo registrato, da verificare.</p>}
          </>}
        </CardContent>
      </Card>
      <div className="min-w-0 space-y-3">
        <Card>
          <CardHeader className="p-3 pb-2"><CardTitle className="text-base">Rate attese e costi aperti · mese</CardTitle></CardHeader>
          <CardContent className="p-3 pt-0">
            {isLoading ? <Skeleton className="h-44 w-full" /> : <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={rows} margin={{top:5,right:5,left:0,bottom:5}}>
                  <XAxis dataKey="name" tick={{fontSize:11}} />
                  <YAxis tickFormatter={v => fmtCur(v)} tick={{fontSize:10}} width={80} />
                  <RechartsTooltip cursor={{fill:"rgba(15,23,42,0.04)"}} formatter={(v: number) => fmtCur(v)} contentStyle={{fontSize:12}} />
                  <Bar dataKey="value" name="Importo" radius={[4,4,0,0]}>{rows.map(row => <Cell key={row.name} fill={row.fill}/>)}</Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
});

function Metric({label,value,tone}:{label:string;value:string;tone?:string}) {
  return <div className="min-w-0"><p className="text-xs leading-snug text-muted-foreground">{label}</p><p className={cn("mt-0.5 break-words text-sm font-semibold tabular-nums sm:text-base",tone)}>{value}</p></div>;
}
