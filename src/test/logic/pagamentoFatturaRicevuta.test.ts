import { describe, expect, it } from "vitest";
import { etichettaModalitaPagamento, pagamentoDaMostrare } from "@/lib/fatturazione/pagamentoFatturaRicevuta";

describe("pagamento della fattura ricevuta, da mostrare", () => {
  it("rate con metodo, ritenuta d'acconto e netto da pagare", () => {
    const p = pagamentoDaMostrare({
      piano_pagamento: [{ scadenza: "2026-11-30", importo: 8550.4, modalita: "MP05" }],
      condizioni_pagamento: "TP02", ritenuta_importo: 1600, ritenuta_aliquota: 20, netto_a_pagare: 8550.4,
    });
    expect(p?.rate).toEqual([{ scadenza: "2026-11-30", importo: 8550.4, metodo: "Bonifico", pagataIl: null }]);
    expect(p?.condizioni).toBe("pagamento completo");
    expect(p?.ritenuta).toEqual({ importo: 1600, aliquota: 20 });
    expect(p?.netto).toBe(8550.4);
  });
  it("senza niente da dire non mostra la sezione", () => {
    expect(pagamentoDaMostrare({ netto_a_pagare: 100 })).toBeNull();
    expect(pagamentoDaMostrare(null)).toBeNull();
  });
  it("RiBa e codici sconosciuti", () => {
    expect(etichettaModalitaPagamento("MP12")).toBe("RiBa");
    expect(etichettaModalitaPagamento("MP99")).toBe("MP99");
    expect(etichettaModalitaPagamento(null)).toBeNull();
  });
});
