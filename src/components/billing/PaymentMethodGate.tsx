import type { ReactNode } from "react";
import { CreditCard, Lock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { usePaymentMethodGate } from "@/hooks/usePaymentMethodGate";
import { useStartCardSetup } from "@/hooks/useBilling";
import { useAuth } from "@/contexts/AuthContext";

/** Ruoli che possono gestire la fatturazione/carta dell'azienda. */
const CAN_MANAGE_BILLING_ROLES = new Set(["company_admin", "super_admin"]);

interface PaymentMethodGateProps {
  /** Nome dello strumento mostrato nel messaggio (es. "l'invio WhatsApp"). */
  toolName?: string;
  /** Contenuto da mostrare quando l'azienda HA un metodo di pagamento valido. */
  children: ReactNode;
  /**
   * Se true, mostra il messaggio sopra `children` invece di sostituirlo.
   * Utile dove non si vuole nascondere del tutto la UI sottostante.
   */
  bannerOnly?: boolean;
}

/** Admin/owner azienda: CTA per registrare la carta (portale Stripe). */
function AddCardCard({ toolName }: { toolName: string }) {
  const startSetup = useStartCardSetup();
  return (
    <Card className="border-amber-300 bg-amber-50/70 dark:border-amber-900 dark:bg-amber-950/20">
      <CardContent className="flex flex-col items-center gap-3 p-5 text-center sm:flex-row sm:text-left">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/40">
          <CreditCard className="h-6 w-6 text-amber-600 dark:text-amber-400" />
        </div>
        <div className="flex-1">
          <p className="font-semibold">Aggiungi una carta aziendale per usare {toolName}</p>
          <p className="text-sm text-muted-foreground">
            È uno strumento a consumo: per attivarlo registra il metodo di pagamento
            dell'azienda. Nessun addebito finché non lo usi.
          </p>
        </div>
        <Button
          onClick={() => startSetup.mutate()}
          disabled={startSetup.isPending}
          className="shrink-0"
        >
          <CreditCard className="mr-2 h-4 w-4" />
          {startSetup.isPending ? "Apertura…" : "Aggiungi carta"}
        </Button>
      </CardContent>
    </Card>
  );
}

/** Utente normale (non gestisce billing): messaggio "contatta l'amministratore". */
function ContactAdminCard({ toolName }: { toolName: string }) {
  return (
    <Card className="border-amber-300 bg-amber-50/70 dark:border-amber-900 dark:bg-amber-950/20">
      <CardContent className="flex flex-col items-center gap-3 p-5 text-center sm:flex-row sm:text-left">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/40">
          <Lock className="h-6 w-6 text-amber-600 dark:text-amber-400" />
        </div>
        <div className="flex-1">
          <p className="font-semibold">{toolName} non è ancora attivo</p>
          <p className="text-sm text-muted-foreground">
            Per usarlo serve la carta di pagamento aziendale. Contatta l'amministratore
            della tua azienda perché la registri in Impostazioni → Fatturazione.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Blocca uno strumento a costo finché l'azienda non registra un metodo di pagamento.
 * Role-aware:
 *  - company_admin / super_admin → CTA per aggiungere la carta.
 *  - altri utenti → messaggio "contatta l'amministratore dell'azienda".
 *
 * Esempio:
 *   <PaymentMethodGate toolName="l'invio WhatsApp"><WhatsAppBroadcast /></PaymentMethodGate>
 */
export function PaymentMethodGate({
  toolName = "questo strumento",
  children,
  bannerOnly = false,
}: PaymentMethodGateProps) {
  const { isBlocked } = usePaymentMethodGate();
  const { role } = useAuth();

  if (!isBlocked) return <>{children}</>;

  const canManageBilling = !!role && CAN_MANAGE_BILLING_ROLES.has(role);
  const gate = canManageBilling ? (
    <AddCardCard toolName={toolName} />
  ) : (
    <ContactAdminCard toolName={toolName} />
  );

  if (bannerOnly) {
    return (
      <div className="space-y-3">
        {gate}
        {children}
      </div>
    );
  }
  return gate;
}
