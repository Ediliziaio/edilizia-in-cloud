import { useState } from "react";
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
import { Loader2, Wallet, DollarSign } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { toast } from "sonner";
import {
  DEFAULT_REFERRAL_COMMISSION_POLICY,
  REFERRAL_COMMISSION_POLICY_KEY,
  evaluateReferralPayoutEligibility,
  parseReferralCommissionPolicy,
} from "@/lib/referralRules";

export default function PartnerPayout() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");

  const { data: referrer } = useQuery({
    queryKey: queryKeys.partnerPayouts.referrer(user?.id),
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("referrers")
        .select("id, total_earned, total_paid, payout_method, payout_details, has_accepted_terms")
        .eq("user_id", user!.id)
        .maybeSingle();
      return data;
    },
  });

  const { data: payoutPolicy = DEFAULT_REFERRAL_COMMISSION_POLICY } = useQuery({
    queryKey: ["platform_settings", REFERRAL_COMMISSION_POLICY_KEY, "partner"],
    queryFn: async () => {
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

  const { data: payouts = [], isLoading } = useQuery({
    queryKey: queryKeys.partnerPayouts.payouts(referrer?.id),
    enabled: !!referrer?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("referral_payouts")
        .select("*")
        .eq("referrer_id", referrer!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const balance = (referrer?.total_earned || 0) - (referrer?.total_paid || 0);
  const requestedAmount = parseFloat(amount);
  const payoutEligibility = evaluateReferralPayoutEligibility({
    amount: Number.isFinite(requestedAmount) ? requestedAmount : balance,
    referrer,
    fraudLogCount: 0,
    policy: payoutPolicy,
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
        fraudLogCount: 0,
        policy: payoutPolicy,
      });
      if (!eligibility.eligible) throw new Error(eligibility.blockers.join(" · "));

      const now = new Date();
      const { error } = await supabase.from("referral_payouts").insert({
        referrer_id: referrer!.id,
        amount: amt,
        period_start: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0],
        period_end: now.toISOString().split("T")[0],
        paid_at: now.toISOString(),
        payment_method: referrer?.payout_method || "bank_transfer",
        notes: notes || null,
        status: "pending",
        requested_by_referrer: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.partnerPayouts.payoutsAll });
      toast.success("Richiesta di pagamento inviata!");
      setAmount("");
      setNotes("");
    },
    onError: (err: any) => {
      toast.error("Errore", { description: err.message });
    },
  });

  const statusBadge = (status: string) => {
    switch (status) {
      case "paid": return <Badge variant="default">Pagato</Badge>;
      case "approved": return <Badge className="bg-blue-500/10 text-blue-700 border-blue-200">Approvato</Badge>;
      case "processing": return <Badge className="bg-yellow-500/10 text-yellow-700 border-yellow-200">In Elaborazione</Badge>;
      case "rejected": return <Badge variant="destructive">Rifiutato</Badge>;
      default: return <Badge variant="secondary">Pending</Badge>;
    }
  };

  return (
    <div className="space-y-6 p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold tracking-tight">Richiedi Pagamento</h1>

      {/* Countdown prossimo pagamento automatico */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Prossimo pagamento automatico</p>
              <p className="text-2xl font-bold text-primary">{paymentInfo.date}</p>
              <p className="text-sm text-muted-foreground mt-1">
                tra {paymentInfo.daysLeft} giorni · importo stimato: {formatCurrency(balance)}
              </p>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-primary">{paymentInfo.daysLeft}</div>
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

      {/* Balance */}
      <Card>
        <CardContent className="pt-6 flex items-center gap-4">
          <Wallet className="h-8 w-8 text-primary" />
          <div>
            <p className="text-sm text-muted-foreground">Saldo Disponibile</p>
            <p className={`text-3xl font-bold ${balance > 0 ? "text-green-600" : ""}`}>{formatCurrency(balance)}</p>
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
            <div className="grid grid-cols-2 gap-4">
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
                <Input value={referrer?.payout_method === "paypal" ? "PayPal" : "Bonifico bancario"} disabled />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Note (opzionale)</Label>
              <Textarea placeholder="Note aggiuntive..." value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            {(payoutEligibility.blockers.length > 0 || payoutEligibility.warnings.length > 0) && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                {[...payoutEligibility.blockers, ...payoutEligibility.warnings].join(" · ")}
              </div>
            )}
            <Button
              onClick={() => requestPayout.mutate()}
              disabled={requestPayout.isPending || !amount || parseFloat(amount) > balance || !payoutEligibility.eligible}
            >
              {requestPayout.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              🏦 Richiedi Pagamento
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
                {payouts.map((p: any) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-bold">{formatCurrency(p.amount)}</TableCell>
                    <TableCell className="text-sm">
                      {format(new Date(p.period_start), "dd/MM/yy")} — {format(new Date(p.period_end), "dd/MM/yy")}
                    </TableCell>
                    <TableCell className="text-sm">{p.payment_method || "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(p.paid_at), "dd MMM yyyy", { locale: it })}
                    </TableCell>
                    <TableCell>{statusBadge(p.status || "pending")}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{p.transaction_reference || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
