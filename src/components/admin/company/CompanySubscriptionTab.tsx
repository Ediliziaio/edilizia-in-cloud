import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  CreditCard, Clock, Pause, Play, Loader2, RefreshCw, CalendarPlus,
  ExternalLink, AlertTriangle, Sparkles, TrendingUp, Gift,
} from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { it } from "date-fns/locale";
import { formatCurrency } from "@/lib/formatters";
import { queryKeys } from "@/lib/queryKeys";
import type { Company, CompanyStatus } from "@/types/auth";
import { statusConfig } from "@/lib/companyUtils";
import { eventTypeLabels, eventTypeIcons } from "@/lib/adminConstants";
import { PaymentMethodCard } from "./PaymentMethodCard";
import { CreditTransactionsTable } from "./CreditTransactionsTable";
import { CreditManagerCard } from "./CreditManagerCard";
import { CompanyFeatureOverridesCard } from "./CompanyFeatureOverridesCard";
import { CompanyModuliVendutaSection } from "./CompanyModuliVendutaSection";
import { CompanyOverrideAuditLogCard } from "./CompanyOverrideAuditLogCard";
import {
  getEffectivePaymentStatus, getEffectiveMRR, PAYMENT_STATUS_META,
} from "@/lib/paymentStatus";
import { useCompanyPlanPriceOverride } from "@/hooks/useCompanyPlanPriceOverride";
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
  // Prezzo reale: override dal tab Billing se attivo, altrimenti listino
  // (coerente con Panoramica — prima entrambe ignoravano il prezzo custom).
  const { data: customPlanPrice } = useCompanyPlanPriceOverride(company.id);
  const nominalMrr = customPlanPrice ?? currentPlan?.price_monthly ?? 0;
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
            <GiftPlanButton
              companyId={company.id}
              companyName={company.name}
              currentPlanName={currentPlan?.name ?? null}
              currentPlanId={company.subscription_plan_id ?? null}
              isCurrentlyComped={effectiveStatus === "comped"}
            />
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

      {/* v8.6.55 — CTA pacchetto custom: setup rapido feature à la carte
          con preset bundle riutilizzabili e calcolo totale mensile. */}
      <div className="rounded-lg border border-orange-200 bg-gradient-to-r from-orange-50/60 to-amber-50/40 dark:from-orange-950/20 dark:to-amber-950/10 p-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3 min-w-0">
          <div className="h-9 w-9 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-orange-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3v18M3 12h18"/></svg>
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm">Pacchetto custom à la carte</p>
            <p className="text-xs text-muted-foreground">
              Crea una configurazione su misura: scegli le feature da abilitare, preset rapidi e calcolo prezzo totale.
            </p>
          </div>
        </div>
        <a
          href={`/admin/companies/${company.id}/pacchetto-custom`}
          className="inline-flex items-center gap-1.5 rounded-md bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium px-3 py-2 shadow-sm transition-colors"
        >
          Apri configuratore →
        </a>
      </div>

      {/* Sezione dedicata Moduli Vendita Verticali (categoria modulo_vendita) */}
      <CompanyModuliVendutaSection
        companyId={company.id}
        companyName={company.name}
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

// ─── Regala Piano (assegna piano + comped + log in 1 sola operazione) ──────

interface PlanOption {
  id: string;
  name: string;
  price_monthly: number;
}

/**
 * Bottone + dialog per "regalare" un piano a un'azienda:
 *   - Assegna il piano scelto (companies.subscription_plan_id)
 *   - Imposta payment_method = "comped" (esclude dal MRR)
 *   - Salva motivo + scadenza opzionale in payment_notes
 *   - Riattiva l'azienda se sospesa (status = "active")
 *   - Logga l'evento in subscription_logs (event_type = "plan_changed", note specifiche)
 *
 * NB: andiamo direttamente su DB invece dell'edge function admin-change-plan
 * perché non vogliamo trigger di sync Stripe (un'azienda comped NON deve
 * avere subscription Stripe). La transazione è "best effort": se l'insert
 * di subscription_logs fallisce, l'update principale è già committato e
 * mostriamo un warning.
 */
function GiftPlanButton({
  companyId, companyName, currentPlanName, currentPlanId, isCurrentlyComped,
}: {
  companyId: string;
  companyName: string;
  currentPlanName: string | null;
  currentPlanId: string | null;
  isCurrentlyComped: boolean;
}) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string>(currentPlanId ?? "");
  const [reason, setReason] = useState("");
  const [expiresAt, setExpiresAt] = useState("");

  // Sync su apertura dialog: prefilla con piano corrente (utile se l'utente
  // regala più volte di seguito — senza questo lo state restava al valore
  // della prima apertura). Reason e expiresAt invece partono sempre vuoti.
  useEffect(() => {
    if (open) {
      setSelectedPlanId(currentPlanId ?? "");
      setReason("");
      setExpiresAt("");
    }
  }, [open, currentPlanId]);

  // Plans fetch lazy: solo quando il dialog si apre
  const { data: plans = [], isLoading: plansLoading } = useQuery({
    queryKey: ["gift-plan-list"],
    queryFn: async (): Promise<PlanOption[]> => {
      // Solo piani globali (no piani ad hoc dei produttori). produttore_id non nei tipi → cast.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("subscription_plans")
        .select("id, name, price_monthly, is_active")
        .eq("is_active", true)
        .is("produttore_id", null)
        .order("price_monthly", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as PlanOption[];
    },
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });

  const selectedPlan = plans.find((p) => p.id === selectedPlanId);

  const giftMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPlanId) throw new Error("Seleziona un piano");
      if (!reason.trim()) throw new Error("Motivo obbligatorio");

      // Costruisci la nota strutturata persistita in payment_notes
      // Formato leggibile + parsable se in futuro vogliamo estrarre i campi.
      const noteLines = [
        `Regalato il ${format(new Date(), "dd/MM/yyyy HH:mm", { locale: it })}`,
        `Piano: ${selectedPlan?.name ?? selectedPlanId}`,
        `Motivo: ${reason.trim()}`,
      ];
      if (expiresAt) {
        noteLines.push(
          `Scadenza regalo: ${format(new Date(expiresAt), "dd/MM/yyyy", { locale: it })}`,
        );
      }
      if (user?.email) noteLines.push(`Operatore: ${user.email}`);
      const paymentNotes = noteLines.join("\n");

      // 1) UPDATE companies (assegna piano + comped + status active)
      const { error: updateErr } = await supabase
        .from("companies")
        .update({
          subscription_plan_id: selectedPlanId,
          payment_method: "comped",
          payment_notes: paymentNotes,
          status: "active",
        })
        .eq("id", companyId);
      if (updateErr) throw new Error("Errore assegnazione piano: " + updateErr.message);

      // 2) INSERT subscription_logs (best-effort, non blocca il flow)
      // Includiamo performed_by e previous_plan_id per audit trail completo
      const { error: logErr } = await supabase
        .from("subscription_logs")
        .insert({
          company_id: companyId,
          event_type: "plan_changed",
          plan_id: selectedPlanId,
          previous_plan_id: currentPlanId ?? null,
          new_status: "active",
          performed_by: user?.id ?? null,
          notes: `Piano regalato (comped). Motivo: ${reason.trim()}${
            expiresAt ? ` · Scadenza: ${expiresAt}` : ""
          }`,
        });
      if (logErr) {
        // Non rifiutiamo l'operazione principale, ma segnaliamo all'utente.
        console.warn("subscription_logs insert failed:", logErr);
        return { warning: "Piano regalato OK, ma log eventi non scritto" };
      }
      return { warning: null };
    },
    onSuccess: (data) => {
      toast.success(`Piano "${selectedPlan?.name}" regalato a ${companyName}`, {
        description: data?.warning ?? "MRR escluso. Configurazione visibile in Panoramica.",
      });
      // Invalidazione completa delle cache dipendenti dal piano + payment_method
      queryClient.invalidateQueries({ queryKey: queryKeys.companyDetail.detail(companyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.companyDetail.planAll });
      queryClient.invalidateQueries({ queryKey: queryKeys.companyDetail.subscriptionLogs(companyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.featureFlags.companyResolved(companyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.featureFlags.list(companyId) });
      queryClient.invalidateQueries({ queryKey: ["feature-access"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.companiesFull });
      setOpen(false);
      // Reset form per la prossima volta
      setReason("");
      setExpiresAt("");
    },
    onError: (e: Error) =>
      toast.error("Impossibile regalare il piano", { description: e.message }),
  });

  const expiryDate = expiresAt ? new Date(expiresAt) : null;
  const expiryInvalid = expiryDate ? expiryDate.getTime() <= Date.now() : false;

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="border-violet-300 text-violet-700 hover:bg-violet-50 hover:text-violet-800 dark:border-violet-800 dark:text-violet-300 dark:hover:bg-violet-950"
      >
        <Gift className="h-3 w-3 mr-1" />
        Regala piano
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gift className="h-5 w-5 text-violet-600" />
              Regala un piano a {companyName}
            </DialogTitle>
            <DialogDescription>
              Assegna un piano <strong>senza addebito</strong>. L'azienda verrà
              marcata come "regalata" (esclusa dal MRR piattaforma).
            </DialogDescription>
          </DialogHeader>

          {/* Banner spiegazione */}
          <div className="rounded-lg border border-violet-200 dark:border-violet-900 bg-violet-50 dark:bg-violet-950/30 p-3 space-y-1 text-xs">
            <div className="flex items-center gap-1.5 font-semibold text-violet-900 dark:text-violet-100">
              <Sparkles className="h-3.5 w-3.5" />
              Cosa succede:
            </div>
            <ul className="text-violet-800/80 dark:text-violet-200/80 space-y-0.5 list-disc pl-5">
              <li>Il piano scelto viene assegnato all'azienda (accesso completo)</li>
              <li>Metodo pagamento: <strong>Regalata</strong> (no Stripe)</li>
              <li>Status: <strong>Attiva</strong> (riattiva se sospesa)</li>
              <li>MRR piattaforma: <strong>0 €</strong> per questa azienda</li>
              <li>Evento loggato in cronologia + audit trail</li>
            </ul>
          </div>

          {plansLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : plans.length === 0 ? (
            // Edge case: nessun piano attivo configurato sulla piattaforma
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Nessun piano attivo configurato. Crea almeno un piano in{" "}
                <strong>/admin/piani</strong> prima di regalare.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="gift-plan">
                  Piano da regalare <span className="text-destructive">*</span>
                </Label>
                <Select value={selectedPlanId} onValueChange={setSelectedPlanId}>
                  <SelectTrigger id="gift-plan">
                    <SelectValue placeholder="Seleziona piano..." />
                  </SelectTrigger>
                  <SelectContent>
                    {plans.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        <div className="flex items-center gap-2">
                          <span>{p.name}</span>
                          <span className="text-xs text-muted-foreground">
                            (listino {formatCurrency(p.price_monthly)}/mese)
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {currentPlanName && (
                  <p className="text-[11px] text-muted-foreground">
                    Piano attuale: <strong>{currentPlanName}</strong>
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="gift-reason">
                  Motivo <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  id="gift-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Es. Demo per evento Milano · Partner strategico · Early adopter del settore serramenti..."
                  rows={2}
                />
                {/* Reason presets */}
                <div className="flex gap-1 flex-wrap">
                  {[
                    "Demo / Evento",
                    "Partner strategico",
                    "Early adopter",
                    "Referral senior",
                    "Test interno",
                  ].map((preset) => (
                    <Button
                      key={preset}
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-6 text-[10px] px-2"
                      onClick={() => setReason(preset)}
                    >
                      {preset}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="gift-expiry">Scadenza regalo (opzionale)</Label>
                <Input
                  id="gift-expiry"
                  type="date"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  min={new Date().toLocaleDateString("en-CA")}
                />
                <p className="text-[11px] text-muted-foreground">
                  Se compilata, è una nota informativa: dovrai gestire manualmente
                  la riattivazione del pagamento alla scadenza.
                </p>
                {expiryInvalid && (
                  <p className="text-[11px] text-destructive flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    La scadenza non può essere nel passato
                  </p>
                )}
              </div>

              {isCurrentlyComped && (
                <Alert>
                  <Sparkles className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    Questa azienda è <strong>già regalata</strong>. Procedendo,
                    aggiornerai il piano e la nota di regalo.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Annulla
            </Button>
            <Button
              onClick={() => giftMutation.mutate()}
              disabled={
                !selectedPlanId ||
                !reason.trim() ||
                expiryInvalid ||
                giftMutation.isPending
              }
              className="bg-violet-600 hover:bg-violet-700 text-white"
            >
              {giftMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Gift className="h-4 w-4 mr-2" />
              )}
              Regala piano
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
