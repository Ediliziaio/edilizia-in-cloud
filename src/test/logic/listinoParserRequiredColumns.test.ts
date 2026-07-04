import { describe, it, expect } from "vitest";
import { parseCsv, findMissingRequiredColumns } from "@/lib/catalogo/listinoParser";

/**
 * GUARD M-H (audit listino): se una colonna OBBLIGATORIA manca proprio
 * dall'intestazione del file, il parser deve lanciare — non importare
 * righe con il campo a null in silenzio (record monchi nel catalogo).
 */
describe("listinoParser — colonne obbligatorie nell'header", () => {
  it("parsa un CSV con tutte le colonne obbligatorie (product)", () => {
    const csv = "Codice *,Descrizione *,Prezzo Base\nA1,Finestra 100x100,120,50";
    const rows = parseCsv(csv, { objectType: "product" });
    expect(rows).toHaveLength(1);
    expect(rows[0].normalized.code).toBe("A1");
    expect(rows[0].normalized.name).toBe("Finestra 100x100");
    expect(rows[0].errors).toHaveLength(0);
  });

  it("lancia se manca 'Codice' per objectType=product", () => {
    const csv = "Descrizione *,Prezzo Base\nFinestra 100x100,120";
    expect(() => parseCsv(csv, { objectType: "product" })).toThrow(/Codice/);
  });

  it("lancia se manca 'Nome Famiglia' per objectType=family", () => {
    const csv = "Codice,Descrizione\nFAM1,Serramenti PVC";
    expect(() => parseCsv(csv, { objectType: "family" })).toThrow(/Nome Famiglia/);
  });

  it("lancia se manca 'Nome' per objectType=tariffa", () => {
    const csv = "Codice,Costo Orario\nOP1,28";
    expect(() => parseCsv(csv, { objectType: "tariffa" })).toThrow(/Nome/);
  });

  it("riconosce header con suffisso * e parentesi (normalizzazione headerKey)", () => {
    // "Valida Dal (AAAA-MM-GG)" mappa via label con parentesi strip
    const headers = ["Nome *", "Valida Dal (AAAA-MM-GG)"];
    expect(findMissingRequiredColumns(headers, { objectType: "tariffa" })).toEqual([]);
  });

  it("riconosce header per key oltre che per label", () => {
    // header "code"/"name" = key diretta, non label
    const headers = ["code", "name"];
    expect(findMissingRequiredColumns(headers, { objectType: "product" })).toEqual([]);
  });

  it("elenca TUTTE le obbligatorie mancanti, non solo la prima", () => {
    const missing = findMissingRequiredColumns(["Categoria"], { objectType: "product" });
    expect(missing).toEqual(["Codice", "Descrizione"]);
  });
});
