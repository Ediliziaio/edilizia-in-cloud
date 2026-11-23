import { describe, expect, it } from "vitest";
import { suggerisciComuniUrbanistica } from "@/lib/planimetrie/fontiUrbanistiche";

const primo = (testo: string) => suggerisciComuniUrbanistica(testo)[0]?.comune;

describe("ricerca del comune per le regole urbanistiche (23/11/2026)", () => {
  it("trova il comune anche da un indirizzo incollato o con il CAP", () => {
    expect(primo("Via Garibaldi 26, 21100 Varese")).toBe("Varese");
    expect(primo("Via Roma 1, 00100 Roma (RM)")).toBe("Roma");
    expect(primo("milano 20100")).toBe("Milano");
  });
  it("senza articolo eliso il capoluogo viene prima", () => {
    expect(primo("aquila")).toBe("L'Aquila");
    expect(primo("spezia")).toBe("La Spezia");
  });
  it("scritto attaccato, senza apostrofo né spazi", () => {
    expect(primo("santangelo lodigiano")).toBe("Sant'Angelo Lodigiano");
  });
  it("accenti e maiuscole non contano, i nomi bilingui sì", () => {
    expect(primo("Cantu")).toBe("Cantù");
    expect(primo("  FORLI ")).toBe("Forlì");
    expect(primo("Bozen")).toBe("Bolzano/Bozen");
  });
});
