/**
 * Capitoli del computo nei moduli di preventivo: il nome si applica a fine
 * scrittura, un doppione si rifiuta e ogni sezione tiene la sua chiave.
 */
import { describe, it, expect } from "vitest";
import { chiaviCapitoli, esitoRinomina, passaChiave } from "@/lib/moduli/capitoliComputo";

describe("rinominare un capitolo", () => {
  const nomi = ["Demolizioni", "Impianti", "Generale"];

  it("un nome nuovo si applica, senza spazi ai lati", () => {
    expect(esitoRinomina("Impianti", "  Impianto elettrico ", nomi)).toEqual({
      tipo: "rinomina",
      nome: "Impianto elettrico",
    });
  });

  it("vuoto o uguale lascia il nome di prima", () => {
    expect(esitoRinomina("Impianti", "   ", nomi)).toEqual({ tipo: "vuoto" });
    expect(esitoRinomina("Impianti", "Impianti ", nomi)).toEqual({ tipo: "invariato" });
  });

  it("il nome di un altro capitolo si rifiuta, anche con maiuscole diverse", () => {
    expect(esitoRinomina("Impianti", "generale", nomi)).toEqual({ tipo: "doppione", nome: "generale" });
    expect(esitoRinomina("Impianti", "Demolizioni", nomi)).toEqual({ tipo: "doppione", nome: "Demolizioni" });
  });

  it("cambiare solo le maiuscole dello stesso capitolo si può", () => {
    expect(esitoRinomina("impianti", "Impianti", ["impianti", "Generale"])).toEqual({
      tipo: "rinomina",
      nome: "Impianti",
    });
  });
});

describe("chiavi stabili delle sezioni", () => {
  it("eliminare un capitolo non sposta le chiavi degli altri", () => {
    const prima = chiaviCapitoli(["A", "B", "C"], new Map());
    expect(chiaviCapitoli(["A", "C"], new Map())).toEqual([prima[0], prima[2]]);
  });

  it("un capitolo rinominato tiene la chiave di prima", () => {
    const prima = chiaviCapitoli(["Nuovo capitolo", "B"], new Map());
    const ereditate = passaChiave(new Map(), "Nuovo capitolo", "Bagno", prima[0]);
    expect(chiaviCapitoli(["Bagno", "B"], ereditate)).toEqual(prima);
  });

  it("un capitolo nuovo col vecchio nome non prende la chiave del rinominato", () => {
    const prima = chiaviCapitoli(["Nuovo capitolo"], new Map());
    let ereditate = passaChiave(new Map(), "Nuovo capitolo", "Bagno", prima[0]);
    const dopo = chiaviCapitoli(["Bagno", "Nuovo capitolo"], ereditate);
    expect(dopo[0]).toBe(prima[0]);
    expect(new Set(dopo).size).toBe(2);

    // Rinominato anche il secondo, e un terzo «Nuovo capitolo»: tre chiavi diverse.
    ereditate = passaChiave(ereditate, "Nuovo capitolo", "Cucina", dopo[1]);
    const ancora = chiaviCapitoli(["Bagno", "Cucina", "Nuovo capitolo"], ereditate);
    expect(ancora.slice(0, 2)).toEqual(dopo);
    expect(new Set(ancora).size).toBe(3);
  });
});
