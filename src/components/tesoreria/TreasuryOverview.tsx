import { useEffect, useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Wallet, TrendingUp, TrendingDown, ArrowUpDown, AlertTriangle, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, Line, ComposedChart, PieChart, Pie, Cell } from "recharts";
import { formatCurrencyCompact, formatDateIt } from "@/lib/formatters";
import { toast } from "sonner";
import { formatTreasuryCurrency, toFiniteAmount } from "@/lib/treasury";
import { useIsMobile } from "@/hooks/use-mobile";

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

export default function TreasuryOverview({ companyId, refreshKey = 0, onNavigateToTransactions }: Props) {
  const isMobile = useIsMobile();
  const [summary, setSummary] = useState<any>(null);
  const [cashFlow, setCashFlow] = useState<any[]>([]);
  const [byCategory, setByCategory] = useState<{ category: string; total: number }[]>([]);
  const [recentTxs, setRecentTxs] = useState<any[]>([]);
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
      setLoading(false);
    }
  }, [companyId, refreshKey]);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [summaryRes, cashFlowRes, catRes, txRes] = await Promise.all([
        supabase.rpc("get_treasury_summary", { p_company_id: companyId }),
        supabase.rpc("get_cash_flow_by_month", { p_company_id: companyId, p_months: 6 }),
        supabase.rpc("get_expenses_by_category", { p_company_id: companyId, p_months: 3 }),
        supabase
          .from("bank_transactions")
          .select("id, booking_date, description, amount, transaction_type, category")
          .eq("company_id", companyId)
          .order("booking_date", { ascending: false })
          .limit(5),
      ]);

      if (!isMountedRef.current) return;

      let hasBlockingError = false;
      if (summaryRes.error) {
        hasBlockingError = true;
        setError(summaryRes.error.message);
      } else if (summaryRes.data && summaryRes.data.length > 0) {
        setSummary(summaryRes.data[0]);
      } else {
        setSummary(null);
      }

      if (cashFlowRes.error) {
        console.error("[TreasuryOverview] Errore cash flow:", cashFlowRes.error.message);
      } else {
        setCashFlow(
          (cashFlowRes.data || []).map((row: any) => ({
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
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="h-80" />
      </div>
    );
  }

  const kpis = [
    { title: "Liquidità Totale", value: toFiniteAmount(summary?.total_balance), icon: Wallet, color: "text-primary", sub: "Saldo di tutti i conti" },
    { title: "Entrate Mese", value: toFiniteAmount(summary?.monthly_income), icon: TrendingUp, color: "text-green-600", sub: "Questo mese" },
    { title: "Uscite Mese", value: toFiniteAmount(summary?.monthly_expenses), icon: TrendingDown, color: "text-red-600", sub: "Questo mese" },
    {
      title: "Cash Flow Netto",
      value: toFiniteAmount(summary?.monthly_net),
      icon: ArrowUpDown,
      color: toFiniteAmount(summary?.monthly_net) >= 0 ? "text-green-600" : "text-red-600",
      sub: "Entrate - Uscite mese corrente",
    },
  ];

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

      {/* KPIs */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <Card key={kpi.title}>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-2">
                <kpi.icon className={`h-5 w-5 ${kpi.color}`} />
                <span className="text-sm text-muted-foreground">{kpi.title}</span>
              </div>
              <p className={`text-2xl font-bold ${kpi.color}`}>{formatEur(kpi.value)}</p>
              <p className="text-xs text-muted-foreground mt-1">{kpi.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Alerts */}
      {summary && toFiniteAmount(summary.total_balance) < 0 && (
        <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-4 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-red-600" />
          <span className="text-red-800 dark:text-red-200 font-medium">Saldo negativo rilevato</span>
        </div>
      )}
      {summary && toFiniteAmount(summary.total_balance) >= 0 && toFiniteAmount(summary.total_balance) < 1000 && (
        <div className="bg-orange-50 dark:bg-orange-950 border border-orange-200 dark:border-orange-800 rounded-lg p-4 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-orange-600" />
          <span className="text-orange-800 dark:text-orange-200 font-medium">Attenzione: liquidità bassa</span>
        </div>
      )}

      {/* Cash Flow Chart: vetrina desktop (ComposedChart alto 320px,
          illeggibile a 375px) → nascosto su mobile. I KPI sopra restano. */}
      {!isMobile && (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Cash Flow — Ultimi 6 Mesi</CardTitle>
        </CardHeader>
        <CardContent>
          {cashFlow.length === 0 ? (
            <p className="text-muted-foreground text-center py-12">
              Collega una banca per vedere il cash flow
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <ComposedChart data={cashFlow}>
                <XAxis dataKey="label" />
                <YAxis tickFormatter={formatCurrencyCompact} />
                <Tooltip formatter={(v: number) => formatEur(v)} />
                <Legend />
                <Bar dataKey="income" name="Entrate" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expenses" name="Uscite" fill="#ef4444" radius={[4, 4, 0, 0]} />
                <Line type="monotone" dataKey="net" name="Netto" stroke="#3b82f6" strokeWidth={2} dot />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
      )}

      {/* Spese per categoria */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Spese per Categoria — Ultimi 3 Mesi</CardTitle>
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
                  <Pie data={byCategory} dataKey="total" nameKey="category" innerRadius={60} outerRadius={95} paddingAngle={2}>
                    {byCategory.map((c) => <Cell key={c.category} fill={categoryColor(c.category)} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatEur(v)} />
                </PieChart>
              </ResponsiveContainer>
              )}
              <div className="space-y-2">
                {(() => { const tot = byCategory.reduce((s, c) => s + c.total, 0); return byCategory.slice(0, 8).map((c) => (
                  <div key={c.category} className="flex items-center gap-2 text-sm">
                    <span className="h-3 w-3 rounded-sm shrink-0" style={{ backgroundColor: categoryColor(c.category) }} />
                    <span className="flex-1 truncate">{c.category}</span>
                    <span className="text-muted-foreground tabular-nums w-10 text-right">{tot ? Math.round((c.total / tot) * 100) : 0}%</span>
                    <span className="font-medium tabular-nums w-24 text-right">{formatEur(c.total)}</span>
                  </div>
                )); })()}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Transactions */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Ultime Transazioni</CardTitle>
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
            <div className="space-y-3">
              {recentTxs.map((tx) => (
                <div key={tx.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div className="flex items-center gap-3">
                    {tx.transaction_type === "credit" ? (
                      <TrendingUp className="h-4 w-4 text-green-600" />
                    ) : (
                      <TrendingDown className="h-4 w-4 text-red-600" />
                    )}
                    <div>
                      <p className="text-sm font-medium truncate max-w-[300px]">{tx.description || "—"}</p>
                      <p className="text-xs text-muted-foreground">{formatDateIt(tx.booking_date)}</p>
                    </div>
                  </div>
                  <span className={`font-semibold text-sm ${tx.transaction_type === "credit" ? "text-green-600" : "text-red-600"}`}>
                    {tx.transaction_type === "credit" ? "+" : ""}{formatEur(tx.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
