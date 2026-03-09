import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Loader2, Check, X, Download } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

export function PayoutApprovalTab() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const { data: pendingPayouts = [], isLoading } = useQuery({
    queryKey: ["admin-pending-payouts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("referral_payouts")
        .select("*")
        .in("status", ["pending", "approved", "processing"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      // Enrich with referrer info
      if (data.length === 0) return [];
      const referrerIds = [...new Set(data.map((p: any) => p.referrer_id))];
      const { data: referrers } = await supabase
        .from("referrers")
        .select("id, name, email, payout_method, payout_details")
        .in("id", referrerIds);
      return data.map((p: any) => ({
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
      if (data.length === 0) return [];
      const referrerIds = [...new Set(data.map((p: any) => p.referrer_id))];
      const { data: referrers } = await supabase
        .from("referrers")
        .select("id, name, email")
        .in("id", referrerIds);
      return data.map((p: any) => ({
        ...p,
        referrer: referrers?.find((r: any) => r.id === p.referrer_id),
      }));
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (payoutId: string) => {
      const { error } = await supabase
        .from("referral_payouts")
        .update({
          status: "approved",
          approved_by: user?.id,
          approved_at: new Date().toISOString(),
        })
        .eq("id", payoutId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-pending-payouts"] });
      toast.success("Payout approvato");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { error } = await supabase
        .from("referral_payouts")
        .update({ status: "rejected", rejection_reason: reason })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-pending-payouts"] });
      setRejectId(null);
      setRejectReason("");
      toast.success("Payout rifiutato");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const markPaid = useMutation({
    mutationFn: async ({ id, referrerId, amount, txRef }: { id: string; referrerId: string; amount: number; txRef: string }) => {
      const { error } = await supabase
        .from("referral_payouts")
        .update({ status: "paid", transaction_reference: txRef })
        .eq("id", id);
      if (error) throw error;

      // Update referrer total_paid
      const { data: ref } = await supabase.from("referrers").select("total_paid").eq("id", referrerId).single();
      if (ref) {
        await supabase.from("referrers").update({ total_paid: (ref.total_paid || 0) + amount }).eq("id", referrerId);
      }

      // Send notification
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID || "guqgszwelffntrgtsycm";
      fetch(`https://${projectId}.supabase.co/functions/v1/send-partner-notification`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "payout_approved",
          referrer_id: referrerId,
          data: { amount, reference: txRef },
        }),
      }).catch(() => {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-pending-payouts"] });
      queryClient.invalidateQueries({ queryKey: ["admin-paid-payouts"] });
      queryClient.invalidateQueries({ queryKey: ["referrers"] });
      toast.success("Payout marcato come pagato");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const exportCSV = () => {
    const allPayouts = [...pendingPayouts, ...paidPayouts];
    const csv = [
      ["Partner", "Email", "Importo", "Metodo", "Stato", "Data", "Riferimento"].join(","),
      ...allPayouts.map((p: any) =>
        [p.referrer?.name, p.referrer?.email, p.amount, p.payment_method, p.status, p.created_at, p.transaction_reference || ""].join(",")
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "payout-export.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const pending = pendingPayouts.filter((p: any) => p.status === "pending");

  const statusBadge = (status: string) => {
    switch (status) {
      case "paid": return <Badge variant="default">Pagato</Badge>;
      case "approved": return <Badge className="bg-blue-500/10 text-blue-700 border-blue-200">Approvato</Badge>;
      case "processing": return <Badge className="bg-yellow-500/10 text-yellow-700 border-yellow-200">In Elaborazione</Badge>;
      case "rejected": return <Badge variant="destructive">Rifiutato</Badge>;
      default: return <Badge variant="secondary">Pending</Badge>;
    }
  };

  if (isLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Payout da Approvare ({pending.length})</h3>
        <Button variant="outline" size="sm" onClick={exportCSV}>
          <Download className="h-4 w-4 mr-1.5" /> Esporta CSV
        </Button>
      </div>

      {pending.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Nessun payout in attesa
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Partner</TableHead>
                  <TableHead className="text-right">Importo</TableHead>
                  <TableHead>Richiesto il</TableHead>
                  <TableHead>Metodo</TableHead>
                  <TableHead>Stato</TableHead>
                  <TableHead className="text-right">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pending.map((p: any) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{p.referrer?.name || "—"}</div>
                        <div className="text-xs text-muted-foreground">{p.referrer?.email}</div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-bold">{formatCurrency(p.amount)}</TableCell>
                    <TableCell className="text-sm">{format(new Date(p.created_at), "dd MMM yyyy", { locale: it })}</TableCell>
                    <TableCell className="text-sm">{p.payment_method || "—"}</TableCell>
                    <TableCell>{statusBadge(p.status)}</TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="outline" onClick={() => approveMutation.mutate(p.id)} disabled={approveMutation.isPending}>
                          <Check className="h-3.5 w-3.5 mr-1" /> Approva
                        </Button>
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setRejectId(p.id)}>
                          <X className="h-3.5 w-3.5 mr-1" /> Rifiuta
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Approved payouts — mark as paid */}
      {pendingPayouts.filter((p: any) => p.status === "approved").length > 0 && (
        <>
          <h3 className="text-lg font-semibold">Approvati — Da Pagare</h3>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Partner</TableHead>
                    <TableHead className="text-right">Importo</TableHead>
                    <TableHead>Metodo</TableHead>
                    <TableHead className="text-right">Azione</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingPayouts.filter((p: any) => p.status === "approved").map((p: any) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.referrer?.name}</TableCell>
                      <TableCell className="text-right font-bold">{formatCurrency(p.amount)}</TableCell>
                      <TableCell className="text-sm">{p.payment_method}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          onClick={() => {
                            const txRef = prompt("Riferimento transazione/bonifico:");
                            if (txRef !== null) {
                              markPaid.mutate({ id: p.id, referrerId: p.referrer_id, amount: p.amount, txRef });
                            }
                          }}
                        >
                          Segna come Pagato
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
                      <TableCell className="text-sm">{format(new Date(p.created_at), "dd/MM/yyyy")}</TableCell>
                      <TableCell>{statusBadge(p.status)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{p.transaction_reference || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}

      {/* Reject dialog */}
      <Dialog open={!!rejectId} onOpenChange={() => { setRejectId(null); setRejectReason(""); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Rifiuta Payout</DialogTitle>
            <DialogDescription>Inserisci il motivo del rifiuto</DialogDescription>
          </DialogHeader>
          <Input placeholder="Motivo..." value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
          <Button
            variant="destructive"
            onClick={() => rejectId && rejectMutation.mutate({ id: rejectId, reason: rejectReason })}
            disabled={rejectMutation.isPending}
          >
            Conferma Rifiuto
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
