import { CreditCard, Lock, RefreshCw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useStartCardSetup } from "@/hooks/useBilling";
import { usePaymentMethodGate } from "@/hooks/usePaymentMethodGate";
import { usePaymentGateStore } from "@/store/paymentGateStore";

/** Ruoli che possono gestire la fatturazione/abbonamento dell'azienda. */
const CAN_MANAGE_BILLING_ROLES = new Set(["company_admin", "super_admin"]);

/**
 * Dialog globale del gate "carta/abbonamento". Montato una volta sotto AuthProvider.
 * Si apre quando un tool a costo risponde 402 (vedi MutationCache.onError in App.tsx).
 * Role-aware + reason-aware:
 *  - admin: "Aggiungi carta" (manca metodo) oppure "Rinnova abbonamento" (sospeso/scaduto);
 *  - altri utenti: messaggio "contatta l'amministratore dell'azienda".
 */
export function PaymentGateDialog() {
  const open = usePaymentGateStore((s) => s.open);
  const hide = usePaymentGateStore((s) => s.hide);
  const { role } = useAuth();
  const { reason } = usePaymentMethodGate();
  const startSetup = useStartCardSetup();
  const navigate = useNavigate();

  const canManageBilling = !!role && CAN_MANAGE_BILLING_ROLES.has(role);
  // reason può essere null se il 402 arriva prima che lo stato client sia allineato:
  // default conservativo su "subscription_inactive" se lo status risulta non-pagante.
  const isSubscription = reason === "subscription_inactive";

  const title = isSubscription ? "Abbonamento non attivo" : "Aggiungi una carta aziendale";

  const renew = () => {
    hide();
    navigate("/azienda/impostazioni/abbonamento");
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && hide()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {!canManageBilling ? (
              <Lock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            ) : isSubscription ? (
              <RefreshCw className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            ) : (
              <CreditCard className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            )}
            {canManageBilling ? title : "Strumento non disponibile"}
          </DialogTitle>
        </DialogHeader>

        {!canManageBilling ? (
          <p className="text-sm text-muted-foreground">
            {isSubscription
              ? "L'abbonamento dell'azienda è sospeso o scaduto. Contatta l'amministratore della tua azienda perché lo rinnovi."
              : "Per usare questo strumento serve la carta di pagamento aziendale. Contatta l'amministratore della tua azienda perché la registri."}
          </p>
        ) : isSubscription ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              L'abbonamento è sospeso o scaduto per mancato pagamento. Rinnova per
              riattivare email, WhatsApp, AI, render e firma.
            </p>
            <Button className="w-full" onClick={renew}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Rinnova abbonamento
            </Button>
          </div>
        ) : (
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
        )}
      </DialogContent>
    </Dialog>
  );
}
