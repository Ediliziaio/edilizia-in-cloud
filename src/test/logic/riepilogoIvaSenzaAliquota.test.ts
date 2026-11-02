import { describe, expect, it } from "vitest";
import { riepilogoIvaLeggibile } from "@/lib/fatturazione/riepilogoRicevuta";

describe("riepilogo IVA", () => {
  it("senza aliquota ma con l'imposta, l'aliquota si ricava: non è «IVA 0%»", () => {
    expect(riepilogoIvaLeggibile([{ imponibile: 2802.97, imposta: 616.65 }], [])[0].aliquota).toBe(22);
  });
  it("l'aliquota scritta resta quella, e una fattura esente resta senza", () => {
    expect(riepilogoIvaLeggibile([{ aliquota: 10, imponibile: 100, imposta: 10 }], [])[0].aliquota).toBe(10);
    expect(riepilogoIvaLeggibile([{ aliquota: 0, natura: "N6.3", imponibile: 100, imposta: 0 }], [])[0].aliquota).toBe(0);
  });
});
