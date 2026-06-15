import { useAuth } from "@/contexts/AuthContext";
import { DEMO_COMPANY_ID } from "@/lib/constants/demoCompany";
import { GIFTED_EXEMPT_METHODS } from "@/lib/paymentStatus";

/**
 * Gate "attivazione gestionale": l'azienda NON può usare il gestionale finché
 * non ha completato:
 *   1. i dati di fatturazione (ragione sociale, P.IVA, indirizzo legale), E
 *   2. una CARTA registrata via Stripe (payment_method === "stripe").
 *
 * Vale per TUTTE le aziende — free, trial e attive — ANCHE col piano gratuito:
 * la carta è richiesta a monte, senza addebito finché non si usano strumenti a
 * consumo. Bonifico/SEPA NON sbloccano: serve la carta.
 *
 * Esenzioni (gate mai attivo):
 *  - nessuna azienda risolta (login/boot)
 *  - Demo Azienda
 *  - metodo "comped"/regalato (deciso dall'admin di piattaforma)
 *  - super_admin (supporto/impersonazione)
 *  - ruolo "customer" (i clienti del portale non sono "l'azienda")
 */

/** Campi minimi dei dati di fatturazione dell'azienda. */
function isBillingDataComplete(c: Record<string, unknown> | null | undefined): boolean {
  if (!c) return false;
  const v = (k: string) => String((c[k] ?? "")).trim().length > 0;
  return v("business_name") && v("vat_number") && v("legal_address") && v("legal_city") && v("legal_postal_code");
}

const EXEMPT_ROLES = new Set(["super_admin", "customer"]);

export interface BillingActivationState {
  /** true se l'azienda NON può ancora usare il gestionale. */
  isBlocked: boolean;
  /** true se mancano i dati di fatturazione. */
  needsBillingData: boolean;
  /** true se manca un metodo di pagamento valido. */
  needsPaymentMethod: boolean;
  /** true se l'utente corrente può completare i passaggi (company_admin). */
  canManage: boolean;
  companyId: string | undefined;
}

/** Ruoli che possono completare dati di fatturazione + carta. */
const CAN_MANAGE_ROLES = new Set(["company_admin"]);

export function useBillingActivationGate(): BillingActivationState {
  const { effectiveCompany, role } = useAuth();
  const company = effectiveCompany as Record<string, unknown> | null;

  const method = String(company?.payment_method ?? "none").toLowerCase();
  // Scelta prodotto: SOLO carta Stripe sblocca il gestionale (bonifico/SEPA non bastano).
  const hasPaymentMethod = method === "stripe";
  const billingComplete = isBillingDataComplete(company);

  const isDemoCompany = effectiveCompany?.id === DEMO_COMPANY_ID;
  const isGifted = GIFTED_EXEMPT_METHODS.has(method);
  const roleExempt = !!role && EXEMPT_ROLES.has(role);

  const exempt = !effectiveCompany || isDemoCompany || isGifted || roleExempt;

  const needsBillingData = !exempt && !billingComplete;
  const needsPaymentMethod = !exempt && !hasPaymentMethod;
  const isBlocked = needsBillingData || needsPaymentMethod;

  return {
    isBlocked,
    needsBillingData,
    needsPaymentMethod,
    canManage: !!role && CAN_MANAGE_ROLES.has(role),
    companyId: effectiveCompany?.id,
  };
}
