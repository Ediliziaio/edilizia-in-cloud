import { describe, expect, it } from "vitest";
import { imponibileIvaFornitori, importoFornitori } from "@/lib/fatturazione/noteDiCredito";

const f = (tipo: string, imponibile: number | null, iva: number | null, totale: number | null) =>
  ({ tipo_documento: tipo, imponibile_totale: imponibile, iva_totale: iva, totale_documento: totale });

describe("imponibile e IVA sopra l'elenco delle ricevute", () => {
  it("somma le fatture e sottrae le note di credito, come il totale", () => {
    const righe = [f("TD01", 1000, 220, 1220), f("TD01", 500, 110, 610), f("TD04", 100, 22, 122)];
    expect(imponibileIvaFornitori(righe)).toEqual({ imponibile: 1400, iva: 308 });
    // Imponibile + IVA deve fare il totale che si vede accanto.
    expect(importoFornitori(righe)).toBe(1708);
  });

  it("l'autofattura porta l'imponibile ma non l'IVA, che si versa con la liquidazione", () => {
    expect(imponibileIvaFornitori([f("TD17", 800, 176, 976)])).toEqual({ imponibile: 800, iva: 0 });
  });

  it("senza IVA scritta la ricava dal totale; senza importi non inventa niente", () => {
    expect(imponibileIvaFornitori([f("TD01", 1000, null, 1220)])).toEqual({ imponibile: 1000, iva: 220 });
    expect(imponibileIvaFornitori([f("TD01", null, null, null)])).toEqual({ imponibile: 0, iva: 0 });
  });
});
