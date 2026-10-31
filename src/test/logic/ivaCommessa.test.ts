import { describe, expect, it } from "vitest";
import { normalizzaIvaCommessa, saldoIva } from "@/lib/orders/ivaCommessa";

describe("IVA della commessa: debito, credito, saldo", () => {
  it("vendo a 100 con IVA 10, compro un bene da 50 + IVA 22%: verso meno (qui sono a credito di 1)", () => {
    expect(saldoIva(10, 11)).toEqual({ importo: 1, verso: "credito" });
  });
  it("vendo a 100 con IVA 10, compro solo in reverse charge: l'IVA delle vendite si versa tutta", () => {
    // il reverse charge va a debito e a credito per lo stesso importo: non entra nel saldo
    expect(saldoIva(10, 0)).toEqual({ importo: 10, verso: "versare" });
  });
  it("pari", () => {
    expect(saldoIva(5, 5).verso).toBe("pari");
  });
  it("normalizza i numeri che arrivano come stringhe", () => {
    const x = normalizzaIvaCommessa({ debito_fatturato: "5664.87", credito_fatture: "7415.32", saldo_ad_oggi: "-1750.45" })!;
    expect(x.debito_fatturato).toBe(5664.87);
    expect(x.saldo_ad_oggi).toBe(-1750.45);
    expect(x.split_payment).toBe(0);
  });
});
