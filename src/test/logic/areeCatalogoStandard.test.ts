import { describe, expect, it } from "vitest";
import { AREE_STANDARD, areaDiVerticale, chiaveTesto } from "@/lib/listino/areeStandard";
import { areeDaAggiungere } from "@/lib/listino/organizzaListino";
import { areePerTariffe, tariffaNellArea } from "@/lib/tariffe/areeTariffe";

describe("catalogo standard per tutte le aree", () => {
  it("copre undici aree senza chiavi o tipologie duplicate", () => {
    expect(AREE_STANDARD).toHaveLength(11);
    expect(new Set(AREE_STANDARD.map((a) => a.chiave)).size).toBe(11);
    for (const area of AREE_STANDARD) {
      expect(areaDiVerticale(area.verticale)).toBe(area.chiave);
      expect(area.tipologie.length).toBeGreaterThanOrEqual(5);
      expect(new Set(area.tipologie.map((t) => chiaveTesto(t.nome))).size).toBe(area.tipologie.length);
    }
  });
  it("non propone di ricreare aree già presenti", () => {
    expect(areeDaAggiungere(AREE_STANDARD)).toEqual([]);
  });
  it("non tratta gli esempi di prodotto come prezzi o articoli importati", () => {
    for (const area of AREE_STANDARD) for (const tipo of area.tipologie) {
      expect(tipo).not.toHaveProperty("prezzo");
      expect(tipo).not.toHaveProperty("company_id");
      for (const esempio of tipo.esempi ?? []) expect(esempio.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("manodopera organizzata per area", () => {
  it("riconosce etichette storiche senza mescolare prodotti o prezzi", () => {
    expect(tariffaNellArea("serramentista", "area:serramenti")).toBe(true);
    expect(tariffaNellArea("bagno", "area:bagni")).toBe(true);
    expect(tariffaNellArea("clima", "area:climatizzazione")).toBe(true);
    expect(tariffaNellArea("tetto", "area:tetti")).toBe(true);
    expect(tariffaNellArea("caldaie", "area:termoidraulico")).toBe(true);
    expect(tariffaNellArea("serramentista", "area:bagni")).toBe(false);
  });
  it("distingue voci comuni da quelle assegnate", () => {
    for (const value of [null, undefined, "", "generico", "generale"]) {
      expect(tariffaNellArea(value, "global")).toBe(true);
      expect(tariffaNellArea(value, "area:bagni")).toBe(false);
    }
    expect(tariffaNellArea("bagno", "global")).toBe(false);
    expect(tariffaNellArea("bagno", "current", "bagni")).toBe(true);
    expect(tariffaNellArea("settore_custom", "all")).toBe(true);
  });
  it("mantiene disponibili le aree personalizzate senza duplicare alias", () => {
    const aree = areePerTariffe([{ vertical_associato: "bagno" }, { vertical_associato: "bagni" }, { vertical_associato: "restauro" }, { vertical_associato: null }]);
    expect(aree).toHaveLength(12);
    expect(aree.filter((a) => a.chiave === "bagni")).toHaveLength(1);
    expect(aree).toContainEqual({ chiave: "restauro", nome: "Restauro" });
  });
});
