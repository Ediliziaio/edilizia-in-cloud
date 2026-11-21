import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Loader2, Check, X, Download, AlertTriangle } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { exportToCSV } from "@/lib/csvExport";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { toast } from "sonner";
import { transitionReferralPayout } from "@/lib/referralPayouts";
import {
  DEFAULT_REFERRAL_COMMISSION_POLICY,
  REFERRAL_COMMISSION_POLICY_KEY,
  evaluateReferralPayoutEligibility,
  parseReferralCommissionPolicy,
} from "@/lib/referralRules";
import {
  bankVerificationLabel,
  contractApprovalLabel,
  getPartnerPayoutCompliance,
} from "@/lib/referralCompliance";

export function PayoutApprovalTab() {
  const queryClient = useQueryClient();
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [bankRejected, setBankRejected] = useState(false);
  const [confirmPayout, setConfirmPayout] = useState<{ id: string; amount: number } | null>(null);
  const [bankReference, setBankReference] = useState("");
  const [approveConfirmId, setApproveConfirmId] = useState<string | null>(null);
  const [approveConfirmData, setApproveConfirmData] = useState<{ referrerName: string; amount: number } | null>(null);

  const { data: pendingPayouts = [], isLoading, isError } = useQuery({
    queryKey: ["admin-pending-payouts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("referral_payouts")
        .select("*")
        .in("status", ["pending", "approved", "processing"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = data ?? [];
      // Enrich with referrer info
      if (rows.length === 0) return [];
      const referrerIds = [...new Set(rows.map((p: any) => p.referrer_id).filter(Boolean))];
      const { data: referrers, error: referrersError } = referrerIds.length > 0
        ? await supabase
          .from("referrers")
          .select("id, name, email, payout_method, payout_details, has_accepted_terms")
          .in("id", referrerIds)
        : { data: [] as any[], error: null };
      if (referrersError) throw referrersError;
      return rows.map((p: any) => ({
        ...p,
        referrer: referrers?.find((r: any) => r.id === p.referrer_id),
      }));
    },
  });

  const { data: paidPayouts = [] } = useQuery({
    queryKey: ["admin-paid-payouts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("referral_payouts")
        .select("*")
        .in("status", ["paid", "rejected"])
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      const rows = data ?? [];
      if (rows.length === 0) return [];
      const referrerIds = [...new Set(rows.map((p: any) => p.referrer_id).filter(Boolean))];
      const { data: referrers, error: referrersError } = referrerIds.length > 0
        ? await supabase
          .from("referrers")
          .select("id, name, email")
          .in("id", referrerIds)
        : { data: [] as any[], error: null };
      if (referrersError) throw referrersError;
      return rows.map((p: any) => ({
        ...p,
        referrer: referrers?.find((r: any) => r.id === p.referrer_id),
      }));
    },
  });

  const { data: payoutPolicy = DEFAULT_REFERRAL_COMMISSION_POLICY } = useQuery({
    queryKey: ["platform_settings", REFERRAL_COMMISSION_POLICY_KEY],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_settings")
        .select("value")
        .eq("key", REFERRAL_COMMISSION_POLICY_KEY)
        .maybeSingle();
      if (error) throw error;
      return parseReferralCommissionPolicy(data?.value);
    },
    staleTime: 60000,
  });

  const { data: recentFraudLogs = [] } = useQuery({
    queryKey: ["referral_fraud_log", "payout-eligibility"],
    queryFn: async () => {
      const since = new Date(Date.now() - 60 * 86_400_000).toISOString();
      const { data, error } = await supabase
        .from("referral_fraud_log")
        .select("id, referrer_id, fraud_type, detected_at")
        .gte("detected_at", since)
        .order("detected_at", { ascending: false, nullsFirst: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60000,
  });

  const refreshPayouts = () => {
    for (const key of ["admin-pending-payouts", "admin-paid-payouts", "pending-payout-count",
      "referral-payout-balance", "referral_payouts", "referrers"]) {
      queryClient.invalidateQueries({ queryKey: [key] });
    }
  };

  const approveMutation = useMutation({
    mutationFn: (id: string) => transitionReferralPayout(id, "approve"),
    onSuccess: () => { refreshPayouts(); toast.success("Richiesta approvata"); },
    onError: (error) => toast.error(error.message),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      transitionReferralPayout(id, bankRejected ? "bank_rejected" : "reject", reason),
    onSuccess: () => {
      refreshPayouts();
      setRejectId(null);
      setRejectReason("");
      setBankRejected(false);
      toast.success("Richiesta chiusa. Importo restituito al saldo disponibile.");
    },
    onError: (error) => toast.error(error.message),
  });

  const prepareMutation = useMutation({
    mutationFn: ({ id }: { id: string; download: boolean }) => transitionReferralPayout(id, "prepare"),
    onSuccess: (instruction, { download }) => {
      refreshPayouts();
      if (!download) {
        toast.success("Pagamento pronto per la riconciliazione");
        return;
      }
      exportToCSV([{
        beneficiary: instruction.beneficiary ?? "",
        iban: instruction.iban ?? "",
        amount: Number(instruction.amount).toFixed(2),
        reference: instruction.reference,
      }], [
        { key: "beneficiary", label: "Beneficiario" },
        { key: "iban", label: "IBAN" },
        { key: "amount", label: "Importo EUR" },
        { key: "reference", label: "Causale" },
      ], `distinta-${instruction.reference}.csv`);
    },
    onError: (error) => toast.error(error.message),
  });

  const markPaid = useMutation({
    mutationFn: ({ id, reference }: { id: string; reference: string }) =>
      transitionReferralPayout(id, "confirm", reference),
    onSuccess: () => {
      refreshPayouts();
      setConfirmPayout(null);
      setBankReference("");
      toast.success("Pagamento riconciliato");
    },
    onError: (error) => toast.error(error.message),
  });

  const exportCSV = () => {
    const allPayouts = [...pendingPayouts, ...paidPayouts];
    exportToCSV(
      allPayouts.map((p: any) => ({
        partner: p.referrer?.name || "-",
        email: p.referrer?.email || "-",
        amount: String(p.amount ?? 0),
        method: p.payment_method || "-",
        status: p.status || "-",
        date: p.created_at || "-",
        reference: p.transaction_reference || "",
      })),
      [
        { key: "partner", label: "Partner" },
        { key: "email", label: "Email" },
        { key: "amount", label: "Importo" },
        { key: "method", label: "Metodo" },
        { key: "status", label: "Stato" },
        { key: "date", label: "Data" },
        { key: "reference", label: "Riferimento" },
      ],
      "payout-export.csv",
    );
  };

  const pending = pendingPayouts.filter((p: any) => p.status === "pending");
  const approved = pendingPayouts.filter((p) => p.status === "approved" || p.status === "processing");

  const fraudCountByReferrer = useMemo(() => {
    const map = new Map<string, number>();
    recentFraudLogs.forEach((log: any) => {
      if (!log.referrer_id) return;
      map.set(log.referrer_id, (map.get(log.referrer_id) || 0) + 1);
    });
    return map;
  }, [recentFraudLogs]);

  const getEligibility = (payout: any) => evaluateReferralPayoutEligibility({
    amount: Number(payout.amount || 0),
    referrer: payout.referrer,
    fraudLogCount: fraudCountByReferrer.get(payout.referrer_id) || 0,
    policy: payoutPolicy,
  });

  const getCompliance = (payout: any) => getPartnerPayoutCompliance({
    payoutDetails: payout.referrer?.payout_details,
    hasAcceptedTerms: payout.referrer?.has_accepted_terms,
  });

  const blockedPendingCount = pending.filter((p: any) => !getEligibility(p).eligible || !getCompliance(p).ready).length;
  const blockedApprovedCount = approved.filter((p) => p.status === "approved" && (!getEligibility(p).eligible || !getCompliance(p).ready)).length;

  const handleApproveClick = (payout: any) => {
    const eligibility = getEligibility(payout);
    const compliance = getCompliance(payout);
    if (!eligibility.eligible || !compliance.ready) {
      toast.error("Payout bloccato dalla policy", {
        description: [...compliance.blockers, ...eligibility.blockers].join(" · "),
      });
      return;
    }

    setApproveConfirmId(payout.id);
    setApproveConfirmData({ referrerName: payout.referrer?.name ?? "—", amount: payout.amount });
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case "paid": return <Badge variant="default">Pagato</Badge>;
      case "approved": return <Badge className="bg-blue-500/10 text-blue-700 border-blue-200">Approvato</Badge>;
      case "processing": return <Badge className="bg-yellow-500/10 text-yellow-700 border-yellow-200">Da riconciliare</Badge>;
      case "rejected": return <Badge variant="destructive">Rifiutato</Badge>;
      default: return <Badge variant="secondary">In attesa</Badge>;
    }
  };

  if (isLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  }

  if (isError) return <p role="alert" className="text-sm text-destructive">Impossibile caricare le richieste di pagamento.</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Richieste da approvare ({pending.length})</h3>
          {(blockedPendingCount > 0 || blockedApprovedCount > 0) && (
            <p className="text-sm text-muted-foreground">
              {blockedPendingCount + blockedApprovedCount} payout bloccati da policy referral.
            </p>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={exportCSV} className="hidden sm:inline-flex">
          <Download className="h-4 w-4 mr-1.5" /> Esporta CSV
        </Button>
      </div>

      {pending.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Nessuna richiesta in attesa
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Partner</TableHead>
                    <TableHead className="text-right">Importo</TableHead>
                    <TableHead>Richiesto il</TableHead>
                    <TableHead>Metodo</TableHead>
                    <TableHead>Stato</TableHead>
                    <TableHead>Controllo</TableHead>
                    <TableHead className="text-right">Azioni</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pending.map((p: any) => {
                    const eligibility = getEligibility(p);
                    const compliance = getCompliance(p);
                    const canApprove = eligibility.eligible && compliance.ready;
                    return (
                      <TableRow key={p.id}>
                        <TableCell>
                          <div className="space-y-1">
                            <div className="font-medium">{p.referrer?.name || "—"}</div>
                            <div className="text-xs text-muted-foreground">{p.referrer?.email}</div>
                            {p.requested_by_referrer ? (
                              <Badge variant="outline" className="text-[11px]">Richiesto dal partner</Badge>
                            ) : p.auto_generated ? (
                              <Badge variant="secondary" className="text-[11px]">Auto · ciclo mensile</Badge>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-bold">{formatCurrency(p.amount)}</TableCell>
                        <TableCell className="text-sm">{format(new Date(p.created_at), "dd MMM yyyy", { locale: it })}</TableCell>
                        <TableCell className="text-sm">{p.payment_method || "—"}</TableCell>
                        <TableCell>{statusBadge(p.status)}</TableCell>
                        <TableCell className="max-w-[260px]">
                          <div className="space-y-1">
                            <Badge variant={canApprove ? "secondary" : "destructive"}>
                              {canApprove ? "Eleggibile" : "Bloccato"}
                            </Badge>
                            <div className="flex flex-wrap gap-1">
                              <Badge variant={compliance.bankStatus === "verified" ? "outline" : "secondary"} className="text-[11px]">
                                Conto: {bankVerificationLabel(compliance.bankStatus)}
                              </Badge>
                              <Badge variant={compliance.contractStatus === "approved" ? "outline" : "secondary"} className="text-[11px]">
                                Contratto: {contractApprovalLabel(compliance.contractStatus)}
                              </Badge>
                            </div>
                            {(compliance.blockers.length > 0 || eligibility.blockers.length > 0 || eligibility.warnings.length > 0) && (
                              <p className="text-xs text-muted-foreground">
                                {[...compliance.blockers, ...eligibility.blockers, ...eligibility.warnings].join(" · ")}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleApproveClick(p)}
                              disabled={approveMutation.isPending || !canApprove}
                            >
                              <Check className="h-3.5 w-3.5 mr-1" /> Approva
                            </Button>
                            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { setBankRejected(false); setRejectId(p.id); }}>
                              <X className="h-3.5 w-3.5 mr-1" /> Rifiuta
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Approved payouts — mark as paid */}
      {approved.length > 0 && (
        <>
          <h3 className="text-lg font-semibold">Pagamenti approvati e da riconciliare</h3>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Partner</TableHead>
                      <TableHead className="text-right">Importo</TableHead>
                      <TableHead>Metodo</TableHead>
                      <TableHead>Controllo</TableHead>
                      <TableHead className="text-right">Azione</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {approved.map((p: any) => {
                      const eligibility = getEligibility(p);
                      const compliance = getCompliance(p);
                      const canPay = eligibility.eligible && compliance.ready;
                      return (
                        <TableRow key={p.id}>
                          <TableCell className="font-medium">{p.referrer?.name}</TableCell>
                          <TableCell className="text-right font-bold">{formatCurrency(p.amount)}</TableCell>
                          <TableCell className="space-y-1 text-sm"><div>{p.payment_method}</div>{statusBadge(p.status ?? "")}</TableCell>
                          <TableCell className="max-w-[260px]">
                            <div className="space-y-1">
                              <Badge variant={canPay ? "secondary" : "destructive"}>
                                {canPay ? "Eleggibile" : "Bloccato"}
                              </Badge>
                              <div className="flex flex-wrap gap-1">
                                <Badge variant={compliance.bankStatus === "verified" ? "outline" : "secondary"} className="text-[11px]">
                                  Conto: {bankVerificationLabel(compliance.bankStatus)}
                                </Badge>
                                <Badge variant={compliance.contractStatus === "approved" ? "outline" : "secondary"} className="text-[11px]">
                                  Contratto: {contractApprovalLabel(compliance.contractStatus)}
                                </Badge>
                              </div>
                              {(compliance.blockers.length > 0 || eligibility.blockers.length > 0 || eligibility.warnings.length > 0) && (
                                <p className="text-xs text-muted-foreground">
                                  {[...compliance.blockers, ...eligibility.blockers, ...eligibility.warnings].join(" · ")}
                                </p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex flex-wrap justify-end gap-2">
                              {p.status === "approved" ? (
                                <>
                                  <Button size="sm" disabled={prepareMutation.isPending || !canPay}
                                    onClick={() => prepareMutation.mutate({ id: p.id, download: false })}>
                                    {p.payment_method === "bank_transfer" ? "Prepara bonifico" : "Prepara pagamento"}
                                  </Button>
                                  <Button size="sm" variant="ghost" onClick={() => { setBankRejected(false); setRejectId(p.id); }}>
                                    Rifiuta
                                  </Button>
                                </>
                              ) : (
                                <>
                                  {p.payment_method === "bank_transfer" && (
                                    <Button size="sm" variant="outline" disabled={prepareMutation.isPending}
                                      onClick={() => prepareMutation.mutate({ id: p.id, download: true })}>
                                      <Download className="mr-1 h-4 w-4" /> Distinta CSV
                                    </Button>
                                  )}
                                  {p.payment_method !== "bank_transfer" && (
                                    <Button size="sm" variant="outline" disabled={prepareMutation.isPending}
                                      onClick={() => prepareMutation.mutate({ id: p.id, download: false })}>
                                      Dati pagamento
                                    </Button>
                                  )}
                                  <Button size="sm" onClick={() => setConfirmPayout({ id: p.id, amount: p.amount })}>
                                    Riconcilia
                                  </Button>
                                  <Button size="sm" variant="ghost" onClick={() => { setBankRejected(true); setRejectId(p.id); }}>
                                    Pagamento respinto
                                  </Button>
                                </>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* History */}
      {paidPayouts.length > 0 && (
        <>
          <h3 className="text-lg font-semibold">Storico</h3>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Partner</TableHead>
                      <TableHead className="text-right">Importo</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead>Stato</TableHead>
                      <TableHead>Rif.</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paidPayouts.map((p: any) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{p.referrer?.name}</TableCell>
                        <TableCell className="text-right">{formatCurrency(p.amount)}</TableCell>
                        <TableCell className="text-sm">{format(new Date(p.paid_at ?? p.created_at), "dd/MM/yyyy")}</TableCell>
                        <TableCell>{statusBadge(p.status)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{p.transaction_reference || "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      <Dialog open={!!confirmPayout} onOpenChange={(open) => {
        if (!open) { setConfirmPayout(null); setBankReference(""); }
      }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Riconcilia pagamento</DialogTitle>
            <DialogDescription>
              Verifica l’addebito di {formatCurrency(confirmPayout?.amount ?? 0)} prima di registrare il riferimento.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-3" onSubmit={(event) => {
            event.preventDefault();
            if (confirmPayout) markPaid.mutate({ id: confirmPayout.id, reference: bankReference });
          }}>
            <label className="block text-sm font-medium" htmlFor="payout-bank-reference">Riferimento transazione</label>
            <Input id="payout-bank-reference" value={bankReference} maxLength={120}
              onChange={(event) => setBankReference(event.target.value)} />
            <Button type="submit" disabled={markPaid.isPending || bankReference.trim().length < 3}>
              Conferma incrocio con la banca
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Reject dialog */}
      <Dialog open={!!rejectId} onOpenChange={(open) => { if (!open) { setRejectId(null); setRejectReason(""); setBankRejected(false); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{bankRejected ? "Registra pagamento respinto" : "Rifiuta richiesta"}</DialogTitle>
            <DialogDescription>{bankRejected ? "Verifica lo scarto con la banca e indica il motivo e il riferimento." : "Inserisci il motivo del rifiuto."}</DialogDescription>
          </DialogHeader>
          <Input aria-label="Motivo del rifiuto" maxLength={500} placeholder="Motivo…" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
          <Button
            variant="destructive"
            onClick={() => rejectId && rejectMutation.mutate({ id: rejectId, reason: rejectReason })}
            disabled={rejectMutation.isPending || rejectReason.trim().length < 3}
          >
            Conferma Rifiuto
          </Button>
        </DialogContent>
      </Dialog>

      {/* Approve confirmation dialog — double confirmation required (P3 governance) */}
      <AlertDialog
        open={!!approveConfirmId}
        onOpenChange={(open) => { if (!open) { setApproveConfirmId(null); setApproveConfirmData(null); } }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              Conferma Approvazione Payout
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">Stai per approvare un payout a <strong>{approveConfirmData?.referrerName}</strong>.</span>
              <span className="block">
                Importo{" "}
                <strong className="text-foreground">
                  {approveConfirmData ? new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", useGrouping: "always" }).format(approveConfirmData.amount) : "—"}
                </strong>
              </span>
              <span className="block">Verranno registrati data e utente che approva.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (approveConfirmId) {
                  approveMutation.mutate(approveConfirmId);
                  setApproveConfirmId(null);
                  setApproveConfirmData(null);
                }
              }}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <Check className="h-4 w-4 mr-1" />
              Sì, Approva Payout
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
