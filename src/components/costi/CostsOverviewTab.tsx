// ============================================================================
// CostsOverviewTab — "dove vanno i soldi", per mese / trimestre / anno
// ============================================================================
// Vista di comprensione (non operativa): totale del periodo, quanto è già
// stato pagato, ripartizione per voce di spesa (Personale, Materiali, Squadre
// esterne, Provvigioni + categorie manuali) con drill-down cliccabile e
// confronto col periodo precedente + trend 12 mesi (cliccabile per navigare).
// Riusa le stesse query della gestione spese (cache react-query condivisa).
// La logica di aggregazione è una funzione pura (buildCostsOverview) coperta
// da test in src/test/logic/costsOverviewPeriodi.test.ts.
// ============================================================================

import { useId, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  addMonths, endOfMonth, endOfQuarter, endOfYear, format, getQuarter, isWithinInterval,
  parseISO, startOfMonth, startOfQuarter, startOfYear, subMonths,
} from "date-fns";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, ChevronLeft, Minus, PiggyBank, ReceiptText, Wallet } from "lucide-react";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";

import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Ciambella } from "@/components/charts/grafici/Ciambella";
import { voceCosto } from "@/lib/costi/voceCosto";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatCurrency, formatCurrencyCompact } from "@/lib/formatters";
import { useCompanyCostsData, type UnifiedCost } from "@/hooks/useCompanyCostsData";
import { partiPerCategoria } from "@/lib/costi/partiPerCategoria";
import { EMPLOYEE_PROJECTION_MONTHS, computeCostiSenzaScadenza } from "@/lib/costsUtils";
import { MonthPicker, type PeriodMode } from "./MonthPicker";
import { NavyStatCard } from "@/components/costi/KpiCard";
import { KpiMobili } from "@/components/mobile/FiltriMobile";
import { COLORI_GRAFICO, PillolaVariazione, StatGrafico, TESTO_ASSE, TooltipScheda, defsGrafico, euroAsse, idSvg } from "@/components/charts/grafici/comune";
import { usePreferisceMenoMovimento } from "@/hooks/usePreferisceMenoMovimento";
import { useT, dateFnsCampo } from "@/lib/campo/lingua/LinguaCampo";

// Filtri neutri: la Panoramica lavora sempre sul dataset completo e filtra
// per periodo lato client (le query sono condivise con la tab Spese).
const NEUTRAL_FILTERS = {
  periodFilter: "all" as const,
  statusFilter: "all" as const,
  searchQuery: "",
  supplierFilter: "all",
  categoryFilter: "all",
  originFilter: "all" as const,
  customDateRange: null as null,
  statusTabFilter: "all" as const,
};

// Normalizzazione categoria → macro-voce leggibile
function macroVoce(cost: UnifiedCost): string {
  return voceCosto(cost.category);
}

const VOCE_COLORS = [
  "#f97316", // orange — Personale (di solito la voce più grossa)
  "#0ea5e9", // sky
  "#8b5cf6", // violet
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ec4899", // pink
  "#64748b", // slate
  "#14b8a6", // teal
  "#ef4444", // red
  "#6366f1", // indigo
];

interface VocePeriodo {
  nome: string;
  totale: number;
  pagato: number;
  count: number;
  costs: UnifiedCost[];
}

export interface TrendPoint {
  key: string;
  label: string;
  date: Date;
  personale: number;
  altro: number;
  totale: number;
  inPeriodo: boolean;
}

function parseDue(value?: string | null): Date | null {
  if (!value || value === "9999-12-31") return null;
  const d = parseISO(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Intervallo del periodo selezionato per la modalità scelta. */
export function periodRange(month: Date, mode: PeriodMode): { start: Date; end: Date } {
  if (mode === "anno") return { start: startOfYear(month), end: endOfYear(month) };
  if (mode === "trimestre") return { start: startOfQuarter(month), end: endOfQuarter(month) };
  return { start: startOfMonth(month), end: endOfMonth(month) };
}

/** Etichetta umana del periodo ("luglio", "3° trimestre", "2026"). */
export function periodLabel(month: Date, mode: PeriodMode): string {
  if (mode === "anno") return format(month, "yyyy");
  if (mode === "trimestre") return `${getQuarter(month)}° trimestre`;
  return format(month, "MMMM", { locale: dateFnsCampo() });
}

/**
 * Aggregazione pura della Panoramica costi: voci del periodo, KPI,
 * totale del periodo precedente (stessa ampiezza) e trend 12 mesi.
 * Esportata per i test.
 */
export function buildCostsOverview(allCosts: UnifiedCost[], month: Date, mode: PeriodMode) {
  const { start, end } = periodRange(month, mode);
  const stepMonths = mode === "anno" ? 12 : mode === "trimestre" ? 3 : 1;
  const prev = periodRange(subMonths(start, stepMonths), mode);

  // Trend: ultimi 12 mesi fino al mese selezionato (sempre mensile,
  // qualunque sia la modalità: è la lente per scegliere dove zoomare)
  const trendKeys: { key: string; label: string; date: Date }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = startOfMonth(subMonths(month, i));
    trendKeys.push({ key: format(d, "yyyy-MM"), label: format(d, "MMM", { locale: dateFnsCampo() }), date: d });
  }
  const trendMap = new Map(trendKeys.map((t) => [t.key, { personale: 0, altro: 0 }]));

  const inPeriod: UnifiedCost[] = [];
  let totalePrec = 0;

  for (const c of allCosts) {
    const due = parseDue(c.due_date);
    if (!due) continue;
    const amount = Number(c.amount) || 0;
    if (isWithinInterval(due, { start, end })) inPeriod.push(c);
    if (isWithinInterval(due, prev)) totalePrec += amount;
    const bucket = trendMap.get(format(startOfMonth(due), "yyyy-MM"));
    if (bucket) {
      // Una fattura divisa per categoria (conti per riga) si conta per parti.
      for (const p of partiPerCategoria(c, amount)) {
        if (macroVoce({ ...c, category: p.categoria ?? "" }) === "Personale") bucket.personale += p.importo;
        else bucket.altro += p.importo;
      }
    }
  }

  const byVoce = new Map<string, VocePeriodo>();
  let totalePeriodo = 0;
  let pagatoPeriodo = 0;
  for (const c of inPeriod) {
    const amount = Number(c.amount) || 0;
    totalePeriodo += amount;
    if (c.is_paid) pagatoPeriodo += amount;
    // Una fattura divisa per categoria entra in ogni voce con la sua parte.
    for (const p of partiPerCategoria(c, amount)) {
      const nome = macroVoce({ ...c, category: p.categoria ?? "" });
      let v = byVoce.get(nome);
      if (!v) {
        v = { nome, totale: 0, pagato: 0, count: 0, costs: [] };
        byVoce.set(nome, v);
      }
      v.totale += p.importo;
      if (c.is_paid) v.pagato += p.importo;
      if (!v.costs.includes(c)) { v.count += 1; v.costs.push(c); }
    }
  }

  const voci = Array.from(byVoce.values()).sort((a, b) => b.totale - a.totale);
  voci.forEach((v) => v.costs.sort((a, b) => Number(b.amount) - Number(a.amount)));

  const trend: TrendPoint[] = trendKeys.map((t) => {
    const bucket = trendMap.get(t.key)!;
    const personale = Math.round(bucket.personale);
    const altro = Math.round(bucket.altro);
    return {
      ...t,
      personale,
      altro,
      totale: personale + altro,
      inPeriodo: isWithinInterval(t.date, { start, end }),
    };
  });

  return {
    voci,
    totalePeriodo,
    pagatoPeriodo,
    daPagarePeriodo: totalePeriodo - pagatoPeriodo,
    totalePrec,
    trend,
    // Fuori da ogni periodo per definizione: dichiarati, non nascosti.
    senzaScadenza: computeCostiSenzaScadenza(allCosts),
  };
}

const MODE_OPTIONS: { id: PeriodMode; label: string }[] = [
  { id: "mese", label: "Mese" },
  { id: "trimestre", label: "Trimestre" },
  { id: "anno", label: "Anno" },
];

export function CostsOverviewTab({
  month,
  onMonthChange,
}: {
  month: Date;
  onMonthChange: (m: Date) => void;
}) {
  const tr = useT();
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const data = useCompanyCostsData(companyId, NEUTRAL_FILTERS);
  const [drillVoce, setDrillVoce] = useState<string | null>(null);
  const [mode, setMode] = useState<PeriodMode>("mese");

  const allCosts = data.allCostsUnfiltered as UnifiedCost[];

  const [, setSearchParams] = useSearchParams();
  const { voci, totalePeriodo, pagatoPeriodo, daPagarePeriodo, totalePrec, trend, senzaScadenza } = useMemo(
    () => buildCostsOverview(allCosts, month, mode),
    [allCosts, month, mode],
  );
  const idTrend = idSvg(useId());
  const fermoTrend = usePreferisceMenoMovimento();
  // Riga sopra il grafico: mese più caro, media dei 12 mesi, ultimo mese contro la media.
  const statTrend = useMemo(() => {
    if (trend.length === 0 || trend.every((t) => t.totale === 0)) return null;
    const caro = trend.reduce((a, b) => (b.totale > a.totale ? b : a));
    const media = trend.reduce((s, t) => s + t.totale, 0) / trend.length;
    return { caro, media, ultimo: trend[trend.length - 1] };
  }, [trend]);

  // Il personale è proiettato solo fino a +EMPLOYEE_PROJECTION_MONTHS mesi:
  // oltre, un mese "leggero" non significa meno costi ma fine della proiezione.
  const horizonEnd = endOfMonth(addMonths(new Date(), EMPLOYEE_PROJECTION_MONTHS));
  const oltreOrizzonte = periodRange(month, mode).end > horizonEnd;

  const vaiAlleSpeseSenzaScadenza = () => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("tab", "spese-variabili");
      next.set("preset", "unscheduled");
      return next;
    });
  };

  const deltaPct = totalePrec > 0 ? ((totalePeriodo - totalePrec) / totalePrec) * 100 : null;
  const maxVoce = voci.length > 0 ? voci[0].totale : 0;
  const drill = drillVoce ? voci.find((v) => v.nome === drillVoce) ?? null : null;
  const vocePagataPct = totalePeriodo > 0 ? Math.round((pagatoPeriodo / totalePeriodo) * 100) : 0;
  const labelPeriodo = periodLabel(month, mode);
  const labelPeriodoPrec = periodLabel(subMonths(periodRange(month, mode).start, mode === "anno" ? 12 : mode === "trimestre" ? 3 : 1), mode);

  if (data.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-56" />
        <div className="grid gap-3 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4 max-sm:space-y-3">
      {/* Mobile: solo il mese (via mese/trimestre/anno e il confronto col periodo prima). */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <MonthPicker
            month={month}
            mode={mode}
            onChange={(m) => {
              setDrillVoce(null);
              onMonthChange(m);
            }}
          />
          {/* Ampiezza periodo: mese / trimestre / anno */}
          <div className="flex items-center gap-0.5 rounded-xl border border-border bg-card p-1 shadow-sm max-sm:hidden">
            {MODE_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  setDrillVoce(null);
                  setMode(opt.id);
                }}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                  mode === opt.id
                    ? "bg-orange-500 text-white shadow-sm"
                    : "text-muted-foreground hover:bg-muted",
                )}
              >
                {tr(opt.label)}
              </button>
            ))}
          </div>
        </div>
        {deltaPct !== null && (
          <Badge
            variant="outline"
            className={cn(
              "gap-1 text-xs max-sm:hidden",
              deltaPct > 3 && "border-red-300 text-red-700 dark:text-red-400",
              deltaPct < -3 && "border-emerald-300 text-emerald-700 dark:text-emerald-400",
            )}
          >
            {deltaPct > 3 ? (
              <ArrowUpRight className="h-3.5 w-3.5" />
            ) : deltaPct < -3 ? (
              <ArrowDownRight className="h-3.5 w-3.5" />
            ) : (
              <Minus className="h-3.5 w-3.5" />
            )}
            {tr("{pct}% vs {periodo}", { pct: Math.abs(deltaPct).toFixed(0), periodo: labelPeriodoPrec })}
          </Badge>
        )}
      </div>

      {/* Testata navy di famiglia: il periodo scelto in tre card in vetro.
          Mobile: due numeri, nome e cifra (vedi sotto). */}
      <div className="overflow-hidden rounded-2xl border border-border shadow-sm max-sm:hidden">
        {/* Senza il titoletto «Panoramica — Dove vanno i soldi · settembre»:
            il periodo è nel selettore sopra e «Dove vanno i soldi» è il titolo
            del riquadro subito sotto. */}
        <div className="bg-eic-navy-deep px-3 py-2 text-white">
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            <NavyStatCard
              label={tr("Totale {labelPeriodo}", { labelPeriodo })}
              value={formatCurrency(totalePeriodo)}
              sub={tr("{n} voci · prima {importo}", { n: voci.length, importo: formatCurrency(totalePrec) })}
              icon={Wallet}
              tone="text-orange-100"
              // Costi che salgono: pillola rossa.
              variazione={totalePrec > 0 ? { pct: ((totalePeriodo - totalePrec) / totalePrec) * 100, piuEMeglio: false, nota: tr("Rispetto al periodo prima") } : undefined}
            />
            <NavyStatCard
              label={tr("Già pagato")}
              value={formatCurrency(pagatoPeriodo)}
              sub={tr("{pct}% del periodo", { pct: vocePagataPct })}
              icon={PiggyBank}
              tone="text-emerald-200"
            />
            <NavyStatCard
              label={tr("Da pagare")}
              value={formatCurrency(daPagarePeriodo)}
              sub={tr("nel periodo, scaduti compresi")}
              icon={ReceiptText}
            />
          </div>
        </div>
      </div>

      <KpiMobili
        className="sm:hidden"
        voci={[
          { label: tr("Totale {labelPeriodo}", { labelPeriodo }), valore: formatCurrency(totalePeriodo) },
          { label: tr("Da pagare"), valore: formatCurrency(daPagarePeriodo), tono: daPagarePeriodo > 0 ? "text-rose-600" : undefined },
        ]}
      />

      {/* Onestà sui limiti dei totali di periodo. Mobile no: sono dati da
          sistemare al computer (avviso fisso lungo due righe). */}
      {senzaScadenza.count > 0 && (
        <button
          type="button"
          onClick={vaiAlleSpeseSenzaScadenza}
          className="flex w-full items-center gap-2 rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2 text-left transition-colors hover:bg-amber-100/80 max-sm:hidden"
        >
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
          <span className="min-w-0 text-xs text-amber-900">
            <strong>{tr("{count} costi senza scadenza · {totale}", { count: String(senzaScadenza.count ?? ""), totale: formatCurrency(senzaScadenza.totale) })}</strong> {tr("→ dai una data")}
          </span>
        </button>
      )}
      {oltreOrizzonte && (
        <p className="text-xs text-muted-foreground max-sm:hidden">{tr("Stipendi proiettati fino a {EMPLOYEE_PROJECTION_MONTHS} mesi da oggi.", { EMPLOYEE_PROJECTION_MONTHS: String(EMPLOYEE_PROJECTION_MONTHS ?? "") })}</p>
      )}

      <div className="grid gap-4 lg:grid-cols-5">
        {/* Ripartizione per voce */}
        <Card className="rounded-2xl border-border shadow-sm lg:col-span-3 max-sm:rounded-lg">
          <CardHeader className="pb-2 max-sm:p-3 max-sm:pb-1">
            <CardTitle className="text-base max-sm:text-sm">
              {drill ? (
                <span className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setDrillVoce(null)}
                    aria-label={tr("Torna alla ripartizione")}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  {drill.nome} · {formatCurrency(drill.totale)}
                </span>
              ) : (
                tr("Dove vanno i soldi")
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="max-sm:px-2 max-sm:pb-2">
            {voci.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground max-sm:py-3 max-sm:text-xs">
                {tr("Nessun costo con scadenza in questo periodo.")}
              </p>
            ) : drill ? (
              <div className="max-h-[380px] space-y-1 overflow-y-auto pr-1">
                {drill.costs.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center gap-3 rounded-lg border border-border/60 bg-card px-3 py-2 max-sm:gap-2 max-sm:px-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground max-sm:text-[13px]">{c.name}</p>
                      <p className="truncate text-xs text-muted-foreground max-sm:text-[11px]">
                        {[
                          c.supplierName,
                          c.order?.order_code,
                          parseDue(c.due_date)
                            ? format(parseDue(c.due_date)!, mode === "mese" ? "d MMM" : "d MMM yyyy", { locale: dateFnsCampo() })
                            : tr("senza scadenza"),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <Badge
                      variant={c.is_paid ? "secondary" : "outline"}
                      className={cn("shrink-0 text-[11px] max-sm:hidden", !c.is_paid && "border-sky-300 text-sky-700")}
                    >
                      {c.is_paid ? tr("Pagato") : tr("Da pagare")}
                    </Badge>
                    <span className={cn("w-24 shrink-0 text-right text-sm font-semibold tabular-nums max-sm:w-auto max-sm:text-[13px]", c.is_paid && "max-sm:text-emerald-700 dark:text-emerald-400")}>
                      {formatCurrency(Number(c.amount))}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              // 14/11/2026: la ciambella delle voci accanto all'elenco (da computer).
              <div className="grid items-start gap-4 sm:grid-cols-[150px_minmax(0,1fr)]">
              <div className="max-sm:hidden sm:sticky sm:top-2">
                <Ciambella
                  titolo={tr("Dove vanno i soldi")}
                  legenda={false}
                  massimo={VOCE_COLORS.length}
                  fette={voci.map((v, idx) => ({ nome: v.nome, valore: v.totale, colore: VOCE_COLORS[idx % VOCE_COLORS.length] }))}
                  onFetta={(nome) => setDrillVoce(nome)}
                />
              </div>
              <div className="space-y-2.5">
                {voci.map((v, idx) => {
                  const pct = totalePeriodo > 0 ? (v.totale / totalePeriodo) * 100 : 0;
                  const barPct = maxVoce > 0 ? (v.totale / maxVoce) * 100 : 0;
                  const color = VOCE_COLORS[idx % VOCE_COLORS.length];
                  return (
                    <button
                      key={v.nome}
                      type="button"
                      onClick={() => setDrillVoce(v.nome)}
                      className="tap-compact group w-full rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted/50"
                    >
                      {/* 15/11/2026: il nome su una riga sua. Accanto a conteggio e importo, nella
                          colonna stretta accanto alla ciambella, veniva schiacciato a zero («I…»). */}
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-foreground max-sm:text-[13px]">
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-sm"
                            style={{ backgroundColor: color }}
                          />
                          <span className="truncate" title={v.nome}>{v.nome}</span>
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {pct >= 0.5 ? `${pct.toFixed(0)}%` : "<1%"}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-baseline justify-between gap-3 pl-[18px] text-xs">
                        <span className="text-muted-foreground max-sm:text-[11px]">
                          {(v.count === 1 ? tr("{n} costo", { n: v.count }) : tr("{n} costi", { n: v.count }))}
                        </span>
                        <span className="font-semibold tabular-nums text-foreground max-sm:text-[13px]">
                          {formatCurrency(v.totale)}
                        </span>
                      </div>
                      <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-muted max-sm:mt-1 max-sm:h-1.5">
                        <div
                          className="h-full rounded-full transition-all group-hover:opacity-80"
                          style={{ width: `${Math.max(barPct, 2)}%`, backgroundColor: color }}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Trend 12 mesi — cliccabile: un click su un mese ci naviga sopra.
            Mobile no: analisi da scrivania, il mese si cambia in cima. */}
        <Card className="rounded-2xl border-border shadow-sm lg:col-span-2 max-sm:hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{tr("Andamento — ultimi 12 mesi")}</CardTitle>
          </CardHeader>
          <CardContent>
            {statTrend && (
              <div className="mb-3 grid grid-cols-3 gap-2 rounded-xl border bg-muted/30 px-3 py-2">
                <StatGrafico etichetta={tr("Mese più caro")} valore={formatCurrencyCompact(statTrend.caro.totale)} nota={statTrend.caro.label} />
                <StatGrafico etichetta={tr("Media")} valore={formatCurrencyCompact(statTrend.media)} nota={tr("al mese")} />
                <StatGrafico
                  etichetta={tr("Ultimo mese")}
                  valore={
                    <span className="inline-flex flex-wrap items-center gap-1">
                      {formatCurrencyCompact(statTrend.ultimo.totale)}
                      <PillolaVariazione pct={statTrend.media > 0 ? ((statTrend.ultimo.totale - statTrend.media) / statTrend.media) * 100 : null} piuEMeglio={false} titolo={tr("Rispetto alla media dei 12 mesi")} />
                    </span>
                  }
                  nota={tr("contro la media")}
                />
              </div>
            )}
            <div className="h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={trend}
                  margin={{ top: 8, right: 4, left: 0, bottom: 0 }}
                  barCategoryGap="22%"
                  onClick={(state) => {
                    const idx = (state as { activeTooltipIndex?: number } | null)?.activeTooltipIndex;
                    if (typeof idx === "number" && trend[idx]) {
                      setDrillVoce(null);
                      onMonthChange(startOfMonth(trend[idx].date));
                    }
                  }}
                  className="cursor-pointer"
                >
                  {defsGrafico(idTrend, { personale: COLORI_GRAFICO.arancio, altro: "hsl(var(--muted-foreground))", totale: COLORI_GRAFICO.blu })}
                  <CartesianGrid fill={`url(#${idTrend}-punti)`} strokeDasharray="4 6" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" tick={TESTO_ASSE} axisLine={false} tickLine={false} tickMargin={6} />
                  <YAxis tick={TESTO_ASSE} axisLine={false} tickLine={false} width={56} tickFormatter={euroAsse} />
                  <RechartsTooltip
                    cursor={{ fill: "hsl(var(--muted))", fillOpacity: 0.5 }}
                    content={(p) => (
                      <TooltipScheda
                        active={p.active}
                        payload={(p.payload ?? []).map((x) => ({
                          ...x,
                          name: x.dataKey === "personale" ? tr("Personale") : x.dataKey === "altro" ? tr("Altri costi") : tr("Totale"),
                          color: x.dataKey === "personale" ? COLORI_GRAFICO.arancio : x.dataKey === "altro" ? "hsl(var(--muted-foreground))" : COLORI_GRAFICO.blu,
                        })) as never}
                        label={String(p.label ?? "")}
                      />
                    )}
                  />
                  <Bar dataKey="personale" stackId="tot" fill={`url(#${idTrend}-barra-personale)`} name="personale" isAnimationActive={!fermoTrend} animationDuration={700}>
                    {trend.map((t, i) => (
                      <Cell key={i} fillOpacity={t.inPeriodo ? 1 : 0.55} />
                    ))}
                  </Bar>
                  <Bar dataKey="altro" stackId="tot" fill={`url(#${idTrend}-barra-altro)`} name="altro" radius={[4, 4, 0, 0]} isAnimationActive={!fermoTrend} animationDuration={700} animationBegin={120}>
                    {trend.map((t, i) => (
                      <Cell key={i} fillOpacity={t.inPeriodo ? 1 : 0.55} />
                    ))}
                  </Bar>
                  <Line
                    type="monotone"
                    dataKey="totale"
                    name="totale"
                    stroke={COLORI_GRAFICO.blu}
                    strokeWidth={2.5}
                    filter={`url(#${idTrend}-ombra)`}
                    dot={false}
                    activeDot={{ r: 5, strokeWidth: 2, stroke: "hsl(var(--background))", fill: COLORI_GRAFICO.blu }}
                    isAnimationActive={!fermoTrend}
                    animationDuration={900}
                    animationBegin={250}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: COLORI_GRAFICO.arancio }} /> {tr("Personale")}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-muted-foreground" /> {tr("Altri costi")}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-0.5 w-3 rounded-full" style={{ background: COLORI_GRAFICO.blu }} /> {tr("Totale")}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default CostsOverviewTab;
