/**
 * Le due anteprime della fattura (15/11/2026): il PDF (copia di cortesia) e il
 * contenuto del file XML che parte allo SDI devono dire la stessa cosa.
 *
 * Qui si generano tutti e due dallo stesso documento — una fattura ordinaria a
 * un'azienda e una fattura alla PA con contratto, ordine, convenzione, CIG, CUP,
 * lotto, ufficio e split payment — e si controlla, dato per dato, che quello che
 * legge il cliente nel PDF sia quello che riceve l'Agenzia. Ogni XML generato
 * passa anche dallo schema ufficiale FatturaPA 1.2.2.
 */
import { describe, expect, it, vi } from "vitest";
import { generateXML } from "../../../supabase/functions/_shared/generateXML";
import { documentoHtml } from "../../../supabase/functions/generate-native-pdf/documentoHtml";
import { vociRiferimenti } from "../../../supabase/functions/_shared/documentoFiscaleVista";
import { sezioniFatturaXml, valoriXml, versioneFatturaXml, type NodoXml } from "@/lib/fatturazione/xmlLeggibile";

vi.mock("../../../supabase/functions/_shared/generateXML", async (originale) =>
  (await import("../helpers/xsdSuOgniXml")).conRegistro(await originale()));
import { ogniXmlNelloSchema } from "../helpers/xsdSuOgniXml";
ogniXmlNelloSchema();

const azienda = {
  ragione_sociale: "Demo Azienda 2 S.r.l.", forma_giuridica: "SRL", partita_iva: "99999999999", codice_fiscale: "99999999999",
  indirizzo_via: "Via dei Cantieri", indirizzo_numero_civico: "24", indirizzo_cap: "20099", indirizzo_comune: "Sesto San Giovanni",
  indirizzo_provincia: "MI", indirizzo_nazione: "IT", regime_fiscale: "RF01", codice_sdi: "ABCDEFG", pec: "demo2@pec.esempio.it",
};

const rigaLavori = {
  id: "r1", numero_linea: 1, descrizione: "Lavori di manutenzione dell'edificio scolastico", quantita: 120,
  unita_misura: "m2", prezzo_unitario: 85, aliquota_iva: "22", imponibile: 10200, imposta: 2244, totale_riga: 12444,
};
const rigaSerramenti = {
  id: "r2", numero_linea: 2, descrizione: "Fornitura serramenti", quantita: 6, unita_misura: "pz",
  prezzo_unitario: 333.33, aliquota_iva: "10", imponibile: 1999.98, imposta: 200, totale_riga: 2199.98,
};

const ordinaria = {
  tipo: "fattura", numero: "FT 12/26", data_emissione: "2026-11-15", data_scadenza: "2026-12-15", stato: "emessa",
  cliente_snapshot: {
    tipo_cliente: "B2B", ragione_sociale: "Edile Rossi srl", partita_iva: "01234567897", codice_sdi: "M5UXCR1",
    pec: "rossi@pec.it", indirizzo_via: "Via Roma 10", indirizzo_cap: "20100", indirizzo_comune: "Milano",
    indirizzo_provincia: "MI", indirizzo_nazione: "IT",
  },
  righe: [rigaSerramenti],
  riepilogo_iva: [{ aliquota: "10", imponibile: 1999.98, imposta: 200, esigibilita: "I" }],
  imponibile_totale: 1999.98, iva_totale: 200, totale_documento: 2199.98, totale_da_pagare: 2199.98,
  metodo_pagamento_codice: "MP05", iban_pagamento: "IT00X9999900000000000000001",
  scadenze_pagamento: [{ numero_rata: 1, data_scadenza: "2026-12-15", importo: 2199.98, metodo_pagamento: "MP05" }],
  note_documento: "Garanzia 10 anni.",
};

const pa = {
  tipo: "fattura_pa", numero: "FT 13/26", data_emissione: "2026-11-15", stato: "bozza", serie: "A",
  cliente_snapshot: {
    tipo_cliente: "PA", ragione_sociale: "Comune di Prova", codice_fiscale: "80012345676", codice_sdi: "UFXYZ1",
    pec: "protocollo@pec.comunediprova.example", indirizzo_via: "Piazza del Municipio 1", indirizzo_cap: "00100",
    indirizzo_comune: "Prova", indirizzo_provincia: "RM", indirizzo_nazione: "IT",
    ufficio_pa: { id: "u1", codice: "UFXYZ1", descrizione: "Ufficio di fatturazione", anagrafica_id: "a1", origine: "commessa" },
  },
  righe: [rigaLavori, rigaSerramenti],
  riepilogo_iva: [
    { aliquota: "22", imponibile: 10200, imposta: 2244, esigibilita: "S" },
    { aliquota: "10", imponibile: 1999.98, imposta: 200, esigibilita: "S" },
  ],
  esigibilita_iva: "S",
  causale: ["Scissione dei pagamenti ai sensi dell'art. 17-ter del DPR 633/72"],
  imponibile_totale: 12199.98, iva_totale: 2444, totale_documento: 14643.98, totale_da_pagare: 12199.98,
  metodo_pagamento_codice: "MP05", iban_pagamento: "IT00X9999900000000000000001",
  scadenze_pagamento: [{ numero_rata: 1, data_scadenza: "2026-12-15", importo: 12199.98, metodo_pagamento: "MP05" }],
  riferimenti_pa: [
    {
      chiave: "k1", tipo: "contratto", numero: "Rep. 1234/2026", data: "2026-03-02", num_item: "Lotto 1",
      cig: "1234567ABC", cup: "J51B21000140006", righe_id: ["r1"], numeri_linea: [1], origine: "commessa",
      order_id: "o1", order_code: "DEMO2-0013", cig_non_dovuto: false, cup_non_dovuto: false,
    },
    {
      chiave: "k2", tipo: "ordine_acquisto", numero: "OdA 77/2026", data: "2026-05-10", cig: "Z1A2B3C4D5",
      righe_id: ["r1"], numeri_linea: [1], origine: "commessa", order_id: "o1", order_code: "DEMO2-0013",
      cig_non_dovuto: false, cup_non_dovuto: false,
    },
    {
      chiave: "k3", tipo: "convenzione", numero: "Conv. 5/2026", data: "2026-06-01", cup: "C33D21000780001",
      righe_id: ["r2"], numeri_linea: [2], origine: "commessa", order_id: "o2", order_code: "DEMO2-0015",
      cig_non_dovuto: true, cig_motivo_esclusione: "Affidamento in house: CIG non dovuto", cup_non_dovuto: false,
    },
  ],
};

/** Tutti i valori di un elemento nelle sezioni lette (come li legge chi guarda l'anteprima). */
function valoriDelle(sezioni: NodoXml[], tag: string): string[] {
  const out: string[] = [];
  const visita = (n: NodoXml) => {
    if (n.tag === tag && n.valore) out.push(n.valore);
    n.figli.forEach(visita);
  };
  sezioni.forEach(visita);
  return out;
}

const testoSenzaTag = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");

describe("Fattura a un'azienda: PDF e XML dicono la stessa cosa", () => {
  const xml = generateXML(ordinaria as never, azienda as never, "00001");
  const sezioni = sezioniFatturaXml(xml);
  const html = documentoHtml(ordinaria as never, azienda as never);
  const testo = testoSenzaTag(html);

  it("il file è quello dei privati (FPR12) e l'anteprima lo dice", () => {
    expect(versioneFatturaXml(xml)).toBe("FPR12");
    expect(valoriDelle(sezioni, "FormatoTrasmissione")[0]).toContain("verso privati");
  });

  it("numero, data, totale e scadenza coincidono nei due documenti", () => {
    expect(valoriDelle(sezioni, "Numero")).toContain("FT 12/26");
    expect(valoriDelle(sezioni, "Data")[0]).toBe("15/11/2026");
    expect(valoriDelle(sezioni, "ImportoTotaleDocumento")[0]).toBe("2.199,98 €");
    expect(valoriDelle(sezioni, "DataScadenzaPagamento")[0]).toBe("15/12/2026");
    expect(testo).toContain("FT 12/26");
    expect(testo).toContain("15/11/2026");
    expect(testo).toContain("2.199,98 €");
    expect(testo).toContain("15/12/2026");
  });

  it("cliente, codice destinatario e IBAN coincidono", () => {
    expect(valoriDelle(sezioni, "Denominazione")).toContain("Edile Rossi srl");
    expect(valoriDelle(sezioni, "CodiceDestinatario")[0]).toBe("M5UXCR1");
    expect(valoriDelle(sezioni, "IBAN")[0]).toBe("IT00X9999900000000000000001");
    expect(testo).toContain("Edile Rossi srl");
    expect(testo).toContain("Codice destinatario M5UXCR1");
    expect(testo).toContain("IT00 X999 9900 0000 0000 0000 001");
  });

  it("la riga e il riepilogo IVA hanno gli stessi numeri", () => {
    expect(valoriDelle(sezioni, "PrezzoTotale")[0]).toBe("1.999,98 €");
    expect(valoriDelle(sezioni, "AliquotaIVA")).toContain("10%");
    expect(valoriDelle(sezioni, "Imposta")[0]).toBe("200,00 €");
    expect(testo).toContain("1.999,98 €");
    expect(testo).toContain("200,00 €");
  });
});

describe("Fattura alla PA: niente si perde per strada", () => {
  const xml = generateXML(pa as never, azienda as never, "00002");
  const sezioni = sezioniFatturaXml(xml);
  const html = documentoHtml(pa as never, azienda as never);
  const testo = testoSenzaTag(html);

  it("il file è quello della PA (FPA12) e il codice destinatario è l'ufficio", () => {
    expect(versioneFatturaXml(xml)).toBe("FPA12");
    expect(valoriXml(xml, "CodiceDestinatario")[0]).toBe("UFXYZ1");
    expect(valoriDelle(sezioni, "CodiceDestinatario")[0]).toBe("UFXYZ1");
    // Nel PDF l'ufficio si legge, con la sua descrizione.
    expect(testo).toContain("Ufficio destinatario");
    expect(testo).toContain("UFXYZ1 · Ufficio di fatturazione");
  });

  it("contratto, ordine e convenzione: nel PDF come nell'XML, con CIG, CUP, lotto e righe", () => {
    expect(valoriXml(xml, "CodiceCIG")).toEqual(["Z1A2B3C4D5", "1234567ABC"]);
    expect(valoriXml(xml, "CodiceCUP")).toEqual(["J51B21000140006", "C33D21000780001"]);
    expect(valoriXml(xml, "NumItem")).toEqual(["Lotto 1"]);

    expect(testo).toContain("Contratto n. Rep. 1234/2026 · del 02/03/2026 · lotto Lotto 1 · CUP J51B21000140006 · CIG 1234567ABC · riga 1");
    expect(testo).toContain("Ordine d'acquisto n. OdA 77/2026 · del 10/05/2026 · CIG Z1A2B3C4D5 · riga 1");
    expect(testo).toContain("Convenzione n. Conv. 5/2026 · del 01/06/2026 · CUP C33D21000780001 · CIG non dovuto");

    const voci = vociRiferimenti(pa as never).map((v) => `${v.etichetta}: ${v.valore}`);
    expect(voci.some((v) => v.startsWith("Contratto:"))).toBe(true);
    expect(voci.some((v) => v.startsWith("Ordine d'acquisto:"))).toBe(true);
    expect(voci.some((v) => v.startsWith("Convenzione:"))).toBe(true);
  });

  it("split payment: l'XML lo dichiara e il PDF spiega perché il cliente paga meno", () => {
    expect(valoriXml(xml, "EsigibilitaIVA")).toEqual(["S", "S"]);
    expect(valoriDelle(sezioni, "EsigibilitaIVA")[0]).toContain("scissione dei pagamenti");
    expect(testo).toContain("Scissione dei pagamenti ai sensi dell'art. 17-ter");
    expect(testo).toContain("IVA in scissione pagamenti");
    // Totale documento e netto a pagare: gli stessi numeri nei due documenti.
    expect(valoriDelle(sezioni, "ImportoTotaleDocumento")[0]).toBe("14.643,98 €");
    expect(testo).toContain("14.643,98 €");
    expect(testo).toContain("12.199,98 €");
    expect(valoriDelle(sezioni, "ImportoPagamento")[0]).toBe("12.199,98 €");
  });

  it("le due righe stanno in tutti e due, con imponibile e aliquota", () => {
    expect(valoriXml(xml, "NumeroLinea")).toEqual(["1", "2"]);
    expect(valoriDelle(sezioni, "PrezzoTotale")).toEqual(["10.200,00 €", "1.999,98 €"]);
    expect(testo).toContain("Lavori di manutenzione dell'edificio scolastico");
    expect(testo).toContain("Fornitura serramenti");
    expect(testo).toContain("10.200,00 €");
    expect(testo).toContain("1.999,98 €");
  });

  it("la bozza lo dice al cliente, e l'anteprima XML tiene i nomi dello schema tradotti", () => {
    expect(testo).toContain("Bozza da verificare");
    const titoli = sezioni.map((s) => s.etichetta);
    expect(titoli).toContain("Dati di trasmissione");
    expect(titoli).toContain("Chi emette (cedente/prestatore)");
    expect(titoli).toContain("Chi riceve (cessionario/committente)");
    expect(titoli).toContain("Dati generali");
    expect(titoli).toContain("Beni e servizi");
    expect(titoli).toContain("Pagamento");
  });
});

describe("Riferimenti vecchi (CIG e CUP sulle colonne, senza righe nuove)", () => {
  it("restano visibili nel PDF come nell'XML", () => {
    const vecchia = { ...ordinaria, riferimenti_pa: [] as unknown[], cig: "9988776655", cup: "B11C22000330004", codice_commessa_convenzione: "COMM-1" };
    const xml = generateXML(vecchia as never, azienda as never, "00003");
    expect(valoriXml(xml, "CodiceCIG")).toEqual(["9988776655"]);
    const testo = testoSenzaTag(documentoHtml(vecchia as never, azienda as never));
    expect(testo).toContain("CIG 9988776655");
    expect(testo).toContain("CUP B11C22000330004");
    expect(testo).toContain("Codice commessa/convenzione COMM-1");
  });
});
