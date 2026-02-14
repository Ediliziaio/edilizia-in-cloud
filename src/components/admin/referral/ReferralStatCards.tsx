import { Users, Building2, TrendingUp, Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/formatters";
import type { Referrer, ReferralCompany, ReferralPayout } from "@/pages/admin/ReferralDashboard";

interface Props {
  referrers: Referrer[];
  referralCompanies: ReferralCompany[];
  payouts: ReferralPayout[];
  getMonthlyCommission: (r: Referrer) => number;
}

export function ReferralStatCards({ referrers, referralCompanies, payouts, getMonthlyCommission }: Props) {
  const activeReferrers = referrers.filter((r) => r.is_active).length;
  const totalCompanies = referralCompanies.length;
  const monthlyTotal = referrers.filter(r => r.is_active).reduce((sum, r) => sum + getMonthlyCommission(r), 0);
  const totalEarned = referrers.reduce((sum, r) => sum + r.total_earned, 0);
  const totalPaid = referrers.reduce((sum, r) => sum + r.total_paid, 0);
  const toPay = totalEarned - totalPaid;

  const cards = [
    { title: "Referrer Attivi", value: activeReferrers.toString(), icon: Users, description: `${referrers.length} totali` },
    { title: "Aziende Portate", value: totalCompanies.toString(), icon: Building2, description: "Totale registrazioni" },
    { title: "Commissioni Mensili", value: formatCurrency(monthlyTotal), icon: TrendingUp, description: "Stima questo mese" },
    { title: "Da Pagare", value: formatCurrency(toPay > 0 ? toPay : 0), icon: Wallet, description: `${formatCurrency(totalPaid)} già pagati` },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.title}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
            <card.icon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{card.value}</div>
            <p className="text-xs text-muted-foreground">{card.description}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
