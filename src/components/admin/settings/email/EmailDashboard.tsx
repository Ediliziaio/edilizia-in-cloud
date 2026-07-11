import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { BarChart3, Mail, TrendingUp, Users, MousePointerClick, AlertTriangle, Calendar, DollarSign, Percent, RefreshCw, Send, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { formatEur } from "@/modules/ai-agents/lib/creditCalculator";
import { formatError } from "@/lib/errors";

interface PlatformStats {
  total_sent: number;
  total_delivered: number;
  total_opened: number;
  total_clicked: number;
  total_bounced: number;
  total_unsubscribed: number;
  total_spam: number;
  total_credits_used: number;
  total_revenue: number;
  active_companies: number;
}

interface TopCompany {
  company_id: string;
  company_name: string;
  total_spent: number;
  balance: number;
}

type PeriodKey = "today" | "7d" | "30d" | "all";

const PROVIDER_LABELS: Record<string, string> = {
  elastic_email: "Elastic Email",
  resend: "Resend",
  sendgrid: "SendGrid",
  brevo: "Brevo",
  mailgun: "Mailgun",
};

const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: "today", label: "Oggi" },
  { key: "7d", label: "7 giorni" },
  { key: "30d", label: "30 giorni" },
  { key: "all", label: "Tutto" },
];

function getPeriodDates(period: PeriodKey): { from: string | null; to: string | null } {
  const now = new Date();
  const to = now.toISOString();
  switch (period) {
    case "today": {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      return { from: start.toISOString(), to };
    }
    case "7d": {
      const start = new Date(now);
      start.setDate(start.getDate() - 7);
      return { from: start.toISOString(), to };
    }
    case "30d": {
      const start = new Date(now);
      start.setDate(start.getDate() - 30);
      return { from: start.toISOString(), to };
    }
    case "all":
    default:
      return { from: null, to: null };
  }
}

export function EmailDashboard() {
  const [period, setPeriod] = useState<PeriodKey>("30d");

  const { data: stats, isLoading: statsLoading, isError: statsError, error: statsErrorObj, refetch: refetchStats } = useQuery({
    queryKey: ["platform-email-stats", period],
    queryFn: async () => {
      const { from, to } = getPeriodDates(period);
      const { data, error } = await supabase.rpc("get_platform_email_stats" as never, {
        p_date_from: from,
        p_date_to: to,
      } as never);
      if (error) throw error;
      const arr = data as unknown as PlatformStats[];
      return arr?.[0] ?? null;
    },
  });

  const { data: topCompanies, isLoading: topLoading, isError: topError, refetch: refetchTop } = useQuery({
    queryKey: ["email-top-companies"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_top_companies_by_email" as never, { p_limit: 10 } as never);
      if (error) throw error;
      return ((data as unknown as TopCompany[]) ?? []).map((r) => ({
        company_id: r.company_id,
        company_name: r.company_name || "—",
        total_spent: r.total_spent ?? 0,
        balance: r.balance ?? 0,
      }));
    },
  });

  // Fetch provider cost from platform_settings
  const { data: providerCost } = useQuery({
    queryKey: ["email-provider-cost"],
    queryFn: async () => {
      const { data } = await supabase
        .from("platform_settings")
        .select("value")
        .eq("key", "credits_email_provider_cost")
        .maybeSingle();
      return parseFloat(data?.value || "0.001");
    },
  });

  const { data: streamProviders } = useQuery({
    queryKey: ["platform-email-provider-labels"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_settings")
        .select("key, value")
        .in("key", ["email_marketing_provider", "email_transactional_provider"]);
      if (error) throw error;
      const rows = (data ?? []) as Array<{ key: string; value: string }>;
      const marketing = rows.find((row) => row.key === "email_marketing_provider")?.value ?? "elastic_email";
      const transactional = rows.find((row) => row.key === "email_transactional_provider")?.value ?? "resend";
      return { marketing, transactional };
    },
  });

  // Real volumes per stream from the unified email_delivery_log — this is the
  // SOURCE OF TRUTH for transactional emails (which never touch email_logs).
  // Conteggi via head-count exact (il fetch senza .limit() veniva troncato a
  // 1000 righe da PostgREST). Il webhook muta lo status in place
  // (delivered→spam/unsubscribed/deferred), quindi "inviate" = tutto ciò che
  // non è failed/bounced/dropped, e spam/unsubscribed sono sottoinsiemi
  // delle consegnate.
  const { data: streamBreakdown, isError: breakdownError, refetch: refetchBreakdown } = useQuery({
    queryKey: ["email-stream-breakdown", period],
    queryFn: async () => {
      const { from, to } = getPeriodDates(period);
      const FAILED_STATUSES = ["failed", "bounced", "dropped"];
      const DELIVERED_STATUSES = ["delivered", "spam", "unsubscribed"];
      const failedIn = `(${FAILED_STATUSES.join(",")})`;

      const countBase = (stream: "marketing" | "transactional") => {
        let q = supabase
          .from("email_delivery_log")
          .select("id", { count: "exact", head: true });
        if (from) q = q.gte("sent_at", from);
        if (to) q = q.lte("sent_at", to);
        // stream è nullable: le righe senza stream vanno nel bucket transazionale
        return stream === "marketing"
          ? q.eq("stream", "marketing")
          : q.or("stream.neq.marketing,stream.is.null");
      };

      const [mkSent, mkDelivered, mkFailed, trSent, trDelivered, trFailed, trUnbilled] = await Promise.all([
        countBase("marketing").not("status", "in", failedIn),
        countBase("marketing").in("status", DELIVERED_STATUSES),
        countBase("marketing").in("status", FAILED_STATUSES),
        countBase("transactional").not("status", "in", failedIn),
        countBase("transactional").in("status", DELIVERED_STATUSES),
        countBase("transactional").in("status", FAILED_STATUSES),
        countBase("transactional").not("status", "in", failedIn).or("charged_eur.is.null,charged_eur.eq.0"),
      ]);
      for (const res of [mkSent, mkDelivered, mkFailed, trSent, trDelivered, trFailed, trUnbilled]) {
        if (res.error) throw res.error;
      }

      // Somme revenue/cost: nessuna RPC di aggregazione disponibile →
      // fetch con limite esplicito ampio + flag di troncamento per la UI.
      const SUM_FETCH_LIMIT = 50000;
      let q = supabase
        .from("email_delivery_log")
        .select("stream, charged_eur, cost_eur")
        .limit(SUM_FETCH_LIMIT);
      if (from) q = q.gte("sent_at", from);
      if (to) q = q.lte("sent_at", to);
      const { data, error } = await q;
      if (error) throw error;
      const rows = (data ?? []) as Array<{
        stream: string | null;
        charged_eur: number | null;
        cost_eur: number | null;
      }>;
      const truncated = rows.length >= SUM_FETCH_LIMIT;

      const mktg = { sent: mkSent.count ?? 0, delivered: mkDelivered.count ?? 0, failed: mkFailed.count ?? 0, revenue: 0, cost: 0 };
      const trans = { sent: trSent.count ?? 0, delivered: trDelivered.count ?? 0, failed: trFailed.count ?? 0, revenue: 0, cost: 0, unbilled: trUnbilled.count ?? 0 };
      for (const r of rows) {
        const bucket = r.stream === "marketing" ? mktg : trans;
        bucket.revenue += Number(r.charged_eur ?? 0);
        bucket.cost += Number(r.cost_eur ?? 0);
      }
      return { mktg, trans, truncated };
    },
  });

  if (statsLoading) return <Skeleton className="h-[400px]" />;

  const s = stats ?? {
    total_sent: 0, total_delivered: 0, total_opened: 0, total_clicked: 0,
    total_bounced: 0, total_unsubscribed: 0, total_spam: 0,
    total_credits_used: 0, total_revenue: 0, active_companies: 0,
  };

  const openRate = s.total_delivered > 0 ? ((s.total_opened / s.total_delivered) * 100).toFixed(1) : "0";
  const clickRate = s.total_opened > 0 ? ((s.total_clicked / s.total_opened) * 100).toFixed(1) : "0";
  const bounceRate = s.total_sent > 0 ? ((s.total_bounced / s.total_sent) * 100).toFixed(1) : "0";

  // Financial KPIs
  const costPerEmail = providerCost ?? 0.001;
  const totalProviderCost = s.total_sent * costPerEmail;
  const totalRevenue = s.total_credits_used; // credits_used = revenue from clients
  const margin = totalRevenue - totalProviderCost;
  const marginPercent = totalRevenue > 0 ? ((margin / totalRevenue) * 100).toFixed(1) : "0";

  const kpis = [
    { label: "Email Inviate", value: s.total_sent.toLocaleString(), icon: Mail, color: "text-blue-600" },
    { label: "Consegnate", value: s.total_delivered.toLocaleString(), icon: Mail, color: "text-green-600" },
    { label: "Tasso Apertura", value: `${openRate}%`, icon: TrendingUp, color: "text-amber-600" },
    { label: "Tasso Click", value: `${clickRate}%`, icon: MousePointerClick, color: "text-purple-600" },
    { label: "Bounce Rate", value: `${bounceRate}%`, icon: AlertTriangle, color: "text-red-600" },
    { label: "Aziende Attive", value: s.active_companies.toLocaleString(), icon: Users, color: "text-primary" },
  ];

  const financialKpis = [
    { label: "Ricavi Lordi", value: formatEur(totalRevenue), icon: DollarSign, color: "text-green-600", description: "Crediti spesi dai clienti" },
    { label: "Costo Provider", value: formatEur(totalProviderCost), icon: BarChart3, color: "text-red-600", description: `${formatEur(costPerEmail)}/email × ${s.total_sent.toLocaleString()}` },
    { label: "Margine Netto", value: formatEur(margin), icon: TrendingUp, color: margin >= 0 ? "text-green-700" : "text-red-600", description: `${marginPercent}% del ricavo` },
    { label: "Margine %", value: `${marginPercent}%`, icon: Percent, color: margin >= 0 ? "text-green-700" : "text-red-600", description: "Ricavi - Costi Provider" },
  ];

  return (
    <div className="space-y-6">
      {/* Period Selector */}
      <div className="flex items-center gap-2">
        <Calendar className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground mr-2">Periodo:</span>
        {PERIODS.map((p) => (
          <Button
            key={p.key}
            variant={period === p.key ? "default" : "outline"}
            size="sm"
            onClick={() => setPeriod(p.key)}
            className="text-xs"
          >
            {p.label}
          </Button>
        ))}
      </div>

      {/* KPI Grid — su errore RPC non mostrare 0 come dati veri */}
      {statsError ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between gap-3 flex-wrap">
            <span>Errore caricamento statistiche email: {formatError(statsErrorObj)}</span>
            <Button variant="outline" size="sm" onClick={() => refetchStats()} className="h-7 gap-1 text-xs">
              <RefreshCw className="h-3 w-3" /> Riprova
            </Button>
          </AlertDescription>
        </Alert>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {kpis.map((kpi) => (
            <Card key={kpi.label}>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2 mb-1">
                  <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
                  <span className="text-xs text-muted-foreground">{kpi.label}</span>
                </div>
                <p className="text-2xl font-bold">{kpi.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Stream breakdown — real volumes from email_delivery_log */}
      {breakdownError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between gap-3 flex-wrap">
            <span>Errore caricamento volumi per stream.</span>
            <Button variant="outline" size="sm" onClick={() => refetchBreakdown()} className="h-7 gap-1 text-xs">
              <RefreshCw className="h-3 w-3" /> Riprova
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {streamBreakdown && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <h3 className="text-sm font-semibold text-muted-foreground">📬 Volumi reali per stream (email_delivery_log)</h3>
            {streamBreakdown.truncated && (
              <Badge variant="secondary" className="text-xs" title="Il periodo contiene più di 50.000 righe: ricavi e costi sono calcolati su un campione parziale. I conteggi restano esatti.">
                Ricavi su dati parziali
              </Badge>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <Send className="h-4 w-4 text-blue-600" />
                  <CardTitle className="text-sm">
                    Marketing — {PROVIDER_LABELS[streamProviders?.marketing ?? "elastic_email"] ?? (streamProviders?.marketing ?? "Elastic Email")}
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="grid grid-cols-3 gap-2 sm:gap-3">
                <div>
                  <p className="text-[10px] sm:text-xs text-muted-foreground">Inviate</p>
                  <p className="text-base sm:text-xl font-bold">{streamBreakdown.mktg.sent.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-[10px] sm:text-xs text-muted-foreground">Fallite</p>
                  <p className="text-base sm:text-xl font-bold text-red-600">{streamBreakdown.mktg.failed.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-[10px] sm:text-xs text-muted-foreground">Ricavi</p>
                  <p className="text-base sm:text-xl font-bold text-green-700">{formatEur(streamBreakdown.mktg.revenue)}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-amber-600" />
                  <CardTitle className="text-sm">
                    Transazionali — {PROVIDER_LABELS[streamProviders?.transactional ?? "resend"] ?? (streamProviders?.transactional ?? "Resend")}
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">Inviate</p>
                  <p className="text-xl font-bold">{streamBreakdown.trans.sent.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Fallite</p>
                  <p className="text-xl font-bold text-red-600">{streamBreakdown.trans.failed.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Ricavi</p>
                  <p className="text-xl font-bold text-green-700">{formatEur(streamBreakdown.trans.revenue)}</p>
                </div>
                <div title="Email transazionali entro quota di piano — ricavo 0 ma costo provider a carico piattaforma">
                  <p className="text-xs text-muted-foreground">Non fatturate</p>
                  <p className="text-xl font-bold text-amber-600">{streamBreakdown.trans.unbilled.toLocaleString()}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Financial KPIs — derivano dalla RPC stats: nascosti su errore */}
      {!statsError && (
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground mb-3">📊 KPI Finanziari</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {financialKpis.map((kpi) => (
            <Card key={kpi.label} className="border-dashed">
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2 mb-1">
                  <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
                  <span className="text-xs text-muted-foreground">{kpi.label}</span>
                </div>
                <p className={`text-2xl font-bold ${kpi.color}`}>{kpi.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{kpi.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
      )}

      {/* Top 10 Companies */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Top 10 Aziende per Spesa Email</CardTitle>
          <CardDescription>Classifica aziende con maggiore utilizzo crediti email</CardDescription>
        </CardHeader>
        <CardContent>
          {topLoading ? (
            <Skeleton className="h-[200px]" />
          ) : topError ? (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="flex items-center justify-between gap-3 flex-wrap">
                <span>Errore caricamento classifica aziende.</span>
                <Button variant="outline" size="sm" onClick={() => refetchTop()} className="h-7 gap-1 text-xs">
                  <RefreshCw className="h-3 w-3" /> Riprova
                </Button>
              </AlertDescription>
            </Alert>
          ) : !topCompanies?.length ? (
            <p className="text-sm text-muted-foreground">Nessun dato disponibile</p>
          ) : (
            <div className="space-y-2">
              {topCompanies.map((c, i) => (
                <div key={c.company_id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-muted-foreground w-6">#{i + 1}</span>
                    <span className="text-sm font-medium">{c.company_name}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-sm font-semibold">{formatEur(c.total_spent)}</p>
                      <p className="text-xs text-muted-foreground">spesi</p>
                    </div>
                    <Badge variant={c.balance > 0 ? "default" : "destructive"} className="text-xs">
                      {formatEur(c.balance)} saldo
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
