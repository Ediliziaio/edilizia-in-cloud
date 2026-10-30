import { memo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, Cell } from "recharts";
import type { FinanceData } from "@/hooks/useCruscottoData";
import { usePrimaNota } from "@/hooks/usePrimaNota";
import { useMarginData } from "@/hooks/useMarginData";
import { safeNumber } from "@/lib/numberUtils";
import { fmtCur } from "@/components/marketing/dashboard/utils";
import { valutaCopertura } from "@/lib/indicatoriGuida";
import { cn } from "@/lib/utils";

interface Props { finance: FinanceData; isLoading: boolean; dataError?: unknown }

export const FinanzaCashFlow = memo(function FinanzaCashFlow({ finance, isLoading, dataError }: Props) {
  const { saldo, isSaldoLoading, saldoError } = usePrimaNota();
  const margin = useMarginData();
  const dailyFixedCosts = margin.totalFixedCostsMonthly / 30;
  const hasCash = !saldoError && !!saldo && saldo.entry_count > 0;
  const coverage = valutaCopertura(saldo?.saldo ?? 0, hasCash, margin.isError ? 0 : margin.totalFixedCostsMonthly).valore;
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
            <div className="grid grid-cols-2 gap-3">
              <Metric label="Rate commesse da incassare" value={fmtCur(finance.thisMonthIncome)} />
              <Metric label="Costi da pagare" value={fmtCur(finance.thisMonthOutflow)} />
              <Metric label="Differenza prevista" value={fmtCur(finance.cashFlowNet)} tone={finance.cashFlowNet < 0 ? "text-destructive" : "text-emerald-600"} />
              <Metric label="Incassi commesse registrati nel mese" value={finance.collectedThisMonth == null ? "—" : fmtCur(finance.collectedThisMonth)} />
            </div>
            {!!finance.costsMissingVatCount && <p className="text-xs text-amber-700">{finance.costsMissingVatCount} costi aperti senza aliquota IVA: è incluso l’importo registrato, da verificare.</p>}
            {!!finance.collectedUndatedCount && <p className="text-xs text-amber-700">{finance.collectedUndatedCount} rate segnate come pagate senza data: non sono attribuite al mese.</p>}
            <div className="grid grid-cols-2 gap-3 border-t pt-2">
              <Metric label="Arretrati precedenti · da incassare" value={fmtCur(finance.priorReceivables ?? 0)} />
              <Metric label="Arretrati precedenti · da pagare" value={fmtCur(finance.priorPayables ?? 0)} />
            </div>
            <div className="grid grid-cols-2 gap-3 border-t pt-2">
              <Metric label="Residuo commesse · tutte le scadenze" value={fmtCur(finance.pendingRevenue)} />
              <Metric label="Costi aperti · tutte le scadenze" value={fmtCur(finance.supplierDebt)} />
            </div>
            <p className="text-xs text-muted-foreground">
              Margine commesse nel periodo selezionato:{" "}
              <strong className="text-foreground">{finance.marginOrdersWithCosts === 0 ? "—" : `${safeNumber(finance.marginThisMonth).toFixed(1)}%`}</strong>
              {!!finance.marginOrdersWithCosts && ` su ${finance.marginOrdersWithCosts} ${finance.marginOrdersWithCosts === 1 ? "commessa" : "commesse"} con costi`}
              {!!finance.marginOrdersWithoutCosts && ` · ${finance.marginOrdersWithoutCosts} senza costi registrati, escluse`}
            </p>
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
        <div className="rounded-lg border bg-muted/20 p-3">
          <div className="grid grid-cols-2 gap-3">
            <Metric label="Costi fissi medi / giorno" value={margin.isLoading ? "…" : margin.isError ? "—" : fmtCur(dailyFixedCosts)} />
            <Metric label="Copertura dal saldo registrato" value={isSaldoLoading || margin.isLoading ? "…" : coverage == null ? "Non disponibile" : coverage === 0 ? "Nessuna copertura" : `${coverage} giorni`} tone={coverage === 0 ? "text-destructive" : undefined} />
          </div>
          <details className="mt-2 text-xs text-muted-foreground">
            <summary className="cursor-pointer py-1">Come si calcola la copertura</summary>
            <p className="mt-1">Saldo Prima Nota {hasCash ? fmtCur(saldo.saldo) : "non disponibile"} ÷ costi fissi medi giornalieri (costi fissi mensili ÷ 30). Gli incassi previsti non entrano nel saldo registrato. Un saldo negativo non copre ulteriori giorni; senza movimenti o costi fissi valutabili il dato resta non disponibile.</p>
          </details>
        </div>
      </div>
    </div>
  );
});

function Metric({label,value,tone}:{label:string;value:string;tone?:string}) {
  return <div className="min-w-0"><p className="text-xs leading-snug text-muted-foreground">{label}</p><p className={cn("mt-0.5 break-words text-sm font-semibold tabular-nums sm:text-base",tone)}>{value}</p></div>;
}
