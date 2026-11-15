import { useId, useState } from "react";
import { COLORI_GRAFICO, TESTO_ASSE, defsGrafico, idSvg } from "@/components/charts/grafici/comune";
import { usePreferisceMenoMovimento } from "@/hooks/usePreferisceMenoMovimento";
import { Clock, Calculator, TrendingUp, ArrowUpDown, Eye, BarChart3, AlertTriangle, CheckCircle2, Target, WalletCards } from "lucide-react";
import { NavyStatCard } from "@/components/costi/KpiCard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Ciambella } from "@/components/charts/grafici/Ciambella";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency, formatCurrencyCompact } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type { BreakEvenData } from "@/hooks/useCompanyCostsData";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
  Cell, ComposedChart, Area, Line,
} from "recharts";
import type { StatusTabFilter } from "@/hooks/useCompanyCostsData";

interface YearlyStats {
  total: number;
  totalPaid: number;
  totalUnpaid: number;
  totalOverdue: number;
  pctPaid: number;
  count: number;
  // Dettaglio year-scoped: TUTTE le card "Situazione anno" leggono da qui,
  // così pagato ≤ totale e scaduti coerenti nella stessa schermata.
  paidCount: number;
  totalPrevisti: number;
  previstiCount: number;
  overdueCount: number;
  totalExpiringSoon: number;
  expiringSoonCount: number;
  vatYear: number;
  vatYearUnpaid: number;
}

interface MonthlyDistItem {
  month: string;
  monthKey: string;
  Fissi: number;
  Variabili: number;
  PagatoEffettivo: number;
  Totale: number;
  Previsto: number;
  Sostenuto: number;
  isCurrent: boolean;
}

interface CostsStatsCardsProps {
  /** Rate mensili dei finanziamenti attivi (cg_loans): secondo pareggio. */
  rateFinanziamenti?: number;
  /** Dati per il capitale circolante (cap. 26): acconti medi e ciclo reale. */
  circolante?: { accontiMese: number; mesiCiclo: number; commesse: number } | null;
  /** Uscite medie mensili (fissi + variabili, ultimi mesi con dati). */
  mediaUsciteMensili?: number;
  monthlyDistribution: MonthlyDistItem[];
  yearlyStats: YearlyStats;
  selectedYear: number;
  onYearChange: (year: number) => void;
  activeStatusTab?: StatusTabFilter;
  onStatusTabChange?: (tab: StatusTabFilter) => void;
  categoryDistribution?: { name: string; value: number }[];
  availableYears?: number[];
  fixedCostsTrend?: { month: string; pctFixed: number }[];
  breakEvenData?: BreakEvenData;
  /** Costi senza scadenza: fuori da OGNI totale di periodo, dichiarati qui. */
  senzaScadenza?: { count: number; totale: number };
}

const currentYear = new Date().getFullYear();

const PIE_COLORS = [
  "hsl(217 91% 60%)", "hsl(142 76% 36%)", "hsl(0 84% 60%)",
  "hsl(45 93% 47%)", "hsl(270 67% 58%)", "hsl(200 70% 50%)", "hsl(var(--muted-foreground))",
];

export function CostsStatsCards({ monthlyDistribution, yearlyStats, selectedYear, onYearChange, activeStatusTab, onStatusTabChange, categoryDistribution = [], availableYears = [], fixedCostsTrend = [], breakEvenData, senzaScadenza, rateFinanziamenti = 0, circolante = null, mediaUsciteMensili = 0 }: CostsStatsCardsProps) {
  const idDist = idSvg(useId());
  const fermo = usePreferisceMenoMovimento();
  // Il budget in quattro righe: fissi annui + utile voluto → fatturato
  // obiettivo → commesse al mese. L'utile è una scelta del titolare, non una
  // previsione: si scrive qui e non si salva da nessuna parte.
  const [utileVolutoRaw, setUtileVolutoRaw] = useState("");
  const utileVoluto = (() => {
    const n = Number(utileVolutoRaw.trim().replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) && n > 0 ? n : 0;
  })();
  const [chartView, setChartView] = useState<"current" | "comparison">("current");

  const handleCardClick = (tab: StatusTabFilter) => {
    if (onStatusTabChange) {
      onStatusTabChange(activeStatusTab === tab ? "all" : tab);
    }
  };

  return (
    <>
      {/* Testata navy di famiglia: la situazione dell'anno in quattro card
          in vetro, col selettore anno in chiaro sul blu. */}
      <div className="overflow-hidden rounded-2xl border border-border shadow-sm">
        <div className="bg-eic-navy-deep p-4 text-white sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-eic-amber text-white shadow-[0_8px_18px_rgba(249,115,22,0.28)] sm:h-11 sm:w-11">
                <Target className="h-4 w-4 sm:h-5 sm:w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-orange-100 sm:text-xs">Pianificazione</p>
                <h2 className="mt-0.5 text-base font-semibold text-white sm:text-xl">Situazione {selectedYear}</h2>
              </div>
            </div>
            {availableYears.length > 2 ? (
              <Select value={String(selectedYear)} onValueChange={(v) => onYearChange(Number(v))}>
                <SelectTrigger className="h-9 w-[100px] border-white/20 bg-white/10 text-white [&>svg]:text-white/70">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableYears.map((y) => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  className={selectedYear === currentYear ? "border-white bg-card text-eic-navy-deep hover:bg-white" : "border-white/25 bg-white/10 text-white hover:bg-white/20"}
                  onClick={() => onYearChange(currentYear)}
                >
                  {currentYear}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className={selectedYear === currentYear - 1 ? "border-white bg-card text-eic-navy-deep hover:bg-white" : "border-white/25 bg-white/10 text-white hover:bg-white/20"}
                  onClick={() => onYearChange(currentYear - 1)}
                >
                  {currentYear - 1}
                </Button>
              </div>
            )}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:mt-5 sm:gap-3 xl:grid-cols-4">
            <NavyStatCard
              label={`Totale ${selectedYear}`}
              value={formatCurrency(yearlyStats.total)}
              sub={`${yearlyStats.count} costi · senza IVA`}
              icon={WalletCards}
              tone="text-orange-100"
            />
            <NavyStatCard
              label="Pagato"
              value={formatCurrency(yearlyStats.totalPaid)}
              sub={`${yearlyStats.pctPaid}% del totale · ${yearlyStats.paidCount} pagati`}
              icon={CheckCircle2}
              tone="text-emerald-200"
              onClick={() => handleCardClick("sostenuti")}
              active={activeStatusTab === "sostenuti"}
            />
            <NavyStatCard
              label="Da pagare"
              value={formatCurrency(yearlyStats.totalUnpaid)}
              sub={`${100 - yearlyStats.pctPaid}% rimanente`}
              icon={Clock}
            />
            <NavyStatCard
              label="Scaduti"
              value={formatCurrency(yearlyStats.totalOverdue)}
              sub={`${yearlyStats.overdueCount} da saldare`}
              icon={AlertTriangle}
              tone={yearlyStats.overdueCount > 0 ? "text-orange-300" : "text-emerald-200"}
              onClick={() => handleCardClick("in_ritardo")}
              active={activeStatusTab === "in_ritardo"}
            />
          </div>
        </div>
      </div>

      {/* Card periodo cliccabili. "Sostenuti" e "Da pagare (scaduti)" non ci
          sono più: erano gli stessi numeri di "Pagato" e "Scaduti" qui sopra,
          che ora sono cliccabili loro. Dieci riquadri → otto. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <button
          type="button"
          className={`p-4 rounded-lg border text-left transition-all hover:shadow-md ${activeStatusTab === "previsti" ? "ring-2 ring-blue-500 bg-blue-100 dark:bg-blue-900/20 border-blue-400" : "bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800"}`}
          onClick={() => handleCardClick("previsti")}
        >
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="h-4 w-4 text-blue-600" />
            <span className="text-xs font-medium">Previsti nel {selectedYear}</span>
          </div>
          <p className="text-xl font-bold text-blue-600 tabular-nums">{formatCurrency(yearlyStats.totalPrevisti)}</p>
          <p className="text-[10px] text-muted-foreground">{yearlyStats.previstiCount} da pagare, non scaduti</p>
        </button>

        <button
          type="button"
          className={`p-4 rounded-lg border text-left transition-all hover:shadow-md ${activeStatusTab === "in_scadenza" ? "ring-2 ring-orange-500 bg-orange-100 dark:bg-orange-900/20 border-orange-400" : "bg-orange-50 dark:bg-orange-900/10 border-orange-200 dark:border-orange-800"}`}
          onClick={() => handleCardClick("in_scadenza")}
        >
          <div className="flex items-center gap-2 mb-1">
            <Clock className="h-4 w-4 text-orange-600" />
            <span className="text-xs font-medium">In scadenza (7gg)</span>
          </div>
          <p className="text-xl font-bold text-orange-600 tabular-nums">{formatCurrency(yearlyStats.totalExpiringSoon)}</p>
          <p className="text-[10px] text-muted-foreground">{yearlyStats.expiringSoonCount} in scadenza</p>
        </button>

        <div className="p-4 rounded-lg bg-violet-50 dark:bg-violet-900/10 border border-violet-200 dark:border-violet-800">
          <div className="flex items-center gap-2 mb-1">
            <Calculator className="h-4 w-4 text-violet-600" />
            <span className="text-xs font-medium">IVA detraibile {selectedYear}</span>
          </div>
          <p className="text-xl font-bold text-violet-600 tabular-nums">{formatCurrency(yearlyStats.vatYear)}</p>
          <p className="text-[10px] text-muted-foreground">di cui da pagare: {formatCurrency(yearlyStats.vatYearUnpaid)}</p>
        </div>

        {/* Al posto del vecchio "Scostamento" (previsti futuri − pagato storico:
            due grandezze non confrontabili): i costi che NESSUN totale può
            contenere perché senza scadenza, resi visibili e cliccabili. */}
        <button
          type="button"
          className={`p-4 rounded-lg border text-left transition-all hover:shadow-md ${activeStatusTab === "senza_scadenza" ? "ring-2 ring-slate-500 bg-muted dark:bg-slate-900/20 border-slate-400" : "bg-muted/50 dark:bg-slate-900/10 border-border dark:border-slate-700"}`}
          onClick={() => handleCardClick("senza_scadenza")}
        >
          <div className="flex items-center gap-2 mb-1">
            <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-medium">Senza scadenza</span>
          </div>
          <p className="text-xl font-bold text-muted-foreground dark:text-slate-200 tabular-nums">{formatCurrency(senzaScadenza?.totale ?? 0)}</p>
          <p className="text-[10px] text-muted-foreground">{senzaScadenza?.count ?? 0} costi fuori dai totali di periodo · importo senza IVA</p>
        </button>
      </div>

      {/* Monthly Distribution Chart */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="text-base">Distribuzione Mensile Costi</CardTitle>
              <CardDescription>
                {chartView === "current"
                  ? "Previsto (per scadenza) vs Pagato effettivo (per data pagamento)"
                  : "Confronto Previsto vs Sostenuto per mese"
                }
              </CardDescription>
            </div>
            <div className="flex gap-1">
              <Button
                variant={chartView === "current" ? "default" : "outline"}
                size="sm"
                className="gap-1 text-xs"
                onClick={() => setChartView("current")}
              >
                <BarChart3 className="h-3.5 w-3.5" />
                Dettaglio
              </Button>
              <Button
                variant={chartView === "comparison" ? "default" : "outline"}
                size="sm"
                className="gap-1 text-xs"
                onClick={() => setChartView("comparison")}
              >
                <Eye className="h-3.5 w-3.5" />
                Previsto vs Sostenuto
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyDistribution} barCategoryGap="20%">
                {defsGrafico(idDist, { fissi: COLORI_GRAFICO.rosso, variabili: "hsl(45 93% 47%)", previsto: COLORI_GRAFICO.blu, sostenuto: COLORI_GRAFICO.verde })}
                <CartesianGrid fill={`url(#${idDist}-punti)`} strokeDasharray="4 6" vertical={false} stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="month"
                  className="text-xs"
                  tick={({ x, y, payload, index }: any) => {
                    const item = monthlyDistribution[index];
                    const isCurrent = item?.isCurrent;
                    return (
                      <text
                        x={x} y={y + 12}
                        textAnchor="middle"
                        fontSize={11}
                        fontWeight={isCurrent ? 700 : 400}
                        fill={isCurrent ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))"}
                      >
                        {payload.value}
                      </text>
                    );
                  }}
                />
                <YAxis
                  className="text-xs"
                  tick={TESTO_ASSE}
                  axisLine={false}
                  tickLine={false}
                  width={60}
                  tickFormatter={formatCurrencyCompact}
                />
                <RechartsTooltip
                  cursor={{ fill: "hsl(var(--muted))", fillOpacity: 0.5 }}
                  formatter={(value: number, name: string) => [formatCurrency(value), name]}
                  contentStyle={{
                    backgroundColor: "hsl(var(--popover))",
                    borderColor: "hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: 12,
                  }}
                  labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 600 }}
                  content={chartView === "comparison" ? ({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const previsto = payload.find(p => p.dataKey === "Previsto")?.value as number || 0;
                    const sostenuto = payload.find(p => p.dataKey === "Sostenuto")?.value as number || 0;
                    const delta = sostenuto - previsto;
                    return (
                      <div className="rounded-lg border bg-card p-3 shadow-md text-xs space-y-1">
                        <p className="font-semibold text-foreground">{label}</p>
                        <div className="flex justify-between gap-4">
                          <span className="text-blue-600">Previsto:</span>
                          <span className="font-medium">{formatCurrency(previsto)}</span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-green-600">Sostenuto:</span>
                          <span className="font-medium">{formatCurrency(sostenuto)}</span>
                        </div>
                        <div className={`flex justify-between gap-4 pt-1 border-t font-semibold ${delta >= 0 ? "text-rose-600" : "text-emerald-600"}`}>
                          <span>Delta:</span>
                          <span>{delta >= 0 ? "+" : ""}{formatCurrency(delta)}</span>
                        </div>
                      </div>
                    );
                  } : undefined}
                />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} formatter={(v: string) => <span className="text-muted-foreground">{v}</span>} />
                {chartView === "current" ? (
                  <>
                    <Bar dataKey="Fissi" fill={`url(#${idDist}-barra-fissi)`} radius={[4, 4, 0, 0]} maxBarSize={16} isAnimationActive={!fermo} animationDuration={700}>
                      {monthlyDistribution.map((entry, i) => (
                        <Cell key={i} fillOpacity={entry.isCurrent ? 1 : 0.7} />
                      ))}
                    </Bar>
                    <Bar dataKey="Variabili" fill={`url(#${idDist}-barra-variabili)`} radius={[4, 4, 0, 0]} maxBarSize={16} isAnimationActive={!fermo} animationDuration={700} animationBegin={100}>
                      {monthlyDistribution.map((entry, i) => (
                        <Cell key={i} fillOpacity={entry.isCurrent ? 1 : 0.7} />
                      ))}
                    </Bar>
                    <Bar
                      dataKey="PagatoEffettivo"
                      name="Pagato Effettivo"
                      fill="hsl(142 76% 36%)"
                      fillOpacity={0.25}
                      stroke="hsl(142 76% 36%)"
                      strokeWidth={1.5}
                      strokeDasharray="4 2"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={16}
                      isAnimationActive={!fermo}
                      animationDuration={700}
                      animationBegin={200}
                    >
                      {monthlyDistribution.map((entry, i) => (
                        <Cell key={i} fillOpacity={entry.isCurrent ? 0.35 : 0.2} />
                      ))}
                    </Bar>
                  </>
                ) : (
                  <>
                    <Bar dataKey="Previsto" fill={`url(#${idDist}-barra-previsto)`} radius={[4, 4, 0, 0]} maxBarSize={20} isAnimationActive={!fermo} animationDuration={700}>
                      {monthlyDistribution.map((entry, i) => (
                        <Cell key={i} fillOpacity={entry.isCurrent ? 1 : 0.7} />
                      ))}
                    </Bar>
                    <Bar dataKey="Sostenuto" fill={`url(#${idDist}-barra-sostenuto)`} radius={[4, 4, 0, 0]} maxBarSize={20} isAnimationActive={!fermo} animationDuration={700} animationBegin={120}>
                      {monthlyDistribution.map((entry, i) => (
                        <Cell key={i} fillOpacity={entry.isCurrent ? 1 : 0.7} />
                      ))}
                    </Bar>
                  </>
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Category Distribution PieChart */}
      {categoryDistribution.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Spese per Categoria</CardTitle>
            <CardDescription>Distribuzione delle uscite per tipologia</CardDescription>
          </CardHeader>
          <CardContent>
            {/* 14/11/2026: la ciambella condivisa, con la legenda in euro e percentuale
                al posto delle etichette attorno alla torta che si accavallavano. */}
            <Ciambella
              titolo="Spese per categoria"
              dimensione={170}
              fette={[...categoryDistribution].sort((x, y) => y.value - x.value).map((c, i) => ({ nome: c.name, valore: c.value, colore: PIE_COLORS[i % PIE_COLORS.length] }))}
              massimo={Math.min(PIE_COLORS.length, 7)}
            />
          </CardContent>
        </Card>
      )}

      {/* Break-even Card */}
      {breakEvenData && (
        <Card className={cn(
          "border-2",
          breakEvenData.status === "above" && "border-green-400 bg-green-50 dark:bg-green-900/10",
          breakEvenData.status === "near"  && "border-orange-400 bg-orange-50 dark:bg-orange-900/10",
          breakEvenData.status === "below" && "border-red-400 bg-red-50 dark:bg-red-900/10",
        )}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Calculator className="h-4 w-4" />
                <span className="text-sm font-semibold">Break-even mensile</span>
              </div>
              <Badge className={cn(
                breakEvenData.status === "above" && "bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300",
                breakEvenData.status === "near"  && "bg-orange-100 text-orange-800 dark:bg-orange-500/15 dark:text-orange-300",
                breakEvenData.status === "below" && "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300",
              )}>
                {breakEvenData.status === "above" ? "Coperto ✓" : breakEvenData.status === "near" ? "Quasi coperto" : "Sotto break-even"}
              </Badge>
            </div>
            <div className="grid grid-cols-3 gap-4 mt-2">
              <div>
                <p className="text-xs text-muted-foreground">Costi fissi mese</p>
                <p className="text-lg font-bold">{formatCurrency(breakEvenData.monthlyFixedCosts)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Fatturato necessario</p>
                <p className="text-lg font-bold">{formatCurrency(breakEvenData.breakEvenRevenue)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">N. commesse necessarie</p>
                <p className="text-lg font-bold">{breakEvenData.breakEvenOrders} ordini</p>
              </div>
            </div>
            <Progress value={breakEvenData.coveragePercent} className="mt-3 h-2" />
            <p className="text-xs text-muted-foreground mt-1">
              {breakEvenData.coveragePercent.toFixed(0)}% coperto dal fatturato del mese: {formatCurrency(breakEvenData.monthlyRevenue)}
            </p>
            {/* Margine di sicurezza (cap. 4 del manuale): quanto puo' calare il
                fatturato prima di finire sotto il pareggio. Sotto il 20% ogni
                commessa rimandata e' un mese in perdita. */}
            {breakEvenData.monthlyRevenue > 0 && breakEvenData.coveragePercent >= 100 && (() => {
              const sicurezza = Math.round(((breakEvenData.monthlyRevenue - breakEvenData.breakEvenRevenue) / breakEvenData.monthlyRevenue) * 100);
              return (
                <p
                  className={cn("mt-1 text-xs", sicurezza < 20 ? "font-medium text-orange-700" : "text-muted-foreground")}
                  title="Quanto può calare il fatturato del mese prima di andare in perdita. Sotto il 20% basta una commessa rimandata."
                >
                  Margine di sicurezza {sicurezza}% · {formatCurrency(breakEvenData.monthlyRevenue - breakEvenData.breakEvenRevenue)}
                </p>
              );
            })()}
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {breakEvenData.ipotesiDaDati
                ? <>Margine {breakEvenData.averageOrderMargin.toLocaleString("it-IT")}% · commessa media {formatCurrency(breakEvenData.averageOrderValue)} (ultimi 12 mesi)</>
                : <>Margine {breakEvenData.averageOrderMargin.toLocaleString("it-IT")}% · commessa media {formatCurrency(breakEvenData.averageOrderValue)} (ipotesi: nessuna commessa consuntivata)</>}
            </p>

            {/* Il secondo pareggio (cap. 31): dal conto corrente escono anche
                le rate dei finanziamenti, che nel conto economico non ci sono.
                "Per non perdere" e' il primo numero; "per non finire in banca"
                e' questo. */}
            {rateFinanziamenti > 0 && breakEvenData.averageOrderMargin > 0 && (() => {
              const beFinanziario = (breakEvenData.monthlyFixedCosts + rateFinanziamenti) / (breakEvenData.averageOrderMargin / 100);
              return (
                <p
                  className="mt-1 text-xs text-muted-foreground"
                  title={`Con le rate dei finanziamenti (${formatCurrency(rateFinanziamenti)}/mese). Imposte e sostituzione mezzi escluse.`}
                >
                  Pareggio con le rate: <strong className="text-foreground">{formatCurrency(beFinanziario)}/mese</strong>
                  {breakEvenData.averageOrderValue > 0 && <> · {Math.ceil(beFinanziario / breakEvenData.averageOrderValue)} commesse</>}
                </p>
              );
            })()}

            {/* Capitale circolante a regime (cap. 26): (uscite - acconti) x
                mesi di ciclo. Non e' una voce di bilancio: serve a
                dimensionare il fido PRIMA che serva. */}
            {circolante && mediaUsciteMensili > 0 && (() => {
              const capitale = Math.max(0, (mediaUsciteMensili - circolante.accontiMese) * circolante.mesiCiclo);
              if (capitale <= 0) return null;
              return (
                <p
                  className="mt-1 text-xs text-muted-foreground"
                  title={`(${formatCurrency(mediaUsciteMensili)} di uscite − ${formatCurrency(circolante.accontiMese)} di acconti al mese) × ${circolante.mesiCiclo.toLocaleString("it-IT")} mesi di ciclo (da ${circolante.commesse} commesse incassate): il fido da dimensionare prima che serva.`}
                >
                  Capitale circolante a regime ≈ <strong className="text-foreground">{formatCurrency(capitale)}</strong>
                </p>
              );
            })()}

            {/* Il budget in quattro righe: sopra il pareggio c'è l'obiettivo.
                Fatturato obiettivo = (fissi annui + utile voluto) ÷ margine%. */}
            <div className="mt-3 border-t border-border/70 pt-3">
              <div className="flex flex-wrap items-center gap-2">
                <label htmlFor="utile-voluto" className="text-xs font-medium">
                  Il pareggio non basta: quanto utile vuoi quest'anno?
                </label>
                <Input
                  id="utile-voluto"
                  inputMode="decimal"
                  placeholder="es. 100.000"
                  value={utileVolutoRaw}
                  onChange={(e) => setUtileVolutoRaw(e.target.value)}
                  className="h-8 w-32 bg-card"
                />
              </div>
              {utileVoluto > 0 && breakEvenData.averageOrderMargin > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Servono{" "}
                  <strong>
                    {formatCurrency((breakEvenData.monthlyFixedCosts * 12 + utileVoluto) / (breakEvenData.averageOrderMargin / 100))}
                  </strong>{" "}
                  all'anno ({formatCurrency((breakEvenData.monthlyFixedCosts * 12 + utileVoluto) / (breakEvenData.averageOrderMargin / 100) / 12)} al mese)
                  {breakEvenData.averageOrderValue > 0 && (
                    <>
                      {" "}
                      →{" "}
                      <strong>
                        {(
                          (breakEvenData.monthlyFixedCosts * 12 + utileVoluto) /
                          (breakEvenData.averageOrderMargin / 100) /
                          12 /
                          breakEvenData.averageOrderValue
                        ).toLocaleString("it-IT", { maximumFractionDigits: 1 })}{" "}
                        commesse al mese
                      </strong>
                      . Il numero da dire alla squadra il lunedì.
                    </>
                  )}
                  {breakEvenData.averageOrderValue <= 0 && "."}
                </p>
              )}
              {utileVoluto > 0 && breakEvenData.averageOrderMargin <= 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Serve il margine medio delle commesse per fare la divisione: chiudi qualche commessa
                  con costi registrati e il numero appare da solo.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Fixed Costs % Trend */}
      {fixedCostsTrend.length > 1 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Tendenza Costi Fissi %</CardTitle>
            <CardDescription>Percentuale costi fissi sul totale (ultimi 12 mesi)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={fixedCostsTrend} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  {defsGrafico(`${idDist}f`, { fissi: COLORI_GRAFICO.rosso })}
                  <CartesianGrid fill={`url(#${idDist}f-punti)`} strokeDasharray="4 6" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" tick={TESTO_ASSE} axisLine={false} tickLine={false} />
                  <YAxis tick={TESTO_ASSE} axisLine={false} tickLine={false} width={40} tickFormatter={(v) => `${v}%`} domain={[0, 100]} />
                  <RechartsTooltip
                    formatter={(value: number) => [`${value.toFixed(1)}%`, "Costi Fissi"]}
                    contentStyle={{ backgroundColor: "hsl(var(--popover))", borderColor: "hsl(var(--border))", borderRadius: "12px", fontSize: 12 }}
                  />
                  <Area type="monotone" dataKey="pctFixed" stroke="none" fill={`url(#${idDist}f-sfuma-fissi)`} isAnimationActive={!fermo} animationDuration={900} tooltipType="none" activeDot={false} />
                  <Line type="monotone" dataKey="pctFixed" name="% Fissi" stroke={COLORI_GRAFICO.rosso} strokeWidth={2.5} filter={`url(#${idDist}f-ombra)`} dot={{ r: 3, fill: COLORI_GRAFICO.rosso, strokeWidth: 0 }} isAnimationActive={!fermo} animationDuration={900} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}
