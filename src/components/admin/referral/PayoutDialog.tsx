import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency } from "@/lib/formatters";
import { referralBalanceKey, requestReferralPayout, useReferralBalance } from "@/lib/referralPayouts";
import type { Referrer } from "@/pages/admin/ReferralDashboard";

interface Props {
  referrer: Referrer | null;
  onOpenChange: () => void;
}

export function PayoutDialog({ referrer, onOpenChange }: Props) {
  if (!referrer) return null;
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onOpenChange(); }}>
      <RequestForm key={referrer.id} referrer={referrer} onClose={onOpenChange} />
    </Dialog>
  );
}

function RequestForm({ referrer, onClose }: { referrer: Referrer; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const requestKey = useRef<{ fingerprint: string; key: string } | undefined>(undefined);
  const { data: balance, isError } = useReferralBalance(referrer.id);
  const numericAmount = Number(amount);
  const mutation = useMutation({
    mutationFn: () => {
      const fingerprint = JSON.stringify([numericAmount, notes]);
      if (requestKey.current?.fingerprint !== fingerprint) {
        requestKey.current = { fingerprint, key: crypto.randomUUID() };
      }
      return requestReferralPayout(referrer.id, numericAmount, requestKey.current.key, notes);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: referralBalanceKey(referrer.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.referralPayouts });
      queryClient.invalidateQueries({ queryKey: ["admin-pending-payouts"] });
      queryClient.invalidateQueries({ queryKey: ["pending-payout-count"] });
      toast({ title: "Richiesta creata", description: "Il pagamento è in attesa di approvazione." });
      onClose();
    },
    onError: (error) => toast({ title: "Richiesta non salvata", description: error.message, variant: "destructive" }),
  });

  return (
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>Prepara pagamento</DialogTitle>
        <DialogDescription>Riserva le commissioni maturate di {referrer.name} per l’approvazione.</DialogDescription>
      </DialogHeader>
      <form onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }} className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {balance ? `Saldo disponibile ${formatCurrency(balance.available)} · ${formatCurrency(balance.reserved)} riservati`
            : isError ? "Saldo temporaneamente non disponibile" : "Caricamento del saldo…"}
        </p>
        <div className="space-y-2">
          <Label htmlFor="admin-payout-amount">Importo (€)</Label>
          <Input id="admin-payout-amount" type="number" required min="0.01" step="0.01" max={balance?.available}
            value={amount} onChange={(event) => setAmount(event.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="admin-payout-notes">Note (facoltative)</Label>
          <Textarea id="admin-payout-notes" maxLength={2000} value={notes} onChange={(event) => setNotes(event.target.value)} />
        </div>
        <Button type="submit" className="w-full"
          disabled={mutation.isPending || !balance || numericAmount <= 0 || numericAmount > balance.available}>
          Crea richiesta
        </Button>
      </form>
    </DialogContent>
  );
}
