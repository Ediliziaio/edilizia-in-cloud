import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/formatters";
import { TrendingUp, BarChart3, Target, DollarSign, RefreshCw, Download, Trophy } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Referrer, ReferralCompany, ReferralPayout } from "@/pages/admin/ReferralDashboard";

interface Props {
  referrers: Referrer[];
  referralCompanies: ReferralCompany[];
  payouts: ReferralPayout[];
  getMonthlyCommission: (r: Referrer) => number;
}

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

export function ReferralAnalytics({ referrers, referralCompanies, payouts, getMonthlyCommission }: Props) {
  const [calculating, setCalculating] = useState(false);

  const analytics = useMemo(() => {
    const referrerStats = referrers.map((r) => {
      const companies = referralCompanies.filter((rc) => rc.referrer_id === r.id);
      const activeCompanies = companies.filter((rc) => rc.is_active && rc.company?.status === "active");
      const totalMrr = activeCompanies.reduce((sum, rc) => sum + (rc.plan?.price_monthly || 0), 0);
      const monthlyCommission = getMonthlyCommission(r);

      return {
        name: r.name,
        tier: r.referral_tiers,
        totalCompanies: companies.length,
        activeCompanies: activeCompanies.length,
        conversionRate: companies.length > 0 ? Math.round((activeCompanies.length / companies.length) * 100) : 0,
        totalMrr,
        totalPaid: r.total_paid,
        totalEarned: r.total_earned,
        roi: r.total_paid > 0 ? Math.round((totalMrr * 12) / r.total_paid * 100) / 100 : 0,
        monthlyCommission,
        totalClicks: r.total_clicks || 0,
      };
    });

    const totalReferred = referralCompanies.length;
    const totalActive = referralCompanies.filter((rc) => rc.is_active && rc.company?.status === "active").length;
    const overallConversion = totalReferred > 0 ? Math.round((totalActive / totalReferred) * 100) : 0;
    const totalMrrGenerated = referrerStats.reduce((sum, r) => sum + r.totalMrr, 0);
    const totalCommissionsPaid = referrers.reduce((sum, r) => sum + r.total_paid, 0);
    const overallROI = totalCommissionsPaid > 0
      ? Math.round((totalMrrGenerated * 12) / totalCommissionsPaid * 100) / 100
      : 0;

    return {
      referrerStats: referrerStats.sort((a, b) => b.totalMrr - a.totalMrr),
      overallConversion,
      totalMrrGenerated,
      totalCommissionsPaid,
      overallROI,
    };
  }, [referrers, referralCompanies, payouts, getMonthlyCommission]);

  const calculateCommissions = async () => {
    setCalculating(true);
    try {
      const now = new Date();
      const m = now.getMonth() + 1;
      const y = now.getFullYear();
      const { data, error } = await supabase.rpc("calculate_monthly_commissions", { p_month: m, p_year: y });
      if (error) throw error;
      toast.success(`Calcolate ${data} voci di commissione per ${m}/${y}`);
    } catch (err: any) {
      toast.error("Errore", { description: err.message });
    } finally {
      setCalculating(false);
    }
  };

  const exportCSV = () => {
    const csv = [
      ["Referrer", "Tier", "Aziende Portate", "Attive", "Conv %", "MRR Generato", "Comm./mese", "Pagato", "ROI"].join(","),
      ...analytics.referrerStats.map((r) =>
        [r.name, r.tier?.name || "—", r.totalCompanies, r.activeCompanies, r.conversionRate + "%",
          r.totalMrr, r.monthlyCommission, r.totalPaid, r.roi + "x"].join(",")
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "referral-analytics.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const leaderboard = analytics.referrerStats.slice(0, 5);
  const maxMrr = leaderboard[0]?.totalMrr || 1;

  const conversionChartData = analytics.referrerStats
    .filter((r) => r.totalCompanies > 0)
    .map((r) => ({
      name: r.name.length > 12 ? r.name.substring(0, 12) + "…" : r.name,
      rate: r.conversionRate,
    }));

  return (
    <div className="space-y-6">
      {/* Actions */}
      <div className="flex gap-2 flex-wrap">
        <Button onClick={calculateCommissions} disabled={calculating} variant="outline">
          <RefreshCw className={`h-4 w-4 mr-1.5 ${calculating ? "animate-spin" : ""}`} />
          Calcola Commissioni Mese Corrente
        </Button>
        <Button variant="outline" onClick={exportCSV}>
          <Download className="h-4 w-4 mr-1.5" /> Esporta CSV
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Conversion Rate</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.overallConversion}%</div>
            <p className="text-xs text-muted-foreground">Referral → Clienti attivi</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">MRR Generato</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(analytics.totalMrrGenerated)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Commissioni Pagate</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(analytics.totalCommissionsPaid)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">ROI Complessivo</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.overallROI}x</div>
          </CardContent>
        </Card>
      </div>

      {/* Leaderboard */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Trophy className="h-5 w-5" /> Top Partner del Mese
          </CardTitle>
        </CardHeader>
        <CardContent>
          {leaderboard.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Nessun dato</p>
          ) : (
            <div className="space-y-3">
              {leaderboard.map((r, i) => (
                <div key={r.name} className="flex items-center gap-3">
                  <span className="text-sm font-bold w-6 text-muted-foreground">#{i + 1}</span>
                  {r.tier && (
                    <span title={r.tier.name}>{r.tier.icon}</span>
                  )}
                  <span className="text-sm font-medium w-32 truncate">{r.name}</span>
                  <span className="text-xs text-muted-foreground w-20">{r.activeCompanies} aziende</span>
                  <span className="text-xs font-medium w-24 text-right">{formatCurrency(r.monthlyCommission)}/mese</span>
                  <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${(r.totalMrr / maxMrr) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Conversion Rate per Referrer */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Conversion Rate per Referrer</CardTitle>
          </CardHeader>
          <CardContent>
            {conversionChartData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Nessun dato disponibile</p>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={conversionChartData} layout="vertical" margin={{ left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                  <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 12 }} />
                  <Tooltip
                    formatter={(value: number) => [`${value}%`, "Conversion"]}
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                  />
                  <Bar dataKey="rate" radius={[0, 4, 4, 0]}>
                    {conversionChartData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Detail table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dettaglio Performance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 font-medium">Referrer</th>
                    <th className="text-center py-2 font-medium">Click</th>
                    <th className="text-center py-2 font-medium">Attivi</th>
                    <th className="text-right py-2 font-medium">MRR</th>
                    <th className="text-right py-2 font-medium">ROI</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.referrerStats.map((r) => (
                    <tr key={r.name} className="border-b last:border-0">
                      <td className="py-2 font-medium">{r.name}</td>
                      <td className="text-center py-2">{r.totalClicks}</td>
                      <td className="text-center py-2">{r.activeCompanies}</td>
                      <td className="text-right py-2">{formatCurrency(r.totalMrr)}</td>
                      <td className="text-right py-2 font-semibold">{r.roi > 0 ? `${r.roi}x` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
