import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/formatters";
import { TrendingUp, BarChart3, Target, DollarSign, RefreshCw, Download, Trophy } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { exportToCSV } from "@/lib/csvExport";
import type { Referrer, ReferralCompany, ReferralPayout } from "@/pages/admin/ReferralDashboard";

interface Props {
  referrers: Referrer[];
  referralCompanies: ReferralCompany[];
  payouts: ReferralPayout[];
  getMonthlyCommission: (r: Referrer) => number;
}

// Colore SEMANTICO per il conversion rate: prima era un arcobaleno (un colore
// per referrer) che non veicolava alcuna informazione. Ora il colore dice
// "com'è la conversione": verde = buona, ambra = media, rosso = bassa.
function convRateColor(rate: number): string {
  if (rate >= 50) return "hsl(160 84% 39%)"; // emerald
  if (rate >= 20) return "hsl(38 92% 50%)";  // amber
  return "hsl(347 77% 50%)";                  // rose
}

export function ReferralAnalytics({ referrers, referralCompanies, payouts: _payouts, getMonthlyCommission }: Props) {
  const [calculating, setCalculating] = useState(false);

  const analytics = useMemo(() => {
    const referrerStats = referrers.map((r) => {
      const companies = referralCompanies.filter((rc) => rc.referrer_id === r.id);
      const activeCompanies = companies.filter((rc) => rc.is_active && rc.company?.status === "active");
      const totalMrr = activeCompanies.reduce((sum, rc) => sum + (rc.plan?.price_monthly || 0), 0);
      const monthlyCommission = getMonthlyCommission(r);

      return {
        id: r.id,
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
  }, [referrers, referralCompanies, getMonthlyCommission]);

  const calculateCommissions = async () => {
    setCalculating(true);
    try {
      const now = new Date();
      const m = now.getMonth() + 1;
      const y = now.getFullYear();
      const { data, error } = await supabase.rpc("calculate_monthly_commissions", { p_month: m, p_year: y });
      if (error) throw error;
      toast.success(`Calcolate ${data} voci di commissione per ${m}/${y}`);
    } catch (err: unknown) {
      toast.error("Errore", {
        description: err instanceof Error ? err.message : "Calcolo commissioni non riuscito.",
      });
    } finally {
      setCalculating(false);
    }
  };

  const exportCSV = () => {
    exportToCSV(
      analytics.referrerStats.map((r) => ({
        referrer: r.name,
        tier: r.tier?.name || "-",
        totalCompanies: String(r.totalCompanies),
        activeCompanies: String(r.activeCompanies),
        conversionRate: `${r.conversionRate}%`,
        totalMrr: String(r.totalMrr),
        monthlyCommission: String(r.monthlyCommission),
        totalPaid: String(r.totalPaid),
        roi: `${r.roi}x`,
      })),
      [
        { key: "referrer", label: "Referrer" },
        { key: "tier", label: "Tier" },
        { key: "totalCompanies", label: "Aziende Portate" },
        { key: "activeCompanies", label: "Attive" },
        { key: "conversionRate", label: "Conv %" },
        { key: "totalMrr", label: "MRR Generato" },
        { key: "monthlyCommission", label: "Comm./mese" },
        { key: "totalPaid", label: "Pagato" },
        { key: "roi", label: "ROI" },
      ],
      "referral-analytics.csv",
    );
  };

  // Ordina e dimensiona la barra sulla COMMISSIONE mensile (il valore mostrato
  // accanto): prima la barra seguiva l'MRR mentre il numero era la commissione
  // → barra e numero potevano contraddirsi.
  const leaderboard = [...analytics.referrerStats]
    .sort((a, b) => b.monthlyCommission - a.monthlyCommission)
    .slice(0, 5);
  const maxCommission = leaderboard[0]?.monthlyCommission || 1;

  // Solo i referrer con ≥2 aziende (con 1 sola il rate è 0/100%, rumore) e
  // massimo i primi 12 per conversione: oltre, le barre si schiacciano a pochi
  // px in un'altezza fissa. L'altezza cresce col numero di barre.
  const conversionChartData = analytics.referrerStats
    .filter((r) => r.totalCompanies >= 2)
    .sort((a, b) => b.conversionRate - a.conversionRate)
    .slice(0, 12)
    .map((r) => ({
      id: r.id,
      name: r.name.length > 12 ? r.name.substring(0, 12) + "…" : r.name,
      rate: r.conversionRate,
    }));
  const conversionChartHeight = Math.max(180, conversionChartData.length * 34);

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
            <p className="text-xs text-muted-foreground">MRR annualizzato ÷ commissioni pagate</p>
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
                <div key={r.id} className="flex items-center gap-3">
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
                      style={{ width: `${(r.monthlyCommission / maxCommission) * 100}%` }}
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
              <p className="text-sm text-muted-foreground text-center py-8">Nessun referrer con almeno 2 aziende</p>
            ) : (
              <ResponsiveContainer width="100%" height={conversionChartHeight}>
                <BarChart data={conversionChartData} layout="vertical" margin={{ left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                  <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 12 }} />
                  <Tooltip
                    formatter={(value: number) => [`${value}%`, "Conversion"]}
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                  />
                  <Bar dataKey="rate" radius={[0, 4, 4, 0]}>
                    {conversionChartData.map((entry) => (
                      <Cell key={entry.id} fill={convRateColor(entry.rate)} />
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
                    <tr key={r.id} className="border-b last:border-0">
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
