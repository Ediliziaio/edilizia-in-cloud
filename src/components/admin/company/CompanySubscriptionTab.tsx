import { useState } from "react";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  CreditCard, Clock, Pause, Play, Loader2, RefreshCw, CalendarPlus,
  ExternalLink, AlertTriangle, Sparkles, TrendingUp,
} from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { it } from "date-fns/locale";
import { formatCurrency } from "@/lib/formatters";
import type { Company, CompanyStatus } from "@/types/auth";
import { statusConfig } from "@/lib/companyUtils";
import { eventTypeLabels, eventTypeIcons } from "@/lib/adminConstants";
import { PaymentMethodCard } from "./PaymentMethodCard";
import { CreditTransactionsTable } from "./CreditTransactionsTable";
import { CreditManagerCard } from "./CreditManagerCard";
import { CompanyFeatureOverridesCard } from "./CompanyFeatureOverridesCard";
import { CompanyOverrideAuditLogCard } from "./CompanyOverrideAuditLogCard";
import {
  getEffectivePaymentStatus, getEffectiveMRR, PAYMENT_STATUS_META,
} from "@/lib/paymentStatus";
import { cn } from "@/lib/utils";

// Forma minima di un piano tariffario — solo i campi letti qui.
// Evita di importare la riga completa di `subscription_plans` che contiene
// decine di colonne irrilevanti per questo componente.
interface SubscriptionPlanSummary {
  id?: string;
  name: string;
  price_monthly: number;
}

interface CurrentSubscriptionSummary {
  current_period_start?: string | null;
  current_period_end?: string | null;
}

// `subscription_logs` con join (`subscription_plans:plan_id(name)`).
// `event_type` è uno dei codici riconosciuti da `eventTypeLabels`.
interface SubscriptionLogRow {
  id: string;
  event_type: string;
  notes: string | null;
  old_status: string | null;
  new_status: string | null;
  created_at: string;
  subscription_plans: { name: string } | null;
}

interface CompanySubscriptionTabProps {
  company: Company;
  currentPlan: SubscriptionPlanSummary | null | undefined;
  currentSubscription: CurrentSubscriptionSummary | null | undefined;
  subscriptionLogs: SubscriptionLogRow[] | undefined;
  onChangePlan: () => void;
  onSuspend: () => void;
  onReactivate: () => void;
  onExtendTrial: (days: number) => void;
  isUpdatingStatus: boolean;
  isExtendingTrial: boolean;
  onUpdatePaymentMethod: (data: {
    payment_method: string;
    bank_iban: string | null;
    bank_account_holder: string | null;
    bank_name: string | null;
    payment_notes: string | null;
  }) => Promise<void>;
  isSavingPaymentMethod: boolean;
  onGenerateCheckout?: () => void;
  isGeneratingCheckout?: boolean;
  checkoutUrl?: string | null;
}

export function CompanySubscriptionTab({
  company,
  currentPlan,
  currentSubscription,
  subscriptionLogs,
  onChangePlan,
  onSuspend,
  onReactivate,
  onExtendTrial,
  isUpdatingStatus,
  isExtendingTrial,
  onUpdatePaymentMethod,
  isSavingPaymentMethod,
  onGenerateCheckout,
  isGeneratingCheckout,
  checkoutUrl,
}: CompanySubscriptionTabProps) {
  const companyStatus = (company.status || "trial") as CompanyStatus;
  const statusCfg = statusConfig[companyStatus] || statusConfig.trial;

  // Stato di pagamento effettivo (riusa helper centrale, coerenza con Panoramica)
  const effectiveStatus = getEffectivePaymentStatus({
    status: company.status,
    payment_method: company.payment_method,
    trial_ends_at: company.trial_ends_at,
  });
  const paymentMeta = PAYMENT_STATUS_META[effectiveStatus];
  const nominalMrr = currentPlan?.price_monthly ?? 0;
  const effectiveMrr = getEffectiveMRR(
    {
      status: company.status,
      payment_method: company.payment_method,
      trial_ends_at: company.trial_ends_at,
    },
    nominalMrr,
  );
  const isPaying = effectiveStatus === "paying";

  // Trial countdown
  const trialDaysLeft =
    companyStatus === "trial" && company.trial_ends_at
      ? differenceInDays(new Date(company.trial_ends_at), new Date())
      : null;
  const trialExtensions = company.trial_extensions_count ?? 0;

  // Stripe customer link (URL sicuro: solo se ID presente)
  const stripeUrl = company.stripe_customer_id
    ? `https://dashboard.stripe.com/customers/${company.stripe_customer_id}`
    : null;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Banner stato pagamento — visibilità immediata */}
      {(effectiveStatus === "comped" || effectiveStatus === "unconfigured") && (
        <Alert
          className={cn(
            "lg:col-span-2 border-l-4",
            effectiveStatus === "comped"
              ? "border-l-violet-500 bg-violet-50/50 dark:bg-violet-950/20"
              : "border-l-amber-500 bg-amber-50/50 dark:bg-amber-950/20",
          )}
        >
          {effectiveStatus === "comped" ? (
            <Sparkles className="h-4 w-4 text-violet-600" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-amber-600" />
          )}
          <AlertDescription>
            <div className="flex items-center gap-2 flex-wrap">
              <strong>
                {effectiveStatus === "comped"
                  ? "Azienda regalata"
                  : "Metodo di pagamento mancante"}
              </strong>
              <Badge
                variant="outline"
                className={cn("text-[10px] h-4 px-1.5", paymentMeta.className)}
              >
                {paymentMeta.shortLabel}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {effectiveStatus === "comped"
                  ? `MRR escluso (listino ${formatCurrency(nominalMrr)}/mese)`
                  : "Configura metodo di pagamento qui sotto"}
              </span>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Trial scadenza ravvicinata */}
      {trialDaysLeft !== null && trialDaysLeft <= 7 && trialDaysLeft >= 0 && (
        <Alert
          variant={trialDaysLeft <= 3 ? "destructive" : "default"}
          className="lg:col-span-2"
        >
          <Clock className="h-4 w-4" />
          <AlertDescription>
            <strong>
              {trialDaysLeft === 0
                ? "Trial scade oggi"
                : `Trial scade tra ${trialDaysLeft} giorn${trialDaysLeft === 1 ? "o" : "i"}`}
            </strong>
            {" — "}{format(new Date(company.trial_ends_at!), "EEEE dd MMMM", { locale: it })}.
            Considera upgrade o estensione.
          </AlertDescription>
        </Alert>
      )}

      {/* Stato abbonamento */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Stato Abbonamento
              </CardTitle>
              <CardDescription>Gestisci lo stato e il piano</CardDescription>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant={statusCfg.variant}>{statusCfg.label}</Badge>
              <TooltipProvider delayDuration={150}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge
                      variant="outline"
                      className={cn("text-[10px] cursor-help", paymentMeta.className)}
                    >
                      {effectiveStatus === "comped" && (
                        <Sparkles className="h-2.5 w-2.5 mr-1" />
                      )}
                      {paymentMeta.shortLabel}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs text-xs">
                    {paymentMeta.description}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between py-2 border-b text-sm">
            <span className="text-muted-foreground">Piano</span>
            <span className="font-medium">{currentPlan?.name || "Nessun piano"}</span>
          </div>
          {companyStatus === "trial" && company.trial_ends_at && (
            <div className="flex justify-between py-2 border-b text-sm">
              <span className="text-muted-foreground">Scadenza Trial</span>
              <span className="font-medium">{format(new Date(company.trial_ends_at), "dd/MM/yyyy", { locale: it })}</span>
            </div>
          )}
          {currentPlan && (
            <div className="flex justify-between py-2 border-b text-sm">
              <span className="text-muted-foreground">Prezzo listino</span>
              <span className="font-medium">{formatCurrency(currentPlan.price_monthly)}/mese</span>
            </div>
          )}
          {currentPlan && (
            <div className="flex justify-between py-2 border-b text-sm">
              <span className="text-muted-foreground flex items-center gap-1">
                <TrendingUp className="h-3 w-3" />
                MRR effettivo
              </span>
              <span
                className={cn(
                  "font-semibold",
                  isPaying ? "text-emerald-600" : "text-muted-foreground",
                )}
              >
                {formatCurrency(effectiveMrr)}/mese
                {!isPaying && nominalMrr > 0 && (
                  <span className="ml-1 text-[10px] text-muted-foreground italic">
                    (escluso)
                  </span>
                )}
              </span>
            </div>
          )}
          {trialDaysLeft !== null && trialDaysLeft >= 0 && (
            <div className="flex justify-between py-2 border-b text-sm">
              <span className="text-muted-foreground">Trial — giorni rimanenti</span>
              <span
                className={cn(
                  "font-medium",
                  trialDaysLeft <= 3
                    ? "text-destructive"
                    : trialDaysLeft <= 7
                      ? "text-amber-600"
                      : "",
                )}
              >
                {trialDaysLeft} giorn{trialDaysLeft === 1 ? "o" : "i"}
              </span>
            </div>
          )}
          {trialExtensions > 0 && (
            <div className="flex justify-between py-2 border-b text-sm">
              <span className="text-muted-foreground">Estensioni trial</span>
              <Badge variant="outline" className="text-xs">
                {trialExtensions} {trialExtensions === 1 ? "volta" : "volte"}
              </Badge>
            </div>
          )}
          {company.stripe_customer_id && (
            <div className="flex justify-between py-2 border-b text-sm items-center gap-2">
              <span className="text-muted-foreground">Stripe ID</span>
              <div className="flex items-center gap-1 min-w-0">
                <span className="font-medium font-mono text-xs truncate max-w-[140px]">
                  {company.stripe_customer_id}
                </span>
                {stripeUrl && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    asChild
                    title="Apri in Stripe Dashboard"
                  >
                    <a href={stripeUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </Button>
                )}
              </div>
            </div>
          )}
          {company.stripe_subscription_status && (
            <div className="flex justify-between py-2 border-b text-sm">
              <span className="text-muted-foreground">Stato Stripe</span>
              <Badge
                variant={
                  company.stripe_subscription_status === "active"
                    ? "default"
                    : company.stripe_subscription_status === "trialing"
                      ? "secondary"
                      : "destructive"
                }
                className="text-xs"
              >
                {company.stripe_subscription_status}
              </Badge>
            </div>
          )}
          {company.dunning_status && company.dunning_status !== "none" && (
            <div className="flex justify-between py-2 border-b text-sm">
              <span className="text-muted-foreground">Stato Dunning</span>
              <Badge variant={company.dunning_status === "critical" ? "destructive" : "secondary"}>
                {company.dunning_status} — {company.payment_failure_count || 0} fallimenti
              </Badge>
            </div>
          )}
          {currentSubscription?.current_period_start && (
            <div className="flex justify-between py-2 border-b text-sm">
              <span className="text-muted-foreground">Inizio periodo</span>
              <span className="font-medium">{format(new Date(currentSubscription.current_period_start), "dd/MM/yyyy", { locale: it })}</span>
            </div>
          )}
          {currentSubscription?.current_period_end && (
            <div className="flex justify-between py-2 border-b text-sm">
              <span className="text-muted-foreground">Fine periodo</span>
              <span className="font-medium">{format(new Date(currentSubscription.current_period_end), "dd/MM/yyyy", { locale: it })}</span>
            </div>
          )}
          <div className="flex flex-wrap gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={onChangePlan}>
              <CreditCard className="h-3 w-3 mr-1" />Cambia piano
            </Button>
            {companyStatus !== "suspended" ? (
              <Button variant="outline" size="sm" disabled={isUpdatingStatus} onClick={onSuspend}>
                {isUpdatingStatus ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Pause className="h-3 w-3 mr-1" />}Sospendi
              </Button>
            ) : (
              <Button variant="outline" size="sm" disabled={isUpdatingStatus} onClick={onReactivate}>
                {isUpdatingStatus ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Play className="h-3 w-3 mr-1" />}Riattiva
              </Button>
            )}
            {(companyStatus === "trial" || companyStatus === "expired") && (
              <ExtendTrialButton onExtendTrial={onExtendTrial} isExtendingTrial={isExtendingTrial} />
            )}
          </div>
        </CardContent>
      </Card>

      {/* Metodo di Pagamento */}
      <PaymentMethodCard
        company={company}
        onSave={onUpdatePaymentMethod}
        isSaving={isSavingPaymentMethod}
        onGenerateCheckout={onGenerateCheckout}
        isGeneratingCheckout={isGeneratingCheckout}
        checkoutUrl={checkoutUrl}
      />

      {/* Override feature inline (sblocco/blocco + limiti + scadenze + prezzi custom) */}
      <CompanyFeatureOverridesCard
        companyId={company.id}
        companyName={company.name}
        planId={currentPlan?.id ?? null}
        planSlug={currentPlan?.slug ?? null}
      />

      {/* Storico modifiche override (audit log) */}
      <CompanyOverrideAuditLogCard companyId={company.id} />

      {/* Gestione crediti multi-wallet (SuperAdmin) */}
      <CreditManagerCard companyId={company.id} />

      {/* Storico transazioni crediti (ai/email/whatsapp/render) — view unificata */}
      <CreditTransactionsTable companyId={company.id} />

      {/* Storico */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Storico Abbonamento
          </CardTitle>
          <CardDescription>Ultimi eventi</CardDescription>
        </CardHeader>
        <CardContent>
          {!subscriptionLogs || subscriptionLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Nessun evento registrato</p>
          ) : (
            <div className="space-y-4">
              {subscriptionLogs.map((log) => {
                const planInfo = log.subscription_plans as { name: string } | null;
                const IconComp = eventTypeIcons[log.event_type] || RefreshCw;
                return (
                  <div key={log.id} className="flex items-start gap-3 text-sm">
                    <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
                      <IconComp className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium">
                        {eventTypeLabels[log.event_type] || log.event_type}
                        {planInfo && <span className="text-muted-foreground"> — {planInfo.name}</span>}
                      </p>
                      {log.notes && <p className="text-muted-foreground truncate">{log.notes}</p>}
                      {log.old_status && log.new_status && log.old_status !== log.new_status && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {statusConfig[log.old_status as CompanyStatus]?.label || log.old_status} → {statusConfig[log.new_status as CompanyStatus]?.label || log.new_status}
                        </p>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {format(new Date(log.created_at), "dd/MM/yy HH:mm")}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ExtendTrialButton({ onExtendTrial, isExtendingTrial }: { onExtendTrial: (days: number) => void; isExtendingTrial: boolean }) {
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState(7);

  return (
    <>
      <Button variant="outline" size="sm" disabled={isExtendingTrial} onClick={() => setOpen(true)}>
        {isExtendingTrial ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <CalendarPlus className="h-3 w-3 mr-1" />}
        Estendi Trial
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Estendi Trial</DialogTitle>
            <DialogDescription>Scegli il numero di giorni da aggiungere al trial.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              {[7, 14, 30].map((d) => (
                <Button key={d} size="sm" variant={days === d ? "default" : "outline"} onClick={() => setDays(d)}>
                  {d}gg
                </Button>
              ))}
            </div>
            <div>
              <Label>Giorni personalizzati</Label>
              <Input type="number" min={1} max={365} value={days} onChange={(e) => setDays(Number(e.target.value))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Annulla</Button>
            <Button disabled={days < 1 || isExtendingTrial} onClick={() => { onExtendTrial(days); setOpen(false); }}>
              {isExtendingTrial && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Estendi di {days} giorni
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
