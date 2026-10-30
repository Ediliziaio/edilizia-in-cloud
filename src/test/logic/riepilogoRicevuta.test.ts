import { describe, expect, it } from "vitest";
import { etichettaAliquota, nomeNatura, nomeTipoDocumento, riepilogoIvaLeggibile, righeLeggibili } from "@/lib/fatturazione/riepilogoRicevuta";

// 30/10/2026 — Su 14.320 fatture ricevute solo 326 avevano l'XML: alle altre la
// pagina mostrava «non disponibile» o l'XML grezzo, anche se righe e totali
// erano già nel database. Il riepilogo si costruisce da lì, con le due forme
// che scrivono gli importatori.

describe("righe di una fattura ricevuta, da qualunque importatore", () => {
  it("forma dell'XML (openapi, ricevi-sdi): aliquota come testo, natura", () => {
    const r = righeLeggibili([
      { numero_linea: 1, descrizione: "Posa cartongesso", quantita: "12.50", prezzo_unitario: "20.00", imponibile: "250.00", aliquota_iva: "0.00", natura_iva: "N6.3" },
    ]);
    expect(r).toEqual([{ descrizione: "Posa cartongesso", quantita: 12.5, prezzoUnitario: 20, imponibile: 250, aliquota: 0, natura: "N6.3" }]);
  });

  it("forma di Fatture in Cloud: aliquota numero, niente natura", () => {
    const r = righeLeggibili([{ descrizione: "ZAVORRA CLS 13 X 100 X H21", quantita: 4, prezzo_unitario: 20, aliquota_iva: 22, imponibile: 80, imposta: 17.6, totale: 97.6 }]);
    expect(r[0]).toMatchObject({ quantita: 4, prezzoUnitario: 20, imponibile: 80, aliquota: 22, natura: null });
  });

  it("senza imponibile lo ricava da quantità × prezzo; le righe vuote si tolgono", () => {
    const r = righeLeggibili([{ descrizione: "Sacchi", quantita: 3, prezzo_unitario: 4.1 }, { descrizione: "", imponibile: 0 }, null, "x"]);
    expect(r).toHaveLength(1);
    expect(r[0].imponibile).toBe(12.3);
  });

  it("non è un elenco: nessuna riga, nessun errore", () => {
    expect(righeLeggibili(null)).toEqual([]);
    expect(righeLeggibili({})).toEqual([]);
  });
});

describe("riepilogo IVA", () => {
  it("quello dell'XML vince", () => {
    const righe = righeLeggibili([{ descrizione: "a", imponibile: 100, aliquota_iva: 22 }]);
    expect(riepilogoIvaLeggibile([{ aliquota: "22.00", natura: null, imponibile: "100.00", imposta: "22.00" }], righe))
      .toEqual([{ aliquota: 22, natura: null, imponibile: 100, imposta: 22 }]);
  });

  it("senza riepilogo (Fatture in Cloud) si ricava dalle righe, per aliquota", () => {
    const righe = righeLeggibili([
      { descrizione: "a", imponibile: 7.45, aliquota_iva: 22 },
      { descrizione: "b", imponibile: 22.34, aliquota_iva: 22 },
      { descrizione: "c", imponibile: 50, aliquota_iva: 10 },
    ]);
    expect(riepilogoIvaLeggibile([], righe)).toEqual([
      { aliquota: 22, natura: null, imponibile: 29.79, imposta: 6.55 },
      { aliquota: 10, natura: null, imponibile: 50, imposta: 5 },
    ]);
  });
});

describe("parole al posto dei codici", () => {
  it("tipo documento e natura IVA", () => {
    expect(nomeTipoDocumento("TD04")).toBe("Nota di credito");
    expect(nomeTipoDocumento("TD99")).toBe("TD99");
    expect(nomeNatura("N6.3")).toBe("Reverse charge (subappalto edile)");
    expect(nomeNatura("N6.12")).toBe("Reverse charge");
    expect(etichettaAliquota({ aliquota: 22, natura: null })).toBe("IVA 22%");
    expect(etichettaAliquota({ aliquota: 0, natura: "N6.3" })).toBe("Reverse charge (subappalto edile)");
  });
});
