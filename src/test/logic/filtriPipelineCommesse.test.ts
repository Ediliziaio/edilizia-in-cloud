import { describe, expect, it } from "vitest";
import { ordiniNelleFasi } from "@/lib/orders/filtriPipeline";

describe("filtri delle fasi della pipeline", () => {
  const assegnazioni = { a: "serramenti-rilievo", b: "serramenti-posa", c: "fotovoltaico-posa", d: "serramenti-posa" };
  it("combina selezione, inclusione ed esclusione prima della paginazione", () => {
    expect(ordiniNelleFasi(assegnazioni, "serramenti-posa", ["serramenti-posa", "serramenti-rilievo"], ["serramenti-rilievo"])).toEqual(["b", "d"]);
    expect(ordiniNelleFasi(assegnazioni, null, ["serramenti-posa"], ["serramenti-posa"])).toEqual([]);
  });
});
