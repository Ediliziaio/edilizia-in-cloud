import { describe, expect, it } from "vitest";
import { avvisiDoppieVoci, haManodoperaConfigurata, stessoProdotto } from "@/lib/preventivi/avvisiInserimento";
import type { QuoteItemPro } from "@/types/quoteItem";
import type { CatalogItem } from "@/types/catalogItem";
const prodotto = { item_type: "product", item_category: "prodotto", name: "Finestra", family_id: "f1", quantity: 1, unit_of_measure: "pz", axis_selections: { colore: "bianco", modello: "A" }, misura_x: 1000, misura_y: 1200 } as QuoteItemPro;
const posa = { item_type: "service", item_category: "posa", name: "Montaggio", tariffa_id: "t1", quantity: 1, unit_of_measure: "pz", parent_temp_id: "parent-1" } as QuoteItemPro;
describe("Avvisi doppie voci nel preventivo", () => {
  it("riconosce lo stesso prodotto anche con ordine delle varianti diverso", () => {
    expect(stessoProdotto(prodotto, { ...prodotto, axis_selections: { modello: "A", colore: "bianco" } })).toBe(true);
    expect(avvisiDoppieVoci([prodotto], [prodotto])).toHaveLength(1);
  });
  it("non confonde misure o varianti diverse e cataloghi distinti", () => {
    expect(avvisiDoppieVoci([{ ...prodotto, misura_x: 1100 }], [prodotto])).toEqual([]);
    expect(avvisiDoppieVoci([{ ...prodotto, axis_selections: { colore: "nero" } }], [prodotto])).toEqual([]);
    expect(avvisiDoppieVoci([{ ...prodotto, family_id: "f2" }], [prodotto])).toEqual([]);
  });
  it("avvisa se la posa automatica si sovrappone a una tariffa inserita a parte", () => {
    expect(avvisiDoppieVoci([prodotto, posa], [{ ...posa, parent_temp_id: null }])).toHaveLength(1);
  });
  it("non segnala la stessa tariffa legata a due prodotti diversi come doppio lavoro", () => {
    expect(avvisiDoppieVoci([{ ...posa, parent_temp_id: "parent-2" }], [posa])).toEqual([]);
  });
  it("avvisa anche inserendo a parte una tariffa già presente come posa collegata", () => {
    expect(avvisiDoppieVoci([{ ...posa, parent_temp_id: null }], [posa])).toHaveLength(1);
  });
  it("non perde un collegamento di montaggio solo perché manca il flag derivato", () => {
    expect(haManodoperaConfigurata({ source: "article", ha_montaggio_automatico: false, article: { montaggio_tariffa_id: "t1" } } as CatalogItem)).toBe(true);
    expect(haManodoperaConfigurata({ source: "family", ha_posa_automatica: false, family: { manodopera_modalita: "manuale" } } as CatalogItem)).toBe(true);
  });
});
