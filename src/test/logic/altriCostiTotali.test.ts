import { describe, expect, it } from "vitest";
import { lordoCosto, totaliAltriCosti } from "@/lib/costi/costoCommessa";

describe("I numeri in cima ad «Altri costi»", () => {
  it("sommano l'IVA compresa e dividono saldati e da saldare", () => {
    const costi = [
      { amount: 100, vat_rate: 22, is_paid: true },
      { amount: 16, vat_rate: null, is_paid: false },
      { amount: 50, vat_rate: 10, is_paid: false },
    ];
    expect(lordoCosto(costi[0])).toBe(122);
    expect(totaliAltriCosti(costi)).toEqual({ totale: 193, saldati: 122, daSaldare: 71 });
  });
  it("senza costi è tutto zero", () => {
    expect(totaliAltriCosti([])).toEqual({ totale: 0, saldati: 0, daSaldare: 0 });
  });
});
