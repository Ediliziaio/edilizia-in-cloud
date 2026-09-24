/**
 * L'XML FatturaPA che parte allo SDI (24/09/2026, prima fattura vera con
 * openapi per Renova Solution).
 *
 * Diciotto fatture di prova validate contro lo schema ufficiale 1.2.2
 * dell'Agenzia e contro i controlli di calcolo dello SDI: prima delle
 * correzioni sette erano da scarto (apostrofo dell'iPhone, ritenuta del
 * condominio, sconto in euro, sconto sul totale, cliente estero, autofattura
 * TD17, nomi lunghi) e molte partivano senza dati che la legge chiede
 * (causale, riferimento normativo, DDT, fattura rettificata). Qui ogni caso
 * resta scritto; i due conti che lo SDI rifà (00423 sulle righe, 00422 sul
 * riepilogo) si rifanno anche qui.
 */
import { describe, expect, it } from "vitest";
import { generateXML, testoSdi, fmtNum8 } from "../../../supabase/functions/_shared/generateXML";
import { calcolaRiga, calcolaTotaliDocumento } from "@/lib/fatturazione/calcoli";

const renova = {
  ragione_sociale: "RENOVA SOLUTION S.R.L.", partita_iva: "01941970939", codice_fiscale: "01941970939",
  indirizzo_via: "Via Revedole", indirizzo_numero_civico: "78/B", indirizzo_cap: "33170", indirizzo_comune: "Pordenone",
  indirizzo_provincia: "PN", indirizzo_nazione: "IT", regime_fiscale: "RF01", codice_sdi: "KRRH6B9",
};
const b2b = {
  tipo_cliente: "B2B", ragione_sociale: "Edil Rossi S.r.l.", partita_iva: "01234567897", codice_sdi: "M5UXCR1",
  indirizzo_via: "Via Roma 1", indirizzo_cap: "33080", indirizzo_comune: "Prata di Pordenone", indirizzo_provincia: "PN", indirizzo_nazione: "IT",
};

type Riga = Record<string, unknown>;
const riga = (descrizione: string, quantita: number, prezzo: number, aliquota: string, extra: Riga = {}) =>
  calcolaRiga({
    id: "r", numero_linea: 1, descrizione, quantita, unita_misura: "PZ", prezzo_unitario: prezzo,
    aliquota_iva: aliquota, imponibile: 0, imposta: 0, totale_riga: 0, ...extra,
  } as never);

function fattura(righe: ReturnType<typeof riga>[], opz: Record<string, unknown> = {}, extra: Record<string, unknown> = {}, cliente: Record<string, unknown> = b2b, azienda: Record<string, unknown> = renova) {
  const t = calcolaTotaliDocumento(righe, opz as never);
  const doc = {
    tipo: "fattura", numero: "FT-2026-0001", data_emissione: "2026-09-24", cliente_snapshot: cliente,
    righe, riepilogo_iva: t.riepilogo_iva, imponibile_totale: t.imponibile_totale, totale_documento: t.totale_documento,
    totale_da_pagare: t.totale_da_pagare, metodo_pagamento_codice: "MP05", scadenze_pagamento: [] as unknown[],
    ritenuta_acconto: opz.ritenutaAcconto, ritenuta_aliquota: opz.ritenutaAliquota, ritenuta_importo: t.ritenuta_importo,
    ritenuta_tipo: opz.ritenutaTipo, sconto_globale_valore: t.scontoGlobaleValore, ...extra,
  };
  return new DOMParser().parseFromString(generateXML(doc, azienda, "00001"), "application/xml");
}

const testi = (d: Document, tag: string) => Array.from(d.getElementsByTagName(tag)).map((e) => e.textContent ?? "");
const n = (v: string | null | undefined) => Number(v ?? 0);

/** I due conti dello SDI: 00423 (righe) e 00422 (riepilogo contro righe, un euro di tolleranza). */
function contiSdi(d: Document): string[] {
  const errori: string[] = [];
  const linee = Array.from(d.getElementsByTagName("DettaglioLinee"));
  for (const l of linee) {
    const q = n(l.getElementsByTagName("Quantita")[0]?.textContent ?? "1");
    let prezzo = n(l.getElementsByTagName("PrezzoUnitario")[0]?.textContent);
    for (const sc of Array.from(l.getElementsByTagName("ScontoMaggiorazione"))) {
      const perc = sc.getElementsByTagName("Percentuale")[0]?.textContent;
      const imp = sc.getElementsByTagName("Importo")[0]?.textContent;
      prezzo -= perc ? prezzo * n(perc) / 100 : n(imp);
    }
    const totale = n(l.getElementsByTagName("PrezzoTotale")[0]?.textContent);
    if (Math.abs(prezzo * q - totale) > 0.01) errori.push(`00423 ${totale} ≠ ${(prezzo * q).toFixed(2)}`);
  }
  for (const r of Array.from(d.getElementsByTagName("DatiRiepilogo"))) {
    const al = n(r.getElementsByTagName("AliquotaIVA")[0]?.textContent);
    const somma = linee
      .filter((l) => n(l.getElementsByTagName("AliquotaIVA")[0]?.textContent) === al)
      .reduce((s, l) => s + n(l.getElementsByTagName("PrezzoTotale")[0]?.textContent), 0);
    const imponibile = n(r.getElementsByTagName("ImponibileImporto")[0]?.textContent);
    if (Math.abs(somma - imponibile) > 1) errori.push(`00422 ${imponibile} ≠ ${somma}`);
  }
  return errori;
}

describe("testo ammesso dallo schema (solo caratteri latini)", () => {
  it("apostrofo curvo, trattini, euro e puntini diventano caratteri ammessi; le accentate restano", () => {
    expect(testoSdi("Sostituzione dell’infisso – valore € 1.200… “plissé”", 1000))
      .toBe("Sostituzione dell'infisso - valore EUR 1.200... \"plissé\"");
  });
  it("niente a capo, e al massimo la lunghezza del campo", () => {
    expect(testoSdi("riga uno\nriga due", 100)).toBe("riga uno riga due");
    expect(testoSdi("x".repeat(90), 80)).toHaveLength(80);
  });
  it("prezzi con più decimali senza troncarli a quattro", () => {
    expect(fmtNum8(180.333333)).toBe("180.333333");
    expect(fmtNum8(12)).toBe("12.00");
  });
});

describe("i casi che lo SDI scartava", () => {
  it("ritenuta del condominio: le righe dicono Ritenuta SI (00411)", () => {
    const d = fattura([riga("Rifacimento facciata", 1, 10000, "10")], { ritenutaAcconto: true, ritenutaAliquota: 4, ritenutaTipo: "RT02" });
    expect(testi(d, "Ritenuta")).toEqual(["SI"]);
    expect(testi(d, "AliquotaRitenuta")).toEqual(["4.00"]);
  });
  it("sconto in euro su una riga: scritto per unità, i conti tornano (00423)", () => {
    const d = fattura([riga("Porta blindata", 2, 750, "22", { sconto_valore: 100 })]);
    expect(testi(d, "Importo")).toEqual(["50.00"]);
    expect(contiSdi(d)).toEqual([]);
  });
  it("sconto sul totale: una riga in meno, il riepilogo torna con le righe (00422)", () => {
    const d = fattura([riga("Infissi", 1, 5000, "22"), riga("Posa", 1, 1000, "22")], { scontoGlobaleValore: 300 });
    expect(testi(d, "PrezzoTotale")).toContain("-300.00");
    expect(testi(d, "ImponibileImporto")).toEqual(["5700.00"]);
    expect(contiSdi(d)).toEqual([]);
  });
  it("cliente estero: CAP 00000, codice XXXXXXX, partita IVA senza prefisso del paese", () => {
    const d = fattura([riga("Serramenti", 2, 900, "0", { natura_iva: "N3_2" })], {}, {},
      { tipo_cliente: "Estero", ragione_sociale: "Bau GmbH", partita_iva: "ATU12345678", indirizzo_via: "Hauptstrasse 10", indirizzo_cap: "1010", indirizzo_comune: "Wien", indirizzo_nazione: "AT" });
    expect(testi(d, "CodiceDestinatario")).toEqual(["XXXXXXX"]);
    expect(testi(d, "CAP")).toEqual(["33170", "00000"]);
    expect(testi(d, "IdCodice")).toContain("U12345678");
  });
  it("autofattura servizi dall'estero (TD17): il fornitore ha RegimeFiscale RF18 e un IdFiscaleIVA", () => {
    const d = fattura([riga("Servizi pubblicitari", 1, 300, "22")], {}, { tipo: "integrazione_servizi_estero" },
      { tipo_cliente: "Estero", ragione_sociale: "Fornitore Ltd", indirizzo_via: "Main St 1", indirizzo_comune: "London", indirizzo_nazione: "GB" });
    expect(testi(d, "RegimeFiscale")).toEqual(["RF18"]);
    expect(testi(d, "IdCodice")).toContain("99999999999");
  });
  it("nomi oltre 80 caratteri e descrizioni oltre 1000 vengono accorciati", () => {
    const d = fattura([riga("Fornitura ".repeat(120), 1, 100, "22")], {}, {},
      { ...b2b, ragione_sociale: "Impresa Edile Costruzioni Generali e Ristrutturazioni del Friuli Venezia Giulia S.r.l." });
    expect(testi(d, "Denominazione")[1].length).toBeLessThanOrEqual(80);
    expect(testi(d, "Descrizione")[0].length).toBeLessThanOrEqual(1000);
  });
});

describe("quello che la legge chiede nell'XML", () => {
  it("reverse charge del subappalto (N6.3): la norma sta nel riepilogo", () => {
    const d = fattura([riga("Subappalto opere murarie", 1, 5000, "0", { natura_iva: "N6_3" })]);
    expect(testi(d, "Natura")).toEqual(["N6.3", "N6.3"]);
    expect(testi(d, "RiferimentoNormativo")).toEqual(["Inversione contabile art. 17 c.6 lett. a DPR 633/72"]);
  });
  it("la causale del documento arriva nell'XML, spezzata a 200 caratteri", () => {
    const lunga = `IVA 10% art. 7 c.1 lett. b L. 488/1999. ${"Beni significativi: serramenti. ".repeat(10)}`;
    const d = fattura([riga("Sostituzione infissi", 1, 1000, "10")], {}, { causale: [lunga] });
    const causali = testi(d, "Causale");
    expect(causali.length).toBeGreaterThan(1);
    expect(causali.every((c) => c.length <= 200)).toBe(true);
    expect(causali[0]).toMatch(/^IVA 10% art. 7/);
  });
  it("fattura differita: numero e data dei DDT", () => {
    const d = fattura([riga("Materiale", 10, 40, "22")], {}, {
      tipo: "fattura_riepilogativa", riferimenti_ddt: [{ NumeroDDT: "45", DataDDT: "2026-09-02" }, { NumeroDDT: "46", DataDDT: "2026-09-09" }],
    });
    expect(testi(d, "NumeroDDT")).toEqual(["45", "46"]);
    expect(testi(d, "DataDDT")).toEqual(["2026-09-02", "2026-09-09"]);
  });
  it("nota di credito: la fattura rettificata in DatiFattureCollegate", () => {
    const d = fattura([riga("Storno parziale", 1, 200, "22")], {}, {
      tipo: "nota_credito", fattura_collegata: { numero: "FT-2026-0010", data: "2026-09-10" },
    });
    const collegate = d.getElementsByTagName("DatiFattureCollegate")[0];
    expect(collegate?.getElementsByTagName("IdDocumento")[0]?.textContent).toBe("FT-2026-0010");
    expect(collegate?.getElementsByTagName("Data")[0]?.textContent).toBe("2026-09-10");
  });
  it("integrazione di una fattura in reverse charge ricevuta (TD16): cedente il fornitore, committente noi", () => {
    const d = fattura([riga("Integrazione IVA", 1, 4000, "22")], {}, { tipo: "reverse_charge_interno" },
      { ...b2b, ragione_sociale: "Muratori Uniti S.n.c.", codice_sdi: "" });
    const cedente = d.getElementsByTagName("CedentePrestatore")[0];
    const committente = d.getElementsByTagName("CessionarioCommittente")[0];
    expect(cedente.getElementsByTagName("Denominazione")[0].textContent).toBe("Muratori Uniti S.n.c.");
    expect(committente.getElementsByTagName("IdCodice")[0].textContent).toBe("01941970939");
    expect(testi(d, "CodiceDestinatario")).toEqual(["KRRH6B9"]);
  });
  it("condizioni di pagamento: TP02 per un pagamento solo, TP01 a rate; IBAN senza spazi, banca prima", () => {
    const una = fattura([riga("Fornitura", 1, 100, "22")], {}, { iban_pagamento: "IT60 X054 2811 1010 0000 0123 456", nome_banca: "Banca di Prova" });
    expect(testi(una, "CondizioniPagamento")).toEqual(["TP02"]);
    expect(testi(una, "IBAN")).toEqual(["IT60X0542811101000000123456"]);
    const pagamento = una.getElementsByTagName("DettaglioPagamento")[0];
    const figli = Array.from(pagamento.children).map((e) => e.tagName);
    expect(figli.indexOf("IstitutoFinanziario")).toBeLessThan(figli.indexOf("IBAN"));
    const rate = fattura([riga("Impianto", 1, 9000, "10")], {}, {
      scadenze_pagamento: [
        { data_scadenza: "2026-10-24", importo: 4950, metodo_pagamento: "MP05" },
        { data_scadenza: "2026-11-24", importo: 4950, metodo_pagamento: "MP05" },
      ],
    });
    expect(testi(rate, "CondizioniPagamento")).toEqual(["TP01"]);
  });
  it("regime forfettario: la causale di legge senza caratteri fuori schema", () => {
    const d = fattura([riga("Consulenza", 1, 500, "0", { natura_iva: "N2_2" })], {}, {}, b2b, { ...renova, regime_fiscale: "RF19" });
    expect(testi(d, "Causale")[0]).toMatch(/legge 23 dicembre 2014, n\. 190 - Regime forfettario$/);
  });
});
