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

// Metodi "regalo" (accesso gratuito per policy) — ESENTI dal gate.
// Mirror di GIFTED_EXEMPT_METHODS in src/lib/paymentStatus.ts (Deno non importa
// da src/). "comped" è il canonico; gli altri sono sinonimi legacy. Volutamente
// ESCLUSI none/""/free/trial (= nessuna carta → bloccati).
const GIFTED_EXEMPT_METHODS = new Set([
  "comped",
  "complimentary",
  "comp",
  "manual_free",
  "gift",
  "gifted",
  "gratis",
  "omaggio",
]);

// Aziende-vetrina interne (Demo Azienda 1 e 2) — sempre esenti dal gate.
// UUID centralizzati in src/lib/constants/demoCompany.ts; qui duplicati perché Deno
// non importa da src/. NB: AI_TEST_LAB_DEMO_COMPANY_ID (aiRouter/silvio-chat) resta
// la sola Demo 1 — quello è il banco di prova modelli, non una vetrina.
const DEMO_COMPANY_IDS = new Set([
  "778a2c76-1253-49f2-a5e8-283363ac3e29", // Demo Azienda S.r.l.
  "d2000000-0000-4000-a000-000000000002", // Demo Azienda 2 S.r.l.
]);

export const PAYMENT_METHOD_REQUIRED_MESSAGE =
  "Registra una carta di pagamento aziendale per usare questo strumento (Impostazioni → Fatturazione).";

// Stati abbonamento che bloccano gli strumenti a costo (annullamento / sospensione
// per mancato pagamento / scadenza). Allineato a process-dunning (grace 7gg).
const BLOCKED_STATUSES = new Set(["suspended", "cancelled", "canceled", "expired"]);

export const SUBSCRIPTION_REQUIRED_MESSAGE =
  "Abbonamento sospeso o scaduto: rinnova per riattivare questo strumento.";

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
/**
 * Variante drop-in per le edge function: ritorna `null` se l'azienda può
 * usare strumenti a costo, altrimenti una Response 402 pronta (stesso
 * code "payment_method_required" che il client intercetta per mostrare
 * il dialog carta). Nato dall'audit AI 2026-06: ~45 funzioni ai-* erogavano
 * AI a pagamento senza alcun gate.
 */
export async function gateAiPayment(
  client: SupabaseLikeClient,
  companyId: string,
  corsHeaders: Record<string, string>,
): Promise<Response | null> {
  const check = await checkPaymentMethod(client, companyId);
  if (check.allowed) return null;
  return new Response(
    JSON.stringify({ error: check.message ?? PAYMENT_METHOD_REQUIRED_MESSAGE, code: "payment_method_required" }),
    { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

export async function checkPaymentMethod(
  client: SupabaseLikeClient,
  companyId: string,
): Promise<PaymentMethodCheck> {
  if (!companyId) {
    return { allowed: false, paymentMethod: "none", message: PAYMENT_METHOD_REQUIRED_MESSAGE };
  }
  // Demo Azienda = vetrina: sempre consentito, nessun blocco.
  if (DEMO_COMPANY_IDS.has(companyId)) {
    return { allowed: true, paymentMethod: "demo" };
  }
  try {
    const { data } = await client
      .from("companies")
      .select("payment_method, status")
      .eq("id", companyId)
      .maybeSingle();
    const method = String(data?.payment_method ?? "none").toLowerCase();
    const status = String(data?.status ?? "").toLowerCase();

    // "comped"/regalati (e sinonimi legacy): sempre consentiti (esenti da carta
    // E da blocco status).
    if (GIFTED_EXEMPT_METHODS.has(method)) {
      return { allowed: true, paymentMethod: method };
    }
    // Abbonamento sospeso/annullato/scaduto → blocco (anche con carta valida).
    if (BLOCKED_STATUSES.has(status)) {
      return { allowed: false, paymentMethod: method, message: SUBSCRIPTION_REQUIRED_MESSAGE };
    }
    // Metodo di pagamento mancante → blocco.
    const hasMethod = method !== "none" && VALID_PAYMENT_METHODS.has(method);
    return {
      allowed: hasMethod,
      paymentMethod: method,
      message: hasMethod ? undefined : PAYMENT_METHOD_REQUIRED_MESSAGE,
    };
  } catch {
    // Lettura fallita: blocca per sicurezza (non far passare consumo non tracciato).
    return { allowed: false, paymentMethod: "none", message: PAYMENT_METHOD_REQUIRED_MESSAGE };
  }
}
