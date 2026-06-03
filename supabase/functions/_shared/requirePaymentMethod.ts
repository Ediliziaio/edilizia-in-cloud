// Gate "carta obbligatoria" lato server (enforcement non aggirabile).
// Allineato al client (src/hooks/usePaymentMethodGate.ts) e a getEffectivePaymentStatus:
// payment_method "none"/null = bloccato; "comped" = esente; altrimenti consentito.

type SupabaseLikeClient = {
  // Le edge function importano minor diversi di supabase-js: tipo strutturale
  // per evitare conflitti di membri protetti tra URL diversi.
  // deno-lint-ignore no-explicit-any
  from: (table: string) => any;
};

const VALID_PAYMENT_METHODS = new Set([
  "stripe",
  "bank_transfer",
  "sepa_debit",
  "other",
  "comped",
]);

// Demo Azienda S.r.l. (company-vetrina interna) — sempre esente dal gate.
// UUID centralizzato in src/lib/constants/demoCompany.ts; qui hardcoded perché Deno
// non importa da src/ (stesso valore di AI_TEST_LAB_DEMO_COMPANY_ID negli edge).
const DEMO_COMPANY_ID = "778a2c76-1253-49f2-a5e8-283363ac3e29";

export const PAYMENT_METHOD_REQUIRED_MESSAGE =
  "Registra una carta di pagamento aziendale per usare questo strumento (Impostazioni → Fatturazione).";

export interface PaymentMethodCheck {
  allowed: boolean;
  paymentMethod: string;
  message?: string;
}

/**
 * Verifica che l'azienda abbia un metodo di pagamento valido prima di eseguire
 * uno strumento a costo (email, AI, WhatsApp, render, firma). Fail-safe: in caso
 * di errore di lettura ritorna allowed=false (blocca) per non far passare costi.
 */
export async function checkPaymentMethod(
  client: SupabaseLikeClient,
  companyId: string,
): Promise<PaymentMethodCheck> {
  if (!companyId) {
    return { allowed: false, paymentMethod: "none", message: PAYMENT_METHOD_REQUIRED_MESSAGE };
  }
  // Demo Azienda = vetrina: sempre consentito, nessun blocco.
  if (companyId === DEMO_COMPANY_ID) {
    return { allowed: true, paymentMethod: "demo" };
  }
  try {
    const { data } = await client
      .from("companies")
      .select("payment_method")
      .eq("id", companyId)
      .maybeSingle();
    const method = String(data?.payment_method ?? "none").toLowerCase();
    const allowed = method !== "none" && VALID_PAYMENT_METHODS.has(method);
    return {
      allowed,
      paymentMethod: method,
      message: allowed ? undefined : PAYMENT_METHOD_REQUIRED_MESSAGE,
    };
  } catch {
    // Lettura fallita: blocca per sicurezza (non far passare consumo non tracciato).
    return { allowed: false, paymentMethod: "none", message: PAYMENT_METHOD_REQUIRED_MESSAGE };
  }
}
