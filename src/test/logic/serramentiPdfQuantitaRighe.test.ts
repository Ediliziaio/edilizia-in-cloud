import { describe, expect, it } from "vitest";
import { groupSerramentiAdvanced } from "@/components/serramenti/SerramentoPDF";
import type { SrSerramentoRow } from "@/types/serramenti";
import { serramentiRoomSummary } from "@/lib/moduli-vendita/serramentiRoomSummary";

describe("PDF commercial line quantities", () => {
  it("keeps different dimensions distinct in both the technical table and room summary", () => {
    const rows = [
      { id: "first", quantita: 1, larghezza_mm: 1300, altezza_mm: 2225 },
      { id: "second", quantita: 2, larghezza_mm: 1266, altezza_mm: 2230 },
    ].map((r) => ({ ...r, family_id: "same-family", tipologia: "finestra_2ante", tipologia_label: "Porta Finestra 2 Ante" } as unknown as SrSerramentoRow));
    const groups = groupSerramentiAdvanced(rows);
    expect(groups.map((r) => [r.larghezza, r.altezza, r.quantita])).toEqual([[1300, 2225, 1], [1266, 2230, 2]]);
    const products = serramentiRoomSummary(rows)[0].products;
    expect(products.map((r) => r.quantity)).toEqual([1, 2]);
    expect(products[0].label).toContain("1300 × 2225 mm");
    expect(products[1].label).toContain("1266 × 2230 mm");
  });
  it("keeps identical lines with quantity 2 and 1 separate, as in Millefiorini", () => {
    const rows = [2, 1].map((quantita, i) => ({
      id: `row-${i}`, family_id: "family", tipologia: "finestra_2ante",
      tipologia_label: "Porta Finestra 1 Anta", quantita,
      larghezza_mm: 690, altezza_mm: 2230, prezzo_totale: quantita * 100,
      valori_assi: { apertura: "dx" }, disegno_config: { v: 1, tipologia: "porta_finestra_1_anta" },
    } as unknown as SrSerramentoRow));
    const output = groupSerramentiAdvanced(rows);
    expect(output.map((r) => r.quantita)).toEqual([2, 1]);
    expect(output.map((r) => r.serramento_ids)).toEqual([["row-0"], ["row-1"]]);
    expect(output.reduce((total, r) => total + r.prezzo_totale, 0)).toBe(300);
    expect(rows.map((r) => r.quantita)).toEqual([2, 1]);
  });
});
