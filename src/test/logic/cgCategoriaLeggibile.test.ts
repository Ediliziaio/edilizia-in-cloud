import { describe, expect, it } from "vitest";
import { categoriaLeggibile } from "@/lib/controlloGestione/formatCG";

describe("categoria leggibile in Configurazione", () => {
  it("toglie i trattini bassi e scioglie le abbreviazioni", () => {
    expect(categoriaLeggibile("amm_immobili")).toBe("Ammortamento immobili");
    expect(categoriaLeggibile("consulenza_lavoro")).toBe("Consulenza lavoro");
    expect(categoriaLeggibile("sopravvenienze_p")).toBe("Sopravvenienze passive");
    expect(categoriaLeggibile("f24")).toBe("F24");
    expect(categoriaLeggibile("Stipendi")).toBe("Stipendi");
  });
});
