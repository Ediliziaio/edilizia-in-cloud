import { useMemo } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  MousePointerClick,
  ShieldAlert,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { formatCurrency, formatDateShort } from "@/lib/formatters";
import type {
  ReferralClick,
  ReferralCompany,
  ReferralEvent,
  ReferralFraudLog,
  ReferralPayout,
  Referrer,
} from "@/pages/admin/ReferralDashboard";

interface Props {
  referrers: Referrer[];
  referralCompanies: ReferralCompany[];
  payouts: ReferralPayout[];
  clicks: ReferralClick[];
  events: ReferralEvent[];
  fraudLogs: ReferralFraudLog[];
  counts?: { clicks90d: number; conversionsTotal: number; conversionsPaying: number; conversionsPaying90d?: number };
  getMonthlyCommission: (r: Referrer) => number;
  onSelectTab: (tab: string) => void;
  onDetail: (r: Referrer) => void;
  onPayout: (r: Referrer) => void;
}

function daysSince(date: string | null | undefined) {
  if (!date) return Number.POSITIVE_INFINITY;
  const parsed = new Date(date).getTime();
  if (Number.isNaN(parsed)) return Number.POSITIVE_INFINITY;
  return Math.floor((Date.now() - parsed) / 86_400_000);
}

function isBillableReferralCompany(rc: ReferralCompany) {
  return rc.is_active && rc.company?.status === "active";
}

export function ReferralCommandCenter({
  referrers,
  referralCompanies,
  payouts,
  clicks,
  events,
  fraudLogs,
  counts,
  getMonthlyCommission,
  onSelectTab,
  onDetail,
  onPayout,
}: Props) {
  // Conteggio click accurato (server-side, non l'array cappato a 500).
  const clicksTotal = counts?.clicks90d ?? clicks.length;
  const insights = useMemo(() => {
    const activeCompanies = referralCompanies.filter(isBillableReferralCompany);
    const pendingPayouts = payouts.filter((p) => p.status === "pending");
    const approvedPayouts = payouts.filter((p) => p.status === "approved" || p.status === "processing");
    const openPayoutAmount = [...pendingPayouts, ...approvedPayouts].reduce((sum, p) => sum + Number(p.amount || 0), 0);

    const clickByReferrer = new Map<string, number>();
    clicks.forEach((click) => {
      clickByReferrer.set(click.referrer_id, (clickByReferrer.get(click.referrer_id) || 0) + 1);
    });

    const companiesByReferrer = new Map<string, ReferralCompany[]>();
    referralCompanies.forEach((company) => {
      companiesByReferrer.set(company.referrer_id, [...(companiesByReferrer.get(company.referrer_id) || []), company]);
    });

    const eventByReferrer = new Map<string, string>();
    events.forEach((event) => {
      if (!event.referrer_id || eventByReferrer.has(event.referrer_id)) return;
      eventByReferrer.set(event.referrer_id, event.created_at);
    });

    const dormantPartners = referrers
      .filter((referrer) => {
        if (!referrer.is_active) return false;
        const lastEvent = eventByReferrer.get(referrer.id) || null;
        const recentClicks = clickByReferrer.get(referrer.id) || 0;
        return daysSince(lastEvent || referrer.created_at) > 30 && recentClicks === 0;
      })
      .slice(0, 5);

    const hotWithoutConversion = referrers
      .map((referrer) => {
        const recentClicks = clickByReferrer.get(referrer.id) || 0;
        const activeCount = (companiesByReferrer.get(referrer.id) || []).filter(isBillableReferralCompany).length;
        return { referrer, recentClicks, activeCount };
      })
      .filter((row) => row.referrer.is_active && row.recentClicks >= 10 && row.activeCount === 0)
      .sort((a, b) => b.recentClicks - a.recentClicks)
      .slice(0, 5);

    const topPartners = referrers
      .filter((referrer) => referrer.is_active)
      .map((referrer) => ({
        referrer,
        monthly: getMonthlyCommission(referrer),
        activeCompanies: (companiesByReferrer.get(referrer.id) || []).filter(isBillableReferralCompany).length,
      }))
      .sort((a, b) => b.monthly - a.monthly)
      .slice(0, 5);

    const totalMrr = activeCompanies.reduce((sum, row) => sum + Number(row.plan?.price_monthly || 0), 0);
    const conversionRate = clicksTotal > 0 ? Math.round((activeCompanies.length / clicksTotal) * 1000) / 10 : 0;

    return {
      activeCompanies,
      pendingPayouts,
      approvedPayouts,
      openPayoutAmount,
      dormantPartners,
      hotWithoutConversion,
      topPartners,
      totalMrr,
      conversionRate,
    };
  }, [clicks, events, getMonthlyCommission, payouts, referralCompanies, referrers]);

  const actionCards = [
    {
      title: "Payout da governare",
      value: String(insights.pendingPayouts.length + insights.approvedPayouts.length),
      description: formatCurrency(insights.openPayoutAmount),
      icon: Wallet,
      tone: insights.openPayoutAmount > 0 ? "warning" : "ok",
      action: "Vai ai payout",
      onClick: () => onSelectTab("payouts"),
    },
    {
      title: "Click senza conversione",
      value: String(insights.hotWithoutConversion.length),
      description: "Partner caldi da aiutare",
      icon: Target,
      tone: insights.hotWithoutConversion.length > 0 ? "warning" : "ok",
      action: "Vedi conversioni",
      onClick: () => onSelectTab("conversions"),
    },
    {
      title: "Partner dormienti",
      value: String(insights.dormantPartners.length),
      description: "Nessuna attività recente",
      icon: Clock3,
      tone: insights.dormantPartners.length > 0 ? "warning" : "ok",
      action: "Apri partner",
      onClick: () => onSelectTab("referrers"),
    },
    {
      title: "Anomalie/frode",
      value: String(fraudLogs.length),
      description: "Da verificare prima del payout",
      icon: ShieldAlert,
      tone: fraudLogs.length > 0 ? "danger" : "ok",
      action: "Regole",
      onClick: () => onSelectTab("rules"),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">MRR referral</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(insights.totalMrr)}</div>
            <p className="text-xs text-muted-foreground">{insights.activeCompanies.length} aziende attive</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Click 90g</CardTitle>
            <MousePointerClick className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{clicksTotal}</div>
            <p className="text-xs text-muted-foreground">{insights.conversionRate}% click to active</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Partner attivi</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{referrers.filter((r) => r.is_active).length}</div>
            <p className="text-xs text-muted-foreground">{referrers.length} totali</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Stato regia</CardTitle>
            <Sparkles className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 text-2xl font-bold">
              {fraudLogs.length === 0 && insights.openPayoutAmount === 0 ? "Pulito" : "Da seguire"}
            </div>
            <p className="text-xs text-muted-foreground">Azioni prioritarie calcolate dai dati</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-4">
        {actionCards.map((card) => (
          <Card key={card.title} className={card.tone === "danger" ? "border-destructive/30" : card.tone === "warning" ? "border-amber-300" : ""}>
            <CardHeader className="space-y-0 pb-2">
              <div className="flex items-center justify-between">
                <card.icon className="h-4 w-4 text-muted-foreground" />
                <Badge variant={card.tone === "ok" ? "secondary" : card.tone === "danger" ? "destructive" : "outline"}>
                  {card.tone === "ok" ? "OK" : "Azione"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <div className="text-2xl font-bold">{card.value}</div>
                <p className="text-sm font-medium">{card.title}</p>
                <p className="text-xs text-muted-foreground">{card.description}</p>
              </div>
              <Button variant="ghost" size="sm" className="h-8 px-0" onClick={card.onClick}>
                {card.action} <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Regia intelligente
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {insights.openPayoutAmount > 0 && (
              <div className="rounded-lg border p-3">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-600" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">Controlla i payout aperti prima del ciclo pagamenti.</p>
                    <p className="text-xs text-muted-foreground">
                      {formatCurrency(insights.openPayoutAmount)} in attesa o approvati.
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => onSelectTab("payouts")}>Apri</Button>
                </div>
              </div>
            )}
            {insights.hotWithoutConversion.map(({ referrer, recentClicks }) => (
              <div key={referrer.id} className="rounded-lg border p-3">
                <div className="flex items-start gap-3">
                  <Target className="mt-0.5 h-4 w-4 text-blue-600" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{referrer.name}: tanti click, zero aziende attive.</p>
                    <p className="text-xs text-muted-foreground">{recentClicks} click negli ultimi 90 giorni.</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => onDetail(referrer)}>Dettaglio</Button>
                </div>
              </div>
            ))}
            {insights.dormantPartners.map((referrer) => (
              <div key={referrer.id} className="rounded-lg border p-3">
                <div className="flex items-start gap-3">
                  <Clock3 className="mt-0.5 h-4 w-4 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{referrer.name}: partner dormiente.</p>
                    <p className="text-xs text-muted-foreground">Ultima attività: {formatDateShort(referrer.last_event_at || referrer.created_at)}</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => onDetail(referrer)}>Apri</Button>
                </div>
              </div>
            ))}
            {insights.openPayoutAmount === 0 && insights.hotWithoutConversion.length === 0 && insights.dormantPartners.length === 0 && fraudLogs.length === 0 && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-4 text-sm text-emerald-800">
                <div className="flex items-center gap-2 font-medium">
                  <CheckCircle2 className="h-4 w-4" />
                  Nessuna urgenza referral rilevata.
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top partner</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {insights.topPartners.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Nessun dato disponibile</p>
            ) : (
              insights.topPartners.map(({ referrer, monthly, activeCompanies }) => {
                const maxMonthly = insights.topPartners[0]?.monthly || 1;
                return (
                  <div key={referrer.id} className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <button className="min-w-0 text-left text-sm font-medium hover:underline" onClick={() => onDetail(referrer)}>
                        {referrer.name}
                      </button>
                      <span className="text-sm font-semibold">{formatCurrency(monthly)}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Progress value={Math.min(100, (monthly / maxMonthly) * 100)} className="h-2" />
                      <span className="w-20 text-right text-xs text-muted-foreground">{activeCompanies} aziende</span>
                    </div>
                  </div>
                );
              })
            )}
            {insights.topPartners[0] && (insights.topPartners[0].referrer.total_earned || 0) - (insights.topPartners[0].referrer.total_paid || 0) > 0 && (
              <Button className="w-full" variant="outline" onClick={() => onPayout(insights.topPartners[0].referrer)}>
                Registra payout top partner
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
