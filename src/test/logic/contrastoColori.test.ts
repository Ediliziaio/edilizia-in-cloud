import { describe, expect, it } from "vitest";
import { contrasto, inchiostroSuBianco, testoSopra } from "@/lib/pdf/contrastoColori";

// Il lime di Renova (#C8E600) sul bianco non si legge, e il testo bianco sopra
// il lime nemmeno. I colori che si leggevano già non devono cambiare.

describe("colori leggibili dal colore dell'azienda", () => {
  it("scurisce un colore chiaro per scrivere sul bianco e scrive scuro sopra di lui", () => {
    expect(contrasto("#C8E600", "#FFFFFF")).toBeLessThan(2);
    const inchiostro = inchiostroSuBianco("#C8E600");
    expect(inchiostro).toBe("#647300");
    expect(contrasto(inchiostro, "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
    expect(testoSopra("#C8E600")).toBe("#0F172A");
    expect(testoSopra("#fff")).toBe("#0F172A");
  });

  it("lascia com'erano i colori che si leggono già", () => {
    // Il verde di serie, l'arancio di Ser Style (3:1 giusto giusto), un blu scuro.
    for (const colore of ["#2D7D5C", "#F06D03", "#1E40AF"]) {
      expect(inchiostroSuBianco(colore)).toBe(colore);
      expect(testoSopra(colore)).toBe("#FFFFFF");
    }
  });

  it("non tocca un colore che non sa leggere", () => {
    expect(inchiostroSuBianco("rosso")).toBe("rosso");
    expect(testoSopra("rosso")).toBe("#FFFFFF");
  });
});
