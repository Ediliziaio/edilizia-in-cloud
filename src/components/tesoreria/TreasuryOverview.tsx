import { useEffect, useState, useRef, type ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Wallet, TrendingUp, TrendingDown, ArrowUpDown, AlertTriangle, ArrowRight, LineChart as LineChartIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, Line, ComposedChart,
  PieChart, Pie, Cell, Area, AreaChart, CartesianGrid, ReferenceLine,
} from "recharts";
import { formatCurrencyCompact, formatDateIt } from "@/lib/formatters";
import { toast } from "sonner";
import { formatTreasuryCurrency, toFiniteAmount } from "@/lib/treasury";
import { useIsMobile } from "@/hooks/use-mobile";
import { prettyTxDesc } from "./txLabel";

const formatEur = (val: unknown) => formatTreasuryCurrency(val, "€0,00");

// Colori categoria (coerenti con le pill in Transazioni), per il donut delle uscite.
const CATEGORY_COLORS: Record<string, string> = {
  Stipendi: "#6366f1", Affitti: "#f59e0b", Fornitori: "#f97316", "Tasse & Tributi": "#ef4444",
  Utenze: "#eab308", Assicurazioni: "#3b82f6", Ristorazione: "#ec4899", Trasferte: "#06b6d4",
  Bancario: "#64748b", Clienti: "#22c55e", Entrata: "#10b981", "Non categorizzata": "#cbd5e1",
};
const categoryColor = (c: string) => CATEGORY_COLORS[c] ?? "#94a3b8";

const monthLabels: Record<string, string> = {
  "01": "Gen", "02": "Feb", "03": "Mar", "04": "Apr", "05": "Mag", "06": "Giu",
  "07": "Lug", "08": "Ago", "09": "Set", "10": "Ott", "11": "Nov", "12": "Dic",
};

interface Props {
  companyId: string;
  refreshKey?: number;
  onNavigateToTransactions?: () => void;
}

interface SaldoPoint { date: string; label: string; saldo: number }

/** Delta % vs mese precedente, null se non calcolabile (divisione per ~0). */
function pctDelta(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || Math.abs(previous) < 0.01) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

/** Chip delta "+12% vs mese scorso". positiveIsGood inverte i colori per le uscite. */
function DeltaChip({ delta, positiveIsGood = true }: { delta: number | null; positiveIsGood?: boolean }) {
  if (delta === null) return null;
  const up = delta >= 0;
  const good = positiveIsGood ? up : !up;
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${
      good
        ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
        : "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
    }`}>
      {up ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
      {up ? "+" : ""}{delta.toFixed(0)}% <span className="font-normal opacity-70">vs mese prec.</span>
    </span>
  );
}

export default function TreasuryOverview({ companyId, refreshKey = 0, onNavigateToTransactions }: Props) {
  const isMobile = useIsMobile();
  const [summary, setSummary] = useState<any>(null);
  const [cashFlow, setCashFlow] = useState<any[]>([]);
  const [byCategory, setByCategory] = useState<{ category: string; total: number }[]>([]);
  const [recentTxs, setRecentTxs] = useState<any[]>([]);
  const [saldoTrend, setSaldoTrend] = useState<SaldoPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (companyId) void loadData();
    else {
      setSummary(null);
      setCashFlow([]);
      setRecentTxs([]);
      setSaldoTrend([]);
      setLoading(false);
    }
  }, [companyId, refreshKey]);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const since = new Date();
      since.setDate(since.getDate() - 90);
      const sinceStr = since.toISOString().slice(0, 10);

      const [summaryRes, cashFlowRes, catRes, txRes, trendRes] = await Promise.all([
        supabase.rpc("get_treasury_summary", { p_company_id: companyId }),
        supabase.rpc("get_cash_flow_by_month", { p_company_id: companyId, p_months: 6 }),
        supabase.rpc("get_expenses_by_category", { p_company_id: companyId, p_months: 3 }),
        supabase
          .from("bank_transactions")
          .select("id, booking_date, description, amount, transaction_type, category, creditor_name, debtor_name")
          .eq("company_id", companyId)
          .order("booking_date", { ascending: false })
          .limit(5),
        // Andamento saldo: movimenti ultimi 90 giorni, cumulati a ritroso dal
        // saldo attuale (somma di tutti i conti) → serie giornaliera.
        supabase
          .from("bank_transactions")
          .select("booking_date, amount")
          .eq("company_id", companyId)
          .gte("booking_date", sinceStr)
          .order("booking_date", { ascending: true })
          .limit(5000),
      ]);

      if (!isMountedRef.current) return;

      let hasBlockingError = false;
      let totalBalance = 0;
      if (summaryRes.error) {
        hasBlockingError = true;
        setError(summaryRes.error.message);
      } else if (summaryRes.data && summaryRes.data.length > 0) {
        setSummary(summaryRes.data[0]);
        totalBalance = toFiniteAmount(summaryRes.data[0]?.total_balance);
      } else {
        setSummary(null);
      }

      if (cashFlowRes.error) {
        console.error("[TreasuryOverview] Errore cash flow:", cashFlowRes.error.message);
      } else {
        setCashFlow(
          (cashFlowRes.data || [])
            // Ordine ascendente garantito localmente: i delta "vs mese prec."
            // e le sparkline assumono ultimo elemento = mese corrente.
            .slice()
            .sort((a: any, b: any) => String(a.month).localeCompare(String(b.month)))
            .map((row: any) => ({
              ...row,
              label: monthLabels[row.month?.split("-")[1]] || row.month,
            }))
        );
      }

      if (catRes.error) {
        console.error("[TreasuryOverview] Errore spese per categoria:", catRes.error.message);
      } else {
        setByCategory((catRes.data || []).map((r: any) => ({ category: r.category, total: toFiniteAmount(r.total) })));
      }

      if (txRes.error) {
        console.error("[TreasuryOverview] Errore ultime transazioni:", txRes.error.message);
      } else {
        setRecentTxs(txRes.data || []);
      }

      if (trendRes.error || summaryRes.error) {
        // Senza il saldo attuale (summary) la serie sarebbe ancorata a 0 →
        // grafico fuorviante: meglio nasconderlo.
        if (trendRes.error) console.error("[TreasuryOverview] Errore trend saldo:", trendRes.error.message);
        setSaldoTrend([]);
      } else {
        // Somma per giorno, poi cumulata a ritroso: l'ultimo punto è il saldo di oggi.
        const perDay = new Map<string, number>();
        for (const row of trendRes.data || []) {
          const d = String(row.booking_date).slice(0, 10);
          perDay.set(d, (perDay.get(d) ?? 0) + toFiniteAmount(row.amount));
        }
        const days = [...perDay.keys()].sort();
        const points: SaldoPoint[] = [];
        let running = totalBalance;
        for (let i = days.length - 1; i >= 0; i--) {
          const d = days[i];
          points.unshift({
            date: d,
            label: `${d.slice(8, 10)}/${d.slice(5, 7)}`,
            saldo: Math.round(running * 100) / 100,
          });
          running -= perDay.get(d) ?? 0; // saldo PRIMA dei movimenti del giorno d
        }
        setSaldoTrend(points);
      }

      if (hasBlockingError) {
        toast.error("Errore nel caricamento della tesoreria. Riprova tra qualche secondo.");
      }
    } catch (e: any) {
      if (!isMountedRef.current) return;
      toast.error("Problema temporaneo. Riprova tra qualche secondo.");
      setError(e.message || "Errore sconosciuto");
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}
        </div>
        <Skeleton className="h-72 rounded-2xl" />
        <Skeleton className="h-80 rounded-2xl" />
      </div>
    );
  }

  // Delta mese corrente vs precedente dal cash flow mensile (serie ascendente).
  const cur = cashFlow.length >= 1 ? cashFlow[cashFlow.length - 1] : null;
  const prev = cashFlow.length >= 2 ? cashFlow[cashFlow.length - 2] : null;
  const deltaIncome = cur && prev ? pctDelta(toFiniteAmount(cur.income), toFiniteAmount(prev.income)) : null;
  const deltaExpenses = cur && prev ? pctDelta(toFiniteAmount(cur.expenses), toFiniteAmount(prev.expenses)) : null;

  const netMese = toFiniteAmount(summary?.monthly_net);
  const kpis = [
    {
      title: "Liquidità Totale",
      value: toFiniteAmount(summary?.total_balance),
      icon: Wallet,
      tile: "from-orange-500 to-amber-400 shadow-[0_4px_12px_rgba(249,115,22,0.3)]",
      tint: "to-orange-50/60 dark:to-orange-950/20",
      valueColor: "text-foreground",
      sub: "Saldo di tutti i conti",
      chip: null as ReactNode,
      spark: saldoTrend.map((p) => ({ v: p.saldo })),
      sparkColor: "#f97316",
    },
    {
      title: "Entrate Mese",
      value: toFiniteAmount(summary?.monthly_income),
      icon: TrendingUp,
      tile: "from-emerald-500 to-teal-400 shadow-[0_4px_12px_rgba(16,185,129,0.3)]",
      tint: "to-emerald-50/60 dark:to-emerald-950/20",
      valueColor: "text-emerald-600 dark:text-emerald-400",
      sub: "Questo mese",
      chip: <DeltaChip delta={deltaIncome} />,
      spark: cashFlow.map((m) => ({ v: toFiniteAmount(m.income) })),
      sparkColor: "#10b981",
    },
    {
      title: "Uscite Mese",
      value: toFiniteAmount(summary?.monthly_expenses),
      icon: TrendingDown,
      tile: "from-rose-500 to-red-400 shadow-[0_4px_12px_rgba(244,63,94,0.3)]",
      tint: "to-rose-50/60 dark:to-rose-950/20",
      valueColor: "text-rose-600 dark:text-rose-400",
      sub: "Questo mese",
      chip: <DeltaChip delta={deltaExpenses} positiveIsGood={false} />,
      spark: cashFlow.map((m) => ({ v: toFiniteAmount(m.expenses) })),
      sparkColor: "#f43f5e",
    },
    {
      title: "Cash Flow Netto",
      value: netMese,
      icon: ArrowUpDown,
      tile: netMese >= 0
        ? "from-sky-500 to-blue-400 shadow-[0_4px_12px_rgba(14,165,233,0.3)]"
        : "from-rose-500 to-red-400 shadow-[0_4px_12px_rgba(244,63,94,0.3)]",
      tint: netMese >= 0 ? "to-sky-50/60 dark:to-sky-950/20" : "to-rose-50/60 dark:to-rose-950/20",
      valueColor: netMese >= 0 ? "text-sky-600 dark:text-sky-400" : "text-rose-600 dark:text-rose-400",
      sub: "Entrate − uscite mese corrente",
      chip: null,
      spark: cashFlow.map((m) => ({ v: toFiniteAmount(m.net) })),
      sparkColor: netMese >= 0 ? "#0ea5e9" : "#f43f5e",
    },
  ];

  const saldoNegativo = summary && toFiniteAmount(summary.total_balance) < 0;
  const saldoBasso = summary && !saldoNegativo && toFiniteAmount(summary.total_balance) < 1000;

  return (
    <div className="space-y-6">
      {error && (
        <Card className="border-destructive/30">
          <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-destructive">Alcuni dati non sono disponibili: {error}</p>
            <Button variant="outline" size="sm" onClick={() => loadData()}>Riprova</Button>
          </CardContent>
        </Card>
      )}

      {/* KPI — stesso linguaggio dell'header di pagina: tile gradiente, card
          rounded-2xl con velo tinto, delta vs mese precedente e sparkline. */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 sm:gap-4">
        {kpis.map((kpi, kpiIdx) => (
          <div key={kpi.title} className={`relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-card via-card ${kpi.tint} p-4 shadow-sm`}>
            <div className="flex items-center gap-2.5">
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${kpi.tile} text-white`}>
                <kpi.icon className="h-[18px] w-[18px]" />
              </div>
              <span className="text-xs font-medium text-muted-foreground leading-tight">{kpi.title}</span>
            </div>
            <p className={`mt-3 text-xl sm:text-2xl font-bold tabular-nums tracking-tight ${kpi.valueColor}`}>
              {formatEur(kpi.value)}
            </p>
            <div className="mt-1 flex items-center gap-2 min-h-[18px]">
              {kpi.chip ?? <span className="text-[11px] text-muted-foreground">{kpi.sub}</span>}
            </div>
            {kpi.spark.length >= 2 && (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 opacity-50">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={kpi.spark} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
                    <defs>
                      {/* id senza spazi: url(#…) con spazi non risolve in SVG */}
                      <linearGradient id={`tsy-spark-${kpiIdx}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={kpi.sparkColor} stopOpacity={0.35} />
                        <stop offset="100%" stopColor={kpi.sparkColor} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Area type="monotone" dataKey="v" stroke={kpi.sparkColor} strokeWidth={1.5} fill={`url(#tsy-spark-${kpiIdx})`} isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Alert liquidità */}
      {saldoNegativo && (
        <div className="flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-900/50 dark:bg-rose-950/30">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-100 dark:bg-rose-900/40">
            <AlertTriangle className="h-4 w-4 text-rose-600 dark:text-rose-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-rose-800 dark:text-rose-200">Saldo negativo rilevato</p>
            <p className="text-xs text-rose-700/80 dark:text-rose-300/80">Controlla le uscite recenti e le scadenze in arrivo nelle Previsioni.</p>
          </div>
        </div>
      )}
      {saldoBasso && (
        <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-950/30">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-900/40">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">Attenzione: liquidità bassa</p>
            <p className="text-xs text-amber-700/80 dark:text-amber-300/80">Il saldo complessivo è sotto i €1.000.</p>
          </div>
        </div>
      )}

      {/* Andamento saldo — il grafico principe della tesoreria: area con
          gradiente sui 90 giorni, leggibile anche su mobile. */}
      {saldoTrend.length >= 2 && (
        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-100 text-orange-600 dark:bg-orange-950/50 dark:text-orange-400">
                <LineChartIcon className="h-4 w-4" />
              </span>
              Andamento Saldo — Ultimi 90 giorni
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={isMobile ? 200 : 260}>
              <AreaChart data={saldoTrend} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="saldo-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f97316" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="#f97316" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={28} />
                <YAxis tickFormatter={formatCurrencyCompact} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={56} />
                <Tooltip formatter={(v: number) => [formatEur(v), "Saldo"]} labelFormatter={(l) => `Giorno ${l}`} />
                <ReferenceLine y={0} stroke="#f43f5e" strokeDasharray="4 4" />
                <Area type="monotone" dataKey="saldo" stroke="#f97316" strokeWidth={2} fill="url(#saldo-fill)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Cash Flow mensile: vetrina desktop (ComposedChart alto, illeggibile a
          375px) → nascosto su mobile; lì resta l'andamento saldo qui sopra. */}
      {!isMobile && (
      <Card className="rounded-2xl shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-100 text-sky-600 dark:bg-sky-950/50 dark:text-sky-400">
              <ArrowUpDown className="h-4 w-4" />
            </span>
            Cash Flow — Ultimi 6 Mesi
          </CardTitle>
        </CardHeader>
        <CardContent>
          {cashFlow.length === 0 ? (
            <p className="text-muted-foreground text-center py-12">
              Collega una banca per vedere il cash flow
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={cashFlow} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                <YAxis tickFormatter={formatCurrencyCompact} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={56} />
                <Tooltip formatter={(v: number) => formatEur(v)} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="income" name="Entrate" fill="#10b981" radius={[6, 6, 0, 0]} maxBarSize={36} />
                <Bar dataKey="expenses" name="Uscite" fill="#f43f5e" radius={[6, 6, 0, 0]} maxBarSize={36} />
                <Line type="monotone" dataKey="net" name="Netto" stroke="#0ea5e9" strokeWidth={2.5} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
      )}

      {/* Spese per categoria */}
      <Card className="rounded-2xl shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-100 text-violet-600 dark:bg-violet-950/50 dark:text-violet-400">
              <TrendingDown className="h-4 w-4" />
            </span>
            Spese per Categoria — Ultimi 3 Mesi
          </CardTitle>
        </CardHeader>
        <CardContent>
          {byCategory.length === 0 ? (
            <p className="text-muted-foreground text-center py-12">
              Nessuna uscita nel periodo. Categorizza i movimenti dalla scheda Transazioni per vedere la ripartizione.
            </p>
          ) : (
            <div className="grid gap-6 md:grid-cols-2 items-center">
              {/* Donut recharts: solo desktop. Su mobile resta la lista con
                  percentuali (stesso dato, più leggibile a dito). */}
              {!isMobile && (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={byCategory} dataKey="total" nameKey="category" innerRadius={62} outerRadius={95} paddingAngle={2} strokeWidth={2}>
                    {byCategory.map((c) => <Cell key={c.category} fill={categoryColor(c.category)} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatEur(v)} />
                </PieChart>
              </ResponsiveContainer>
              )}
              <div className="space-y-1">
                {(() => { const tot = byCategory.reduce((s, c) => s + c.total, 0); return byCategory.slice(0, 8).map((c) => (
                  <div key={c.category} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-muted/50">
                    <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: categoryColor(c.category) }} />
                    <span className="flex-1 truncate">{c.category}</span>
                    <div className="hidden sm:block h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full" style={{ width: `${tot ? Math.min(100, Math.round((c.total / tot) * 100)) : 0}%`, backgroundColor: categoryColor(c.category) }} />
                    </div>
                    <span className="text-muted-foreground tabular-nums w-9 text-right text-xs">{tot ? Math.round((c.total / tot) * 100) : 0}%</span>
                    <span className="font-semibold tabular-nums w-24 text-right">{formatEur(c.total)}</span>
                  </div>
                )); })()}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Ultime transazioni */}
      <Card className="rounded-2xl shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              <ArrowRight className="h-4 w-4" />
            </span>
            Ultime Transazioni
          </CardTitle>
          <button
            className="text-sm text-primary hover:underline inline-flex items-center gap-1"
            onClick={onNavigateToTransactions}
          >
            Vedi tutte <ArrowRight className="h-3 w-3" />
          </button>
        </CardHeader>
        <CardContent>
          {recentTxs.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">Nessuna transazione</p>
          ) : (
            <div className="space-y-1">
              {recentTxs.map((tx) => {
                const isCredit = tx.transaction_type === "credit";
                return (
                  <div key={tx.id} className="flex items-center justify-between gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-muted/50">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                        isCredit
                          ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400"
                          : "bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400"
                      }`}>
                        {isCredit ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{prettyTxDesc(tx)}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDateIt(tx.booking_date)}
                          {tx.category ? <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px]">{tx.category}</span> : null}
                        </p>
                      </div>
                    </div>
                    <span className={`shrink-0 font-semibold text-sm tabular-nums ${isCredit ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                      {isCredit ? "+" : ""}{formatEur(tx.amount)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
