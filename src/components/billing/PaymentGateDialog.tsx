import { CreditCard, Lock } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useStartCardSetup } from "@/hooks/useBilling";
import { usePaymentGateStore } from "@/store/paymentGateStore";

/** Ruoli che possono gestire la fatturazione/carta dell'azienda. */
const CAN_MANAGE_BILLING_ROLES = new Set(["company_admin", "super_admin"]);

/**
 * Dialog globale del gate "carta obbligatoria". Montato una volta sotto AuthProvider.
 * Si apre quando un tool a costo risponde 402 (vedi MutationCache.onError in App.tsx).
 * Role-aware:
 *  - company_admin / super_admin → CTA "Aggiungi carta" (checkout setup Stripe).
 *  - altri utenti → messaggio "contatta l'amministratore dell'azienda".
 */
export function PaymentGateDialog() {
  const open = usePaymentGateStore((s) => s.open);
  const hide = usePaymentGateStore((s) => s.hide);
  const { role } = useAuth();
  const startSetup = useStartCardSetup();
  const canManageBilling = !!role && CAN_MANAGE_BILLING_ROLES.has(role);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && hide()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {canManageBilling ? (
              <CreditCard className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            ) : (
              <Lock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            )}
            {canManageBilling ? "Aggiungi una carta aziendale" : "Strumento non ancora attivo"}
          </DialogTitle>
        </DialogHeader>

        {canManageBilling ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Questo strumento è a consumo: per attivarlo registra il metodo di
              pagamento dell'azienda. Nessun addebito finché non lo usi.
            </p>
            <Button
              className="w-full"
              onClick={() => startSetup.mutate()}
              disabled={startSetup.isPending}
            >
              <CreditCard className="mr-2 h-4 w-4" />
              {startSetup.isPending ? "Apertura…" : "Aggiungi carta"}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Per usare questo strumento serve la carta di pagamento aziendale.
            Contatta l'amministratore della tua azienda perché la registri in
            Impostazioni → Fatturazione.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
