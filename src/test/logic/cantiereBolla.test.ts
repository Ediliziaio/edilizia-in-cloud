import { expect, it } from "vitest";
import { cantiereBolla, NESSUN_CANTIERE } from "@/lib/campo/cantiereBolla";

it("operaio: senza cantiere non è pronto; il link vale solo per i suoi cantieri", () => {
  expect(cantiereBolla({ richiesto: null, scelta: "", cantieri: ["a", "b"], ufficio: false })).toEqual({
    orderId: null,
    valore: "",
    pronto: false,
  });
  expect(cantiereBolla({ richiesto: "x", scelta: "", cantieri: ["a"], ufficio: false }).orderId).toBe("a");
  expect(cantiereBolla({ richiesto: "b", scelta: "", cantieri: ["a", "b"], ufficio: false }).orderId).toBe("b");
  // La voce dell'ufficio non apre la strada a un operaio.
  expect(cantiereBolla({ richiesto: null, scelta: NESSUN_CANTIERE, cantieri: ["a", "b"], ufficio: false }).pronto).toBe(
    false,
  );
});

it("ufficio: senza scelta e senza cantieri la bolla va in ufficio", () => {
  expect(cantiereBolla({ richiesto: null, scelta: "", cantieri: [], ufficio: true })).toEqual({
    orderId: null,
    valore: NESSUN_CANTIERE,
    pronto: true,
  });
  expect(cantiereBolla({ richiesto: null, scelta: NESSUN_CANTIERE, cantieri: ["a"], ufficio: true }).orderId).toBeNull();
  expect(cantiereBolla({ richiesto: null, scelta: "b", cantieri: ["a", "b"], ufficio: true }).orderId).toBe("b");
});
