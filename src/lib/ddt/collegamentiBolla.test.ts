import { describe, expect, it } from "vitest";
import {
  avvisoQuantitaTestata,
  bloccoCollegamento,
  commesseDellaBolla,
  nomePersona,
  type StatoBolla,
} from "./collegamentiBolla";

const libera: StatoBolla = { stato: "ricevuto", consegne: 0, ricezioni: 0, arrivoRegistrato: false, caricataAMagazzino: false };

describe("bloccoCollegamento", () => {
  it("una bolla appena caricata si cambia tutta", () => {
    for (const campo of ["ordine", "fornitore", "commessa", "destinazione"] as const)
      expect(bloccoCollegamento(campo, libera)).toBeNull();
  });

  it("una bolla verificata non si cambia, nemmeno la commessa", () => {
    for (const campo of ["ordine", "fornitore", "commessa", "destinazione"] as const)
      expect(bloccoCollegamento(campo, { ...libera, stato: "verificato" })).toMatch(/verificata/);
  });

  it("con righe consegnate restano fornitore, ordine e destinazione; la commessa no", () => {
    const s = { ...libera, consegne: 2 };
    expect(bloccoCollegamento("fornitore", s)).not.toBeNull();
    expect(bloccoCollegamento("ordine", s)).not.toBeNull();
    expect(bloccoCollegamento("destinazione", s)).not.toBeNull();
    expect(bloccoCollegamento("commessa", s)).toBeNull();
  });

  it("l'arrivo registrato sull'ordine o una ricezione bloccano l'ordine", () => {
    expect(bloccoCollegamento("ordine", { ...libera, arrivoRegistrato: true })).not.toBeNull();
    expect(bloccoCollegamento("ordine", { ...libera, ricezioni: 1 })).not.toBeNull();
  });

  it("il carico a magazzino blocca solo la destinazione", () => {
    const s = { ...libera, caricataAMagazzino: true };
    expect(bloccoCollegamento("destinazione", s)).not.toBeNull();
    expect(bloccoCollegamento("ordine", s)).toBeNull();
    expect(bloccoCollegamento("fornitore", s)).toBeNull();
  });
});

describe("commesseDellaBolla", () => {
  const codici = new Map([["a", "C-001"], ["b", "C-002"]]);

  it("la commessa della testata per prima, poi quelle delle consegne", () => {
    const out = commesseDellaBolla({ id: "a", codice: null }, [
      { order_id: "b" }, { order_id: "a" }, { order_id: "b" }, { order_id: null },
    ], codici);
    expect(out).toEqual([
      { id: "a", codice: "C-001", principale: true, consegne: 1 },
      { id: "b", codice: "C-002", principale: false, consegne: 2 },
    ]);
  });

  it("senza commessa in testata mostra quelle delle consegne", () => {
    expect(commesseDellaBolla(null, [{ order_id: "b" }], codici)).toEqual([
      { id: "b", codice: "C-002", principale: false, consegne: 1 },
    ]);
  });

  it("un reso non porta una commessa in più", () => {
    expect(commesseDellaBolla(null, [{ order_id: "b", tipo: "reso" }], codici)).toEqual([]);
  });

  it("nessuna commessa: elenco vuoto, non obbligatoria", () => {
    expect(commesseDellaBolla(null, [], codici)).toEqual([]);
  });
});

describe("avvisoQuantitaTestata", () => {
  it("una testata a zero è un campo vuoto, non uno scarto", () => {
    expect(avvisoQuantitaTestata(0, 1, 1)).toBeNull();
    expect(avvisoQuantitaTestata(null, 3, 1)).toBeNull();
  });

  it("lo scarto vero si dice in parole semplici", () => {
    expect(avvisoQuantitaTestata(5, 6, 1)).toBe("In testata c'è scritto 5, ma le righe fanno 6. Contano le righe.");
  });

  it("con unità diverse sommare non ha senso", () => {
    expect(avvisoQuantitaTestata(5, 6, 2)).toBeNull();
  });

  it("se tornano, niente avviso", () => {
    expect(avvisoQuantitaTestata(2.5, 2.5, 1)).toBeNull();
  });
});

describe("nomePersona", () => {
  it("nome e cognome, altrimenti l'email", () => {
    expect(nomePersona({ first_name: " Luca ", last_name: "Bianchi" })).toBe("Luca Bianchi");
    expect(nomePersona({ first_name: null, last_name: "", email: "a@b.it" })).toBe("a@b.it");
    expect(nomePersona(null)).toBeNull();
  });
});
