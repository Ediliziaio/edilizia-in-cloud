import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Wallet, DollarSign, ShieldCheck, FileText } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { toast } from "sonner";
import {
  DEFAULT_REFERRAL_COMMISSION_POLICY,
  REFERRAL_COMMISSION_POLICY_KEY,
  evaluateReferralPayoutEligibility,
  type ReferralCommissionPolicy,
  parseReferralCommissionPolicy,
} from "@/lib/referralRules";
import {
  bankVerificationLabel,
  contractApprovalLabel,
  getPartnerPayoutCompliance,
} from "@/lib/referralCompliance";

type PreviewReferrer = {
  id: string;
  total_earned: number;
  total_paid: number;
  payout_method: string | null;
  payout_details: Record<string, unknown> | null;
  has_accepted_terms: boolean | null;
};

type PreviewPayout = {
  id: string;
  amount: number;
  period_start: string;
  period_end: string;
  paid_at: string | null;
  created_at?: string | null;
  payment_method: string | null;
  status: string | null;
  transaction_reference: string | null;
};

type PayoutRow = PreviewPayout & {
  created_at?: string | null;
  notes?: string | null;
};

export type PartnerPayoutPreviewData = {
  referrer: PreviewReferrer;
  payouts: PayoutRow[];
  policy?: ReferralCommissionPolicy;
};

const formatSafeDate = (value: string | null | undefined, pattern: string) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return format(date, pattern, { locale: it });
};

const paymentMethodLabel = (method: string | null | undefined) => {
  if (method === "paypal") return "PayPal";
  if (method === "bank_transfer") return "Bonifico bancario";
  return method || "—";
};

export default function PartnerPayout({ previewData }: { previewData?: PartnerPayoutPreviewData } = {}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const isPreview = !!previewData;

  const { data: referrer, isLoading: isReferrerLoading } = useQuery({
    queryKey: isPreview ? ["partner-payout-preview", "referrer"] : queryKeys.partnerPayouts.referrer(user?.id),
    enabled: isPreview || !!user?.id,
    queryFn: async () => {
      if (previewData) return previewData.referrer;
      const { data } = await supabase
        .from("referrers")
        .select("id, total_earned, total_paid, payout_method, payout_details, has_accepted_terms")
        .eq("user_id", user!.id)
        .maybeSingle();
      return data;
    },
  });

  const { data: payoutPolicy = DEFAULT_REFERRAL_COMMISSION_POLICY } = useQuery({
    queryKey: isPreview
      ? ["platform_settings", REFERRAL_COMMISSION_POLICY_KEY, "partner-preview"]
      : ["platform_settings", REFERRAL_COMMISSION_POLICY_KEY, "partner"],
    queryFn: async () => {
      if (previewData?.policy) return previewData.policy;
      const { data, error } = await supabase
        .from("platform_settings")
        .select("value")
        .eq("key", REFERRAL_COMMISSION_POLICY_KEY)
        .maybeSingle();
      if (error) return DEFAULT_REFERRAL_COMMISSION_POLICY;
      return parseReferralCommissionPolicy(data?.value);
    },
    staleTime: 60000,
  });

  const { data: payouts = [], isLoading } = useQuery<PayoutRow[]>({
    queryKey: isPreview ? ["partner-payout-preview", "payouts"] : queryKeys.partnerPayouts.payouts(referrer?.id),
    enabled: isPreview || !!referrer?.id,
    queryFn: async () => {
      if (previewData) return previewData.payouts;
      const { data, error } = await supabase
        .from("referral_payouts")
        .select("*")
        .eq("referrer_id", referrer!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Conteggio segnalazioni anti-frode del partner: la tabella è leggibile solo
  // da super_admin, quindi si passa dalla RPC dedicata. Se la RPC non è ancora
  // deployata (o errore), fallback 0 = comportamento precedente.
  const { data: fraudLogCount = 0 } = useQuery({
    queryKey: ["partner-fraud-count", referrer?.id],
    enabled: !isPreview && !!referrer?.id,
    staleTime: 60000,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as unknown as (fn: string) => PromiseLike<{ data: number | null; error: unknown }>)(
        "get_my_referral_fraud_count",
      );
      if (error) return 0;
      return data ?? 0;
    },
  });

  const balance = (referrer?.total_earned || 0) - (referrer?.total_paid || 0);
  const [hasDefaultedAmount, setHasDefaultedAmount] = useState(false);
  useEffect(() => {
    if (!hasDefaultedAmount && !amount && balance > 0) {
      setAmount(balance.toFixed(2));
      setHasDefaultedAmount(true);
    }
  }, [amount, balance, hasDefaultedAmount]);

  const requestedAmount = parseFloat(amount);
  const amountInvalid =
    !amount ||
    !Number.isFinite(requestedAmount) ||
    requestedAmount <= 0 ||
    requestedAmount > balance;
  const payoutEligibility = evaluateReferralPayoutEligibility({
    amount: Number.isFinite(requestedAmount) ? requestedAmount : balance,
    referrer,
    fraudLogCount,
    policy: payoutPolicy,
  });
  const payoutCompliance = getPartnerPayoutCompliance({
    payoutDetails: referrer?.payout_details,
    hasAcceptedTerms: referrer?.has_accepted_terms,
  });

  // ── Calcola prossimo pagamento automatico (il 12 del mese) ───
  const getNextPaymentInfo = () => {
    const today       = new Date();
    const day         = today.getDate();
    const month       = today.getMonth();
    const year        = today.getFullYear();
    const paymentDate = day < 12
      ? new Date(year, month, 12)
      : new Date(year, month + 1, 12);
    const daysLeft    = Math.ceil((paymentDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return {
      date:        format(paymentDate, "d MMMM yyyy", { locale: it }),
      daysLeft,
      isThisMonth: day < 12,
    };
  };
  const paymentInfo = getNextPaymentInfo();

  const requestPayout = useMutation({
    mutationFn: async () => {
      const amt = parseFloat(amount);
      if (isNaN(amt) || amt <= 0 || amt > balance) throw new Error("Importo non valido");
      const eligibility = evaluateReferralPayoutEligibility({
        amount: amt,
        referrer,
        fraudLogCount,
        policy: payoutPolicy,
      });
      if (!eligibility.eligible) throw new Error(eligibility.blockers.join(" · "));
      const compliance = getPartnerPayoutCompliance({
        payoutDetails: referrer?.payout_details,
        hasAcceptedTerms: referrer?.has_accepted_terms,
      });
      if (!compliance.ready) throw new Error(compliance.blockers.join(" · "));

      if (isPreview) return;

      const now = new Date();
      const { error } = await supabase.from("referral_payouts").insert({
        referrer_id: referrer!.id,
        amount: amt,
        period_start: new Date(now.getFullYear(), now.getMonth(), 1).toLocaleDateString("en-CA"),
        period_end: now.toLocaleDateString("en-CA"),
        paid_at: null,
        payment_method: referrer?.payout_method || "bank_transfer",
        notes: notes || null,
        status: "pending",
        requested_by_referrer: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      if (!isPreview) {
        queryClient.invalidateQueries({ queryKey: queryKeys.partnerPayouts.payoutsAll });
      }
      toast.success(isPreview ? "Simulazione richiesta pagamento pronta" : "Richiesta di pagamento inviata!");
      setAmount("");
      setNotes("");
    },
    onError: (err) => {
      toast.error("Errore", { description: err instanceof Error ? err.message : "Errore imprevisto" });
    },
  });

  const statusBadge = (status: string) => {
    switch (status) {
      case "paid": return <Badge variant="default">Pagato</Badge>;
      case "approved": return <Badge className="bg-blue-500/10 text-blue-700 border-blue-200">Approvato</Badge>;
      case "processing": return <Badge className="bg-yellow-500/10 text-yellow-700 border-yellow-200">In Elaborazione</Badge>;
      case "rejected": return <Badge variant="destructive">Rifiutato</Badge>;
      default: return <Badge variant="secondary">In attesa</Badge>;
    }
  };

  if (isReferrerLoading && !isPreview) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  if (!referrer) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Wallet className="h-12 w-12 mx-auto mb-4 opacity-40" />
            <h1 className="text-xl font-semibold text-foreground">Payout partner non disponibile</h1>
            <p className="mt-2 text-sm">Il tuo account non è ancora collegato a un profilo partner attivo.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Richiedi Pagamento</h1>

      {/* Countdown prossimo pagamento automatico */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="p-4 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">Prossimo pagamento automatico</p>
              <p className="text-xl font-bold text-primary sm:text-2xl">{paymentInfo.date}</p>
              <p className="text-sm text-muted-foreground mt-1">
                tra {paymentInfo.daysLeft} giorni · importo stimato: {formatCurrency(balance)}
              </p>
            </div>
            <div className="shrink-0 text-center">
              <div className="text-3xl font-bold text-primary sm:text-4xl">{paymentInfo.daysLeft}</div>
              <div className="text-xs text-muted-foreground">giorni</div>
            </div>
          </div>
          {balance <= 0 && (
            <p className="text-sm text-muted-foreground mt-3 italic">
              Nessuna commissione maturata per questo ciclo.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Compliance */}
      <Card className={payoutCompliance.ready ? "border-emerald-200 bg-emerald-50/40" : "border-amber-200 bg-amber-50/40"}>
        <CardContent className="grid gap-3 p-4 sm:p-6 md:grid-cols-2">
          <div className="flex items-start gap-3">
            <ShieldCheck className={`mt-0.5 h-4 w-4 ${payoutCompliance.bankStatus === "verified" ? "text-emerald-600" : "text-amber-600"}`} />
            <div>
              <p className="text-sm font-medium">Conto corrente</p>
              <Badge variant={payoutCompliance.bankStatus === "verified" ? "default" : "secondary"}>
                {bankVerificationLabel(payoutCompliance.bankStatus)}
              </Badge>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <FileText className={`mt-0.5 h-4 w-4 ${payoutCompliance.contractStatus === "approved" ? "text-emerald-600" : "text-amber-600"}`} />
            <div>
              <p className="text-sm font-medium">Contratto partner</p>
              <Badge variant={payoutCompliance.contractStatus === "approved" ? "default" : "secondary"}>
                {contractApprovalLabel(payoutCompliance.contractStatus)}
              </Badge>
            </div>
          </div>
          {!payoutCompliance.ready && (
            <p className="md:col-span-2 text-sm text-amber-900">
              Prima di richiedere un payout serve conto verificato e contratto approvato.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Balance */}
      <Card>
        <CardContent className="flex items-center gap-4 p-4 sm:p-6">
          <Wallet className="h-8 w-8 shrink-0 text-primary" />
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">Saldo Disponibile</p>
            <p className={`text-2xl font-bold sm:text-3xl ${balance > 0 ? "text-green-600" : ""}`}>{formatCurrency(balance)}</p>
          </div>
        </CardContent>
      </Card>

      {/* Request form */}
      {balance > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Nuova Richiesta</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Importo (max {formatCurrency(balance)})</Label>
                <Input
                  type="number"
                  step="0.01"
                  max={balance}
                  placeholder={balance.toFixed(2)}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Metodo</Label>
                <Input value={paymentMethodLabel(referrer?.payout_method)} disabled />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Note (opzionale)</Label>
              <Textarea placeholder="Note aggiuntive..." value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            {(payoutEligibility.blockers.length > 0 || payoutEligibility.warnings.length > 0 || payoutCompliance.blockers.length > 0) && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                {[...payoutCompliance.blockers, ...payoutEligibility.blockers, ...payoutEligibility.warnings].join(" · ")}
              </div>
            )}
            <Button
              className="w-full sm:w-auto"
              onClick={() => requestPayout.mutate()}
              disabled={requestPayout.isPending || amountInvalid || !payoutEligibility.eligible || !payoutCompliance.ready}
            >
              {requestPayout.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Richiedi Pagamento
            </Button>
          </CardContent>
        </Card>
      )}

      {/* History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Storico Pagamenti</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : payouts.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <DollarSign className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p>Nessun pagamento registrato</p>
            </div>
          ) : (
            <>
              <div className="space-y-3 p-4 md:hidden">
                {payouts.map((p) => (
                  <div key={`${p.id}-mobile`} className="rounded-lg border bg-background p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xl font-bold">{formatCurrency(p.amount)}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {formatSafeDate(p.period_start, "dd/MM/yy")} — {formatSafeDate(p.period_end, "dd/MM/yy")}
                        </p>
                      </div>
                      {statusBadge(p.status || "pending")}
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                      <div className="rounded-md bg-muted/50 p-3">
                        <p className="text-[11px] font-medium uppercase text-muted-foreground">Metodo</p>
                        <p className="font-semibold">{paymentMethodLabel(p.payment_method)}</p>
                      </div>
                      <div className="rounded-md bg-muted/50 p-3">
                        <p className="text-[11px] font-medium uppercase text-muted-foreground">Data</p>
                        <p className="font-semibold">{formatSafeDate(p.paid_at || p.created_at, "dd MMM yyyy")}</p>
                      </div>
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">Rif. {p.transaction_reference || "—"}</p>
                  </div>
                ))}
              </div>
              <div className="hidden overflow-x-auto md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Importo</TableHead>
                      <TableHead>Periodo</TableHead>
                      <TableHead>Metodo</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead>Stato</TableHead>
                      <TableHead>Rif.</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payouts.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-bold">{formatCurrency(p.amount)}</TableCell>
                        <TableCell className="text-sm">
                          {formatSafeDate(p.period_start, "dd/MM/yy")} — {formatSafeDate(p.period_end, "dd/MM/yy")}
                        </TableCell>
                        <TableCell className="text-sm">{paymentMethodLabel(p.payment_method)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatSafeDate(p.paid_at || p.created_at, "dd MMM yyyy")}
                        </TableCell>
                        <TableCell>{statusBadge(p.status || "pending")}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{p.transaction_reference || "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
