import { useAuth } from "@/contexts/AuthContext";
import { DEMO_COMPANY_ID } from "@/lib/constants/demoCompany";

/**
 * Metodi di pagamento considerati "validi": l'azienda può usare gli strumenti a costo.
 * Allineato a getEffectivePaymentStatus (src/lib/paymentStatus.ts):
 *  - "comped" = esente, deciso dall'admin di piattaforma → consentito
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

export interface PaymentMethodGateState {
  /** true se l'azienda NON può usare gli strumenti a costo (manca carta/metodo). */
  isBlocked: boolean;
  /** true se l'azienda ha un metodo di pagamento valido registrato. */
  hasPaymentMethod: boolean;
  /** Valore normalizzato di companies.payment_method ("none" se assente). */
  paymentMethod: string;
  companyId: string | undefined;
}

/**
 * Gate "carta obbligatoria": gli strumenti a costo (email, AI, WhatsApp, render
 * documenti, firma digitale) richiedono che l'azienda abbia un metodo di pagamento
 * valido — anche sui piani gratuiti. Senza metodo → bloccati.
 *
 * Il blocco vale per chiunque operi nell'azienda (coerente con l'enforcement
 * server). CHI può risolverlo è gestito a livello UI (PaymentMethodGate):
 * company_admin/super_admin vedono il CTA "Aggiungi carta", gli altri il
 * messaggio "contatta l'amministratore dell'azienda".
 */
export function usePaymentMethodGate(): PaymentMethodGateState {
  const { effectiveCompany } = useAuth();
  const method = String(effectiveCompany?.payment_method ?? "none").toLowerCase();
  const hasPaymentMethod = method !== "none" && VALID_PAYMENT_METHODS.has(method);
  // Demo Azienda S.r.l. (vetrina interna) è sempre esente: niente blocco.
  const isDemoCompany = effectiveCompany?.id === DEMO_COMPANY_ID;
  const isBlocked = !!effectiveCompany && !hasPaymentMethod && !isDemoCompany;

  return {
    isBlocked,
    hasPaymentMethod,
    paymentMethod: method,
    companyId: effectiveCompany?.id,
  };
}
