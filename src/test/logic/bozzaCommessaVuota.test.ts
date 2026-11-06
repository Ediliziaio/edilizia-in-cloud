import { describe, expect, it } from "vitest";
import { bozzaHaContenuto } from "@/hooks/useOrderDraft";

describe("Bozza della nuova commessa", () => {
  it("col solo codice proposto e lo stato iniziale non c'è niente da recuperare", () => {
    expect(bozzaHaContenuto({ orderCode: "DEMO2-0004", statusId: "s", customerId: "", description: " ", totalAmount: "0", orderItems: [], installments: [] })).toBe(false);
  });
  it("basta una cosa scritta dall'utente", () => {
    expect(bozzaHaContenuto({ customerId: "c" })).toBe(true);
    expect(bozzaHaContenuto({ description: "Bagno" })).toBe(true);
    expect(bozzaHaContenuto({ totalAmount: "1000" })).toBe(true);
    expect(bozzaHaContenuto({ workStartDate: "2026-11-02" })).toBe(true);
  });
});


it("cliente e indirizzo proposti dal percorso non sono una bozza compilata", () => {
  const proposta = { customerId: "demo", prefilledCustomerId: "demo", cantiereAddress: "Via Demo", cantiereAddressManuale: false };
  expect(bozzaHaContenuto(proposta)).toBe(false);
  expect(bozzaHaContenuto({ ...proposta, description: "Lavoro scritto" })).toBe(true);
  expect(bozzaHaContenuto({ ...proposta, customerId: "altro" })).toBe(true);
  expect(bozzaHaContenuto({ ...proposta, cantiereAddressManuale: true })).toBe(true);
});
