import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CreditCard, Clock, Pause, Play, Timer, Loader2, Banknote, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { formatCurrency } from "@/lib/formatters";
import type { Company, CompanyStatus } from "@/types/auth";
import { statusConfig } from "@/lib/companyUtils";
import { eventTypeLabels, eventTypeIcons } from "@/lib/adminConstants";
import { PaymentMethodCard } from "./PaymentMethodCard";

interface CompanySubscriptionTabProps {
  company: Company;
  currentPlan: any;
  currentSubscription: any;
  subscriptionLogs: any[] | undefined;
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

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Stato abbonamento */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Stato Abbonamento
              </CardTitle>
              <CardDescription>Gestisci lo stato e il piano</CardDescription>
            </div>
            <Badge variant={statusCfg.variant}>{statusCfg.label}</Badge>
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
              <span className="text-muted-foreground">Prezzo</span>
              <span className="font-medium">{formatCurrency(currentPlan.price_monthly)}/mese</span>
            </div>
          )}
          {company.stripe_customer_id && (
            <div className="flex justify-between py-2 border-b text-sm">
              <span className="text-muted-foreground">Stripe ID</span>
              <span className="font-medium font-mono text-xs">{company.stripe_customer_id}</span>
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
              <Button variant="outline" size="sm" disabled={isExtendingTrial} onClick={() => onExtendTrial(14)}>
                {isExtendingTrial ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Timer className="h-3 w-3 mr-1" />}+14 giorni trial
              </Button>
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

      {/* Dati Fatturazione */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Banknote className="h-5 w-5" />
            Dati Fatturazione
          </CardTitle>
          <CardDescription>Dati aziendali per la fatturazione</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between py-2 border-b text-sm">
            <span className="text-muted-foreground">Ragione Sociale</span>
            <span className="font-medium">{company.business_name || company.name}</span>
          </div>
          {company.vat_number && (
            <div className="flex justify-between py-2 border-b text-sm">
              <span className="text-muted-foreground">Partita IVA</span>
              <span className="font-medium font-mono">{company.vat_number}</span>
            </div>
          )}
          {company.fiscal_code && (
            <div className="flex justify-between py-2 border-b text-sm">
              <span className="text-muted-foreground">Codice Fiscale</span>
              <span className="font-medium font-mono">{company.fiscal_code}</span>
            </div>
          )}
          {company.pec && (
            <div className="flex justify-between py-2 border-b text-sm">
              <span className="text-muted-foreground">PEC</span>
              <span className="font-medium">{company.pec}</span>
            </div>
          )}
          {company.sdi_code && (
            <div className="flex justify-between py-2 border-b text-sm">
              <span className="text-muted-foreground">Codice SDI</span>
              <span className="font-medium font-mono">{company.sdi_code}</span>
            </div>
          )}
          {company.legal_address && (
            <div className="flex justify-between py-2 border-b text-sm">
              <span className="text-muted-foreground">Sede Legale</span>
              <span className="font-medium text-right">
                {company.legal_address}{company.legal_city ? `, ${company.legal_city}` : ""}{company.legal_province ? ` (${company.legal_province})` : ""}{company.legal_postal_code ? ` - ${company.legal_postal_code}` : ""}
              </span>
            </div>
          )}
          {!company.vat_number && !company.pec && !company.sdi_code && (
            <p className="text-sm text-muted-foreground text-center py-4">Nessun dato fiscale inserito. Compilali nel tab "Dettagli".</p>
          )}
        </CardContent>
      </Card>

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
