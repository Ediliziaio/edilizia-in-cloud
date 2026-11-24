import { describe, expect, it } from "vitest";
import { aliquotaLetta, formDaRicevuta, lordoDaNetto, pivaPulita } from "@/lib/costi/letturaRicevuta";

describe("letturaRicevuta", () => {
  it("compila importo, IVA, data, scadenza e descrizione da una fattura letta", () => {
    const f = formDaRicevuta({
      numero_fattura: "12/A", data_fattura: "2026-11-20", data_scadenza: "2026-12-20",
      cedente: { ragione_sociale: "Noleggi Rossi srl", piva: "IT01234567890" },
      imponibile_totale: 100, iva_totale: 22, totale_documento: 122,
      righe: [{ descrizione: "Noleggio piattaforma" }],
      riepilogo_iva: [{ aliquota: 22, imponibile: 100 }],
    });
    expect(f).toMatchObject({
      descrizione: "Noleggio piattaforma", importo: "122,00", aliquotaIva: "22",
      data: "2026-11-20", scadenza: "2026-12-20", senzaFattura: false,
      note: "Documento n. 12/A · Noleggi Rossi srl",
    });
  });

  it("non tocca i campi che l'AI non ha letto", () => {
    expect(formDaRicevuta({ totale_documento: null, data_fattura: "20/11/2026" })).toEqual({});
  });

  it("più righe: descrizione col fornitore", () => {
    expect(formDaRicevuta({ cedente: { ragione_sociale: "Comune di Milano" }, righe: [{ descrizione: "Diritti" }, { descrizione: "Bollo" }] }).descrizione)
      .toBe("Diritti – Comune di Milano");
  });

  it("aliquota dedotta da imponibile e IVA, o la prevalente nel riepilogo", () => {
    expect(aliquotaLetta({ imponibile_totale: 100, iva_totale: 10 })).toBe("10");
    expect(aliquotaLetta({ imponibile_totale: 100, iva_totale: 7 })).toBeNull();
    expect(aliquotaLetta({ riepilogo_iva: [{ aliquota: 4, imponibile: 10 }, { aliquota: 22, imponibile: 90 }] })).toBe("22");
  });

  it("IVA esclusa → lordo, e partite IVA confrontabili", () => {
    expect(lordoDaNetto(287, 22)).toBe(350.14);
    expect(pivaPulita("IT 0123 4567890")).toBe("01234567890");
  });
});
