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

export default function PartnerPayout() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");

  const { data: referrer } = useQuery({
    queryKey: queryKeys.partnerPayouts.referrer(user?.id),
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase.from("referrers").select("id, total_earned, total_paid, payout_method, payout_details").eq("user_id", user!.id).maybeSingle();
      return data;
    },
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

  const requestPayout = useMutation({
    mutationFn: async () => {
      const amt = parseFloat(amount);
      if (isNaN(amt) || amt <= 0 || amt > balance) throw new Error("Importo non valido");

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
      queryClient.invalidateQueries({ queryKey: ["my-payouts"] });
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
            <Button
              onClick={() => requestPayout.mutate()}
              disabled={requestPayout.isPending || !amount || parseFloat(amount) > balance}
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
