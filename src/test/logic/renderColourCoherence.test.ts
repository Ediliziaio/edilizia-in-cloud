import { describe, expect, it } from "vitest";
import { cambiaCodiceColore, cambiaNomeColore, codiceColore, coloriContraddittori, validaColoriStanza } from "../../../shared/render-room/colours.ts";

describe("un colore unico dal form al render", () => {
  it("digitare un esadecimale non espande il testo a metà scrittura", () => {
    let c = { colore_hex: "#FFFFFF", colore_nome: "" };
    for (const value of ["#", "#A", "#A6", "#A6B", "#A6B4", "#A6B49", "#A6B49E"]) {
      c = cambiaNomeColore(c, "colore_nome", "colore_hex", value);
      expect(c.colore_nome).toBe(value);
    }
    expect(c.colore_hex).toBe("#A6B49E");
    expect(codiceColore("#abc")).toBe("#AABBCC");
  });
  it("cambiare il selettore rimuove un vecchio nome e tiene sincronizzato un nome esadecimale", () => {
    expect(cambiaCodiceColore({ colore_nome: "Sabbia", colore_hex: "#DBC6A6" }, "colore_nome", "colore_hex", "#000000").colore_nome).toBeUndefined();
    expect(cambiaCodiceColore({ colore_nome: "#FFF", colore_hex: "#FFFFFF" }, "colore_nome", "colore_hex", "#000000").colore_nome).toBe("#000000");
  });
  it("il vecchio caso del soggiorno è rifiutato prima di campioni, credito e provider", () => {
    const cfg = { verniciatura: { attivo: true, colore_nome: "#A6B49E", colore_hex: "#FFFFFF" } };
    expect(coloriContraddittori(cfg)).toEqual(["verniciatura"]);
    expect(() => validaColoriStanza(cfg)).toThrow(/due codici diversi/);
    expect(() => validaColoriStanza({ verniciatura: { ...cfg.verniciatura, attivo: false } })).not.toThrow();
  });
  it("ignora i colori di una modalità di pittura non selezionata", () => {
    const colore = { attivo: true, colore_hex: "#FFFFFF", colore_nome: "#FFFFFF", colore_accento_nome: "#000000", colore_accento_hex: "#FFFFFF", applica_a: "tutte" };
    expect(() => validaColoriStanza({ verniciatura: colore })).not.toThrow();
    expect(() => validaColoriStanza({ verniciatura: { ...colore, applica_a: "parete_accento" } })).toThrow(/due codici diversi/);
  });
});
