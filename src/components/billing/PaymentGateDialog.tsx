import { useState } from "react";
import { CreditCard, Lock, MessageCircle, RefreshCw, Wallet } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useStartCardSetup } from "@/hooks/useBilling";
import { usePaymentMethodGate } from "@/hooks/usePaymentMethodGate";
import { usePaymentGateStore } from "@/store/paymentGateStore";
import { isMobileAppRuntime } from "@/lib/mobile/platform";
import { useIsMobile } from "@/hooks/use-mobile";
import { formatCurrency } from "@/lib/formatters";
import { RechargeDialog } from "@/components/credits/RechargeDialog";
import { AddonWhatsAppOfferta } from "@/components/billing/AddonWhatsAppOfferta";
import type { WalletType } from "@/hooks/credits/useWallets";

/** Ruoli che possono gestire la fatturazione/abbonamento dell'azienda. */
const CAN_MANAGE_BILLING_ROLES = new Set(["company_admin", "super_admin"]);

/**
 * Dialog globale del gate "carta/abbonamento/crediti". Montato una volta sotto AuthProvider.
 * Si apre quando un tool a costo risponde che manca la carta o che i crediti sono
 * finiti — lo riconosce il fetch del client Supabase (lib/creditoEsaurito.ts), per
 * ogni strumento e in qualunque forma il server lo dica.
 * Role-aware + reason-aware:
 *  - admin: "Aggiungi carta" (manca metodo), "Rinnova abbonamento" (sospeso/scaduto),
 *    oppure "Ricarica ora" (crediti finiti) che apre subito la ricarica Stripe;
 *  - altri utenti: messaggio "contatta l'amministratore dell'azienda";
 *  - add-on WhatsApp Business non attivo: l'offerta con il pagamento
 *    (AddonWhatsAppOfferta, che a chi non puo' comprarlo dice a chi chiederlo).
 */
export function PaymentGateDialog() {
  const open = usePaymentGateStore((s) => s.open);
  const hide = usePaymentGateStore((s) => s.hide);
  const kind = usePaymentGateStore((s) => s.kind);
  const dettaglio = usePaymentGateStore((s) => s.dettaglio);
  const { role } = useAuth();
  const { reason } = usePaymentMethodGate();
  const startSetup = useStartCardSetup();
  const navigate = useNavigate();
  // La ricarica vera (Stripe) si apre in un secondo dialog, dopo aver chiuso
  // questo: chi finisce i crediti nel mezzo di un'azione paga da dove sta,
  // senza andare a cercare la pagina giusta.
  const [ricarica, setRicarica] = useState<WalletType | null>(null);
  // Dal telefono l'abbonamento non si rinnova (regola dell'utente, 25/09/2026).
  const isMobile = useIsMobile();

  const canManageBilling = !!role && CAN_MANAGE_BILLING_ROLES.has(role);
  // reason può essere null se il 402 arriva prima che lo stato client sia allineato:
  // default conservativo su "subscription_inactive" se lo status risulta non-pagante.
  const isSubscription = reason === "subscription_inactive";
  // Il saldo crediti e' finito: carta e abbonamento sono a posto.
  const isCredits = kind === "credits";
  // WhatsApp Business ne' nel piano ne' comprato come add-on.
  const isAddonWhatsApp = kind === "addon_whatsapp";
  const portafoglio = dettaglio?.portafoglio;
  const eRender = portafoglio === "render";
  const eSms = portafoglio === "sms";

  const title = isCredits
    ? eRender
      ? "Crediti Render AI esauriti"
      : eSms
        ? "Crediti SMS esauriti"
        : "Crediti esauriti"
    : isSubscription
      ? "Abbonamento non attivo"
      : "Aggiungi una carta aziendale";

  // Cosa e' successo, detto per quel che e': il render non e' partito, l'SMS
  // non e' uscito, o il portafoglio unico (AI, email, WhatsApp) e' a zero.
  const spiegazione = eRender
    ? "I crediti Render AI dell'azienda sono finiti: il render non è stato avviato."
    : eSms
      ? "I crediti SMS dell'azienda sono finiti: l'invio non è partito."
      : "Il portafoglio crediti dell'azienda è a zero: l'operazione è stata fermata prima di generare costi. Il portafoglio è unico per AI, email e WhatsApp.";
  const saldo = !eRender && !eSms && typeof dettaglio?.saldoEur === "number" ? dettaglio.saldoEur : null;
  const nota = dettaglio?.messaggio && dettaglio.messaggio.length <= 160 ? dettaglio.messaggio : null;

  const renew = () => {
    hide();
    navigate("/azienda/impostazioni/abbonamento");
  };

  const vaiAiCrediti = () => {
    hide();
    navigate("/azienda/impostazioni/crediti");
  };

  const ricaricaOra = () => {
    // Gli SMS hanno il loro borsellino nella pagina Crediti; nell'app mobile
    // la ricarica resta sul web, come per la carta.
    if (eSms || isMobileAppRuntime) {
      vaiAiCrediti();
      return;
    }
    hide();
    setRicarica(eRender ? "render" : "email");
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !o && hide()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {isAddonWhatsApp ? (
                <MessageCircle className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              ) : !canManageBilling ? (
                <Lock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              ) : isCredits ? (
                <Wallet className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              ) : isSubscription ? (
                <RefreshCw className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              ) : (
                <CreditCard className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              )}
              {isAddonWhatsApp
                ? "WhatsApp Business non attivo"
                : canManageBilling ? title : "Strumento non disponibile"}
            </DialogTitle>
          </DialogHeader>

          {isAddonWhatsApp ? (
            <AddonWhatsAppOfferta />
          ) : !canManageBilling ? (
            <p className="text-sm text-muted-foreground">
              {isCredits
                ? "I crediti per questa funzione sono esauriti. Contatta l'amministratore della tua azienda perché ricarichi il portafoglio."
                : isSubscription
                  ? "L'abbonamento dell'azienda è sospeso o scaduto. Contatta l'amministratore della tua azienda perché lo rinnovi."
                  : "Per usare questo strumento serve la carta di pagamento aziendale. Contatta l'amministratore della tua azienda perché la registri."}
            </p>
          ) : isCredits ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">{spiegazione}</p>
              {saldo !== null && (
                <p className="text-sm">
                  Saldo attuale: <strong className="tabular-nums">{formatCurrency(saldo)}</strong>
                </p>
              )}
              {nota && <p className="text-xs text-muted-foreground">{nota}</p>}
              <Button className="w-full" onClick={ricaricaOra}>
                <Wallet className="mr-2 h-4 w-4" />
                Ricarica ora
              </Button>
              <button
                type="button"
                className="w-full text-center text-xs text-muted-foreground underline-offset-4 hover:underline"
                onClick={vaiAiCrediti}
              >
                Saldo, storico e ricarica automatica
              </button>
            </div>
          ) : isMobileAppRuntime ? (
            /* App Store Guideline 3.1.1: nell'app mobile NON apriamo checkout/carta
               esterni (Stripe). Abbonamento e metodi di pagamento si gestiscono
               dall'area riservata sul web. */
            <p className="text-sm text-muted-foreground">
              La gestione dell'abbonamento e dei metodi di pagamento è disponibile
              nell'area riservata sul sito web, non dall'app.
            </p>
          ) : isSubscription && isMobile ? (
            <p className="text-sm text-muted-foreground">
              L'abbonamento è sospeso o scaduto per mancato pagamento: si rinnova dal
              computer, e da lì tornano email, WhatsApp, AI, render e firma.
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

      {/* Montato solo quando serve: RechargeDialog legge i prezzi appena nasce. */}
      {ricarica && (
        <RechargeDialog open onOpenChange={(v) => !v && setRicarica(null)} walletType={ricarica} />
      )}
    </>
  );
}
