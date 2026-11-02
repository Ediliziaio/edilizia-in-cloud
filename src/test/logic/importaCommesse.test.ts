import { describe, expect, it } from "vitest";
import { commessaDaRiga, dataDaCella, numeroDaCella } from "@/lib/orders/importaCommesse";

const contesto = {
  aziendaId: "c1",
  clientePerEmail: new Map([["mario@x.it", "cliente-1"]]),
  codiciEsistenti: new Set(["o-1"]),
  statoPredefinito: "stato-1",
};
const riga = (extra: Record<string, string> = {}) => ({ customer_email: "Mario@x.it", description: "Bagno", total_amount: "10.000,00", vat_rate: "10", ...extra });
const ok = (r: ReturnType<typeof commessaDaRiga>) => {
  if ("errore" in r) throw new Error(r.errore);
  return r;
};

describe("Numeri e date del file", () => {
  it("legge gli importi all'italiana: 12.000,50 non è 12", () => {
    expect(numeroDaCella("12.000,50")).toBe(12000.5);
    expect(numeroDaCella("12000,50")).toBe(12000.5);
    expect(numeroDaCella("12.000")).toBe(12000);
    expect(numeroDaCella("1234.56")).toBe(1234.56);
    expect(numeroDaCella("12.000,50 €")).toBe(12000.5);
  });
  it("vuota è null, illeggibile è NaN e non zero", () => {
    expect(numeroDaCella("  ")).toBeNull();
    expect(numeroDaCella("dodici")).toBeNaN();
    expect(numeroDaCella("12 mila")).toBeNaN();
  });
  it("le date si leggono in italiano e una data impossibile non passa", () => {
    expect(dataDaCella("31/12/2026")).toBe("2026-12-31");
    expect(dataDaCella("1/2/2026")).toBe("2026-02-01");
    expect(dataDaCella("2026-12-31")).toBe("2026-12-31");
    expect(dataDaCella("")).toBeNull();
    expect(dataDaCella("31/02/2026")).toBeUndefined();
    expect(dataDaCella("domani")).toBeUndefined();
  });
});

describe("Una riga del file", () => {
  it("il totale è senza IVA; la rata di saldo è il totale con l'IVA", () => {
    const r = ok(commessaDaRiga(riga(), contesto));
    expect(r.ordine).toMatchObject({ total_amount: 10000, vat_rate: 10, customer_id: "cliente-1", current_status_id: "stato-1", balance_amount: 11000 });
    expect(r.rate.map((x) => [x.label, x.amount])).toEqual([["Saldo", 11000]]);
  });
  it("gli acconti diventano rate e il saldo è il resto", () => {
    const r = ok(commessaDaRiga(riga({ deposit_amount: "3.000", deposit_2_amount: "2.000,00" }), contesto));
    expect(r.rate.map((x) => [x.label, x.amount])).toEqual([["Acconto 1", 3000], ["Acconto 2", 2000], ["Saldo", 6000]]);
  });
  it("l'IVA è obbligatoria e lo zero è un'aliquota vera", () => {
    expect(commessaDaRiga(riga({ vat_rate: "" }), contesto)).toMatchObject({ errore: expect.stringContaining("IVA") });
    expect(ok(commessaDaRiga(riga({ vat_rate: "0" }), contesto)).ordine.vat_rate).toBe(0);
  });
  it("un numero che non si legge ferma la riga", () => {
    expect(commessaDaRiga(riga({ total_amount: "dodici" }), contesto)).toMatchObject({ errore: expect.stringContaining("dodici") });
    expect(commessaDaRiga(riga({ deposit_amount: "boh" }), contesto)).toMatchObject({ errore: expect.stringContaining("Acconto 1") });
  });
  it("acconti oltre il totale con l'IVA non passano", () => {
    expect(commessaDaRiga(riga({ deposit_amount: "20.000" }), contesto)).toMatchObject({ errore: expect.stringContaining("superano") });
  });
  it("un'email fuori dai clienti, per esempio di un dipendente, non intesta la commessa", () => {
    expect(commessaDaRiga(riga({ customer_email: "dipendente@x.it" }), contesto)).toMatchObject({ errore: expect.stringContaining("non trovato") });
  });
  it("codice già preso e data sbagliata fermano la riga", () => {
    expect(commessaDaRiga(riga({ order_code: "O-1" }), contesto)).toMatchObject({ errore: expect.stringContaining("già esistente") });
    expect(commessaDaRiga(riga({ expected_date: "31/02/2026" }), contesto)).toMatchObject({ errore: expect.stringContaining("31/02/2026") });
  });
});
