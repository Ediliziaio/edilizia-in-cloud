import { describe, expect, it } from "vitest";
import { descrizioneSenzaControparte } from "@/components/orders/QuadroPagamentiCommessa";

describe("titolo del pagamento senza il fornitore ripetuto", () => {
  it("toglie la coda «- Fornitore» quando il fornitore è già scritto prima", () => {
    expect(descrizioneSenzaControparte("Fattura SIM-PARZ-FT-001 - Edilmateriali Roma S.r.l.", "Edilmateriali Roma S.r.l.")).toBe("Fattura SIM-PARZ-FT-001");
    // i punti nel nome non sono «qualsiasi carattere»
    expect(descrizioneSenzaControparte("OdA 12 - Edilmateriali RomaXSXrXlX", "Edilmateriali Roma S.r.l.")).toBe("OdA 12 - Edilmateriali RomaXSXrXlX");
  });
  it("lascia com'è quando non c'è ripetizione, e non svuota mai il testo", () => {
    expect(descrizioneSenzaControparte("Noleggio ponteggio marzo", "Ponteggi Sud")).toBe("Noleggio ponteggio marzo");
    expect(descrizioneSenzaControparte("Ponteggi Sud", "Ponteggi Sud")).toBe("Ponteggi Sud");
    expect(descrizioneSenzaControparte(null, "Ponteggi Sud")).toBe("");
    expect(descrizioneSenzaControparte("Fattura 3 · ponteggi sud", "Ponteggi Sud")).toBe("Fattura 3");
  });
});
