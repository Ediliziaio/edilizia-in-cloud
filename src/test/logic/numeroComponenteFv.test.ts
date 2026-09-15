/**
 * "Componenti FV": un prezzo scritto all'italiana non deve mai diventare 0
 * in silenzio (caso reale: "1.200,50" → NaN → salvato 0).
 */
import { describe, it, expect } from "vitest";
import { leggiNumeroComponente } from "@/lib/fotovoltaico/numeroComponente";

describe("leggiNumeroComponente", () => {
  it("formato italiano con migliaia e decimali: il caso che prima diventava 0", () => {
    expect(leggiNumeroComponente("1.200,50")).toBe(1200.5);
  });

  it("i formati che si digitano davvero", () => {
    expect(leggiNumeroComponente("120")).toBe(120);
    expect(leggiNumeroComponente("120,5")).toBe(120.5);
    expect(leggiNumeroComponente("1.500")).toBe(1500);
    expect(leggiNumeroComponente("€ 99,90")).toBe(99.9);
    expect(leggiNumeroComponente("3,68")).toBe(3.68);
    expect(leggiNumeroComponente("9.3")).toBe(9.3);
  });

  it("campo vuoto: nessun valore, non un errore", () => {
    expect(leggiNumeroComponente("")).toBeUndefined();
    expect(leggiNumeroComponente("   ")).toBeUndefined();
    expect(leggiNumeroComponente(null)).toBeUndefined();
  });

  it("testo non numerico o negativo: errore, mai 0", () => {
    expect(leggiNumeroComponente("abc")).toBeNull();
    expect(leggiNumeroComponente("€")).toBeNull();
    expect(leggiNumeroComponente("-50")).toBeNull();
  });
});
