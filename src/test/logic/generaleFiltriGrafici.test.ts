import { describe, expect, it } from "vitest";
import { categorieFiltro, gruppoFonte, totaliRigheFiltrate } from "@/lib/orders/generali/filtriGrafici";
import { composizioneCosti } from "@/lib/orders/generali/graficiPanoramica";
import { documentoNelFiltro } from "@/lib/orders/generali/documentiFiltri";
import type { CasellaDocumento } from "@/lib/orders/generali/documenti";
import type { RigaConfronto } from "@/lib/orders/generali/pianoConti";

describe("filtri dei grafici della generale", () => {
  it("trasmette tutte le categorie della fetta Altri, con lo stesso totale", () => {
    const c = composizioneCosti(Array.from({ length: 9 }, (_, i) => ({ categoria: `cat_${i}`, valore: i + 1 })));
    const altri = c.categorie.find(c => c.id === "altre-categorie")!;
    expect(altri.categorie).toEqual(["cat_3", "cat_2", "cat_1", "cat_0"]);
    expect(altri.valore).toBe(10);
    expect(categorieFiltro(altri.categorie.join(","))).toEqual(altri.categorie);
  });
  it("normalizza la selezione delle categorie e scarta valori estranei", () => {
    expect(categorieFiltro("terreno,terreno,generali,<script>,a/b")).toEqual(["terreno", "generali"]);
    expect(categorieFiltro(null)).toEqual([]);
  });
  it("somma solo le righe filtrate e mantiene le rettifiche con segno", () => {
    const righe = [{ previsto: 100, approvato: null, reale: 20.1, aFinire: 79.9, stima: 100, scostamento: 0 }, { previsto: 0, approvato: null, reale: -5, aFinire: 0, stima: -5, scostamento: -5 }] as RigaConfronto[];
    expect(totaliRigheFiltrate(righe)).toEqual({ previsto: 100, approvato: null, reale: 15.1, aFinire: 79.9, stima: 95, scostamento: -5 });
  });
  it("il gruppo investitori comprende capitale e prestiti, il debito banca e finanziamenti", () => {
    expect(["propri", "capitale", "prestito", "banca", "finanziamento"].map(t => gruppoFonte(t as Parameters<typeof gruppoFonte>[0]))).toEqual(["propri", "investitori", "investitori", "debito", "debito"]);
  });
  it("i filtri documentali corrispondono ai contatori e distinguono i facoltativi", () => {
    const c = (stato: CasellaDocumento["stato"], obbligatoria = true) => ({ stato, obbligatoria }) as CasellaDocumento;
    expect(documentoNelFiltro(c("mancante", false), "mancanti")).toBe(false);
    expect(documentoNelFiltro(c("mancante"), "mancanti")).toBe(true);
    expect(documentoNelFiltro(c("in_scadenza"), "presenti")).toBe(true);
    expect(documentoNelFiltro(c("scaduto"), "presenti")).toBe(false);
    expect(documentoNelFiltro(c("in_scadenza", false), "in_scadenza")).toBe(true);
    expect(documentoNelFiltro(c("non_serve"), "tutti")).toBe(true);
  });
});
