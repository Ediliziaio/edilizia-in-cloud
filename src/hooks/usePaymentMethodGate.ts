import { useAuth } from "@/contexts/AuthContext";
import { isDemoCompanyId } from "@/lib/constants/demoCompany";
import { GIFTED_EXEMPT_METHODS } from "@/lib/paymentStatus";

/**
 * Metodi di pagamento considerati "validi": l'azienda può usare gli strumenti a costo.
 * Allineato a getEffectivePaymentStatus (src/lib/paymentStatus.ts):
 *  - "comped" = esente, deciso dall'admin di piattaforma → consentito (mai bloccato)
 *  - "stripe" / "bank_transfer" / "sepa_debit" / "other" = metodo registrato → consentito
 *  - "none" / null = nessun metodo → BLOCCATO
 */
export const VALID_PAYMENT_METHODS = new Set([
  "stripe",
  "bank_transfer",
  "sepa_debit",
  "other",
  "comped",
]);

/** Stati abbonamento che bloccano gli strumenti a costo (annullamento/sospensione/scadenza). */
const BLOCKED_STATUSES = new Set(["suspended", "cancelled", "canceled", "expired"]);

export type PaymentGateReason = "no_payment_method" | "subscription_inactive" | null;

export interface PaymentMethodGateState {
  /** true se l'azienda NON può usare gli strumenti a costo. */
  isBlocked: boolean;
  /** true se l'azienda ha un metodo di pagamento valido registrato. */
  hasPaymentMethod: boolean;
  /** Valore normalizzato di companies.payment_method ("none" se assente). */
  paymentMethod: string;
  /** Motivo del blocco: manca la carta, oppure abbonamento sospeso/scaduto. */
  reason: PaymentGateReason;
  companyId: string | undefined;
}

/**
 * Gate "carta obbligatoria + abbonamento attivo": gli strumenti a costo (email, AI,
 * WhatsApp, render documenti, firma digitale, invio SDI) richiedono che l'azienda:
 *  - abbia un metodo di pagamento valido, E
 *  - non sia in stato sospeso/annullato/scaduto (mancato pagamento abbonamento).
 *
 * "comped"/regalati e la Demo Azienda sono sempre ESENTI.
 * CHI può risolverlo è gestito a livello UI (admin → CTA; utente → contatta admin).
 */
export function usePaymentMethodGate(): PaymentMethodGateState {
  const { effectiveCompany } = useAuth();
  const method = String(effectiveCompany?.payment_method ?? "none").toLowerCase();
  const status = String((effectiveCompany as { status?: string | null } | null)?.status ?? "").toLowerCase();

  const hasPaymentMethod = method !== "none" && VALID_PAYMENT_METHODS.has(method);
  const isDemoCompany = isDemoCompanyId(effectiveCompany?.id);
  // "comped" e sinonimi legacy (gift, complimentary, manual_free…) = regalata → esente.
  const isGifted = GIFTED_EXEMPT_METHODS.has(method);
  const isSubscriptionBlocked = BLOCKED_STATUSES.has(status);

  const exempt = !effectiveCompany || isDemoCompany || isGifted;
  const isBlocked = !exempt && (isSubscriptionBlocked || !hasPaymentMethod);
  const reason: PaymentGateReason = !isBlocked
    ? null
    : isSubscriptionBlocked
      ? "subscription_inactive"
      : "no_payment_method";

  return {
    isBlocked,
    hasPaymentMethod,
    paymentMethod: method,
    reason,
    companyId: effectiveCompany?.id,
  };
}
