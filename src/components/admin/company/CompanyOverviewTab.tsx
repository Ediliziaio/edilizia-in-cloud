import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Tabs, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
  Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ClipboardList, Users, MessageSquare, TrendingUp, Heart, DollarSign,
  Calendar, Activity, ArrowUpRight, ArrowDownRight, Minus, ShoppingCart,
  Clock, AlertTriangle, Zap, ExternalLink, Info, Mail, Sparkles,
  Cake, LogIn,
} from "lucide-react";
import { format, formatDistanceToNow, differenceInDays } from "date-fns";
import { it } from "date-fns/locale";
import { formatCurrency } from "@/lib/formatters";
import { ticketStatusLabels } from "@/lib/adminConstants";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import { CompanyConversionCard } from "./CompanyConversionCard";
import { Progress } from "@/components/ui/progress";
import { useCompanyHealthScore } from "@/hooks/useHealthScores";
import { HealthScoreBadge } from "./HealthScoreBadge";
import type { CompanyStats } from "@/hooks/useCompanyDetail";
import {
  useCompanyCreditsSnapshot,
  useCompanyLastActivity,
  useMonthlyOrdersExtended,
  type OverviewPeriod,
} from "@/hooks/useCompanyOverviewExtras";
import {
  getEffectivePaymentStatus,
  getEffectiveMRR,
  PAYMENT_STATUS_META,
} from "@/lib/paymentStatus";
import { cn } from "@/lib/utils";

interface MonthlyOrderData {
  month: string;
  count: number;
  value: number;
}

interface CompanyOverviewTabProps {
  companyId?: string;
  stats: CompanyStats | null;
  totalTeam: number;
  recentOrders: any[] | undefined;
  recentTickets: any[] | undefined;
  currentPlan: any | null;
  currentSubscription: any | null;
  monthlyOrders: MonthlyOrderData[];
  daysSinceLastOrder: number | null;
  companyCreatedAt: string;
  companyStatus?: string;
  trialEndsAt?: string | null;
  paymentMethod?: string;
  onExtendTrial?: (days: number) => void;
  isExtendingTrial?: boolean;
  /** Callback per navigare ad un altro tab (attiva KPI click-through). */
  onNavigateToTab?: (tab: string) => void;
}

/** Descrizioni criteri Health Score (mostrate in tooltip). */
const HEALTH_CRITERIA: Record<string, string> = {
  Login:
    "Frequenza e recency dei login del team. 25 punti se almeno 3 utenti hanno fatto login negli ultimi 7gg.",
  Ordini:
    "Volume e recency degli ordini. 25 punti se c'è almeno 1 ordine nelle ultime 4 settimane con trend positivo.",
  Funzionalità:
    "Quante funzionalità moduli sono state usate almeno una volta (CRM, Marketing, Warehouse, ecc).",
  Team:
    "Numero di membri attivi (profilo creato + almeno 1 login). Max 15 punti con 5+ membri.",
  Engagement:
    "Mix di metriche comportamentali: note CS, ticket risposti, onboarding completato, feedback lasciati.",
};

function getHealthInfo(days: number | null) {
  if (days === null) return { color: "text-muted-foreground", label: "N/A", bgClass: "bg-muted/50", ring: "ring-muted" };
  if (days <= 7) return { color: "text-green-600", label: `${days}g fa`, bgClass: "bg-green-500/10", ring: "ring-green-500/20" };
  if (days <= 30) return { color: "text-yellow-600", label: `${days}g fa`, bgClass: "bg-yellow-500/10", ring: "ring-yellow-500/20" };
  return { color: "text-red-600", label: `${days}g fa`, bgClass: "bg-red-500/10", ring: "ring-red-500/20" };
}

function TrendIndicator({ value, suffix = "%" }: { value: number; suffix?: string }) {
  if (value === 0) return <span className="text-xs text-muted-foreground flex items-center gap-0.5"><Minus className="h-3 w-3" /> 0{suffix}</span>;
  if (value > 0) return <span className="text-xs text-green-600 flex items-center gap-0.5"><ArrowUpRight className="h-3 w-3" /> +{value.toFixed(0)}{suffix}</span>;
  return <span className="text-xs text-red-600 flex items-center gap-0.5"><ArrowDownRight className="h-3 w-3" /> {value.toFixed(0)}{suffix}</span>;
}

function MiniBar({ data }: { data: MonthlyOrderData[] }) {
  if (data.length === 0) return null;
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div className="flex items-end gap-0.5 h-8">
      {data.map((d, i) => (
        <div
          key={i}
          className="flex-1 rounded-sm bg-primary/60 hover:bg-primary transition-colors"
          style={{ height: `${Math.max(4, (d.value / max) * 100)}%` }}
          title={`${d.month}: ${formatCurrency(d.value)}`}
        />
      ))}
    </div>
  );
}

function buildTimeline(recentOrders: any[], recentTickets: any[], companyCreatedAt: string) {
  const items: Array<{ id: string; type: string; title: string; date: string; icon: typeof ClipboardList; color: string; detail?: string }> = [];

  (recentOrders || []).slice(0, 3).forEach(o => {
    items.push({
      id: `o-${o.id}`,
      type: "Ordine",
      title: o.description || "Ordine",
      date: o.created_at,
      icon: ShoppingCart,
      color: "text-primary",
      detail: formatCurrency(o.total_amount),
    });
  });

  (recentTickets || []).slice(0, 3).forEach(t => {
    const status = ticketStatusLabels[t.status];
    items.push({
      id: `t-${t.id}`,
      type: "Ticket",
      title: t.subject,
      date: t.created_at,
      icon: MessageSquare,
      color: t.status === "risolto" ? "text-green-600" : "text-yellow-600",
      detail: status?.label || t.status,
    });
  });

  items.push({
    id: "created",
    type: "Evento",
    title: "Azienda creata",
    date: companyCreatedAt,
    icon: Zap,
    color: "text-violet-600",
  });

  items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return items.slice(0, 8);
}

export function CompanyOverviewTab({
  companyId, stats, totalTeam, recentOrders, recentTickets,
  currentPlan, currentSubscription, monthlyOrders, daysSinceLastOrder,
  companyCreatedAt, companyStatus, trialEndsAt, paymentMethod,
  onExtendTrial, isExtendingTrial, onNavigateToTab,
}: CompanyOverviewTabProps) {
  const { data: serverHealth } = useCompanyHealthScore(companyId);
  const { data: credits } = useCompanyCreditsSnapshot(companyId);
  const { data: lastActivity } = useCompanyLastActivity(companyId);

  // Period selector per il chart principale (default 6m = comportamento legacy)
  const [chartPeriod, setChartPeriod] = useState<OverviewPeriod>("6m");
  const { monthlyOrders: extendedMonthly, isLoading: isChartLoading } =
    useMonthlyOrdersExtended(companyId, chartPeriod);
  // Se abbiamo i dati estesi li usiamo, altrimenti cadiamo sul prop (SSR safety)
  const chartData =
    extendedMonthly.length > 0 || chartPeriod !== "6m" ? extendedMonthly : monthlyOrders;

  const avgOrderValue =
    stats && stats.ordersCount > 0 ? stats.ordersValue / stats.ordersCount : 0;
  const nominalMrr = currentPlan?.price_monthly || 0;

  // === Stato di pagamento effettivo ===
  // Prima mostravamo sempre nominalMrr come MRR: un'azienda in trial,
  // regalata o sospesa appariva con €547/mese anche se non generava ricavo.
  // Ora calcoliamo l'MRR EFFETTIVO (0 se non pagante) e mostriamo un badge.
  const paymentShape = {
    status: companyStatus,
    payment_method: paymentMethod,
    trial_ends_at: trialEndsAt,
  };
  const effectiveStatus = getEffectivePaymentStatus(paymentShape);
  const effectiveMrr = getEffectiveMRR(paymentShape, nominalMrr);
  const paymentMeta = PAYMENT_STATUS_META[effectiveStatus];
  const isPaying = effectiveStatus === "paying";

  const health = getHealthInfo(daysSinceLastOrder);

  const monthsActive = Math.max(
    1,
    Math.round(
      (Date.now() - new Date(companyCreatedAt).getTime()) /
        (30 * 24 * 60 * 60 * 1000),
    ),
  );
  const daysSinceSignup = Math.max(
    0,
    differenceInDays(new Date(), new Date(companyCreatedAt)),
  );
  // LTV = MRR effettivo × mesi. Se non pagante → LTV = 0 (coerenza con MRR).
  const ltv = effectiveMrr * monthsActive;

  // Trend MoM: usa SEMPRE monthlyOrders (6m) per stabilità — il grafico
  // può cambiare periodo, il trend no.
  const currentMonthValue =
    monthlyOrders.length > 0 ? monthlyOrders[monthlyOrders.length - 1].value : 0;
  const prevMonthValue =
    monthlyOrders.length > 1 ? monthlyOrders[monthlyOrders.length - 2].value : 0;
  const momVariation =
    prevMonthValue > 0
      ? ((currentMonthValue - prevMonthValue) / prevMonthValue) * 100
      : 0;

  const currentMonthCount =
    monthlyOrders.length > 0 ? monthlyOrders[monthlyOrders.length - 1].count : 0;
  const prevMonthCount =
    monthlyOrders.length > 1 ? monthlyOrders[monthlyOrders.length - 2].count : 0;
  const momCountVar =
    prevMonthCount > 0
      ? ((currentMonthCount - prevMonthCount) / prevMonthCount) * 100
      : 0;

  const timeline = buildTimeline(
    recentOrders || [],
    recentTickets || [],
    companyCreatedAt,
  );

  // Click-through: se non c'è callback, niente cursor pointer
  const kpiClickable = !!onNavigateToTab;
  const go = (tab: string) => onNavigateToTab?.(tab);

  return (
    <div className="space-y-6">
      {/* Trial Conversion Card (solo quando davvero in trial, non comped) */}
      {companyStatus === "trial" && effectiveStatus === "trial" && (
        <CompanyConversionCard
          trialEndsAt={trialEndsAt || null}
          onboardingPct={0}
          paymentMethod={paymentMethod || "none"}
          onExtendTrial={onExtendTrial}
          isExtendingTrial={isExtendingTrial}
        />
      )}

      {/* Banner stato non-pagante (comped / unconfigured) — visibile subito */}
      {(effectiveStatus === "comped" || effectiveStatus === "unconfigured") && (
        <Card
          className={cn(
            "border-l-4",
            effectiveStatus === "comped"
              ? "border-l-violet-500 bg-violet-50/50 dark:bg-violet-950/20"
              : "border-l-amber-500 bg-amber-50/50 dark:bg-amber-950/20",
          )}
        >
          <CardContent className="p-4 flex items-start gap-3">
            <div
              className={cn(
                "h-9 w-9 rounded-lg flex items-center justify-center shrink-0",
                effectiveStatus === "comped"
                  ? "bg-violet-500/15"
                  : "bg-amber-500/15",
              )}
            >
              {effectiveStatus === "comped" ? (
                <Sparkles className="h-4 w-4 text-violet-600" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-amber-600" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold">
                  {effectiveStatus === "comped"
                    ? "Azienda regalata — non pagante"
                    : "Metodo di pagamento non configurato"}
                </p>
                <Badge
                  variant="outline"
                  className={cn("text-[10px] h-4 px-1.5", paymentMeta.className)}
                >
                  {paymentMeta.shortLabel}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {effectiveStatus === "comped" ? (
                  <>
                    Questa azienda ha <strong>accesso gratuito</strong> concesso
                    per policy (demo, partner, early adopter).
                    {nominalMrr > 0 && (
                      <>
                        {" "}
                        Il prezzo di listino del piano è{" "}
                        <strong>{formatCurrency(nominalMrr)}/mese</strong> ma non
                        viene contabilizzato nel MRR.
                      </>
                    )}
                  </>
                ) : (
                  <>
                    L'azienda risulta <strong>attiva</strong> ma nessun metodo di
                    pagamento è configurato. Il MRR è <strong>a rischio</strong>:
                    vai alla tab <em>Abbonamento</em> per configurare
                    Stripe/IBAN/SEPA o marcare l'azienda come regalata.
                  </>
                )}
              </p>
              {kpiClickable && (
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0 mt-1 text-xs"
                  onClick={() => go("abbonamento")}
                >
                  Vai a Abbonamento
                  <ExternalLink className="h-3 w-3 ml-1" />
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* === KPI Hero Row (click-through to related tabs) === */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Revenue KPI → Attività */}
        <Card
          role={kpiClickable ? "button" : undefined}
          tabIndex={kpiClickable ? 0 : undefined}
          onClick={kpiClickable ? () => go("attivita") : undefined}
          onKeyDown={
            kpiClickable
              ? (e) => (e.key === "Enter" || e.key === " ") && go("attivita")
              : undefined
          }
          className={cn(
            "relative overflow-hidden group transition-all",
            kpiClickable && "cursor-pointer hover:ring-2 hover:ring-primary/30",
          )}
        >
          <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-bl-full" />
          <CardContent className="pt-5 pb-4">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                  Fatturato Ordini
                  {kpiClickable && (
                    <ExternalLink className="h-2.5 w-2.5 opacity-0 group-hover:opacity-60 transition-opacity" />
                  )}
                </p>
                <p className="text-2xl font-bold tracking-tight">
                  {formatCurrency(stats?.ordersValue || 0)}
                </p>
                <div className="flex items-center gap-2">
                  <TrendIndicator value={momVariation} />
                  <span className="text-xs text-muted-foreground">vs mese prec.</span>
                </div>
              </div>
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center ring-1 ring-primary/20">
                <DollarSign className="h-5 w-5 text-primary" />
              </div>
            </div>
            <div className="mt-3">
              <MiniBar data={monthlyOrders} />
            </div>
          </CardContent>
        </Card>

        {/* Orders KPI → Attività */}
        <Card
          role={kpiClickable ? "button" : undefined}
          tabIndex={kpiClickable ? 0 : undefined}
          onClick={kpiClickable ? () => go("attivita") : undefined}
          onKeyDown={
            kpiClickable
              ? (e) => (e.key === "Enter" || e.key === " ") && go("attivita")
              : undefined
          }
          className={cn(
            "relative overflow-hidden group transition-all",
            kpiClickable && "cursor-pointer hover:ring-2 hover:ring-primary/30",
          )}
        >
          <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-bl-full" />
          <CardContent className="pt-5 pb-4">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                  Ordini
                  {kpiClickable && (
                    <ExternalLink className="h-2.5 w-2.5 opacity-0 group-hover:opacity-60 transition-opacity" />
                  )}
                </p>
                <p className="text-2xl font-bold tracking-tight">{stats?.ordersCount || 0}</p>
                <div className="flex items-center gap-2">
                  <TrendIndicator value={momCountVar} />
                  <span className="text-xs text-muted-foreground">
                    media {formatCurrency(avgOrderValue)}
                  </span>
                </div>
              </div>
              <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center ring-1 ring-blue-500/20">
                <ClipboardList className="h-5 w-5 text-blue-600" />
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2 text-xs">
              <div
                className={cn(
                  "flex items-center gap-1 px-2 py-0.5 rounded-full",
                  health.bgClass,
                )}
              >
                <Heart className={cn("h-3 w-3", health.color)} />
                <span className={cn("font-medium", health.color)}>
                  Ultimo: {health.label}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* MRR & LTV → Abbonamento */}
        <Card
          role={kpiClickable ? "button" : undefined}
          tabIndex={kpiClickable ? 0 : undefined}
          onClick={kpiClickable ? () => go("abbonamento") : undefined}
          onKeyDown={
            kpiClickable
              ? (e) => (e.key === "Enter" || e.key === " ") && go("abbonamento")
              : undefined
          }
          className={cn(
            "relative overflow-hidden group transition-all",
            kpiClickable && "cursor-pointer hover:ring-2 hover:ring-primary/30",
          )}
        >
          <div
            className={cn(
              "absolute top-0 right-0 w-24 h-24 rounded-bl-full",
              isPaying ? "bg-green-500/5" : "bg-muted/30",
            )}
          />
          <CardContent className="pt-5 pb-4">
            <div className="flex items-start justify-between">
              <div className="space-y-1 min-w-0">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                  MRR
                  {kpiClickable && (
                    <ExternalLink className="h-2.5 w-2.5 opacity-0 group-hover:opacity-60 transition-opacity" />
                  )}
                </p>
                {/* Badge stato pagamento PRIMA del valore: l'utente capisce
                    subito il contesto prima di leggere la cifra. */}
                <TooltipProvider delayDuration={150}>
                  <UITooltip>
                    <TooltipTrigger asChild>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px] px-1.5 py-0 h-4 font-semibold cursor-help",
                          paymentMeta.className,
                        )}
                      >
                        {paymentMeta.shortLabel}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs text-xs">
                      {paymentMeta.description}
                    </TooltipContent>
                  </UITooltip>
                </TooltipProvider>
                <div className="flex items-baseline gap-2">
                  <p
                    className={cn(
                      "text-2xl font-bold tracking-tight",
                      !isPaying && "text-muted-foreground line-through decoration-2",
                    )}
                  >
                    {formatCurrency(isPaying ? effectiveMrr : nominalMrr)}
                  </p>
                  {!isPaying && (
                    <span className="text-sm font-semibold text-muted-foreground">
                      → {formatCurrency(0)}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {currentPlan?.name ?? "Nessun piano"}
                  {!isPaying && nominalMrr > 0 && (
                    <span className="italic"> · listino {formatCurrency(nominalMrr)}/mese</span>
                  )}
                </p>
              </div>
              <div
                className={cn(
                  "h-10 w-10 rounded-xl flex items-center justify-center ring-1 shrink-0",
                  isPaying
                    ? "bg-green-500/10 ring-green-500/20"
                    : "bg-muted ring-border",
                )}
              >
                <TrendingUp
                  className={cn(
                    "h-5 w-5",
                    isPaying ? "text-green-600" : "text-muted-foreground",
                  )}
                />
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">LTV</span>
              <span className={cn("font-semibold", !isPaying && "text-muted-foreground")}>
                {effectiveMrr > 0 ? formatCurrency(ltv) : formatCurrency(0)}
              </span>
              <span className="text-muted-foreground">{monthsActive} mesi</span>
            </div>
            {effectiveMrr > 0 && (
              <Progress
                value={Math.min(100, (monthsActive / 24) * 100)}
                className="h-1 mt-1.5"
              />
            )}
          </CardContent>
        </Card>

        {/* Team & Subscription → Team */}
        <Card
          role={kpiClickable ? "button" : undefined}
          tabIndex={kpiClickable ? 0 : undefined}
          onClick={kpiClickable ? () => go("team") : undefined}
          onKeyDown={
            kpiClickable
              ? (e) => (e.key === "Enter" || e.key === " ") && go("team")
              : undefined
          }
          className={cn(
            "relative overflow-hidden group transition-all",
            kpiClickable && "cursor-pointer hover:ring-2 hover:ring-primary/30",
          )}
        >
          <div className="absolute top-0 right-0 w-24 h-24 bg-violet-500/5 rounded-bl-full" />
          <CardContent className="pt-5 pb-4">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                  Team &amp; Rinnovo
                  {kpiClickable && (
                    <ExternalLink className="h-2.5 w-2.5 opacity-0 group-hover:opacity-60 transition-opacity" />
                  )}
                </p>
                <p className="text-2xl font-bold tracking-tight">
                  {totalTeam}{" "}
                  <span className="text-sm font-normal text-muted-foreground">membri</span>
                </p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-violet-500/10 flex items-center justify-center ring-1 ring-violet-500/20">
                <Users className="h-5 w-5 text-violet-600" />
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2 text-xs">
              <Calendar className="h-3 w-3 text-muted-foreground" />
              <span className="text-muted-foreground">Rinnovo:</span>
              <span className="font-medium">
                {currentSubscription?.current_period_end
                  ? format(
                      new Date(currentSubscription.current_period_end),
                      "dd MMM yyyy",
                      { locale: it },
                    )
                  : "—"}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">Ticket aperti:</span>
              <Badge
                variant={stats?.openTicketsCount ? "destructive" : "secondary"}
                className="text-xs h-4 px-1.5"
              >
                {stats?.openTicketsCount || 0}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* === Quick Info Strip: Credits + Last Activity + Signup age === */}
      <div className="grid gap-3 md:grid-cols-3">
        {/* Credits */}
        <Card
          role={kpiClickable ? "button" : undefined}
          tabIndex={kpiClickable ? 0 : undefined}
          onClick={kpiClickable ? () => go("billing") : undefined}
          onKeyDown={
            kpiClickable
              ? (e) => (e.key === "Enter" || e.key === " ") && go("billing")
              : undefined
          }
          className={cn(
            "group transition-all",
            kpiClickable && "cursor-pointer hover:ring-2 hover:ring-primary/20",
          )}
        >
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
              <Sparkles className="h-4 w-4 text-amber-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                Crediti
                {kpiClickable && (
                  <ExternalLink className="h-2.5 w-2.5 opacity-0 group-hover:opacity-60 transition-opacity" />
                )}
              </p>
              <div className="flex items-center gap-3 mt-0.5">
                <div className="flex items-center gap-1">
                  <Mail className="h-3 w-3 text-blue-600" />
                  <span className="text-sm font-semibold">
                    {credits?.email_balance_eur != null
                      ? formatCurrency(credits.email_balance_eur)
                      : "—"}
                  </span>
                </div>
                <span className="text-muted-foreground/40">·</span>
                <div className="flex items-center gap-1">
                  <Sparkles className="h-3 w-3 text-violet-600" />
                  <span className="text-sm font-semibold">
                    {credits?.ai_balance_eur != null
                      ? formatCurrency(credits.ai_balance_eur)
                      : "—"}
                  </span>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5">Email · AI</p>
            </div>
          </CardContent>
        </Card>

        {/* Last team activity */}
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
              <LogIn className="h-4 w-4 text-emerald-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                Ultimo login team
              </p>
              {lastActivity?.last_login_at ? (
                <>
                  <p className="text-sm font-semibold truncate">
                    {formatDistanceToNow(new Date(lastActivity.last_login_at), {
                      addSuffix: true,
                      locale: it,
                    })}
                  </p>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {lastActivity.last_login_user_name ?? "Utente"}
                  </p>
                </>
              ) : (
                <p className="text-sm font-medium text-muted-foreground">
                  Nessun login registrato
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Signup age */}
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-rose-500/10 flex items-center justify-center shrink-0">
              <Cake className="h-4 w-4 text-rose-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                Cliente da
              </p>
              <p className="text-sm font-semibold">
                {daysSinceSignup < 30
                  ? `${daysSinceSignup} giorn${daysSinceSignup === 1 ? "o" : "i"}`
                  : monthsActive < 12
                    ? `${monthsActive} mes${monthsActive === 1 ? "e" : "i"}`
                    : `${Math.round((monthsActive / 12) * 10) / 10} anni`}
              </p>
              <p className="text-[10px] text-muted-foreground">
                dal {format(new Date(companyCreatedAt), "dd MMM yyyy", { locale: it })}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* === Health Score === */}
      {serverHealth && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                Health Score
              </CardTitle>
              <HealthScoreBadge companyId={companyId!} healthScore={serverHealth} />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <TooltipProvider delayDuration={150}>
              {/* Health score 5 dimensioni: 2 cols su mobile (~140px/cella), 5 su sm+ */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                {[
                  { label: "Login", value: serverHealth.login_score, max: 25, icon: "🔑" },
                  { label: "Ordini", value: serverHealth.orders_score, max: 25, icon: "📦" },
                  { label: "Funzionalità", value: serverHealth.features_score, max: 20, icon: "⚙️" },
                  { label: "Team", value: serverHealth.team_score, max: 15, icon: "👥" },
                  { label: "Engagement", value: serverHealth.engagement_score, max: 15, icon: "🔥" },
                ].map((item) => {
                  const pct = (item.value / item.max) * 100;
                  return (
                    <div key={item.label} className="space-y-2">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm">{item.icon}</span>
                        <span className="text-xs font-medium">{item.label}</span>
                        <UITooltip>
                          <TooltipTrigger asChild>
                            <Info className="h-3 w-3 text-muted-foreground/70 cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs text-xs">
                            {HEALTH_CRITERIA[item.label] ?? ""}
                          </TooltipContent>
                        </UITooltip>
                      </div>
                      <div className="flex items-baseline gap-1">
                        <span
                          className={cn(
                            "text-lg font-bold",
                            pct >= 70
                              ? "text-green-600"
                              : pct >= 40
                                ? "text-yellow-600"
                                : "text-red-600",
                          )}
                        >
                          {item.value}
                        </span>
                        <span className="text-xs text-muted-foreground">/{item.max}</span>
                      </div>
                      <Progress value={pct} className="h-1.5" />
                    </div>
                  );
                })}
              </div>
            </TooltipProvider>

            {serverHealth.signals.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {serverHealth.signals.map((s) => (
                  <Badge key={s} variant="outline" className="text-xs gap-1">
                    <AlertTriangle className="h-2.5 w-2.5" />
                    {s.replace(/_/g, " ")}
                  </Badge>
                ))}
              </div>
            )}

            <div className="flex items-center gap-3 pt-1 border-t">
              <span className="text-xs font-medium text-muted-foreground">Rischio Churn</span>
              <Progress value={serverHealth.churn_risk} className="h-2 flex-1" />
              <span className={cn(
                "text-sm font-bold",
                serverHealth.churn_risk > 60 ? "text-red-600" : serverHealth.churn_risk > 30 ? "text-yellow-600" : "text-green-600"
              )}>{serverHealth.churn_risk}%</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* === Chart + Timeline Row === */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Orders Chart - 2 cols */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                Trend Ordini
                <span className="text-xs font-normal text-muted-foreground">
                  — {chartPeriod === "3m" ? "3 mesi" : chartPeriod === "12m" ? "12 mesi" : "6 mesi"}
                </span>
              </CardTitle>
              <Tabs
                value={chartPeriod}
                onValueChange={(v) => setChartPeriod(v as OverviewPeriod)}
              >
                <TabsList className="h-7 p-0.5">
                  <TabsTrigger value="3m" className="h-6 text-xs px-2">
                    3m
                  </TabsTrigger>
                  <TabsTrigger value="6m" className="h-6 text-xs px-2">
                    6m
                  </TabsTrigger>
                  <TabsTrigger value="12m" className="h-6 text-xs px-2">
                    12m
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </CardHeader>
          <CardContent>
            {isChartLoading && chartData.length === 0 ? (
              <div className="h-[260px] flex items-center justify-center text-sm text-muted-foreground">
                Caricamento trend…
              </div>
            ) : chartData.length > 0 ? (
              <div className="h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="month" className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                    <YAxis yAxisId="left" className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                    <YAxis yAxisId="right" orientation="right" className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }}
                      formatter={(value: number, name: string) => [
                        name === "value" ? formatCurrency(value) : value,
                        name === "value" ? "Valore" : "Ordini",
                      ]}
                    />
                    <Area yAxisId="left" type="monotone" dataKey="count" stroke="hsl(var(--primary))" fill="url(#colorValue)" strokeWidth={2} name="count" />
                    <Area yAxisId="right" type="monotone" dataKey="value" stroke="hsl(142 76% 36%)" fill="none" strokeWidth={2} strokeDasharray="5 5" name="value" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[260px] flex items-center justify-center text-sm text-muted-foreground">
                Nessun ordine nel periodo selezionato
              </div>
            )}
          </CardContent>
        </Card>

        {/* Activity Timeline - 1 col */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              Attività Recente
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y max-h-[300px] overflow-y-auto">
              {timeline.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.id} className="flex items-start gap-3 px-4 py-3 hover:bg-muted/30 transition-colors">
                    <div className={cn("mt-0.5 h-7 w-7 rounded-lg flex items-center justify-center shrink-0",
                      item.type === "Ordine" ? "bg-primary/10" : item.type === "Ticket" ? "bg-yellow-500/10" : "bg-violet-500/10"
                    )}>
                      <Icon className={cn("h-3.5 w-3.5", item.color)} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs h-4 px-1 shrink-0">{item.type}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(item.date), { addSuffix: true, locale: it })}
                        </span>
                      </div>
                      <p className="text-sm font-medium truncate mt-0.5">{item.title}</p>
                      {item.detail && (
                        <p className="text-xs text-muted-foreground">{item.detail}</p>
                      )}
                    </div>
                  </div>
                );
              })}
              {timeline.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">Nessuna attività</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* === Recent Orders & Tickets Tables === */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-primary" />
                Ultimi Ordini
              </CardTitle>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs">
                  {recentOrders?.length || 0}
                </Badge>
                {kpiClickable && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => go("attivita")}
                  >
                    Vai a Attività
                    <ExternalLink className="h-3 w-3 ml-1" />
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {!recentOrders || recentOrders.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Nessun ordine</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Descrizione</TableHead>
                    <TableHead className="text-right">Importo</TableHead>
                    <TableHead>Stato</TableHead>
                    <TableHead className="text-right">Data</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentOrders.map((order) => {
                    const statusInfo = order.order_statuses as { name: string; color: string; icon: string } | null;
                    return (
                      <TableRow key={order.id}>
                        <TableCell className="font-medium max-w-[200px] truncate">{order.description}</TableCell>
                        <TableCell className="font-semibold text-right">{formatCurrency(order.total_amount)}</TableCell>
                        <TableCell>
                          {statusInfo ? (
                            <Badge variant="outline" className="text-xs" style={{ borderColor: statusInfo.color, color: statusInfo.color }}>
                              {statusInfo.name}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs text-right">
                          {formatDistanceToNow(new Date(order.created_at), { addSuffix: true, locale: it })}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-primary" />
                Ultimi Ticket
              </CardTitle>
              <div className="flex items-center gap-2">
                <Badge
                  variant={stats?.openTicketsCount ? "destructive" : "secondary"}
                  className="text-xs"
                >
                  {stats?.openTicketsCount || 0} aperti
                </Badge>
                {kpiClickable && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => go("supporto")}
                  >
                    Vai a Supporto
                    <ExternalLink className="h-3 w-3 ml-1" />
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {!recentTickets || recentTickets.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Nessun ticket</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Oggetto</TableHead>
                    <TableHead>Stato</TableHead>
                    <TableHead className="text-right">Data</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentTickets.map((ticket) => {
                    const tStatus = ticketStatusLabels[ticket.status] || { label: ticket.status, variant: "outline" as const };
                    return (
                      <TableRow key={ticket.id}>
                        <TableCell className="font-medium max-w-[250px] truncate">{ticket.subject}</TableCell>
                        <TableCell>
                          <Badge variant={tStatus.variant} className="text-xs">{tStatus.label}</Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs text-right">
                          {formatDistanceToNow(new Date(ticket.created_at), { addSuffix: true, locale: it })}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
