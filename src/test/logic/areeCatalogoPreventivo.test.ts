import { describe, expect, it } from "vitest";
import {
  areeTariffa,
  chiaveProdotto,
  classificaProdottiPerArea,
  nellAreaCatalogo,
  riepilogoAreeCatalogo,
} from "@/lib/preventivi/areeCatalogoPreventivo";
import type { CatalogCategory, CatalogItem } from "@/types/catalogItem";
import type { MacroListino } from "@/lib/listino/lineeListino";
import type { TariffaPro } from "@/hooks/usePreventivoCosti";

const famiglia = (id: string, extra = {}): CatalogItem =>
  ({
    source: "family",
    id,
    nome: "Box doccia",
    family: { vertical: "generico", ...extra },
  }) as CatalogItem;
const articolo = (id: string, extra = {}): CatalogItem =>
  ({ source: "article", id, nome: "Finestra", article: extra }) as CatalogItem;
describe("Aree del catalogo preventivo", () => {
  it("normalizza gli alias e mantiene tutte le aree dichiarate di una macrocategoria", () => {
    const p = famiglia("f", { vertical: "tetti", macrocategoria_id: "m" });
    const result = classificaProdottiPerArea([p], [], [
      {
        id: "m",
        verticali_abilitati: [
          "serramentista",
          "serramenti",
          "bagno",
          "generico",
          "Area speciale",
        ],
      },
    ] as MacroListino[]);
    expect(result.get(chiaveProdotto(p))).toEqual([
      "serramenti",
      "bagni",
      "area_speciale",
    ]);
  });
  it("eredita l'area dalla categoria e dalla famiglia collegata senza confondere ID di sorgenti diverse", () => {
    const f = famiglia("uguale", { vertical: "fotovoltaico" });
    const a = { ...articolo("uguale"), categoria_id: "c" };
    const collegato = articolo("collegato", { family_id: f.id });
    const result = classificaProdottiPerArea(
      [f, a, collegato],
      [{ id: "c", macrocategoria_id: "m" }] as CatalogCategory[],
      [{ id: "m", verticali_abilitati: ["bagni"] }] as MacroListino[],
    );
    expect(result.get(chiaveProdotto(f))).toEqual(["fotovoltaico"]);
    expect(result.get(chiaveProdotto(a))).toEqual(["bagni"]);
    expect(result.get(chiaveProdotto(collegato))).toEqual(["fotovoltaico"]);
  });
  it("usa le categorie legacy riconosciute ma non deduce l'area dal nome né da etichette ambigue", () => {
    const prodotti = [
      articolo("doccia", { category: "Doccia" }),
      articolo("pavimenti", { category: "Pavimenti e rivestimenti" }),
      articolo("ambiguo", { category: "Accessori" }),
      famiglia("nome-non-area"),
    ];
    const result = classificaProdottiPerArea(prodotti, [], []);
    expect(result.get("article:doccia")).toEqual(["bagni"]);
    expect(result.get("article:pavimenti")).toEqual(["pavimenti"]);
    expect(result.get("article:ambiguo")).toEqual([]);
    expect(result.get("family:nome-non-area")).toEqual([]);
  });
  it("le voci comuni rimangono accessibili e si possono escludere senza includere altre aree", () => {
    expect(nellAreaCatalogo([], "bagni")).toBe(true);
    expect(nellAreaCatalogo([], "bagni", false)).toBe(false);
    expect(nellAreaCatalogo(["serramenti"], "bagni")).toBe(false);
    expect(nellAreaCatalogo(["bagni", "pavimenti"], "bagni", false)).toBe(true);
    expect(nellAreaCatalogo([], "common", false)).toBe(true);
    expect(nellAreaCatalogo(["bagni"], "common")).toBe(false);
  });
  it("conta solo servizi attivi e non moltiplica i prodotti presenti in più aree", () => {
    const p = famiglia("p");
    const classificazione = new Map([
      [chiaveProdotto(p), ["bagni", "pavimenti"]],
    ]);
    const tariffe = [
      { id: "t", vertical_associato: "bagno" },
      { id: "comune" },
      { id: "spenta", attiva: false, vertical_associato: "tetti" },
    ] as TariffaPro[];
    const result = riepilogoAreeCatalogo([p], tariffe, classificazione);
    expect(result).toEqual(
      expect.arrayContaining([
        { id: "area:bagni", nome: "Bagni", prodotti: 1, servizi: 1 },
        { id: "common", nome: "Comuni / senza area", prodotti: 0, servizi: 1 },
      ]),
    );
    expect(result.some((a) => a.id === "area:tetti")).toBe(false);
    expect(areeTariffa(tariffe[1])).toEqual([]);
  });
  it("distingue aree personalizzate dai filtri Tutte e Comuni", () => {
    const tariffe = [
      { vertical_associato: "Common" },
      { vertical_associato: "All" },
    ] as TariffaPro[];
    const result = riepilogoAreeCatalogo([], tariffe, new Map());
    expect(result.map((a) => a.id)).toEqual(["area:all", "area:common"]);
    expect(nellAreaCatalogo(["common"], "area:common", false)).toBe(true);
    expect(nellAreaCatalogo([], "area:common", false)).toBe(false);
  });
});
