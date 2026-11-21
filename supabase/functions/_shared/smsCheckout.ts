export const SMS_CHECKOUT_TYPE = "sms_credits";

type SessioneStripe = {
  id?: string;
  mode?: string;
  payment_status?: string;
  payment_intent?: string | { id?: string } | null;
  amount_total?: number | null;
  currency?: string | null;
  metadata?: Record<string, string | undefined> | null;
};

type AccreditoSms = {
  p_checkout_id: string;
  p_payment_intent_id: string;
  p_company_id: string;
  p_amount_cents: number;
  p_credit_cents: number;
};

export function centesimiValidi(valore: number): boolean {
  return Number.isSafeInteger(valore) && valore > 0 && valore <= 2_147_483_647;
}

export async function confermaPagamentoSms(
  sessione: SessioneStripe,
  accredita: (dati: AccreditoSms) => PromiseLike<{ error: { message: string } | null }>,
): Promise<void> {
  if (sessione.metadata?.type !== SMS_CHECKOUT_TYPE || sessione.payment_status !== "paid") return;

  const amount = Number(sessione.metadata.amount_cents);
  const credit = Number(sessione.metadata.credit_cents);
  const paymentId = typeof sessione.payment_intent === "string" ? sessione.payment_intent : sessione.payment_intent?.id;
  const companyId = sessione.metadata.company_id;
  if (!sessione.id || !paymentId || !companyId || sessione.mode !== "payment" ||
      sessione.currency !== "eur" || !centesimiValidi(amount) || !centesimiValidi(credit) ||
      sessione.amount_total !== amount) {
    throw new Error("Dati Stripe incoerenti per l'accredito SMS");
  }

  const { error } = await accredita({
    p_checkout_id: sessione.id,
    p_payment_intent_id: paymentId,
    p_company_id: companyId,
    p_amount_cents: amount,
    p_credit_cents: credit,
  });
  if (error) throw new Error(`Accredito SMS non registrato: ${error.message}`);
}
