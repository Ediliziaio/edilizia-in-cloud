import { describe, expect, it } from "vitest";
import {
  MAX_CATALOG_REFERENCES,
  RENDER_CATALOG_VERTICALI,
  categoriaLabel,
  toggleCatalogSelection,
} from "../../lib/render/renderCatalog";
import {
  CATALOG_TARGET_LABELS,
  buildCatalogLegend,
  catalogReferenceLabel,
  normalizeCatalogAssetIds,
} from "../../../supabase/functions/_shared/renderCatalogReferences";

const U1 = "11111111-1111-4111-8111-111111111111";
const U2 = "22222222-2222-4222-8222-222222222222";
const U3 = "33333333-3333-4333-8333-333333333333";
const U4 = "44444444-4444-4444-8444-444444444444";
const U5 = "55555555-5555-4555-8555-555555555555";

describe("toggleCatalogSelection — selezione max 4, ordine preservato", () => {
  it("aggiunge in coda e toglie senza riordinare", () => {
    expect(toggleCatalogSelection([], U1)).toEqual([U1]);
    expect(toggleCatalogSelection([U1, U2], U3)).toEqual([U1, U2, U3]);
    expect(toggleCatalogSelection([U1, U2, U3], U2)).toEqual([U1, U3]);
  });
  it("al massimo non aggiunge ma permette ancora di togliere", () => {
    const pieno = [U1, U2, U3, U4];
    expect(pieno).toHaveLength(MAX_CATALOG_REFERENCES);
    expect(toggleCatalogSelection(pieno, U5)).toEqual(pieno);
    expect(toggleCatalogSelection(pieno, U4)).toEqual([U1, U2, U3]);
  });
  it("non muta l'array in ingresso", () => {
    const ids = [U1];
    toggleCatalogSelection(ids, U2);
    expect(ids).toEqual([U1]);
  });
});

describe("categorie del catalogo ↔ etichette bersaglio dell'edge", () => {
  it("ogni categoria del frontend ha un'etichetta inglese nell'edge (niente PRODUCT TARGET generico)", () => {
    for (const v of RENDER_CATALOG_VERTICALI) {
      for (const c of v.categorie) {
        expect(CATALOG_TARGET_LABELS[c.value], `${v.value}/${c.value}`).toBeDefined();
      }
    }
  });
  it("categoriaLabel ripiega sul valore grezzo", () => {
    expect(categoriaLabel("bagno", "wc")).toBe("WC");
    expect(categoriaLabel("bagno", "inesistente")).toBe("inesistente");
  });
});

describe("normalizeCatalogAssetIds — input del wizard non fidato", () => {
  it("tiene solo uuid, senza doppioni, massimo 4, in ordine", () => {
    expect(normalizeCatalogAssetIds([U1, "x", U1.toUpperCase(), 42, U2, U3, U4, U5])).toEqual([U1, U2, U3, U4]);
  });
  it("tutto il resto → vuoto", () => {
    expect(normalizeCatalogAssetIds(undefined)).toEqual([]);
    expect(normalizeCatalogAssetIds("abc")).toEqual([]);
    expect(normalizeCatalogAssetIds([null, 1, {}])).toEqual([]);
  });
});

describe("legenda per il modello", () => {
  it("etichetta nel formato delle reference infissi", () => {
    expect(catalogReferenceLabel({ categoria: "mobile_bagno", etichetta: "  Mobile sospeso rovere 120 " }))
      .toBe("VANITY UNIT TARGET — Mobile sospeso rovere 120 (customer's own catalogue)");
    expect(catalogReferenceLabel({ categoria: "boh", etichetta: "X" })).toMatch(/^PRODUCT TARGET — X/);
  });
  it("vuota senza asset; numerata e con istruzione d'uso altrimenti", () => {
    expect(buildCatalogLegend([])).toBe("");
    const legend = buildCatalogLegend([
      { categoria: "wc", etichetta: "WC sospeso rimless" },
      { categoria: "rubinetteria", etichetta: "Miscelatore nero opaco" },
    ]);
    expect(legend.startsWith("REFERENCE IMAGES ATTACHED")).toBe(true);
    expect(legend).toContain("1. TOILET (WC) TARGET — WC sospeso rimless");
    expect(legend).toContain("2. FAUCET / TAPWARE TARGET — Miscelatore nero opaco");
    expect(legend).toContain("Do NOT copy the reference photo's background");
  });
  it("taglia etichette lunghissime a 80 caratteri", () => {
    const lunga = "a".repeat(200);
    expect(catalogReferenceLabel({ categoria: "wc", etichetta: lunga })).toContain("a".repeat(80) + " (customer");
    expect(catalogReferenceLabel({ categoria: "wc", etichetta: lunga })).not.toContain("a".repeat(81));
  });
});
