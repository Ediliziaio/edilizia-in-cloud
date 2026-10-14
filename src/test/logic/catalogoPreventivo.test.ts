import { describe, expect, it } from "vitest";
import type { CatalogCategory, CatalogItemFamily } from "@/types/catalogItem";
import {
  corrispondeProdottoCatalogo,
  dettagliProdottoCatalogo,
  prezzoProdottoCatalogo,
  rigaCollegataAlProdotto,
} from "@/lib/preventivi/catalogoPreventivo";
const categorie = [
  { id: "alu", nome: "PVC Aluplast" },
  { id: "sal", nome: "PVC Salamander" },
] as CatalogCategory[];
const prodotto = {
  source: "family",
  id: "p1",
  nome: "Finestra 1 Anta",
  categoria_id: "sal",
  modalita_prezzo: "mq",
  prezzo_base_vendita: 0,
  family: { codice: "F-001", axes: [] },
} as CatalogItemFamily;
describe("Catalogo nel preventivo: identità, prezzo e collegamenti", () => {
  it("distingue una finestra per linea e codice e la trova con parole separate", () => {
    expect(dettagliProdottoCatalogo(prodotto, categorie)).toMatchObject({
      categoria: "PVC Salamander",
      codice: "F-001",
    });
    expect(
      corrispondeProdottoCatalogo(prodotto, categorie, "finestra salamander"),
    ).toBe(true);
    expect(corrispondeProdottoCatalogo(prodotto, categorie, "F-001")).toBe(
      true,
    );
    expect(corrispondeProdottoCatalogo(prodotto, categorie, "aluplast")).toBe(
      false,
    );
  });
  it("non presenta un prezzo mancante come un prodotto gratuito", () => {
    expect(prezzoProdottoCatalogo(prodotto)).toBe("Prezzo da completare");
    expect(
      prezzoProdottoCatalogo({ ...prodotto, modalita_prezzo: "griglia" }),
    ).toBe("Prezzo a misura");
    expect(
      prezzoProdottoCatalogo({ ...prodotto, prezzo_base_vendita: 0.0044 }),
    ).toContain("0,0044");
  });
  it("un servizio autonomo resta sullo stesso livello degli altri elementi", () => {
    expect(rigaCollegataAlProdotto({})).toBe(false);
    expect(rigaCollegataAlProdotto({ _parentIdx: 0 })).toBe(true);
    expect(rigaCollegataAlProdotto({ parent_temp_id: "prodotto-1" })).toBe(
      true,
    );
    expect(rigaCollegataAlProdotto({ parent_item_id: "db-prodotto-1" })).toBe(
      true,
    );
  });
});
