import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/formatters";
import { TrendingUp, BarChart3, Target, DollarSign } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import type { Referrer, ReferralCompany, ReferralPayout } from "@/pages/admin/ReferralDashboard";

interface Props {
  referrers: Referrer[];
  referralCompanies: ReferralCompany[];
  payouts: ReferralPayout[];
  getMonthlyCommission: (r: Referrer) => number;
}

interface ReferrerROI {
  name: string;
  totalCompanies: number;
  activeCompanies: number;
  conversionRate: number;
  totalMrr: number;
  totalPaid: number;
  totalEarned: number;
  roi: number; // MRR generated / commissions paid
  monthlyCommission: number;
}

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

export function ReferralAnalytics({ referrers, referralCompanies, payouts, getMonthlyCommission }: Props) {
  const analytics = useMemo(() => {
    const referrerStats: ReferrerROI[] = referrers.map((r) => {
      const companies = referralCompanies.filter((rc) => rc.referrer_id === r.id);
      const activeCompanies = companies.filter((rc) => rc.is_active && rc.company?.status === "active");
      const totalMrr = activeCompanies.reduce((sum, rc) => sum + (rc.plan?.price_monthly || 0), 0);
      const monthlyCommission = getMonthlyCommission(r);

      return {
        name: r.name,
        totalCompanies: companies.length,
        activeCompanies: activeCompanies.length,
        conversionRate: companies.length > 0
          ? Math.round((activeCompanies.length / companies.length) * 100)
          : 0,
        totalMrr,
        totalPaid: r.total_paid,
        totalEarned: r.total_earned,
        roi: r.total_paid > 0 ? Math.round((totalMrr * 12) / r.total_paid * 100) / 100 : 0,
        monthlyCommission,
      };
    });

    // Overall stats
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

  const roiChartData = analytics.referrerStats
    .filter((r) => r.totalCompanies > 0)
    .map((r) => ({
      name: r.name.length > 12 ? r.name.substring(0, 12) + "…" : r.name,
      roi: r.roi,
      mrr: r.totalMrr,
    }));

  const conversionChartData = analytics.referrerStats
    .filter((r) => r.totalCompanies > 0)
    .map((r) => ({
      name: r.name.length > 12 ? r.name.substring(0, 12) + "…" : r.name,
      rate: r.conversionRate,
      total: r.totalCompanies,
    }));

  return (
    <div className="space-y-6">
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
            <p className="text-xs text-muted-foreground">Da aziende referral attive</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Commissioni Pagate</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(analytics.totalCommissionsPaid)}</div>
            <p className="text-xs text-muted-foreground">Totale erogato</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">ROI Complessivo</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.overallROI}x</div>
            <p className="text-xs text-muted-foreground">ARR / Commissioni pagate</p>
          </CardContent>
        </Card>
      </div>

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
                    formatter={(value: number, name: string) => [`${value}%`, "Conversion"]}
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

        {/* ROI per Referrer */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">ROI per Referrer (ARR/Paid)</CardTitle>
          </CardHeader>
          <CardContent>
            {roiChartData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Nessun dato disponibile</p>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={roiChartData} layout="vertical" margin={{ left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tickFormatter={(v) => `${v}x`} />
                  <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 12 }} />
                  <Tooltip
                    formatter={(value: number, name: string) => {
                      if (name === "roi") return [`${value}x`, "ROI"];
                      return [formatCurrency(value), "MRR"];
                    }}
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                  />
                  <Bar dataKey="roi" radius={[0, 4, 4, 0]}>
                    {roiChartData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Detailed Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dettaglio Performance per Referrer</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 font-medium">Referrer</th>
                  <th className="text-center py-2 font-medium">Portati</th>
                  <th className="text-center py-2 font-medium">Attivi</th>
                  <th className="text-center py-2 font-medium">Conv. %</th>
                  <th className="text-right py-2 font-medium">MRR Gen.</th>
                  <th className="text-right py-2 font-medium">Comm./mese</th>
                  <th className="text-right py-2 font-medium">Pagato</th>
                  <th className="text-right py-2 font-medium">ROI</th>
                </tr>
              </thead>
              <tbody>
                {analytics.referrerStats.map((r) => (
                  <tr key={r.name} className="border-b last:border-0">
                    <td className="py-2 font-medium">{r.name}</td>
                    <td className="text-center py-2">{r.totalCompanies}</td>
                    <td className="text-center py-2">{r.activeCompanies}</td>
                    <td className="text-center py-2">
                      <Badge variant={r.conversionRate >= 50 ? "default" : r.conversionRate >= 25 ? "secondary" : "outline"}>
                        {r.conversionRate}%
                      </Badge>
                    </td>
                    <td className="text-right py-2">{formatCurrency(r.totalMrr)}</td>
                    <td className="text-right py-2">{formatCurrency(r.monthlyCommission)}</td>
                    <td className="text-right py-2">{formatCurrency(r.totalPaid)}</td>
                    <td className="text-right py-2 font-semibold">
                      {r.roi > 0 ? `${r.roi}x` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
