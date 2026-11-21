import { describe, expect, it, vi } from "vitest";
import { confermaPagamentoSms } from "../../../supabase/functions/_shared/smsCheckout";

const sessione = {
  id: "cs_test_prova",
  mode: "payment",
  payment_status: "paid",
  payment_intent: "pi_prova",
  amount_total: 2000,
  currency: "eur",
  metadata: { type: "sms_credits", company_id: "azienda", amount_cents: "2000", credit_cents: "2640" },
};

describe("Conferma ricarica SMS", () => {
  it("aspetta un pagamento con l’importo esatto nella valuta prevista", async () => {
    const accredita = vi.fn(async () => ({ error: null }));
    await confermaPagamentoSms({ ...sessione, payment_status: "unpaid" }, accredita);
    await expect(confermaPagamentoSms({ ...sessione, amount_total: 1 }, accredita)).rejects.toThrow("incoerenti");
    await expect(confermaPagamentoSms({ ...sessione, currency: "usd" }, accredita)).rejects.toThrow("incoerenti");
    expect(accredita).not.toHaveBeenCalled();
  });

  it("propaga al webhook un accredito fallito per consentire un nuovo tentativo", async () => {
    const accredita = vi.fn(async () => ({ error: { message: "database non disponibile" } }));
    await expect(confermaPagamentoSms(sessione, accredita)).rejects.toThrow("Accredito SMS non registrato");
    expect(accredita).toHaveBeenCalledWith({
      p_checkout_id: "cs_test_prova",
      p_payment_intent_id: "pi_prova",
      p_company_id: "azienda",
      p_amount_cents: 2000,
      p_credit_cents: 2640,
    });
  });
});
