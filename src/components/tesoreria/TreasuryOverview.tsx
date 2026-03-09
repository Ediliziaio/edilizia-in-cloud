import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Wallet, TrendingUp, TrendingDown, ArrowUpDown, AlertTriangle, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, Line, ComposedChart } from "recharts";

const formatEur = (val: number) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(val);

const monthLabels: Record<string, string> = {
  "01": "Gen", "02": "Feb", "03": "Mar", "04": "Apr", "05": "Mag", "06": "Giu",
  "07": "Lug", "08": "Ago", "09": "Set", "10": "Ott", "11": "Nov", "12": "Dic",
};

interface Props {
  companyId: string;
}

export default function TreasuryOverview({ companyId }: Props) {
  const [summary, setSummary] = useState<any>(null);
  const [cashFlow, setCashFlow] = useState<any[]>([]);
  const [recentTxs, setRecentTxs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (companyId) loadData();
  }, [companyId]);

  async function loadData() {
    setLoading(true);
    const [summaryRes, cashFlowRes, txRes] = await Promise.all([
      supabase.rpc("get_treasury_summary", { p_company_id: companyId }),
      supabase.rpc("get_cash_flow_by_month", { p_company_id: companyId, p_months: 6 }),
      supabase
        .from("bank_transactions")
        .select("id, booking_date, description, amount, transaction_type, category")
        .eq("company_id", companyId)
        .order("booking_date", { ascending: false })
        .limit(5),
    ]);

    if (summaryRes.data && summaryRes.data.length > 0) {
      setSummary(summaryRes.data[0]);
    }
    setCashFlow(
      (cashFlowRes.data || []).map((row: any) => ({
        ...row,
        label: monthLabels[row.month?.split("-")[1]] || row.month,
      }))
    );
    setRecentTxs(txRes.data || []);
    setLoading(false);
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
    { title: "Liquidità Totale", value: summary?.total_balance || 0, icon: Wallet, color: "text-primary", sub: "Saldo di tutti i conti" },
    { title: "Entrate Mese", value: summary?.monthly_income || 0, icon: TrendingUp, color: "text-green-600", sub: "Questo mese" },
    { title: "Uscite Mese", value: summary?.monthly_expenses || 0, icon: TrendingDown, color: "text-red-600", sub: "Questo mese" },
    {
      title: "Cash Flow Netto",
      value: summary?.monthly_net || 0,
      icon: ArrowUpDown,
      color: (summary?.monthly_net || 0) >= 0 ? "text-green-600" : "text-red-600",
      sub: "Entrate - Uscite mese corrente",
    },
  ];

  return (
    <div className="space-y-6">
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
      {summary && summary.total_balance < 0 && (
        <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-4 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-red-600" />
          <span className="text-red-800 dark:text-red-200 font-medium">🔴 Saldo negativo rilevato</span>
        </div>
      )}
      {summary && summary.total_balance >= 0 && summary.total_balance < 1000 && (
        <div className="bg-orange-50 dark:bg-orange-950 border border-orange-200 dark:border-orange-800 rounded-lg p-4 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-orange-600" />
          <span className="text-orange-800 dark:text-orange-200 font-medium">⚠ Attenzione: liquidità bassa</span>
        </div>
      )}

      {/* Cash Flow Chart */}
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
                <YAxis tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`} />
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

      {/* Recent Transactions */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Ultime Transazioni</CardTitle>
          <button className="text-sm text-primary hover:underline inline-flex items-center gap-1">
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
                      <p className="text-xs text-muted-foreground">{tx.booking_date}</p>
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
