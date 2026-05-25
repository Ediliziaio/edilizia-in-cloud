import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDateShort, formatDateTime } from "@/lib/formatters";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  bankVerificationLabel,
  contractApprovalLabel,
  getBankVerificationStatus,
  getContractApprovalStatus,
  getReferralPayoutDetails,
  type BankVerificationStatus,
  type ContractApprovalStatus,
} from "@/lib/referralCompliance";
import type {
  ReferralClick,
  ReferralCompany,
  ReferralEvent,
  ReferralFraudLog,
  ReferralLedgerEntry,
  ReferralPayout,
  Referrer,
} from "@/pages/admin/ReferralDashboard";

interface Props {
  referrer: Referrer | null;
  onOpenChange: () => void;
  referralCompanies: ReferralCompany[];
  payouts: ReferralPayout[];
  clicks: ReferralClick[];
  events: ReferralEvent[];
  ledger: ReferralLedgerEntry[];
  fraudLogs: ReferralFraudLog[];
}

const methodLabels: Record<string, string> = {
  bank_transfer: "Bonifico",
  paypal: "PayPal",
  other: "Altro",
};

function toValidTime(value: string | null | undefined) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

export function ReferrerDetailDialog({
  referrer,
  onOpenChange,
  referralCompanies,
  payouts,
  clicks,
  events,
  ledger,
  fraudLogs,
}: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const complianceMutation = useMutation({
    mutationFn: async ({
      target,
      status,
      reason,
    }: {
      target: "bank" | "contract";
      status: BankVerificationStatus | ContractApprovalStatus;
      reason?: string;
    }) => {
      if (!referrer) throw new Error("Partner non disponibile");
      const details = getReferralPayoutDetails(referrer.payout_details);
      const now = new Date().toISOString();
      const payoutDetails = target === "bank"
        ? {
          ...details,
          bank_verification: {
            ...(details.bank_verification || {}),
            status,
            verified_at: status === "verified" ? now : details.bank_verification?.verified_at || null,
            rejected_at: status === "rejected" ? now : details.bank_verification?.rejected_at || null,
            reviewed_by: user?.id || null,
            rejection_reason: status === "rejected" ? reason || "Verifica conto respinta" : null,
          },
        }
        : {
          ...details,
          contract: {
            ...(details.contract || {}),
            status,
            approved_at: status === "approved" ? now : details.contract?.approved_at || null,
            rejected_at: status === "rejected" ? now : details.contract?.rejected_at || null,
            reviewed_by: user?.id || null,
            rejection_reason: status === "rejected" ? reason || "Contratto respinto" : null,
          },
        };

      const { error } = await supabase
        .from("referrers")
        .update({ payout_details: payoutDetails })
        .eq("id", referrer.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["referrers"] });
      queryClient.invalidateQueries({ queryKey: ["admin-pending-payouts"] });
      toast.success("Stato partner aggiornato");
    },
    onError: (err) => {
      toast.error("Errore", { description: err instanceof Error ? err.message : "Errore imprevisto" });
    },
  });

  if (!referrer) return null;

  const payoutDetails = getReferralPayoutDetails(referrer.payout_details);
  const bankStatus = getBankVerificationStatus(payoutDetails);
  const contractStatus = getContractApprovalStatus(payoutDetails, referrer.has_accepted_terms);

  const timeline = [
    ...events.map((event) => ({
      id: `event-${event.id}`,
      date: event.created_at,
      title: `Evento: ${event.event_type}`,
      description: event.referral_code ? `Codice ${event.referral_code}` : "Evento referral",
      tone: "secondary" as const,
    })),
    ...clicks.map((click) => ({
      id: `click-${click.id}`,
      date: click.created_at,
      title: click.converted ? "Click convertito" : "Click referral",
      description: [click.utm_source, click.utm_campaign, click.landing_page].filter(Boolean).join(" · ") || click.referral_code,
      tone: click.converted ? "default" as const : "secondary" as const,
    })),
    ...referralCompanies.map((company) => ({
      id: `company-${company.id}`,
      date: company.referred_at,
      title: company.is_active ? "Azienda attiva attribuita" : "Azienda attribuita",
      description: company.company?.name || company.company_id,
      tone: company.is_active ? "default" as const : "outline" as const,
    })),
    ...ledger.map((entry) => ({
      id: `ledger-${entry.id}`,
      date: entry.calculated_at,
      title: `Commissione ${entry.status || "calcolata"}`,
      description: `${entry.period_month}/${entry.period_year} · ${formatCurrency(Number(entry.commission_amount || 0))}`,
      tone: entry.status === "paid" ? "default" as const : "outline" as const,
    })),
    ...payouts.map((payout) => ({
      id: `payout-${payout.id}`,
      date: payout.paid_at || payout.created_at,
      title: `Payout ${payout.status || "registrato"}`,
      description: formatCurrency(Number(payout.amount || 0)),
      tone: payout.status === "paid" ? "default" as const : "outline" as const,
    })),
    ...fraudLogs.map((log) => ({
      id: `fraud-${log.id}`,
      date: log.detected_at,
      title: `Anomalia: ${log.fraud_type}`,
      description: "Verifica richiesta prima del payout",
      tone: "destructive" as const,
    })),
  ]
    .sort((a, b) => toValidTime(b.date) - toValidTime(a.date))
    .slice(0, 40);

  return (
    <Dialog open={!!referrer} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[82vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{referrer.name}</DialogTitle>
          <DialogDescription>
            Codice: <code className="bg-muted px-2 py-0.5 rounded text-xs">{referrer.referral_code}</code>
            {" · "}{referrer.email}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="companies" className="mt-2">
          <TabsList className="grid h-auto w-full grid-cols-2 gap-1 md:grid-cols-5">
            <TabsTrigger value="companies">Aziende Portate ({referralCompanies.length})</TabsTrigger>
            <TabsTrigger value="payouts">Storico Pagamenti ({payouts.length})</TabsTrigger>
            <TabsTrigger value="compliance">Compliance</TabsTrigger>
            <TabsTrigger value="timeline">Timeline ({timeline.length})</TabsTrigger>
            <TabsTrigger value="ledger">Commissioni ({ledger.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="companies">
            {referralCompanies.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">Nessuna azienda portata</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Azienda</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Stato</TableHead>
                    <TableHead className="text-right">MRR</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {referralCompanies.map((rc) => (
                    <TableRow key={rc.id}>
                      <TableCell className="font-medium">{rc.company?.name || "—"}</TableCell>
                      <TableCell>{formatDateShort(rc.referred_at)}</TableCell>
                      <TableCell>
                        <Badge variant={rc.is_active ? "default" : "secondary"}>
                          {rc.is_active ? "Attiva" : "Inattiva"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {rc.plan ? formatCurrency(rc.plan.price_monthly) : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TabsContent>

          <TabsContent value="payouts">
            {payouts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">Nessun pagamento registrato</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Importo</TableHead>
                    <TableHead>Periodo</TableHead>
                    <TableHead>Metodo</TableHead>
                    <TableHead>Data</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payouts.map((p) => {
                    const method = p.payment_method || "-";
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{formatCurrency(p.amount)}</TableCell>
                        <TableCell>
                          {formatDateShort(p.period_start)} — {formatDateShort(p.period_end)}
                        </TableCell>
                        <TableCell>{methodLabels[method] || method}</TableCell>
                        <TableCell>{formatDateShort(p.paid_at || p.created_at)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </TabsContent>

          <TabsContent value="compliance">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">Verifica conto corrente</h3>
                    <p className="text-sm text-muted-foreground">IBAN, intestatario e dati fiscali per payout.</p>
                  </div>
                  <Badge variant={bankStatus === "verified" ? "default" : bankStatus === "rejected" ? "destructive" : "secondary"}>
                    {bankVerificationLabel(bankStatus)}
                  </Badge>
                </div>
                <div className="mt-4 space-y-2 text-sm">
                  <div className="flex justify-between gap-3"><span className="text-muted-foreground">IBAN</span><span className="font-mono">{payoutDetails.iban || "—"}</span></div>
                  <div className="flex justify-between gap-3"><span className="text-muted-foreground">Intestatario</span><span>{payoutDetails.account_holder || "—"}</span></div>
                  <div className="flex justify-between gap-3"><span className="text-muted-foreground">Banca</span><span>{payoutDetails.bank || "—"}</span></div>
                  <div className="flex justify-between gap-3"><span className="text-muted-foreground">Codice fiscale</span><span>{payoutDetails.fiscal_code || "—"}</span></div>
                </div>
                {payoutDetails.bank_verification?.rejection_reason && (
                  <p className="mt-3 rounded-md bg-destructive/10 p-2 text-sm text-destructive">{payoutDetails.bank_verification.rejection_reason}</p>
                )}
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={() => complianceMutation.mutate({ target: "bank", status: "verified" })}
                    disabled={complianceMutation.isPending || !payoutDetails.iban || !payoutDetails.account_holder}
                  >
                    Approva conto
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const reason = window.prompt("Motivo respingimento conto:");
                      if (reason?.trim()) complianceMutation.mutate({ target: "bank", status: "rejected", reason });
                    }}
                    disabled={complianceMutation.isPending}
                  >
                    Respingi
                  </Button>
                </div>
              </div>

              <div className="rounded-lg border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">Contratto partner</h3>
                    <p className="text-sm text-muted-foreground">Firma digitale e approvazione legale.</p>
                  </div>
                  <Badge variant={contractStatus === "approved" ? "default" : contractStatus === "rejected" ? "destructive" : "secondary"}>
                    {contractApprovalLabel(contractStatus)}
                  </Badge>
                </div>
                <div className="mt-4 space-y-2 text-sm">
                  <div className="flex justify-between gap-3"><span className="text-muted-foreground">Firmatario</span><span>{payoutDetails.contract?.signed_name || "—"}</span></div>
                  <div className="flex justify-between gap-3"><span className="text-muted-foreground">Versione</span><span>{payoutDetails.contract?.version || "—"}</span></div>
                  <div className="flex justify-between gap-3"><span className="text-muted-foreground">Firmato il</span><span>{formatDateTime(payoutDetails.contract?.signed_at || "")}</span></div>
                  <div className="flex justify-between gap-3"><span className="text-muted-foreground">IP firma</span><span>{payoutDetails.contract?.ip_address || "—"}</span></div>
                </div>
                {payoutDetails.contract?.rejection_reason && (
                  <p className="mt-3 rounded-md bg-destructive/10 p-2 text-sm text-destructive">{payoutDetails.contract.rejection_reason}</p>
                )}
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={() => complianceMutation.mutate({ target: "contract", status: "approved" })}
                    disabled={complianceMutation.isPending || contractStatus === "missing"}
                  >
                    Approva contratto
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const reason = window.prompt("Motivo respingimento contratto:");
                      if (reason?.trim()) complianceMutation.mutate({ target: "contract", status: "rejected", reason });
                    }}
                    disabled={complianceMutation.isPending || contractStatus === "missing"}
                  >
                    Respingi
                  </Button>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="timeline">
            {timeline.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">Nessun evento disponibile</div>
            ) : (
              <div className="space-y-3 py-2">
                {timeline.map((item) => (
                  <div key={item.id} className="flex gap-3 rounded-lg border p-3">
                    <div className="mt-1 h-2.5 w-2.5 rounded-full bg-primary" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-sm font-medium">{item.title}</p>
                        <Badge variant={item.tone}>{formatDateTime(item.date || "")}</Badge>
                      </div>
                      <p className="mt-1 break-words text-xs text-muted-foreground">{item.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="ledger">
            {ledger.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">Nessuna commissione a ledger</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Periodo</TableHead>
                    <TableHead>Piano</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Stato</TableHead>
                    <TableHead className="text-right">Importo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ledger.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell>{entry.period_month}/{entry.period_year}</TableCell>
                      <TableCell>{entry.subscription_plan_name || "—"}</TableCell>
                      <TableCell>{entry.commission_type || "—"}</TableCell>
                      <TableCell>
                        <Badge variant={entry.status === "paid" ? "default" : "outline"}>
                          {entry.status || "calcolata"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(Number(entry.commission_amount || 0))}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
