import { describe, it, expect } from "vitest";
import { puoAnnullare, codaGestibile, etichettaEsito, etichettaOrigine, anteprimaParametri } from "../fiducia";

describe("puoAnnullare — solo reversibile + eseguita + non già annullata", () => {
  it("reversibile + eseguita → sì", () => expect(puoAnnullare(true, "eseguita")).toBe(true));
  it("irreversibile → no (era passata da conferma)", () => expect(puoAnnullare(false, "eseguita")).toBe(false));
  it("non eseguita → no", () => expect(puoAnnullare(true, "rifiutata")).toBe(false));
  it("già annullata → no", () => expect(puoAnnullare(true, "eseguita", true)).toBe(false));
});

describe("codaGestibile", () => {
  it("in_attesa → sì", () => expect(codaGestibile("in_attesa")).toBe(true));
  it("approvata → no", () => expect(codaGestibile("approvata")).toBe(false));
});

describe("etichette", () => {
  it("esito", () => expect(etichettaEsito("annullata")).toBe("Annullata"));
  it("origine canali", () => {
    expect(etichettaOrigine("whatsapp")).toBe("WhatsApp");
    expect(etichettaOrigine("trigger")).toBe("Automatico (evento)");
  });
});

describe("anteprimaParametri", () => {
  it("riassume coppie chiave:valore", () => {
    expect(anteprimaParametri({ totale: 1464, fornitore: "Edil" })).toBe("totale: 1464 · fornitore: Edil");
  });
  it("salta vuoti/null", () => expect(anteprimaParametri({ a: "", b: null, c: "ok" })).toBe("c: ok"));
  it("oggetto vuoto → stringa vuota", () => expect(anteprimaParametri({})).toBe(""));
  it("limita il numero di coppie", () => {
    expect(anteprimaParametri({ a: 1, b: 2, c: 3, d: 4, e: 5 }, 2)).toBe("a: 1 · b: 2");
  });
});
