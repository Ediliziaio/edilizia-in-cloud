import { memo, useId } from "react";
import { usePreferisceMenoMovimento } from "@/hooks/usePreferisceMenoMovimento";
import { COLORI_GRAFICO, TESTO_ASSE, TooltipScheda, defsGrafico, idSvg } from "@/components/charts/grafici/comune";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, Cell, ReferenceLine } from "recharts";
import type { FinanceData } from "@/hooks/useCruscottoData";
import { safeNumber } from "@/lib/numberUtils";
import { fmtCur } from "@/components/marketing/dashboard/utils";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

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
  const t = useT();
  const id = idSvg(useId());
  const fermo = usePreferisceMenoMovimento();
  const rows = [
    { name: "Rate attese", value: safeNumber(finance.thisMonthIncome), fill: `url(#${id}-barra-verde)` },
    { name: "Costi aperti", value: safeNumber(finance.thisMonthOutflow), fill: `url(#${id}-barra-rosso)` },
    { name: "Differenza", value: safeNumber(finance.cashFlowNet), fill: `url(#${id}-barra-${finance.cashFlowNet >= 0 ? "verde" : "rosso"})` },
  ];
  if (dataError) return <div role="alert" className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive">{t("Dati finanziari non disponibili. Usa Riprova nell’avviso in alto per ricaricarli.")}</div>;
  return (
    <div className="grid grid-cols-1 items-start gap-3 xl:grid-cols-2">
      <div className="xl:col-span-2">
        <h3 className="text-sm font-semibold text-muted-foreground">{t("Scadenze aperte · mese corrente")}</h3>
        <p className="text-xs text-muted-foreground">{t("Rate e costi ancora da regolare nel mese. La differenza non è il saldo di cassa. Rate IVA inclusa; costi con l’IVA registrata.")}</p>
      </div>
      <Card className="min-w-0">
        <CardHeader className="p-3 pb-2"><CardTitle className="text-base">{t("Previsione sulle scadenze del mese")}</CardTitle></CardHeader>
        <CardContent className="p-3 pt-0 space-y-3">
          {isLoading ? <Skeleton className="h-28 w-full" /> : <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Metric label={t("Rate commesse da incassare")} value={fmtCur(finance.thisMonthIncome)} />
              <Metric label={t("Costi da pagare")} value={fmtCur(finance.thisMonthOutflow)} />
              <Metric label={t("Differenza prevista")} value={fmtCur(finance.cashFlowNet)} tone={finance.cashFlowNet < 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"} />
            </div>
            {!!finance.costsMissingVatCount && <p className="text-xs text-amber-700">{t("{costsMissingVatCount} costi aperti senza aliquota IVA: è incluso l’importo registrato, da verificare.", { costsMissingVatCount: String(finance.costsMissingVatCount ?? "") })}</p>}
          </>}
        </CardContent>
      </Card>
      <div className="min-w-0 space-y-3">
        <Card>
          <CardHeader className="p-3 pb-2"><CardTitle className="text-base">{t("Rate attese e costi aperti · mese")}</CardTitle></CardHeader>
          <CardContent className="p-3 pt-0">
            {isLoading ? <Skeleton className="h-44 w-full" /> : <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={rows} margin={{top:5,right:5,left:0,bottom:5}} barCategoryGap="30%">
                  {defsGrafico(id, { verde: COLORI_GRAFICO.verde, rosso: COLORI_GRAFICO.rosso })}
                  <CartesianGrid fill={`url(#${id}-punti)`} vertical={false} stroke="hsl(var(--border))" strokeDasharray="4 6" />
                  <XAxis dataKey="name" tick={TESTO_ASSE} axisLine={false} tickLine={false} tickMargin={6} tickFormatter={(v: string) => t(v)} />
                  <YAxis tickFormatter={v => fmtCur(v)} tick={TESTO_ASSE} axisLine={false} tickLine={false} width={80} />
                  <ReferenceLine y={0} stroke="hsl(var(--border))" />
                  <RechartsTooltip
                    cursor={{ fill: "hsl(var(--muted))", fillOpacity: 0.5 }}
                    content={(p) => <TooltipScheda active={p.active} payload={(p.payload ?? []).map((x) => ({ ...x, color: (x.payload as { name?: string } | undefined)?.name === "Costi aperti" || ((x.payload as { name?: string } | undefined)?.name === "Differenza" && finance.cashFlowNet < 0) ? COLORI_GRAFICO.rosso : COLORI_GRAFICO.verde })) as never} label={typeof p.label === "string" ? t(p.label) : p.label} formato={(v) => fmtCur(v)} />}
                  />
                  <Bar dataKey="value" name={t("Importo")} radius={[6,6,2,2]} maxBarSize={64} isAnimationActive={!fermo} animationDuration={800}>{rows.map(row => <Cell key={row.name} fill={row.fill}/>)}</Bar>
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
