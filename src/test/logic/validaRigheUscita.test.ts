import { describe, expect, it } from "vitest";
import { validaRigheUscita } from "@/lib/magazzino/validaRigheUscita";
const base = { stockItemId: "stock", itemName: "Infisso", quantity: 2, trackingMode: "serialized" as const, serialNumbers: ["A", "B"] };
describe("uscita merce incompleta", () => {
  it("accetta seriali distinti e quantità coerente", () => expect(validaRigheUscita([base])).toBeNull());
  it.each([0, -1, NaN, Infinity])("rifiuta quantità %s senza inviare movimenti", quantity => expect(validaRigheUscita([{ ...base, quantity }])).not.toBeNull());
  it("non scarta silenziosamente articoli non risolti", () => expect(validaRigheUscita([base, { ...base, stockItemId: null }])).not.toBeNull());
  it("richiede tutti i seriali", () => expect(validaRigheUscita([{ ...base, serialNumbers: [] }])).not.toBeNull());
  it("rifiuta duplicati anche fra righe", () => expect(validaRigheUscita([base, base])).not.toBeNull());
  it("rifiuta seriali vuoti", () => expect(validaRigheUscita([{ ...base, serialNumbers: ["A", " "] }])).not.toBeNull());
  it("accetta quantità frazionarie per merce fungibile", () => expect(validaRigheUscita([{ ...base, trackingMode: "fungible", quantity: 1.5, serialNumbers: [] }])).toBeNull());
});
