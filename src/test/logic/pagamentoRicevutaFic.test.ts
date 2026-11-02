import { describe, expect, it } from "vitest";
import { codiceMpDaNomeFic, pagamentoRicevutaFic } from "../../../supabase/functions/_shared/pagamentoRicevutaFic";

describe("Fatture in Cloud, fatture ricevute: rate, metodo e ritenuta (01/11/2026)", () => {
  it("RiBa 30/60/90 da 10.000 €: tre rate alle loro date, metodo MP12", () => {
    const { piano, ritenuta } = pagamentoRicevutaFic({
      payment_method: { name: "Ri.Ba." },
      payments_list: [
        { amount: 3333.33, due_date: "2026-12-31", status: "not_paid" },
        { amount: 3333.33, due_date: "2027-01-31", status: "not_paid" },
        { amount: 3333.34, due_date: "2027-02-28", status: "not_paid" },
      ],
    });
    expect(piano?.map((r) => [r.scadenza, r.importo, r.modalita])).toEqual([
      ["2026-12-31", 3333.33, "MP12"], ["2027-01-31", 3333.33, "MP12"], ["2027-02-28", 3333.34, "MP12"],
    ]);
    expect(ritenuta).toBeNull();
  });

  it("parcella con ritenuta d'acconto: la ritenuta si conserva, la rata pagata si riconosce", () => {
    const { piano, ritenuta } = pagamentoRicevutaFic({
      amount_withholding_tax: 200,
      payments_list: [{ amount: 1020, due_date: "2026-11-30", paid_date: "2026-11-28", status: "paid", payment_account: { name: "Bonifico", iban: "IT60 X054 2811 1010 0000 0123 456" } }],
    });
    expect(ritenuta).toBe(200);
    expect(piano?.[0]).toMatchObject({ importo: 1020, modalita: "MP05", iban: "IT60X0542811101000000123456", pagata_il: "2026-11-28" });
  });

  it("senza rate ma con una scadenza: una rata unica; senza niente: nessun piano", () => {
    expect(pagamentoRicevutaFic({ next_due_date: "2026-12-15" }).piano).toEqual([{ scadenza: "2026-12-15", importo: null, modalita: null, iban: null }]);
    expect(pagamentoRicevutaFic({}).piano).toBeNull();
  });

  it("i nomi dei metodi di FIC", () => {
    expect(["RiBa", "Bonifico bancario", "Carta di credito", "Contanti", "SDD", "boh"].map(codiceMpDaNomeFic))
      .toEqual(["MP12", "MP05", "MP08", "MP01", "MP19", null]);
  });
});
