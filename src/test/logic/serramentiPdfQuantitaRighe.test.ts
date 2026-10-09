import { describe, expect, it } from "vitest";
import { groupSerramentiAdvanced } from "@/components/serramenti/SerramentoPDF";
import type { SrSerramentoRow } from "@/types/serramenti";

describe("PDF commercial line quantities", () => {
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
