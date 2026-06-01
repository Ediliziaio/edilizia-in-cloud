import { useMemo } from "react";
import {
  Activity,
  ArrowRight,
  Building2,
  Coins,
  Download,
  Layers,
  MousePointerClick,
  ShieldAlert,
  TrendingUp,
  Trophy,
  UserX,
  Users,
  Wallet,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency, formatDateShort, formatRelativeTime } from "@/lib/formatters";
import { exportToCSV } from "@/lib/csvExport";
import type {
  Referrer,
  ReferralClick,
  ReferralCompany,
  ReferralConversion,
  ReferralEvent,
  ReferralFraudLog,
  ReferralPayout,
} from "@/pages/admin/ReferralDashboard";

interface Props {
  referrers: Referrer[];
  referralCompanies: ReferralCompany[];
  conversions: ReferralConversion[];
  clicks: ReferralClick[];
  events: ReferralEvent[];
  payouts: ReferralPayout[];
  fraudLogs: ReferralFraudLog[];
  counts?: { clicks90d: number; conversionsTotal: number; conversionsPaying: number };
  onSelectTab: (tab: string) => void;
  onDetail: (r: Referrer) => void;
}

const FUNNEL_LABEL: Record<string, string> = {
  click: "Click",
  registered: "Registrato",
  active: "Attivo",
  paying: "Pagante",
  approved: "Approvato",
  rejected: "Rifiutato",
  expired: "Scaduto",
};

const EVENT_LABEL: Record<string, string> = {
  click: "Click sul link",
  register: "Registrazione",
  registered: "Registrazione",
  activate: "Attivazione",
  active: "Attivazione",
  convert: "Conversione",
  conversion: "Conversione",
  paying: "Cliente pagante",
  approved: "Commissione approvata",
  payout: "Payout",
  reject: "Referenza rifiutata",
  rejected: "Referenza rifiutata",
};

// Palette esplicita: i token --chart-* non sono definiti in index.css, quindi
// usiamo colori HSL letterali leggibili sia in light che dark.
const COLOR = {
  blue: "hsl(214 80% 50%)",
  emerald: "hsl(160 84% 39%)",
  emeraldDark: "hsl(160 84% 30%)",
  amber: "hsl(38 92% 50%)",
  violet: "hsl(262 83% 58%)",
  rose: "hsl(347 77% 50%)",
  slate: "hsl(215 16% 55%)",
  cyan: "hsl(190 90% 42%)",
};

const STATUS_COLOR: Record<string, string> = {
  click: COLOR.cyan,
  registered: COLOR.blue,
  active: COLOR.violet,
  paying: COLOR.emerald,
  approved: COLOR.emeraldDark,
  rejected: COLOR.rose,
  expired: COLOR.slate,
};

const FUNNEL_COLORS = [COLOR.cyan, COLOR.blue, COLOR.violet, COLOR.emerald, COLOR.emeraldDark];

const EVENT_COLOR: Record<string, string> = {
  click: COLOR.cyan,
  register: COLOR.blue,
  registered: COLOR.blue,
  activate: COLOR.violet,
  active: COLOR.violet,
  convert: COLOR.emerald,
  conversion: COLOR.emerald,
  paying: COLOR.emerald,
  approved: COLOR.emeraldDark,
  payout: COLOR.amber,
  reject: COLOR.rose,
  rejected: COLOR.rose,
};

const STATUS_ORDER = ["click", "registered", "active", "paying", "approved", "rejected", "expired"];

const TOOLTIP_STYLE = {
  background: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 8,
  fontSize: 12,
} as const;

function compactEuro(value: number) {
  if (Math.abs(value) >= 1000) return `€${(value / 1000).toFixed(1)}k`;
  return `€${Math.round(value)}`;
}

function isBillable(rc: ReferralCompany) {
  return rc.is_active && rc.company?.status === "active";
}

export function ReferralMegaDashboard({
  referrers,
  referralCompanies,
  conversions,
  clicks,
  events,
  payouts,
  fraudLogs,
  counts,
  onSelectTab,
  onDetail,
}: Props) {
  const referrersById = useMemo(() => new Map(referrers.map((r) => [r.id, r])), [referrers]);
  const companyNameById = useMemo(() => {
    const map = new Map<string, string>();
    referralCompanies.forEach((rc) => {
      if (rc.company?.name && rc.company_id) map.set(rc.company_id, rc.company.name);
    });
    return map;
  }, [referralCompanies]);

  const stats = useMemo(() => {
    const activeReferrers = referrers.filter((r) => r.is_active);
    const orphanCount = referrers.filter((r) => !r.user_id).length;
    const activeCompanies = referralCompanies.filter(isBillable);
    const totalMrr = activeCompanies.reduce((sum, rc) => sum + Number(rc.plan?.price_monthly || 0), 0);

    const totalEarned = referrers.reduce((sum, r) => sum + Number(r.total_earned || 0), 0);
    const totalPaid = referrers.reduce((sum, r) => sum + Number(r.total_paid || 0), 0);
    const toPay = referrers.reduce((sum, r) => sum + Math.max(0, Number(r.total_earned || 0) - Number(r.total_paid || 0)), 0);

    const trackedRevenue = conversions.reduce((sum, c) => sum + Number(c.revenue || 0), 0);
    const trackedCommission = conversions.reduce((sum, c) => sum + Number(c.commission_amount || 0), 0);
    const payingCount = conversions.filter((c) => c.status === "paying" || c.status === "approved").length;
    const flaggedCount = conversions.filter((c) => c.fraud_status === "review" || c.fraud_status === "blocked").length;

    // Totali accurati dai conteggi server-side; fallback alle lunghezze degli
    // array, che possono essere troncate dai .limit() delle query righe.
    const clicksTotal = counts?.clicks90d ?? clicks.length;
    const conversionsTotal = counts?.conversionsTotal ?? conversions.length;
    const payingTotal = counts?.conversionsPaying ?? payingCount;

    // Funnel cumulativo: ogni stadio include quelli successivi.
    const reached = (statuses: string[]) => conversions.filter((c) => statuses.includes(c.status)).length;
    const funnel = [
      { stage: "Click 90g", value: clicksTotal },
      { stage: "Registrati", value: reached(["registered", "active", "paying", "approved"]) },
      { stage: "Attivi", value: reached(["active", "paying", "approved"]) },
      { stage: "Paganti", value: reached(["paying", "approved"]) },
      { stage: "Approvati", value: reached(["approved"]) },
    ];
    const conversionRate = clicksTotal > 0 ? Math.round((payingTotal / clicksTotal) * 1000) / 10 : 0;

    // Distribuzione stati (tutte le referenze)
    const statusDist = STATUS_ORDER
      .map((s) => ({ status: s, label: FUNNEL_LABEL[s] || s, value: conversions.filter((c) => c.status === s).length }))
      .filter((x) => x.value > 0);

    // Trend ultimi 6 mesi: nuove referenze + revenue
    const now = new Date();
    const months: { key: string; label: string; referenze: number; revenue: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: format(d, "MMM", { locale: it }), referenze: 0, revenue: 0 });
    }
    const monthIndex = new Map(months.map((m, i) => [m.key, i]));
    conversions.forEach((c) => {
      if (!c.created_at) return;
      const d = new Date(c.created_at);
      const idx = monthIndex.get(`${d.getFullYear()}-${d.getMonth()}`);
      if (idx === undefined) return;
      months[idx].referenze += 1;
      months[idx].revenue += Number(c.revenue || 0);
    });

    // Distribuzione per tier (partner attivi)
    const tierMap = new Map<string, { name: string; icon: string; color: string; count: number }>();
    activeReferrers.forEach((r) => {
      const t = r.referral_tiers;
      const key = t?.slug || "none";
      const entry = tierMap.get(key) || {
        name: t?.name || "Senza tier",
        icon: t?.icon || "·",
        color: t?.color || "hsl(215 16% 55%)",
        count: 0,
      };
      entry.count += 1;
      tierMap.set(key, entry);
    });
    const tierDist = [...tierMap.values()].sort((a, b) => b.count - a.count);
    const maxTier = tierDist[0]?.count || 1;

    // Pipeline payout
    const payoutPending = payouts.filter((p) => p.status === "pending");
    const payoutApproved = payouts.filter((p) => p.status === "approved" || p.status === "processing");
    const payoutPaid = payouts.filter((p) => p.status === "paid");
    const sumAmount = (rows: ReferralPayout[]) => rows.reduce((sum, p) => sum + Number(p.amount || 0), 0);

    // Top referenze per revenue
    const topReferences = [...conversions]
      .filter((c) => Number(c.revenue || 0) > 0 || c.status === "paying" || c.status === "approved")
      .sort((a, b) => Number(b.revenue || 0) - Number(a.revenue || 0))
      .slice(0, 8);

    return {
      activeReferrers,
      orphanCount,
      activeCompanies,
      totalMrr,
      totalEarned,
      totalPaid,
      toPay,
      trackedRevenue,
      trackedCommission,
      payingCount,
      payingTotal,
      clicksTotal,
      conversionsTotal,
      flaggedCount,
      funnel,
      conversionRate,
      statusDist,
      months,
      tierDist,
      maxTier,
      payout: {
        pendingCount: payoutPending.length,
        pendingAmount: sumAmount(payoutPending),
        approvedCount: payoutApproved.length,
        approvedAmount: sumAmount(payoutApproved),
        paidCount: payoutPaid.length,
        paidAmount: sumAmount(payoutPaid),
      },
      topReferences,
    };
  }, [referrers, referralCompanies, conversions, clicks, payouts, counts]);

  const exportAll = () => {
    exportToCSV(
      conversions.map((c) => {
        const r = referrersById.get(c.referrer_id);
        return {
          azienda: (c.company_id && companyNameById.get(c.company_id)) || c.company_id || "-",
          partner: r?.name || "-",
          email_partner: r?.email || "-",
          stato: FUNNEL_LABEL[c.status] || c.status,
          revenue: String(Number(c.revenue || 0)),
          commissione: String(Number(c.commission_amount || 0)),
          frode: c.fraud_status || "clear",
          data: c.created_at ? formatDateShort(c.created_at) : "-",
        };
      }),
      [
        { key: "azienda", label: "Azienda" },
        { key: "partner", label: "Partner" },
        { key: "email_partner", label: "Email partner" },
        { key: "stato", label: "Stato" },
        { key: "revenue", label: "Revenue" },
        { key: "commissione", label: "Commissione" },
        { key: "frode", label: "Frode" },
        { key: "data", label: "Data" },
      ],
      "referral-tutte-le-referenze.csv",
    );
  };

  const kpisPrimary = [
    {
      title: "Referenze totali",
      value: String(stats.conversionsTotal),
      sub: `${stats.payingTotal} paganti`,
      icon: Building2,
    },
    {
      title: "Revenue tracciata",
      value: formatCurrency(stats.trackedRevenue),
      sub: `MRR attivo ${formatCurrency(stats.totalMrr)}`,
      icon: TrendingUp,
    },
    {
      title: "Commissioni maturate",
      value: formatCurrency(stats.totalEarned),
      sub: `Pagate ${formatCurrency(stats.totalPaid)}`,
      icon: Coins,
    },
    {
      title: "Partner attivi",
      value: String(stats.activeReferrers.length),
      sub: `${referrers.length} totali`,
      icon: Users,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Panoramica referral</h2>
          <p className="text-sm text-muted-foreground">Tutte le statistiche di partner e referenze in un colpo d'occhio</p>
        </div>
        <Button variant="outline" size="sm" onClick={exportAll} disabled={conversions.length === 0}>
          <Download className="mr-1.5 h-4 w-4" /> Esporta tutte le referenze
        </Button>
      </div>

      {stats.orphanCount > 0 && (
        <button
          type="button"
          onClick={() => onSelectTab("referrers")}
          className="flex w-full items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-left transition hover:bg-amber-100"
        >
          <div className="flex items-center gap-3">
            <UserX className="h-5 w-5 text-amber-600" />
            <div>
              <p className="text-sm font-medium text-amber-800">{stats.orphanCount} partner senza accesso al portale</p>
              <p className="text-xs text-amber-700">Creati senza account collegato — reinvitali dalla scheda Partner</p>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-amber-600" />
        </button>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {kpisPrimary.map((kpi) => (
          <Card key={kpi.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{kpi.title}</CardTitle>
              <kpi.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{kpi.value}</div>
              <p className="text-xs text-muted-foreground">{kpi.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className={stats.toPay > 0 ? "border-amber-300" : ""}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Da pagare</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.toPay)}</div>
            <Button variant="ghost" size="sm" className="h-7 px-0 text-xs" onClick={() => onSelectTab("payouts")}>
              Vai ai payout <ArrowRight className="ml-1 h-3 w-3" />
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Conversion globale</CardTitle>
            <MousePointerClick className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.conversionRate}%</div>
            <p className="text-xs text-muted-foreground">{stats.clicksTotal} click → {stats.payingTotal} paganti</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Commissioni tracciate</CardTitle>
            <Coins className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.trackedCommission)}</div>
            <p className="text-xs text-muted-foreground">Dalle conversioni</p>
          </CardContent>
        </Card>
        <Card className={stats.flaggedCount > 0 ? "border-destructive/40" : ""}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Segnalati frode</CardTitle>
            <ShieldAlert className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.flaggedCount}</div>
            <p className="text-xs text-muted-foreground">{fraudLogs.length} anomalie registrate</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" /> Funnel di conversione
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats.funnel.every((f) => f.value === 0) ? (
              <p className="py-10 text-center text-sm text-muted-foreground">Nessun dato di funnel</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={stats.funnel} layout="vertical" margin={{ left: 10, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
                  <YAxis type="category" dataKey="stage" width={84} tick={{ fontSize: 12 }} />
                  <RTooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [v, "Conteggio"]} />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {stats.funnel.map((entry, i) => (
                      <Cell key={entry.stage} fill={FUNNEL_COLORS[i % FUNNEL_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" /> Andamento ultimi 6 mesi
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={stats.months} margin={{ left: -8, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis yAxisId="left" allowDecimals={false} tick={{ fontSize: 12 }} />
                <YAxis yAxisId="right" orientation="right" tickFormatter={compactEuro} tick={{ fontSize: 11 }} width={48} />
                <RTooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(value: number, name) => name === "revenue" ? [formatCurrency(value), "Revenue"] : [value, "Referenze"]}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar yAxisId="left" dataKey="referenze" name="Referenze" fill={COLOR.blue} radius={[4, 4, 0, 0]} />
                <Line yAxisId="right" dataKey="revenue" name="revenue" stroke={COLOR.emerald} strokeWidth={2} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Distribuzione referenze per stato</CardTitle>
          </CardHeader>
          <CardContent>
            {stats.statusDist.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">Nessuna referenza</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={stats.statusDist}
                    dataKey="value"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    innerRadius={56}
                    outerRadius={88}
                    paddingAngle={2}
                  >
                    {stats.statusDist.map((d) => (
                      <Cell key={d.status} fill={STATUS_COLOR[d.status]} />
                    ))}
                  </Pie>
                  <RTooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number, n) => [v, n]} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Layers className="h-5 w-5 text-primary" /> Partner per tier
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {stats.tierDist.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">Nessun partner attivo</p>
            ) : (
              stats.tierDist.map((tier) => (
                <div key={tier.name} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 font-medium">
                      <span>{tier.icon}</span> {tier.name}
                    </span>
                    <span className="text-muted-foreground">{tier.count} partner</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${(tier.count / stats.maxTier) * 100}%`, backgroundColor: tier.color }}
                    />
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-amber-200">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-amber-700">Payout in attesa</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.payout.pendingAmount)}</div>
            <p className="text-xs text-muted-foreground">{stats.payout.pendingCount} richieste</p>
          </CardContent>
        </Card>
        <Card className="border-blue-200">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-blue-700">Approvati / in corso</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.payout.approvedAmount)}</div>
            <p className="text-xs text-muted-foreground">{stats.payout.approvedCount} payout</p>
          </CardContent>
        </Card>
        <Card className="border-emerald-200">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-emerald-700">Pagati</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.payout.paidAmount)}</div>
            <p className="text-xs text-muted-foreground">{stats.payout.paidCount} payout</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base flex items-center gap-2">
            <Trophy className="h-5 w-5 text-primary" /> Top referenze per revenue
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={() => onSelectTab("conversions")}>
            Tutte le conversioni <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
          </Button>
        </CardHeader>
        <CardContent>
          {stats.topReferences.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Nessuna referenza con revenue tracciata</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Azienda</TableHead>
                    <TableHead>Partner</TableHead>
                    <TableHead>Stato</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">Commissione</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.topReferences.map((c) => {
                    const referrer = referrersById.get(c.referrer_id);
                    return (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">
                          {(c.company_id && companyNameById.get(c.company_id)) || "Azienda referral"}
                        </TableCell>
                        <TableCell>
                          {referrer ? (
                            <button className="text-left hover:underline" onClick={() => onDetail(referrer)}>
                              {referrer.name}
                            </button>
                          ) : "-"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={c.status === "paying" || c.status === "approved" ? "default" : "outline"}>
                            {FUNNEL_LABEL[c.status] || c.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-semibold">{formatCurrency(Number(c.revenue || 0))}</TableCell>
                        <TableCell className="text-right">{formatCurrency(Number(c.commission_amount || 0))}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" /> Attività recente
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={() => onSelectTab("regia")}>
            Apri regia <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
          </Button>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Nessuna attività registrata</p>
          ) : (
            <ol className="space-y-3">
              {events.slice(0, 12).map((e) => {
                const r = e.referrer_id ? referrersById.get(e.referrer_id) : undefined;
                return (
                  <li key={e.id} className="flex items-center gap-3 text-sm">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: EVENT_COLOR[e.event_type] || COLOR.slate }}
                    />
                    <span className="font-medium">{EVENT_LABEL[e.event_type] || e.event_type}</span>
                    {r ? (
                      <button className="truncate text-left text-muted-foreground hover:underline" onClick={() => onDetail(r)}>
                        {r.name}
                      </button>
                    ) : (
                      <span className="truncate text-muted-foreground">{e.referral_code || "—"}</span>
                    )}
                    <span className="ml-auto shrink-0 text-xs text-muted-foreground">{formatRelativeTime(e.created_at)}</span>
                  </li>
                );
              })}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
