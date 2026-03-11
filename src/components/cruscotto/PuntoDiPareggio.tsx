import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Target, TrendingUp, TrendingDown, AlertTriangle,
  CalendarDays, Banknote, BarChart3,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell, LabelList,
} from "recharts";
import { formatCurrency } from "@/lib/formatters";
import { useMarginData } from "@/hooks/useMarginData";
import { useBreakEvenHistorical } from "@/hooks/useBreakEvenHistorical";

const MONTH_NAMES = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];
const MONTH_SHORT = [
  "Gen", "Feb", "Mar", "Apr", "Mag", "Giu",
  "Lug", "Ago", "Set", "Ott", "Nov", "Dic",
];

function monthLabel(m: number): string {
  if (m <= 0 || m > 12) return "—";
  return MONTH_NAMES[m - 1];
}

// ─── CalendarioAnno ───────────────────────────────────────────────────────────

function CalendarioAnno({ breakEvenMonth }: { breakEvenMonth: number }) {
  const notReached = breakEvenMonth > 12;

  return (
    <div>
      <p className="text-xs text-muted-foreground mb-3">
        {notReached
          ? "Con il ritmo attuale il punto di pareggio non viene raggiunto nell'anno."
          : `I primi ${breakEvenMonth} mesi coprono i costi fissi. Da ${monthLabel(breakEvenMonth + 1 <= 12 ? breakEvenMonth + 1 : 12)} inizi a guadagnare per te.`}
      </p>
      <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-12">
        {MONTH_SHORT.map((name, idx) => {
          const monthNum = idx + 1;
          const isPaying = notReached || monthNum <= breakEvenMonth;
          const isBreakEvenMonth = !notReached && monthNum === breakEvenMonth;

          return (
            <div
              key={name}
              className={`
                flex flex-col items-center justify-center rounded-lg p-1.5 text-center
                transition-all
                ${isBreakEvenMonth
                  ? "ring-2 ring-primary ring-offset-1 bg-primary/10 font-bold scale-105"
                  : isPaying
                  ? "bg-red-100 dark:bg-red-950/40"
                  : "bg-emerald-100 dark:bg-emerald-950/40"}
              `}
            >
              <span className={`text-[10px] font-medium ${
                isPaying && !isBreakEvenMonth
                  ? "text-red-700 dark:text-red-400"
                  : isBreakEvenMonth
                  ? "text-primary"
                  : "text-emerald-700 dark:text-emerald-400"
              }`}>
                {name}
              </span>
              <span className="mt-0.5 text-sm">
                {isBreakEvenMonth ? "🎯" : isPaying ? "💸" : "💰"}
              </span>
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground flex-wrap">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-sm bg-red-200 dark:bg-red-950 border border-red-300" />
          Coprono i costi fissi
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-sm bg-primary/20 border border-primary" />
          Mese di pareggio
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-sm bg-emerald-200 dark:bg-emerald-950 border border-emerald-300" />
          Guadagni per te
        </span>
      </div>
    </div>
  );
}

// ─── BreakdownCostiFissi ──────────────────────────────────────────────────────

function BreakdownCostiFissi({
  fixedCosts,
  salariesMonthly,
  avgMarginPercent,
  totalFixedCostsMonthly,
}: {
  fixedCosts: { category: string; amount: number }[];
  salariesMonthly: number;
  avgMarginPercent: number;
  totalFixedCostsMonthly: number;
}) {
  return (
    <div className="space-y-2">
      {salariesMonthly > 0 && (
        <div className="flex items-center justify-between text-sm py-1 border-b">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            👥 Stipendi dipendenti
          </span>
          <span className="font-medium">{formatCurrency(salariesMonthly)}/mese</span>
        </div>
      )}
      {fixedCosts.map(fc => (
        <div key={fc.category} className="flex items-center justify-between text-sm py-1 border-b last:border-0">
          <span className="text-muted-foreground">{fc.category}</span>
          <span className="font-medium">{formatCurrency(fc.amount)}/mese</span>
        </div>
      ))}
      <div className="flex items-center justify-between text-sm py-2 bg-muted/30 rounded-lg px-3 mt-1">
        <span className="font-semibold">Totale costi fissi</span>
        <span className="font-bold text-base">{formatCurrency(totalFixedCostsMonthly)}/mese</span>
      </div>
      <p className="text-xs text-muted-foreground pt-1">
        Margine lordo usato per il calcolo:{" "}
        <strong>{avgMarginPercent.toFixed(1)}%</strong>
        {" "}(media degli ordini · al netto di merce e squadre esterne)
      </p>
    </div>
  );
}

// ─── StoricoAnniChart ─────────────────────────────────────────────────────────

function StoricoAnniChart({
  data,
}: {
  data: {
    year: number;
    totalRevenue: number;
    breakEvenAnnual: number;
    breakEvenMonthOfYear: number;
    reachedBreakEven: boolean;
  }[];
}) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
        Nessun dato storico disponibile.
      </div>
    );
  }

  const maxBE = Math.max(...data.map(d => d.breakEvenAnnual), 1);

  const chartData = data.map(d => ({
    anno: String(d.year),
    Fatturato: Math.round(d.totalRevenue),
    "Break-Even": Math.round(d.breakEvenAnnual),
    reachedBreakEven: d.reachedBreakEven,
    meseLabel: d.breakEvenMonthOfYear <= 12
      ? `${MONTH_SHORT[d.breakEvenMonthOfYear - 1]}`
      : "—",
  }));

  return (
    <div className="space-y-2">
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={chartData} margin={{ top: 24, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="anno" tick={{ fontSize: 12 }} />
          <YAxis
            tick={{ fontSize: 11 }}
            tickFormatter={v => `€${(v / 1000).toFixed(0)}k`}
            width={56}
          />
          <Tooltip
            formatter={(value: number, name: string) => [formatCurrency(value), name]}
          />
          <ReferenceLine
            y={maxBE}
            stroke="hsl(var(--destructive))"
            strokeDasharray="4 2"
            label={{ value: "Break-Even", position: "right", fontSize: 10 }}
          />
          <Bar dataKey="Fatturato" radius={[4, 4, 0, 0]}>
            {chartData.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={entry.reachedBreakEven
                  ? "hsl(var(--primary))"
                  : "hsl(var(--destructive) / 0.7)"}
              />
            ))}
            <LabelList
              dataKey="meseLabel"
              position="top"
              style={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-sm bg-primary" />
          Pareggio raggiunto
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-sm bg-destructive/70" />
          Sotto il punto di pareggio
        </span>
        <span className="text-[11px]">Etichetta = mese di pareggio di quell'anno</span>
      </div>
    </div>
  );
}

// ─── PuntoDiPareggio (main export) ───────────────────────────────────────────

export function PuntoDiPareggio() {
  const {
    isLoading,
    avgMarginPercent,
    fixedCosts,
    salariesMonthly,
    totalFixedCostsMonthly,
    breakEvenRevenue,
    breakEvenAnnual,
    breakEvenMonthOfYear,
    currentMonthlyRevenue,
    breakEvenDelta,
  } = useMarginData();

  const { historicalData, isLoading: loadingHist } = useBreakEvenHistorical();

  const isAboveBreakEven = breakEvenDelta >= 0;
  const deltaLabel = isAboveBreakEven
    ? `+${formatCurrency(breakEvenDelta)} sopra il break-even`
    : `${formatCurrency(Math.abs(breakEvenDelta))} sotto il break-even`;

  const profitFromMonth = breakEvenMonthOfYear < 12 ? breakEvenMonthOfYear + 1 : null;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }

  const noData = avgMarginPercent === 0 || totalFixedCostsMonthly === 0;

  return (
    <div className="space-y-6">

      {/* ── Sezione A: KPI Cards ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

        {/* Card 1: Break-even mensile */}
        <Card className={`border ${isAboveBreakEven ? "border-emerald-200 dark:border-emerald-900" : "border-red-200 dark:border-red-900"}`}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
              <Banknote className="h-4 w-4" />
              Punto di Pareggio Mensile
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <div className="text-2xl font-bold">
              {noData ? "—" : formatCurrency(breakEvenRevenue)}
            </div>
            <p className="text-xs text-muted-foreground">da fatturare ogni mese</p>
            {!noData && (
              <Badge
                variant={isAboveBreakEven ? "default" : "destructive"}
                className="text-xs mt-1"
              >
                {isAboveBreakEven
                  ? <TrendingUp className="h-3 w-3 mr-1 inline" />
                  : <TrendingDown className="h-3 w-3 mr-1 inline" />}
                {deltaLabel}
              </Badge>
            )}
          </CardContent>
        </Card>

        {/* Card 2: Break-even annuale */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
              <Target className="h-4 w-4" />
              Punto di Pareggio Annuale
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <div className="text-2xl font-bold">
              {noData ? "—" : formatCurrency(breakEvenAnnual)}
            </div>
            <p className="text-xs text-muted-foreground">da fatturare in un anno</p>
            {!noData && (
              <p className="text-xs text-muted-foreground mt-1">
                Fatturato mensile attuale:{" "}
                <strong>{formatCurrency(currentMonthlyRevenue)}/mese</strong>
              </p>
            )}
          </CardContent>
        </Card>

        {/* Card 3: Mese di pareggio */}
        <Card className={`${
          breakEvenMonthOfYear > 12
            ? "border-orange-200 dark:border-orange-900 bg-orange-50/30 dark:bg-orange-950/20"
            : breakEvenMonthOfYear <= 6
            ? "border-emerald-200 dark:border-emerald-900 bg-emerald-50/30 dark:bg-emerald-950/20"
            : "border-amber-200 dark:border-amber-900 bg-amber-50/30 dark:bg-amber-950/20"
        }`}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
              <CalendarDays className="h-4 w-4" />
              Mese di Pareggio
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {noData ? (
              <div className="text-muted-foreground text-sm">Dati insufficienti</div>
            ) : breakEvenMonthOfYear > 12 ? (
              <>
                <div className="text-xl font-bold text-orange-600 dark:text-orange-400">
                  Non raggiunto
                </div>
                <p className="text-xs text-muted-foreground">
                  Con il ritmo attuale i costi fissi non vengono coperti nell'anno
                </p>
                <div className="flex items-center gap-1 mt-1">
                  <AlertTriangle className="h-3.5 w-3.5 text-orange-500" />
                  <span className="text-xs text-orange-600 dark:text-orange-400 font-medium">
                    Aumenta il fatturato o riduci i costi fissi
                  </span>
                </div>
              </>
            ) : (
              <>
                <div className="text-2xl font-bold">
                  {monthLabel(breakEvenMonthOfYear)}
                </div>
                {profitFromMonth ? (
                  <p className="text-xs text-muted-foreground">
                    Da <strong className="text-emerald-600 dark:text-emerald-400">
                      {monthLabel(profitFromMonth)}
                    </strong> guadagni per te
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Raggiungi il pareggio a Dicembre
                  </p>
                )}
                <Badge
                  variant="outline"
                  className={`text-xs mt-1 ${breakEvenMonthOfYear <= 6 ? "border-emerald-400 text-emerald-700" : "border-amber-400 text-amber-700"}`}
                >
                  Mese {breakEvenMonthOfYear} su 12
                </Badge>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {noData && (
        <Card className="border-dashed border-amber-300 bg-amber-50/30 dark:bg-amber-950/20">
          <CardContent className="py-6 text-center">
            <AlertTriangle className="h-8 w-8 text-amber-500 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              Per calcolare il punto di pareggio sono necessari ordini con i costi di acquisto e costi fissi aziendali configurati.
            </p>
          </CardContent>
        </Card>
      )}

      {!noData && (
        <>
          {/* ── Sezione B: Calendario dell'Anno ──────────────────────────── */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-primary" />
                Calendario dell'Anno — Quando inizi a guadagnare per te
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CalendarioAnno breakEvenMonth={breakEvenMonthOfYear} />
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* ── Sezione C: Breakdown Costi Fissi ──────────────────────── */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-primary" />
                  Struttura dei Costi Fissi
                </CardTitle>
              </CardHeader>
              <CardContent>
                <BreakdownCostiFissi
                  fixedCosts={fixedCosts}
                  salariesMonthly={salariesMonthly}
                  avgMarginPercent={avgMarginPercent}
                  totalFixedCostsMonthly={totalFixedCostsMonthly}
                />
              </CardContent>
            </Card>

            {/* ── Formula di calcolo ────────────────────────────────────── */}
            <Card className="bg-muted/20">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  🧮 Come viene calcolato
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <div className="space-y-1.5">
                  <div className="flex justify-between">
                    <span>Costi fissi mensili</span>
                    <strong className="text-foreground">{formatCurrency(totalFixedCostsMonthly)}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Margine lordo medio %</span>
                    <strong className="text-foreground">{avgMarginPercent.toFixed(1)}%</strong>
                  </div>
                  <Separator />
                  <div className="flex justify-between font-medium text-foreground">
                    <span>Break-even mensile</span>
                    <span>{formatCurrency(breakEvenRevenue)}</span>
                  </div>
                  <div className="flex justify-between font-medium text-foreground">
                    <span>Break-even annuale</span>
                    <span>{formatCurrency(breakEvenAnnual)}</span>
                  </div>
                </div>
                <div className="pt-1 border-t text-xs space-y-1">
                  <p>
                    <strong>Margine lordo</strong> = Fatturato − (Acquisto merce + Squadre esterne)
                  </p>
                  <p>
                    <strong>Costi fissi</strong> includono gli stipendi dei dipendenti interni (anche quelli che fanno posa): sono un costo fisso indipendentemente dal volume di lavoro.
                  </p>
                  <p>
                    <strong>Formula</strong>: Break-even = Costi Fissi ÷ Margine%
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ── Sezione D: Storico Anni ──────────────────────────────────── */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                Storico Annuale — Fatturato vs Punto di Pareggio
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                L'etichetta sopra ogni barra indica il mese in cui quell'anno hai raggiunto il pareggio.
              </p>
            </CardHeader>
            <CardContent>
              {loadingHist ? (
                <Skeleton className="h-44 w-full" />
              ) : (
                <StoricoAnniChart data={historicalData} />
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
