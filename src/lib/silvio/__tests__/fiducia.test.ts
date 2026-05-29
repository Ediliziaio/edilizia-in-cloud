import { describe, it, expect } from "vitest";
import { puoAnnullare, annullabileInverso, codaGestibile, etichettaEsito, etichettaOrigine, anteprimaParametri } from "../fiducia";

describe("puoAnnullare — solo reversibile + eseguita + non già annullata", () => {
  it("reversibile + eseguita → sì", () => expect(puoAnnullare(true, "eseguita")).toBe(true));
  it("irreversibile → no (era passata da conferma)", () => expect(puoAnnullare(false, "eseguita")).toBe(false));
  it("non eseguita → no", () => expect(puoAnnullare(true, "rifiutata")).toBe(false));
  it("già annullata → no", () => expect(puoAnnullare(true, "eseguita", true)).toBe(false));
});

describe("annullabileInverso — UI mostra Annulla solo per inversi DB supportati", () => {
  const ID = "11111111-1111-1111-1111-111111111111";
  it("collegamento email reversibile eseguito tracciato → sì", () =>
    expect(annullabileInverso("email_collegamento", ID, true, "eseguita")).toBe(true));
  it("bozza documento reversibile eseguita tracciata → sì", () =>
    expect(annullabileInverso("email_documento_estratto", ID, true, "eseguita")).toBe(true));
  it("oggetto non tracciato (id mancante) → no, niente pulsante che fallirebbe", () =>
    expect(annullabileInverso("email_collegamento", null, true, "eseguita")).toBe(false));
  it("tipo oggetto senza inverso DB (es. scadenza) → no", () =>
    expect(annullabileInverso("scadenza_previsionale", ID, true, "eseguita")).toBe(false));
  it("tipo oggetto nullo → no", () =>
    expect(annullabileInverso(null, ID, true, "eseguita")).toBe(false));
  it("non reversibile anche se tracciato → no", () =>
    expect(annullabileInverso("email_collegamento", ID, false, "eseguita")).toBe(false));
  it("già annullata → no", () =>
    expect(annullabileInverso("email_collegamento", ID, true, "eseguita", true)).toBe(false));
  it("rifiutata/errore → no", () => {
    expect(annullabileInverso("email_collegamento", ID, true, "rifiutata")).toBe(false);
    expect(annullabileInverso("email_collegamento", ID, true, "errore")).toBe(false);
  });
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
