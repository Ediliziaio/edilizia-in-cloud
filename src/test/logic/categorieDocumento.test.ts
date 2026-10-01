import { describe, expect, it } from "vitest";
import {
  categoriaSuggerita, erroreFile, etichettaCategoria, formatDimensione, nomeRinominato, tipoAnteprima,
} from "@/lib/documenti/categorieDocumento";

describe("documenti: categorie e controlli", () => {
  it("suggerisce la categoria dal nome", () => {
    expect(categoriaSuggerita("Contratto_Rossi.pdf")).toBe("contratto");
    expect(categoriaSuggerita("preventivo-bagno.pdf")).toBe("preventivo");
    expect(categoriaSuggerita("Planimetria piano 1.pdf")).toBe("planimetria");
    expect(categoriaSuggerita("bonifico acconto.pdf")).toBe("fattura");
    expect(categoriaSuggerita("carta identita fronte.jpg", "image/jpeg")).toBe("identita");
    expect(categoriaSuggerita("IMG_2044.jpg", "image/jpeg")).toBe("foto");
    expect(categoriaSuggerita("varie.txt")).toBe("altro");
  });

  it("controlla formato, peso e file vuoti", () => {
    expect(erroreFile({ name: "a.pdf", size: 1000 })).toBeNull();
    expect(erroreFile({ name: "a.exe", size: 1000 })).toContain("formato non ammesso");
    expect(erroreFile({ name: "a.pdf", size: 25 * 1024 * 1024 })).toContain("20 MB");
    expect(erroreFile({ name: "a.pdf", size: 0 })).toContain("vuoto");
    expect(erroreFile({ name: "senzaestensione", size: 10 })).toContain("formato non ammesso");
  });

  it("decide l'anteprima", () => {
    expect(tipoAnteprima("application/pdf")).toBe("pdf");
    expect(tipoAnteprima("image/png")).toBe("immagine");
    expect(tipoAnteprima("", "foto.JPG")).toBe("immagine");
    expect(tipoAnteprima("application/msword", "a.doc")).toBeNull();
  });

  it("rinomina tenendo l'estensione", () => {
    expect(nomeRinominato("scan001.pdf", "Contratto firmato")).toBe("Contratto firmato.pdf");
    expect(nomeRinominato("scan001.pdf", "Contratto.pdf")).toBe("Contratto.pdf");
    expect(nomeRinominato("scan001.pdf", "  ")).toBe("scan001.pdf");
    expect(nomeRinominato("a.pdf", "x/y")).toBe("x-y.pdf");
  });

  it("scrive etichette e dimensioni", () => {
    expect(etichettaCategoria(null)).toBe("Altro");
    expect(etichettaCategoria("foto")).toBe("Foto");
    expect(formatDimensione(2048)).toBe("2 KB");
    expect(formatDimensione(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});
