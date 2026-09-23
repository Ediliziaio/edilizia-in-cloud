import { useAuth } from "@/contexts/AuthContext";
import { isDemoCompanyId } from "@/lib/constants/demoCompany";
import { GIFTED_EXEMPT_METHODS } from "@/lib/paymentStatus";

/**
 * Gate "attivazione gestionale": l'azienda NON può usare il gestionale finché
 * non ha un metodo di pagamento registrato (vale anche col piano gratuito), e
 * resta fuori se l'abbonamento è scaduto o cancellato.
 *
 * I dati di fatturazione (ragione sociale, P.IVA, indirizzo legale) servono lo
 * stesso — finiscono in fattura — ma dal 23/09/2026 NON chiudono più fuori
 * nessuno: chi può compilarli se li ritrova come avviso in alto (vedi
 * SubscriptionBanner). Prima bastava un campo vuoto per fermare TUTTA l'azienda:
 * Ener Italia S.p.A. aveva la carta registrata e l'anagrafica vuota, e 28 persone
 * si sono trovate davanti la schermata di attivazione senza poter lavorare, con
 * il pagamento già fatto.
 *
 * Il TRIAL è esentato durante il periodo di prova (vedi sotto): si blocca solo a
 * prova scaduta. Metodi che sbloccano: carta (Stripe), addebito SEPA, bonifico.
 *  - "stripe"       = carta o SEPA registrati via Stripe (addebito automatico)
 *  - "sepa_debit"   = addebito SEPA (qualora etichettato distintamente)
 *  - "bank_transfer"= bonifico (dichiarativo: nessun addebito automatico)
 *
 * Esenzioni (gate mai attivo):
 *  - nessuna azienda risolta (login/boot)
 *  - Demo Azienda
 *  - metodo "comped"/regalato (deciso dall'admin di piattaforma)
 *  - super_admin (supporto/impersonazione)
 *  - ruolo "customer" (i clienti del portale non sono "l'azienda")
 */

/** Metodi di pagamento che sbloccano il gestionale (scelta prodotto: carta/SEPA/bonifico). */
const UNLOCKING_METHODS = new Set(["stripe", "sepa_debit", "bank_transfer"]);

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
  /** true se mancano i dati di fatturazione (avviso, non blocco). */
  needsBillingData: boolean;
  /** true se manca un metodo di pagamento valido. */
  needsPaymentMethod: boolean;
  /** true se l'abbonamento è scaduto/cancellato → lockout duro (chi non paga più). */
  subscriptionExpired: boolean;
  /** true se l'utente corrente può completare i passaggi (company_admin). */
  canManage: boolean;
  companyId: string | undefined;
}

/** Stati abbonamento "morto": la piattaforma va bloccata finché non si rinnova. */
const DEAD_SUBSCRIPTION_STATUSES = new Set(["expired", "canceled"]);

/** Ruoli che possono completare dati di fatturazione + carta. */
const CAN_MANAGE_ROLES = new Set(["company_admin"]);

/**
 * Lo stato del gate a partire dalla sola azienda e dal ruolo: niente React, così
 * la regola («cosa chiude fuori e cosa no») si verifica nei test.
 */
export function statoAttivazione(
  company: Record<string, unknown> | null | undefined,
  role: string | null | undefined,
): BillingActivationState {
  const method = String(company?.payment_method ?? "none").toLowerCase();
  const hasPaymentMethod = UNLOCKING_METHODS.has(method);
  const billingComplete = isBillingDataComplete(company);

  const companyId = typeof company?.id === "string" ? company.id : undefined;
  const isDemoCompany = isDemoCompanyId(companyId);
  const isGifted = GIFTED_EXEMPT_METHODS.has(method);
  const roleExempt = !!role && EXEMPT_ROLES.has(role);

  // Trial attivo: durante il periodo di prova NON blocchiamo il gestionale. L'utente
  // può comunque inserire dati di fatturazione + carta dall'app (Impostazioni); il gate
  // scatta SOLO a trial scaduto (status 'trial' con trial_ends_at passato → status flippa
  // a expired/active/free e il blocco si riattiva). Senza data di fine = prova aperta.
  const status = String(company?.status ?? "").toLowerCase();
  const trialEndsRaw = company?.trial_ends_at;
  const trialEndsAtMs = trialEndsRaw ? Date.parse(String(trialEndsRaw)) : NaN;
  const isActiveTrial = status === "trial" && (!Number.isFinite(trialEndsAtMs) || trialEndsAtMs > Date.now());

  const exempt = !company || isDemoCompany || isGifted || roleExempt || isActiveTrial;

  // Lockout duro: abbonamento scaduto/cancellato (chi non paga più) → blocco totale
  // finché non rinnova. Le esenzioni (demo/comped/super_admin) valgono anche qui.
  const subscriptionExpired = !exempt && DEAD_SUBSCRIPTION_STATUSES.has(status);

  const needsBillingData = !exempt && !billingComplete;
  const needsPaymentMethod = !exempt && !hasPaymentMethod;
  // I dati mancanti NON entrano nel blocco: chi paga entra e lavora, l'anagrafica
  // gliela chiede l'avviso in alto.
  const isBlocked = needsPaymentMethod || subscriptionExpired;

  return {
    isBlocked,
    needsBillingData,
    needsPaymentMethod,
    subscriptionExpired,
    canManage: !!role && CAN_MANAGE_ROLES.has(role),
    companyId,
  };
}

export function useBillingActivationGate(): BillingActivationState {
  const { effectiveCompany, role } = useAuth();
  return statoAttivazione(effectiveCompany as Record<string, unknown> | null, role);
}
