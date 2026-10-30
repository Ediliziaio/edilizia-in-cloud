import { describe, expect, it } from "vitest";
import { percorsiPlanimetrie } from "@/lib/planimetrie/render/percorsi";
import { tipoStanzaDaDestinazione } from "@/lib/planimetrie/render/renderDallaPianta";

describe("render dalla pianta — browser", () => {
  it("dalla destinazione del locale al tipo di stanza del render", () => {
    expect(tipoStanzaDaDestinazione("camera")).toBe("camera_da_letto");
    expect(tipoStanzaDaDestinazione("disimpegno")).toBe("corridoio");
    expect(tipoStanzaDaDestinazione("bagno")).toBe("bagno");
    expect(tipoStanzaDaDestinazione("balcone")).toBe("altro");
  });

  it("indirizzi delle pagine", () => {
    expect(percorsiPlanimetrie.renderStanza("p1", "l 1", { livelloId: "pt", ambito: "progetto:A" }))
      .toBe("/azienda/render/planimetrie/p1/stanza/l%201?livello=pt&ambito=progetto%3AA");
    expect(percorsiPlanimetrie.nuova("documento")).toBe("/azienda/render/planimetrie/nuova?da=documento");
  });
});
