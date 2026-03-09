import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CreditCard, Clock, Pause, Play, Timer, Loader2, Banknote, RefreshCw, CalendarPlus } from "lucide-react";
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
