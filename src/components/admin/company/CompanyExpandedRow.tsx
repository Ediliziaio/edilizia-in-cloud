import React from "react";
import { useNavigate } from "react-router-dom";
import { DollarSign, CheckCircle2, StickyNote, Phone, Mail, Activity, CreditCard, ShieldAlert, Package, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format, differenceInDays } from "date-fns";
import { it } from "date-fns/locale";
import { formatCurrency } from "@/lib/formatters";
import { getOnboardingPct, getHealthBreakdown } from "@/lib/companyUtils";
import { getNextActions } from "./CompanyNextActions";
import { CompanyTagsCell } from "./CompanyTagsCell";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface CompanyExpandedRowProps {
  company: {
    id: string;
    business_name?: string | null;
    vat_number?: string | null;
    phone?: string | null;
    email?: string;
    pec?: string | null;
    sdi_code?: string | null;
    website?: string | null;
    fiscal_code?: string | null;
    trial_ends_at?: string | null;
    status?: string;
    payment_method?: string;
  };
  orderStats?: { count: number; totalValue: number; lastOrderDate: string | null };
  healthData?: { score: number; health: string; lastOrderDate: string | null; order_count: number; user_count: number; has_customers: boolean; has_staff: boolean };
  planLimits?: { max_orders: number | null; max_users: number | null };
  latestNote?: { content: string; created_at: string; authorName: string };
  tags: Array<{ id: string; tag: string; color: string }>;
}

function getUsageColor(pct: number): string {
  if (pct >= 90) return "bg-destructive";
  if (pct >= 70) return "bg-amber-500";
  return "bg-green-500";
}

function getUsageTextColor(pct: number): string {
  if (pct >= 90) return "text-destructive";
  if (pct >= 70) return "text-amber-600";
  return "text-green-600";
}

export const CompanyExpandedRow = React.memo(function CompanyExpandedRow({
  company, orderStats, healthData: hd, planLimits, latestNote, tags,
}: CompanyExpandedRowProps) {
  const navigate = useNavigate();
  const lastDate = orderStats?.lastOrderDate ? new Date(orderStats.lastOrderDate) : null;
  const daysSince = lastDate ? differenceInDays(new Date(), lastDate) : null;
  const onboardingPct = getOnboardingPct(hd);
  const healthBreakdown = getHealthBreakdown(hd);

  const status = company.status || "trial";
  const paymentMethod = company.payment_method || "none";
  const nextActions = getNextActions({
    status,
    trialEndsAt: company.trial_ends_at || null,
    onboardingPct,
    daysSinceLastOrder: daysSince,
    paymentMethod,
  });

  // Usage calculations
  const orderCount = orderStats?.count || 0;
  const maxOrders = planLimits?.max_orders;
  const orderUsagePct = maxOrders ? Math.min(Math.round((orderCount / maxOrders) * 100), 100) : null;

  const userCount = hd?.user_count || 0;
  const maxUsers = planLimits?.max_users;
  const userUsagePct = maxUsers ? Math.min(Math.round((userCount / maxUsers) * 100), 100) : null;

  // Payment badge
  const hasPayment = paymentMethod !== "none" && paymentMethod !== "";
  const paymentLabel = hasPayment ? "Carta configurata" : "Nessun pagamento";
  const PaymentIcon = hasPayment ? CreditCard : ShieldAlert;

  // Business info fields
  const businessFields = [
    { label: "Ragione sociale", value: company.business_name },
    { label: "P.IVA", value: company.vat_number },
    { label: "Telefono", value: company.phone },
    { label: "PEC", value: company.pec },
    { label: "SDI", value: company.sdi_code },
    { label: "Sito", value: company.website },
    { label: "C. Fiscale", value: company.fiscal_code },
    { label: "Scadenza Trial", value: company.trial_ends_at ? format(new Date(company.trial_ends_at), "dd/MM/yyyy", { locale: it }) : null },
  ].filter((f) => f.value);

  const priorityColors: Record<string, string> = {
    high: "text-destructive bg-destructive/10",
    medium: "text-amber-600 bg-amber-500/10",
    low: "text-blue-600 bg-blue-500/10",
  };

  return (
    <div className="space-y-3">
      {/* Row 1 — SaaS KPIs: LTV | Utilizzo Ordini | Utilizzo Utenti | Onboarding */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* LTV */}
        <div className="flex items-center gap-3 rounded-lg border bg-card p-3">
          <div className="rounded-md bg-primary/10 p-2"><DollarSign className="h-4 w-4 text-primary" /></div>
          <div>
            <p className="text-xs text-muted-foreground">LTV Cliente</p>
            <p className="text-sm font-semibold">{formatCurrency(orderStats?.totalValue || 0)}</p>
          </div>
        </div>

        {/* Utilizzo Ordini */}
        <div className="flex items-center gap-3 rounded-lg border bg-card p-3">
          <div className={`rounded-md p-2 ${orderUsagePct !== null ? (orderUsagePct >= 90 ? "bg-destructive/10" : orderUsagePct >= 70 ? "bg-amber-500/10" : "bg-green-500/10") : "bg-muted"}`}>
            <Package className={`h-4 w-4 ${orderUsagePct !== null ? getUsageTextColor(orderUsagePct) : "text-muted-foreground"}`} />
          </div>
          <div className="flex-1">
            <p className="text-xs text-muted-foreground">Ordini</p>
            {orderUsagePct !== null ? (
              <div className="flex items-center gap-2 mt-0.5">
                <div className="h-1.5 flex-1 rounded-full bg-secondary overflow-hidden">
                  <div className={`h-full rounded-full ${getUsageColor(orderUsagePct)} transition-all`} style={{ width: `${orderUsagePct}%` }} />
                </div>
                <span className={`text-xs font-medium ${getUsageTextColor(orderUsagePct)}`}>{orderCount}/{maxOrders}</span>
              </div>
            ) : (
              <p className="text-sm font-semibold">{orderCount} <span className="text-xs text-muted-foreground font-normal">/ ∞</span></p>
            )}
          </div>
        </div>

        {/* Utilizzo Utenti */}
        <div className="flex items-center gap-3 rounded-lg border bg-card p-3">
          <div className={`rounded-md p-2 ${userUsagePct !== null ? (userUsagePct >= 90 ? "bg-destructive/10" : userUsagePct >= 70 ? "bg-amber-500/10" : "bg-green-500/10") : "bg-muted"}`}>
            <Users className={`h-4 w-4 ${userUsagePct !== null ? getUsageTextColor(userUsagePct) : "text-muted-foreground"}`} />
          </div>
          <div className="flex-1">
            <p className="text-xs text-muted-foreground">Utenti</p>
            {userUsagePct !== null ? (
              <div className="flex items-center gap-2 mt-0.5">
                <div className="h-1.5 flex-1 rounded-full bg-secondary overflow-hidden">
                  <div className={`h-full rounded-full ${getUsageColor(userUsagePct)} transition-all`} style={{ width: `${userUsagePct}%` }} />
                </div>
                <span className={`text-xs font-medium ${getUsageTextColor(userUsagePct)}`}>{userCount}/{maxUsers}</span>
              </div>
            ) : (
              <p className="text-sm font-semibold">{userCount} <span className="text-xs text-muted-foreground font-normal">/ ∞</span></p>
            )}
          </div>
        </div>

        {/* Onboarding */}
        <div className="flex items-center gap-3 rounded-lg border bg-card p-3">
          <div className="rounded-md bg-primary/10 p-2"><CheckCircle2 className="h-4 w-4 text-primary" /></div>
          <div className="flex-1">
            <p className="text-xs text-muted-foreground">Onboarding</p>
            <div className="flex items-center gap-2 mt-0.5">
              <div className="h-1.5 flex-1 rounded-full bg-secondary overflow-hidden">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${onboardingPct}%` }} />
              </div>
              <span className="text-xs font-medium text-muted-foreground">{onboardingPct}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Row 2 — Payment Badge + Quick Contact */}
      <div className="flex items-center gap-2 rounded-lg border bg-card p-3">
        <Badge variant={hasPayment ? "default" : "destructive"} className="gap-1.5">
          <PaymentIcon className="h-3 w-3" />
          {paymentLabel}
        </Badge>
        <div className="h-4 w-px bg-border mx-1" />
        <span className="text-xs font-medium text-muted-foreground mr-1">Contatto rapido:</span>
        {company.phone && (
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={(e) => { e.stopPropagation(); window.open(`tel:${company.phone}`); }}>
            <Phone className="h-3 w-3" />Chiama
          </Button>
        )}
        {company.email && (
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={(e) => { e.stopPropagation(); window.open(`mailto:${company.email}`); }}>
            <Mail className="h-3 w-3" />Email
          </Button>
        )}
        <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={(e) => { e.stopPropagation(); navigate(`/admin/aziende/${company.id}?tab=notes`); }}>
          <StickyNote className="h-3 w-3" />Nota rapida
        </Button>
      </div>

      {/* Row 3 — Intelligence */}

      {/* Next Best Actions */}
      {nextActions.length > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="h-4 w-4 text-amber-600" />
            <span className="text-xs font-semibold">Azioni suggerite</span>
            <Badge variant="secondary" className="text-[10px]">{nextActions.length}</Badge>
          </div>
          <div className="flex flex-wrap gap-2">
            {nextActions.map((action, i) => {
              const Icon = action.icon;
              const colors = priorityColors[action.priority];
              return (
                <div key={i} className="flex items-center gap-2 text-xs rounded-md border bg-card px-2.5 py-1.5">
                  <div className={`p-1 rounded ${colors}`}><Icon className="h-3 w-3" /></div>
                  <span>{action.message}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Health Score Breakdown */}
      {healthBreakdown.length > 0 && hd && (
        <div className="rounded-lg border bg-card p-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-medium">Health Score</span>
            <Badge variant="outline" className="text-[10px]">{hd.score}/100</Badge>
          </div>
          <TooltipProvider>
            <div className="flex gap-1 h-2 rounded-full overflow-hidden bg-secondary">
              {healthBreakdown.map((factor, i) => (
                <Tooltip key={i}>
                  <TooltipTrigger asChild>
                    <div className={`${factor.color} transition-all cursor-help`} style={{ width: `${(factor.maxScore / 90) * 100}%`, opacity: factor.score > 0 ? 1 : 0.2 }} />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    <p className="font-medium">{factor.label}</p>
                    <p>{factor.score}/{factor.maxScore} punti</p>
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
          </TooltipProvider>
          <div className="flex gap-3 mt-1.5">
            {healthBreakdown.map((f, i) => (
              <span key={i} className="text-[10px] text-muted-foreground">{f.label}: {f.score}/{f.maxScore}</span>
            ))}
          </div>
        </div>
      )}

      {/* Business Info (conditional) */}
      {businessFields.length > 0 && (
        <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-x-6 gap-y-2 rounded-lg border bg-card p-3">
          {businessFields.map((f) => (
            <div key={f.label}>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{f.label}</p>
              <p className="text-xs font-medium truncate">{f.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* CRM Notes + Tags */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="flex-1 rounded-lg border bg-card p-3">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              <StickyNote className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs font-medium">Ultima Nota CRM</span>
            </div>
            <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={(e) => { e.stopPropagation(); navigate(`/admin/aziende/${company.id}?tab=notes`); }}>
              Vedi tutte →
            </Button>
          </div>
          {latestNote ? (
            <div>
              <p className="text-xs text-foreground line-clamp-2">{latestNote.content}</p>
              <p className="text-[10px] text-muted-foreground mt-1">
                {latestNote.authorName} · {format(new Date(latestNote.created_at), "dd MMM yyyy, HH:mm", { locale: it })}
              </p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic">Nessuna nota</p>
          )}
        </div>
        <div className="md:w-64 rounded-lg border bg-card p-3">
          <p className="text-xs font-medium mb-1.5">Tag / Segmenti</p>
          <CompanyTagsCell companyId={company.id} tags={tags} />
        </div>
      </div>
    </div>
  );
});
