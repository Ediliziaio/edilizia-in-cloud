import { describe, expect, it } from "vitest";
import { categorieFornitore, fornitoreInCategoria, normalizzaCategorie } from "@/lib/fornitori/categorieFornitore";
import { emptyForm, payloadFornitore, supplierToForm, ricercaFornitore, contattiPerUnione, type Supplier } from "@/lib/suppliers/anagraficaFornitore";

describe("categorie multiple dei fornitori", () => {
  const fornitore = { ...emptyForm, id: "f1", name: "Termo Forniture", oda_prossimo: null, product_category: "Idraulica", product_categories: ["Idraulica", "Climatizzazione"] } as unknown as Supplier;
  it("mantiene la categoria storica senza richiedere una bonifica massiva", () => {
    expect(categorieFornitore({ product_category: "Categoria libera precedente", product_categories: [] })).toEqual(["Categoria libera precedente"]);
    expect(normalizzaCategorie([" Idraulica ", "idraulica", "Climatizzazione"])).toEqual(["Idraulica", "Climatizzazione"]);
  });
  it("trova lo stesso fornitore con entrambe le categorie, senza duplicarlo", () => {
    for (const nome of ["Idraulica", "Climatizzazione"]) {
      expect([fornitore].filter((s) => fornitoreInCategoria(s, nome))).toHaveLength(1);
      expect(ricercaFornitore(fornitore, nome)).toBe(true);
    }
  });
  it("modifica e riapertura conservano le due categorie e la compatibilità con i lettori precedenti", () => {
    const form = supplierToForm(fornitore);
    expect(form.product_categories).toEqual(["Idraulica", "Climatizzazione"]);
    const payload = payloadFornitore(form);
    expect(payload.product_category).toBe("Idraulica");
    expect(payload.product_categories).toEqual(["Idraulica", "Climatizzazione"]);
  });
  it("l'unione dei doppioni recupera tutte le categorie senza duplicati", () => {
    const source = { ...fornitore, id: "f2", product_categories: ["Climatizzazione", "Fotovoltaico"] };
    expect(contattiPerUnione(source, fornitore).product_categories).toEqual(["Idraulica", "Climatizzazione", "Fotovoltaico"]);
  });
});
