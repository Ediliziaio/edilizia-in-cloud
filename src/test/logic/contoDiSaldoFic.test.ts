import { describe, it, expect } from "vitest";
import { scegliContoDiSaldo, type ContoFic } from "../../../supabase/functions/_shared/contoDiSaldoFic";

const c = (id: number, iban: string | null = null): ContoFic => ({ id, name: `conto ${id}`, iban });

describe("scegliContoDiSaldo", () => {
  it("nessun conto su FIC (il caso di Demo Azienda) → null", () => {
    expect(scegliContoDiSaldo({ conti: [], metodo: { id: 1, default_payment_account: null }, ibanFattura: null })).toBeNull();
  });
  it("un conto solo → quello", () => {
    expect(scegliContoDiSaldo({ conti: [c(5)], metodo: null, ibanFattura: null })?.id).toBe(5);
  });
  it("il predefinito del metodo di pagamento vince", () => {
    expect(scegliContoDiSaldo({
      conti: [c(5, "IT60X0542811101000000123456"), c(6)],
      metodo: { id: 1, default_payment_account: { id: 6 } },
      ibanFattura: "IT60X0542811101000000123456",
    })?.id).toBe(6);
  });
  it("altrimenti il conto con l'IBAN della fattura, spazi e minuscole ignorati", () => {
    expect(scegliContoDiSaldo({
      conti: [c(5, "IT60X0542811101000000123456"), c(6, "IT11A0000000000000000000001")],
      metodo: null,
      ibanFattura: "it60 x054 2811 1010 0000 0123 456",
    })?.id).toBe(5);
  });
  it("oppure l'IBAN del metodo di pagamento", () => {
    expect(scegliContoDiSaldo({
      conti: [c(5), c(6, "IT11A0000000000000000000001")],
      metodo: { id: 1, bank_iban: "IT11A0000000000000000000001" },
      ibanFattura: null,
    })?.id).toBe(6);
  });
  it("più conti e nessun indizio → null, non si tira a indovinare", () => {
    expect(scegliContoDiSaldo({ conti: [c(5), c(6)], metodo: null, ibanFattura: null })).toBeNull();
  });
});
