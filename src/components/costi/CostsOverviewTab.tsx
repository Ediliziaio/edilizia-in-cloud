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

import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  addMonths, endOfMonth, endOfQuarter, endOfYear, format, getQuarter, isWithinInterval,
  parseISO, startOfMonth, startOfQuarter, startOfYear, subMonths,
} from "date-fns";
import { it } from "date-fns/locale";
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
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/formatters";
import { useCompanyCostsData, type UnifiedCost } from "@/hooks/useCompanyCostsData";
import { EMPLOYEE_PROJECTION_MONTHS, computeCostiSenzaScadenza } from "@/lib/costsUtils";
import { MonthPicker, type PeriodMode } from "./MonthPicker";
import { NavyStatCard } from "@/components/costi/KpiCard";
import { KpiMobili } from "@/components/mobile/FiltriMobile";

// Filtri neutri: la Panoramica lavora sempre sul dataset completo e filtra
// per periodo lato client (le query sono condivise con la tab Spese).
const NEUTRAL_FILTERS = {
  periodFilter: "all" as const,
  statusFilter: "all" as const,
  searchQuery: "",
  supplierFilter: "all",
  categoryFilter: "all",
  originFilter: "all" as const,
  customDateRange: null,
  statusTabFilter: "all" as const,
};

// Normalizzazione categoria → macro-voce leggibile
function macroVoce(cost: UnifiedCost): string {
  const cat = (cost.category || "").trim();
  if (!cat) return "Altro";
  const lower = cat.toLowerCase();
  if (lower === "personale") return "Personale";
  if (lower === "fornitori" || lower === "materiali") return "Materiali & fornitori";
  if (lower === "squadre esterne") return "Squadre esterne";
  if (lower === "provvigioni") return "Provvigioni";
  return cat;
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
  return format(month, "MMMM", { locale: it });
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
    trendKeys.push({ key: format(d, "yyyy-MM"), label: format(d, "MMM", { locale: it }), date: d });
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
      if (macroVoce(c) === "Personale") bucket.personale += amount;
      else bucket.altro += amount;
    }
  }

  const byVoce = new Map<string, VocePeriodo>();
  let totalePeriodo = 0;
  let pagatoPeriodo = 0;
  for (const c of inPeriod) {
    const nome = macroVoce(c);
    const amount = Number(c.amount) || 0;
    totalePeriodo += amount;
    if (c.is_paid) pagatoPeriodo += amount;
    let v = byVoce.get(nome);
    if (!v) {
      v = { nome, totale: 0, pagato: 0, count: 0, costs: [] };
      byVoce.set(nome, v);
    }
    v.totale += amount;
    if (c.is_paid) v.pagato += amount;
    v.count += 1;
    v.costs.push(c);
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

  // Il personale è proiettato solo fino a +EMPLOYEE_PROJECTION_MONTHS mesi:
  // oltre, un mese "leggero" non significa meno costi ma fine della proiezione.
  const horizonEnd = endOfMonth(addMonths(new Date(), EMPLOYEE_PROJECTION_MONTHS));
  const oltreOrizzonte = periodRange(month, mode).end > horizonEnd;

  const vaiAlleSpeseSenzaScadenza = () => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("tab", "spese");
      next.set("preset", "senza_scadenza");
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
          <div className="flex items-center gap-0.5 rounded-xl border border-slate-200 bg-white p-1 shadow-sm max-sm:hidden">
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
                    : "text-muted-foreground hover:bg-slate-100",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        {deltaPct !== null && (
          <Badge
            variant="outline"
            className={cn(
              "gap-1 text-xs max-sm:hidden",
              deltaPct > 3 && "border-red-300 text-red-700",
              deltaPct < -3 && "border-emerald-300 text-emerald-700",
            )}
          >
            {deltaPct > 3 ? (
              <ArrowUpRight className="h-3.5 w-3.5" />
            ) : deltaPct < -3 ? (
              <ArrowDownRight className="h-3.5 w-3.5" />
            ) : (
              <Minus className="h-3.5 w-3.5" />
            )}
            {Math.abs(deltaPct).toFixed(0)}% vs {labelPeriodoPrec}
          </Badge>
        )}
      </div>

      {/* Testata navy di famiglia: il periodo scelto in tre card in vetro.
          Mobile: due numeri, nome e cifra (vedi sotto). */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 shadow-sm max-sm:hidden">
        {/* Senza il titoletto «Panoramica — Dove vanno i soldi · settembre»:
            il periodo è nel selettore sopra e «Dove vanno i soldi» è il titolo
            del riquadro subito sotto. */}
        <div className="bg-[#173b67] p-4 text-white sm:p-5">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
            <NavyStatCard
              label={`Totale ${labelPeriodo}`}
              value={formatCurrency(totalePeriodo)}
              sub={`${voci.length} voci · prima ${formatCurrency(totalePrec)}`}
              icon={Wallet}
              tone="text-orange-100"
            />
            <NavyStatCard
              label="Già pagato"
              value={formatCurrency(pagatoPeriodo)}
              sub={`${vocePagataPct}% del periodo`}
              icon={PiggyBank}
              tone="text-emerald-200"
            />
            <NavyStatCard
              label="Da pagare"
              value={formatCurrency(daPagarePeriodo)}
              sub="in scadenza nel periodo"
              icon={ReceiptText}
            />
          </div>
        </div>
      </div>

      <KpiMobili
        className="sm:hidden"
        voci={[
          { label: `Totale ${labelPeriodo}`, valore: formatCurrency(totalePeriodo) },
          { label: "Da pagare", valore: formatCurrency(daPagarePeriodo), tono: daPagarePeriodo > 0 ? "text-rose-600" : undefined },
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
            <strong>{senzaScadenza.count} costi senza scadenza per {formatCurrency(senzaScadenza.totale)}</strong>{" "}
            non compaiono in nessun totale di periodo. Clicca per vederli e dare loro una data.
          </span>
        </button>
      )}
      {oltreOrizzonte && (
        <p className="text-xs text-muted-foreground max-sm:hidden">
          Oltre {EMPLOYEE_PROJECTION_MONTHS} mesi da oggi gli stipendi non sono proiettati: un periodo
          così avanti mostra solo i costi già registrati.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-5">
        {/* Ripartizione per voce */}
        <Card className="rounded-2xl border-slate-200 shadow-sm lg:col-span-3 max-sm:rounded-lg">
          <CardHeader className="pb-2 max-sm:p-3 max-sm:pb-1">
            <CardTitle className="text-base max-sm:text-sm">
              {drill ? (
                <span className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setDrillVoce(null)}
                    aria-label="Torna alla ripartizione"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  {drill.nome} · {formatCurrency(drill.totale)}
                </span>
              ) : (
                "Dove vanno i soldi"
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="max-sm:px-2 max-sm:pb-2">
            {voci.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground max-sm:py-3 max-sm:text-xs">
                Nessun costo con scadenza in questo periodo.
              </p>
            ) : drill ? (
              <div className="max-h-[380px] space-y-1 overflow-y-auto pr-1">
                {drill.costs.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center gap-3 rounded-lg border border-slate-100 bg-white px-3 py-2 max-sm:gap-2 max-sm:px-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-800 max-sm:text-[13px]">{c.name}</p>
                      <p className="truncate text-xs text-muted-foreground max-sm:text-[11px]">
                        {[
                          c.supplierName,
                          c.order?.order_code,
                          parseDue(c.due_date)
                            ? format(parseDue(c.due_date)!, mode === "mese" ? "d MMM" : "d MMM yyyy", { locale: it })
                            : "senza scadenza",
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <Badge
                      variant={c.is_paid ? "secondary" : "outline"}
                      className={cn("shrink-0 text-[11px] max-sm:hidden", !c.is_paid && "border-sky-300 text-sky-700")}
                    >
                      {c.is_paid ? "Pagato" : "Da pagare"}
                    </Badge>
                    <span className={cn("w-24 shrink-0 text-right text-sm font-semibold tabular-nums max-sm:w-auto max-sm:text-[13px]", c.is_paid && "max-sm:text-emerald-700")}>
                      {formatCurrency(Number(c.amount))}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
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
                      className="tap-compact group w-full rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-slate-50"
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-slate-800 max-sm:text-[13px]">
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-sm"
                            style={{ backgroundColor: color }}
                          />
                          <span className="truncate">{v.nome}</span>
                          <span className="shrink-0 text-xs text-muted-foreground max-sm:text-[11px]">
                            {v.count} {v.count === 1 ? "costo" : "costi"}
                          </span>
                        </span>
                        <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-900 max-sm:text-[13px]">
                          {formatCurrency(v.totale)}
                          <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                            {pct >= 0.5 ? `${pct.toFixed(0)}%` : "<1%"}
                          </span>
                        </span>
                      </div>
                      <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-slate-100 max-sm:mt-1 max-sm:h-1.5">
                        <div
                          className="h-full rounded-full transition-all group-hover:opacity-80"
                          style={{ width: `${Math.max(barPct, 2)}%`, backgroundColor: color }}
                        />
                      </div>
                    </button>
                  );
                })}
                <p className="pt-1 text-[11px] text-muted-foreground max-sm:hidden">
                  Clicca una voce per vedere i singoli costi del periodo.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Trend 12 mesi — cliccabile: un click su un mese ci naviga sopra.
            Mobile no: analisi da scrivania, il mese si cambia in cima. */}
        <Card className="rounded-2xl border-slate-200 shadow-sm lg:col-span-2 max-sm:hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Andamento — ultimi 12 mesi</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={trend}
                  margin={{ top: 8, right: 4, left: 4, bottom: 0 }}
                  onClick={(state) => {
                    const idx = (state as { activeTooltipIndex?: number } | null)?.activeTooltipIndex;
                    if (typeof idx === "number" && trend[idx]) {
                      setDrillVoce(null);
                      onMonthChange(startOfMonth(trend[idx].date));
                    }
                  }}
                  className="cursor-pointer"
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    width={52}
                    tickFormatter={(v: number) =>
                      v >= 1000 ? `${Math.round(v / 1000)}k€` : `${v}€`
                    }
                  />
                  <RechartsTooltip
                    formatter={(value: number, name: string) => [
                      formatCurrency(value),
                      name === "personale" ? "Personale" : name === "altro" ? "Altri costi" : "Totale",
                    ]}
                    labelStyle={{ textTransform: "capitalize" }}
                  />
                  <Bar dataKey="personale" stackId="tot" fill="#f97316" name="personale">
                    {trend.map((t, i) => (
                      <Cell key={i} fillOpacity={t.inPeriodo ? 1 : 0.55} />
                    ))}
                  </Bar>
                  <Bar dataKey="altro" stackId="tot" fill="#94a3b8" name="altro" radius={[3, 3, 0, 0]}>
                    {trend.map((t, i) => (
                      <Cell key={i} fillOpacity={t.inPeriodo ? 1 : 0.55} />
                    ))}
                  </Bar>
                  <Line
                    type="monotone"
                    dataKey="totale"
                    name="totale"
                    stroke="#0ea5e9"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-orange-500" /> Personale
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-slate-400" /> Altri costi
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-0.5 w-3 rounded-full bg-sky-500" /> Totale
              </span>
              <span className="ml-auto text-[11px]">Clicca un mese per navigarci</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default CostsOverviewTab;
