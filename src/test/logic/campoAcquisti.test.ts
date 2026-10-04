import { describe, expect, it } from "vitest";
import { descriviStato, mappaLetturaDocumento, tipoDocumentoDa, totaleRighe } from "@/lib/campo/acquisti";

describe("Lettura della bolla o dello scontrino", () => {
  const ddt = {
    intestazione: { numero_ddt: "DDT-123", data_ddt: "2026-10-03" },
    mittente: { ragione_sociale: "Tecnomat S.p.A." },
    righe_merce: [
      { codice_articolo: "SIL-1", descrizione: "Silicone neutro", unita_misura: "PZ", quantita: 2, prezzo_unitario_eur: 8.5, importo_eur: 17 },
      { descrizione: "Viti inox 4x40", unita_misura: "conf", quantita: 1, prezzo_unitario_eur: null as number | null, importo_eur: 28.5 },
    ],
    totali: { imponibile_eur: 37.3, iva_eur: 8.2, totale_documento_eur: 45.5 },
    confidence: 0.92,
  };

  it("porta fornitore, numero, data, prodotti e totale nel modulo", () => {
    const l = mappaLetturaDocumento(ddt);
    expect(l).toMatchObject({ fornitore: "Tecnomat S.p.A.", numero: "DDT-123", data: "2026-10-03", totale: 45.5, daControllare: false });
    expect(l.righe).toEqual([
      expect.objectContaining({ descrizione: "Silicone neutro", codice: "SIL-1", quantita: 2, unita: "pz", prezzo_unitario: 8.5, importo: 17 }),
      expect.objectContaining({ descrizione: "Viti inox 4x40", quantita: 1, unita: "conf", importo: 28.5 }),
    ]);
  });

  it("senza il totale scritto usa imponibile + IVA, poi la somma delle righe", () => {
    expect(mappaLetturaDocumento({ ...ddt, totali: { imponibile_eur: 100, iva_eur: 22 } }).totale).toBe(122);
    expect(mappaLetturaDocumento({ ...ddt, totali: {} }).totale).toBe(45.5);
  });

  it("non inventa niente: campi non letti restano vuoti e la lettura va controllata", () => {
    const l = mappaLetturaDocumento({ righe_merce: [{ descrizione: "  ", quantita: 3 }], confidence: 0.9 });
    expect(l).toMatchObject({ fornitore: "", numero: "", data: "", totale: null, righe: [], daControllare: true });
  });

  it("una lettura poco sicura chiede di controllare, anche se completa", () => {
    expect(mappaLetturaDocumento({ ...ddt, confidence: 0.5 }).daControllare).toBe(true);
  });

  it("una data non valida viene scartata, una quantità nulla vale 1", () => {
    const l = mappaLetturaDocumento({ ...ddt, intestazione: { numero_ddt: "1", data_ddt: "03/10/2026" }, righe_merce: [{ descrizione: "Tubo", quantita: 0 }] });
    expect(l.data).toBe("");
    expect(l.righe[0].quantita).toBe(1);
  });

  it("regge un documento vuoto o rotto senza esplodere", () => {
    expect(mappaLetturaDocumento(null).righe).toEqual([]);
    expect(mappaLetturaDocumento("boh").totale).toBeNull();
  });
});

describe("Totale dei prodotti", () => {
  it("somma gli importi, oppure prezzo × quantità, e non indovina se manca qualcosa", () => {
    expect(totaleRighe([{ descrizione: "a", quantita: 2, prezzo_unitario: 1.1 }, { descrizione: "b", quantita: 1, importo: 3 }])).toBe(5.2);
    expect(totaleRighe([{ descrizione: "a", quantita: 2 }, { descrizione: "b", quantita: 1, importo: 3 }])).toBeNull();
    expect(totaleRighe([])).toBeNull();
  });
});

describe("Tipo di documento e stato letti dall'operaio", () => {
  it("lo scontrino è di chi ha pagato; il resto è una bolla", () => {
    expect(tipoDocumentoDa("pagato_da_me")).toBe("scontrino");
    expect(tipoDocumentoDa("conto_azienda")).toBe("bolla");
    expect(tipoDocumentoDa("ritiro_ordine")).toBe("bolla");
  });
  it("dice in parole semplici a che punto è", () => {
    const base = { modalita: "pagato_da_me" as const, motivo_rifiuto: null as string | null };
    expect(descriviStato({ ...base, stato: "da_verificare", rimborso_stato: "da_rimborsare" })).toEqual({ testo: "In verifica dall’ufficio", tono: "attesa" });
    expect(descriviStato({ ...base, stato: "registrato", rimborso_stato: "da_rimborsare" }).testo).toBe("Registrata · rimborso in programma");
    expect(descriviStato({ ...base, stato: "registrato", rimborso_stato: "rimborsato" }).testo).toBe("Registrata · rimborsata");
    expect(descriviStato({ ...base, modalita: "conto_azienda", stato: "registrato", rimborso_stato: "non_dovuto" }).testo).toBe("Registrata dall’ufficio");
    expect(descriviStato({ ...base, stato: "rifiutato", rimborso_stato: "non_dovuto", motivo_rifiuto: "Illeggibile" })).toEqual({ testo: "Non accettata: Illeggibile", tono: "no" });
  });
});
