/**
 * Lotti 4 e 5 del piano docs/piano-clienti-pa-commessa-fattura.md (15/11/2026).
 *
 * Dalla commessa alla fattura (riferimenti, ufficio, origine, modifiche a mano, cambio e
 * aggiornamento della commessa) e dalla fattura all'XML (DatiOrdineAcquisto, DatiContratto,
 * DatiConvenzione, RiferimentoNumeroLinea), con i controlli prima dell'invio. Ogni XML passa
 * dallo schema XSD ufficiale 1.2.2 e dai conti dello SDI (00422, 00423).
 */
import { describe, expect, it, vi } from "vitest";
import { generateXML } from "../../../supabase/functions/_shared/generateXML";
import { controlliFatturaSdi, controlliRiferimentiPa } from "../../../supabase/functions/_shared/controlliFatturaSdi";
import {
  aggiornaDallaCommessa, allineaRighe, collegaCommessa, colonneCompatibili, conflittiCollegamento, etichettaOrigine,
  modificaRiferimento, normalizzaRiferimenti, proponiDallaCommessa, riferimentoManuale, ripristinaRiferimento, togliCommessa,
  type FonteVecchia, type RigaRiferimentoCommessa,
} from "../../../supabase/functions/_shared/riferimentiPaFattura";
import { datiPaFattura, scegliUfficio, snapshotConUfficio, type UfficioDisponibile } from "@/lib/fatturazione/fatturaPaDaCommessa";
import { calcolaRiga, calcolaTotaliDocumento } from "@/lib/fatturazione/calcoli";
import { erroriXsd } from "../helpers/validaXsdFatturaPa";
import { contiSdi } from "../helpers/contiSdi";

// Ogni XML generato in questo file passa dallo schema XSD ufficiale FatturaPA 1.2.2.
vi.mock("../../../supabase/functions/_shared/generateXML", async (originale) =>
  (await import("../helpers/xsdSuOgniXml")).conRegistro(await originale()));
import { ogniXmlNelloSchema } from "../helpers/xsdSuOgniXml";
ogniXmlNelloSchema();

const azienda = {
  ragione_sociale: "IMPRESA PROVA S.R.L.", partita_iva: "01234567897", codice_fiscale: "01234567897",
  indirizzo_via: "Via Roma", indirizzo_numero_civico: "1", indirizzo_cap: "33170", indirizzo_comune: "Pordenone",
  indirizzo_provincia: "PN", regime_fiscale: "RF01", forma_giuridica: "SRL", codice_rea: "123456", rea_ufficio: "PN",
  capitale_sociale: 10000, stato_liquidazione: "LN", socio_unico: false,
};
const indirizzo = { indirizzo_via: "Piazza Municipio 1", indirizzo_cap: "33080", indirizzo_comune: "Demolandia", indirizzo_provincia: "PN", indirizzo_nazione: "IT" };
const ENTE = { ...indirizzo, tipo_cliente: "PA" as const, ragione_sociale: "Comune di Demolandia", codice_fiscale: "80012345678" };

const righe = [
  calcolaRiga({ id: "r1", numero_linea: 1, descrizione: "Lavori lotto 1", quantita: 1, unita_misura: "a corpo", prezzo_unitario: 10000, aliquota_iva: "22", imponibile: 0, imposta: 0, totale_riga: 0 } as never),
  calcolaRiga({ id: "r2", numero_linea: 2, descrizione: "Fornitura da ordine", quantita: 3, unita_misura: "pz", prezzo_unitario: 333.33, aliquota_iva: "22", imponibile: 0, imposta: 0, totale_riga: 0 } as never),
  calcolaRiga({ id: "r3", numero_linea: 3, descrizione: "Manutenzione in convenzione", quantita: 1, unita_misura: "a corpo", prezzo_unitario: 500, aliquota_iva: "10", imponibile: 0, imposta: 0, totale_riga: 0 } as never),
];

function documento(extra: Record<string, unknown> = {}, split = true): Record<string, unknown> {
  const t = calcolaTotaliDocumento(righe, { splitPayment: split, esigibilitaDefault: split ? "S" : "I" });
  return {
    id: "d1", tipo: "fattura_pa", numero: "FT-2026-0100", data_emissione: "2026-11-15", anagrafica_id: "ana-ente",
    cliente_snapshot: { ...ENTE, codice_sdi: "UFTST2" }, righe, esigibilita_iva: split ? "S" : "I",
    riepilogo_iva: t.riepilogo_iva, imponibile_totale: t.imponibile_totale, iva_totale: t.iva_totale,
    totale_documento: t.totale_documento, totale_da_pagare: t.totale_da_pagare,
    metodo_pagamento_codice: "MP05", iban_pagamento: "IT60X0542811101000000123456",
    ...extra,
  };
}

const xmlDi = (doc: Record<string, unknown>) => generateXML(doc, azienda, "00001");
const dom = (xml: string) => new DOMParser().parseFromString(xml, "application/xml");
const testi = (d: Document | Element, tag: string) => Array.from(d.getElementsByTagName(tag)).map((e) => e.textContent ?? "");
function figli(el: Element): string[] { return Array.from(el.children).map((c) => c.tagName); }
function validoESenzaScarti(xml: string) {
  expect(erroriXsd(xml)).toEqual([]);
  expect(contiSdi(dom(xml))).toEqual([]);
}

// Commessa DEMO2-0013 come su Demo Azienda 2 (lotto 3).
const COMMESSA = { id: "ord-13", codice: "DEMO2-0013" };
const RIGHE_COMMESSA: RigaRiferimentoCommessa[] = [
  { id: "rp-1", tipo: "contratto", numero: "Rep. 1234/2026", data: "2026-03-01", cig: "1234567ABC", cup: "J51B21000140006", lotto: "Lotto 1", ufficio_id: "uff-2", codice_univoco_ufficio: "UFTST2" },
  { id: "rp-2", tipo: "ordine_acquisto", numero: "OdA 77/2026", data: "2026-06-10", cig: "Z1A2B3C4D5", cup: null },
];
const UFFICI: UfficioDisponibile[] = [
  { id: "uff-1", anagrafica_id: "ana-ente", codice_univoco_ufficio: "UFTST1", descrizione: "Ragioneria", predefinito: false, attivo: true },
  { id: "uff-2", anagrafica_id: "ana-ente", codice_univoco_ufficio: "UFTST2", descrizione: "Lavori pubblici", predefinito: true, attivo: true },
];

describe("lotto 5 — XML dei riferimenti PA", () => {
  it("contratto, ordine e convenzione nei loro blocchi, nell'ordine dello schema, con RiferimentoNumeroLinea", () => {
    const rif = normalizzaRiferimenti([
      { tipo: "contratto", numero: "Rep. 1234/2026", data: "2026-03-01", num_item: "Lotto 1", cig: "1234567ABC", cup: "J51B21000140006", righe_id: ["r1"] },
      { tipo: "ordine_acquisto", numero: "OdA 77/2026", data: "2026-06-10", cig: "Z1A2B3C4D5", righe_id: ["r2"] },
      { tipo: "convenzione", numero: "CONV-5", codice_commessa_convenzione: "COMM-2026-9", cig: "9A1B2C3D4E", righe_id: ["r3"] },
    ]);
    const xml = xmlDi(documento({ riferimenti_pa: rif }));
    validoESenzaScarti(xml);
    const d = dom(xml);
    const generali = d.getElementsByTagName("DatiGenerali")[0];
    expect(figli(generali)).toEqual(["DatiGeneraliDocumento", "DatiOrdineAcquisto", "DatiContratto", "DatiConvenzione"]);
    const contratto = d.getElementsByTagName("DatiContratto")[0];
    expect(figli(contratto)).toEqual(["RiferimentoNumeroLinea", "IdDocumento", "Data", "NumItem", "CodiceCUP", "CodiceCIG"]);
    expect(testi(contratto, "RiferimentoNumeroLinea")).toEqual(["1"]);
    expect(testi(contratto, "IdDocumento")).toEqual(["Rep. 1234/2026"]);
    expect(testi(contratto, "NumItem")).toEqual(["Lotto 1"]);
    const ordine = d.getElementsByTagName("DatiOrdineAcquisto")[0];
    expect(testi(ordine, "RiferimentoNumeroLinea")).toEqual(["2"]);
    expect(testi(ordine, "CodiceCIG")).toEqual(["Z1A2B3C4D5"]);
    const conv = d.getElementsByTagName("DatiConvenzione")[0];
    expect(figli(conv)).toEqual(["RiferimentoNumeroLinea", "IdDocumento", "CodiceCommessaConvenzione", "CodiceCIG"]);
    // Il contratto non si traveste più da ordine con IdDocumento «0».
    expect(testi(d, "IdDocumento")).not.toContain("0");
  });

  it("le righe seguono gli id: spostare una riga non sposta il riferimento", () => {
    const rif = normalizzaRiferimenti([{ tipo: "ordine_acquisto", numero: "OdA 1", cig: "Z1A2B3C4D5", righe_id: ["r2"] }]);
    const scambiate = [righe[1], righe[0], righe[2]];
    const xml = xmlDi(documento({ riferimenti_pa: rif, righe: scambiate }));
    validoESenzaScarti(xml);
    expect(testi(dom(xml), "RiferimentoNumeroLinea")).toEqual(["1"]);
  });

  it("CIG e CUP non dovuti: nessun tag, nessun valore finto", () => {
    const rif = normalizzaRiferimenti([{ tipo: "convenzione", numero: "Conv. 3/2026", cig_non_dovuto: true, cig_motivo_esclusione: "affidamento in house", cup: "C33D21000780001" }]);
    const xml = xmlDi(documento({ riferimenti_pa: rif }));
    validoESenzaScarti(xml);
    expect(xml).not.toContain("CodiceCIG");
    expect(testi(dom(xml), "CodiceCUP")).toEqual(["C33D21000780001"]);
    const tuttoNonDovuto = xmlDi(documento({ riferimenti_pa: normalizzaRiferimenti([{ tipo: "contratto", numero: "C-1", cig_non_dovuto: true, cup_non_dovuto: true }]) }));
    validoESenzaScarti(tuttoNonDovuto);
    expect(tuttoNonDovuto).not.toMatch(/CodiceCIG|CodiceCUP/);
  });

  it("documento vecchio senza riferimenti_pa: XML come prima (ordine con CIG/CUP)", () => {
    const xml = xmlDi(documento({ cig: "1234567ABC", cup: "J51B21000140006", riferimenti_ordine: [{ IdDocumento: "ORD-9", Data: "2026-05-01" }] }));
    validoESenzaScarti(xml);
    const ordine = dom(xml).getElementsByTagName("DatiOrdineAcquisto")[0];
    expect(figli(ordine)).toEqual(["IdDocumento", "Data", "CodiceCUP", "CodiceCIG"]);
    expect(xml).not.toContain("DatiContratto");
  });

  it("riferimento senza numero: IdDocumento 0 nello schema e avviso prima dell'invio", () => {
    const doc = documento({ riferimenti_pa: normalizzaRiferimenti([{ tipo: "contratto", cig: "1234567ABC" }]) });
    validoESenzaScarti(xmlDi(doc));
    const p = controlliRiferimentiPa(doc);
    expect(p.find((x) => x.field.endsWith(".numero"))?.severity).toBe("warning");
  });

  it("testi lunghi e caratteri speciali nei riferimenti restano nello schema", () => {
    const rif = normalizzaRiferimenti([{ tipo: "contratto", numero: "Rep. n° 1234/2026 «A»", num_item: "Lotto 1 — manutenzione straordinaria", codice_commessa_convenzione: "x".repeat(150), cig: "1234567ABC" }]);
    const xml = xmlDi(documento({ riferimenti_pa: rif }));
    validoESenzaScarti(xml);
  });
});

describe("campi Basic Latin dello schema (trovati validando contro l'XSD)", () => {
  it("«m²», «n°» e lettere accentate in unità di misura, numeri e riferimenti non fanno più scartare la fattura", () => {
    const conMq = [{ ...righe[0], unita_misura: "m²", riferimento_amministrazione: "Capitolo n° 12" }, { ...righe[1], unita_misura: "m³" }, righe[2]];
    const xml = xmlDi(documento({
      righe: conMq, numero: "FT n° 7/2026",
      riferimenti_pa: normalizzaRiferimenti([{ tipo: "contratto", numero: "Rep. n° 12/2026", num_item: "Lotto unico è", cig: "1234567ABC" }]),
      riferimenti_ddt: [{ numero: "DDT n° 3", data: "2026-11-10" }],
    }));
    validoESenzaScarti(xml);
    const d = dom(xml);
    expect(testi(d, "UnitaMisura")).toEqual(["m2", "m3", "a corpo"]);
    expect(testi(d, "Numero")).toEqual(["FT n 7/2026"]);
    expect(testi(d, "IdDocumento")).toEqual(["Rep. n 12/2026"]);
    expect(testi(d, "NumItem")).toEqual(["Lotto unico e"]);
    expect(testi(d, "NumeroDDT")).toEqual(["DDT n 3"]);
  });

  it("numero del contratto oltre 20 caratteri: errore che dice cosa fare (l'XML lo taglierebbe)", () => {
    const p = controlliRiferimentiPa(documento({ riferimenti_pa: normalizzaRiferimenti([{ tipo: "contratto", numero: "Repertorio 1234/2026 del Comune", cig: "1234567ABC" }]) }));
    expect(p.find((x) => x.field.endsWith(".numero"))).toMatchObject({ severity: "error" });
    expect(p.find((x) => x.field.endsWith(".numero"))?.message).toMatch(/l'XML ne ammette 20/);
  });
});

describe("lotto 5 — controlli prima dell'invio (errore / avviso / informazione)", () => {
  const conRif = (rif: unknown[], extra: Record<string, unknown> = {}) => documento({ riferimenti_pa: normalizzaRiferimenti(rif), ...extra });

  it("Codice Univoco Ufficio: manca o non è di 6 caratteri → blocca, e dice dove inserirlo", () => {
    const senza = controlliRiferimentiPa(conRif([{ tipo: "contratto", numero: "1", cig: "1234567ABC" }], { cliente_snapshot: { ...ENTE } }));
    const e = senza.find((p) => p.field === "codice_sdi")!;
    expect(e.severity).toBe("error");
    expect(e.message).toMatch(/Ufficio destinatario/);
    expect(e.message).toMatch(/la bozza si salva/);
    const sette = controlliRiferimentiPa(conRif([{ tipo: "contratto", numero: "1", cig: "1234567ABC" }], { cliente_snapshot: { ...ENTE, codice_sdi: "ABC1234" } }));
    expect(sette.find((p) => p.field === "codice_sdi")?.severity).toBe("error");
  });

  it("CIG: 10 caratteri (SmartCIG compreso); CUP: 15 con la lettera davanti", () => {
    const ok = controlliRiferimentiPa(conRif([{ tipo: "ordine_acquisto", numero: "1", cig: "Z1A2B3C4D5", cup: "J51B21000140006" }]));
    expect(ok.filter((p) => p.severity === "error")).toEqual([]);
    const ko = controlliRiferimentiPa(conRif([{ tipo: "ordine_acquisto", numero: "1", cig: "ABC123ABC123ABC", cup: "151B21000140006" }]));
    expect(ko.filter((p) => p.severity === "error").map((p) => p.field)).toEqual(["riferimenti_pa[0].cig", "riferimenti_pa[0].cup"]);
    expect(ko[0].message).toMatch(/10 caratteri/);
  });

  it("PA senza CIG: blocca; con «CIG non dovuto»: informazione, niente errore", () => {
    const senza = controlliRiferimentiPa(conRif([{ tipo: "contratto", numero: "1", cup: "J51B21000140006" }]));
    expect(senza.find((p) => p.field === "cig")?.severity).toBe("error");
    const nonDovuto = controlliRiferimentiPa(conRif([{ tipo: "contratto", numero: "1", cig_non_dovuto: true, cig_motivo_esclusione: "in house" }]));
    expect(nonDovuto.filter((p) => p.severity === "error")).toEqual([]);
    expect(nonDovuto.find((p) => p.severity === "info")?.message).toMatch(/non dovuto \(in house\)/);
  });

  it("il formato giusto non conferma il codice: lo dice come informazione", () => {
    const p = controlliRiferimentiPa(conRif([{ tipo: "contratto", numero: "1", cig: "1234567ABC" }]));
    const info = p.filter((x) => x.severity === "info");
    expect(info).toHaveLength(1);
    expect(info[0].message).toMatch(/non può sapere se è quello di questo appalto/);
  });

  it("nota di credito PA senza CIG: avviso, non blocco", () => {
    const p = controlliRiferimentiPa(documento({ tipo: "nota_credito" }));
    expect(p.find((x) => x.field === "cig")?.severity).toBe("warning");
  });

  it("coerenza ufficio, cliente e commessa", () => {
    const altroEnte = controlliRiferimentiPa(conRif([{ tipo: "contratto", numero: "1", cig: "1234567ABC" }], {
      cliente_snapshot: { ...ENTE, codice_sdi: "UFZZZ9", ufficio_pa: { id: "uff-x", codice: "UFZZZ9", anagrafica_id: "altro-ente", origine: "manuale" } },
    }));
    expect(altroEnte.find((p) => p.field === "codice_sdi")?.severity).toBe("error");
    const contesto = controlliRiferimentiPa(conRif([{ tipo: "contratto", numero: "1", cig: "1234567ABC" }]), {
      ufficio: { id: "uff-9", anagrafica_id: "altro-ente", codice_univoco_ufficio: "UFTST2" },
      commessa: { id: "ord-13", codice: "DEMO2-0013", anagrafica_id: "altro-cliente", cliente: "Comune B" },
    });
    expect(contesto.find((p) => p.field === "codice_sdi")?.severity).toBe("error");
    expect(contesto.find((p) => p.field === "cliente")?.severity).toBe("warning");
    const diverso = controlliRiferimentiPa(conRif([{ tipo: "contratto", numero: "1", cig: "1234567ABC" }], {
      cliente_snapshot: { ...ENTE, codice_sdi: "UFTST1", ufficio_pa: { id: "uff-2", codice: "UFTST2", anagrafica_id: "ana-ente", origine: "anagrafica" } },
    }));
    expect(diverso.find((p) => p.field === "codice_sdi")?.severity).toBe("warning");
  });

  it("riferimenti di più commesse senza righe: avviso; righe che non ci sono: errore", () => {
    const due = controlliRiferimentiPa(conRif([
      { tipo: "contratto", numero: "A", cig: "1234567ABC", order_id: "o1", origine: "commessa" },
      { tipo: "contratto", numero: "B", cig: "Z1A2B3C4D5", order_id: "o2", origine: "commessa" },
    ]), { commesseCollegate: ["o1", "o2"] });
    expect(due.find((p) => p.field === "riferimenti_pa")?.severity).toBe("warning");
    const fuori = controlliRiferimentiPa(conRif([{ tipo: "contratto", numero: "A", cig: "1234567ABC", numeri_linea: [7] }]));
    expect(fuori.find((p) => p.field.endsWith("numeri_linea"))?.severity).toBe("error");
  });

  it("riferimento di una commessa scollegata: avviso", () => {
    const p = controlliRiferimentiPa(conRif([{ tipo: "contratto", numero: "A", cig: "1234567ABC", order_id: "vecchia", order_code: "DEMO2-0001", origine: "commessa" }], { ordine_id: "nuova" }));
    expect(p.find((x) => x.field === "riferimenti_pa")?.message).toMatch(/DEMO2-0001 che non è più collegata/);
  });

  it("controlliFatturaSdi: un documento PA completo non ha errori", () => {
    const doc = conRif([{ tipo: "contratto", numero: "Rep. 1", cig: "1234567ABC", cup: "J51B21000140006" }]);
    expect(controlliFatturaSdi(doc, azienda).filter((p) => p.severity === "error")).toEqual([]);
  });
});

describe("lotto 4 — dalla commessa alla fattura", () => {
  it("C: righe della commessa → riferimenti con origine «dalla commessa», ufficio della commessa → CodiceDestinatario", () => {
    const dati = datiPaFattura({ commessa: COMMESSA, anagrafica: { id: "ana-ente" }, tipoCliente: "PA", righeCommessa: RIGHE_COMMESSA, uffici: UFFICI });
    expect(dati.riferimenti_pa.map((r) => [r.tipo, r.numero, r.cig, r.cup, r.num_item, r.origine, r.order_id, r.sorgente_id])).toEqual([
      ["contratto", "Rep. 1234/2026", "1234567ABC", "J51B21000140006", "Lotto 1", "commessa", "ord-13", "rp-1"],
      ["ordine_acquisto", "OdA 77/2026", "Z1A2B3C4D5", null, null, "commessa", "ord-13", "rp-2"],
    ]);
    expect(etichettaOrigine(dati.riferimenti_pa[0])).toBe("dalla commessa DEMO2-0013");
    expect(dati.ufficio).toMatchObject({ id: "uff-2", codice: "UFTST2", origine: "commessa" });
    expect(dati.compatibili).toEqual({ cig: "1234567ABC", cup: "J51B21000140006", codice_commessa_convenzione: null });
    const snap = snapshotConUfficio({ ...ENTE, codice_sdi: "UFTST1" }, dati.ufficio);
    expect(snap.codice_sdi).toBe("UFTST2");
  });

  it("D: ufficio diverso dal predefinito scelto sulla fattura → CodiceDestinatario di quell'ufficio", () => {
    const dati = datiPaFattura({ commessa: COMMESSA, anagrafica: { id: "ana-ente" }, tipoCliente: "PA", righeCommessa: [], uffici: UFFICI, ufficioScelto: "uff-1" });
    expect(dati.ufficio).toMatchObject({ codice: "UFTST1", origine: "manuale" });
    const doc = documento({ cliente_snapshot: snapshotConUfficio({ ...ENTE }, dati.ufficio), riferimenti_pa: normalizzaRiferimenti([{ tipo: "contratto", numero: "1", cig: "1234567ABC" }]) });
    const xml = xmlDi(doc);
    validoESenzaScarti(xml);
    expect(testi(dom(xml), "CodiceDestinatario")).toEqual(["UFTST1"]);
    // Senza scelta: il predefinito.
    expect(scegliUfficio({ anagrafica: null, righeCommessa: [], uffici: UFFICI, tipoCliente: "PA" }).ufficio?.codice).toBe("UFTST2");
    // Ufficio della commessa disattivato: predefinito, con avviso.
    const dis = scegliUfficio({ anagrafica: null, righeCommessa: [{ ...RIGHE_COMMESSA[0], ufficio_id: "uff-1" }], uffici: [{ ...UFFICI[0], attivo: false }, UFFICI[1]], tipoCliente: "PA" });
    expect(dis.ufficio?.codice).toBe("UFTST2");
    expect(dis.avvisi[0]).toMatch(/disattivato/);
  });

  it("ripiego: senza righe sulla commessa, contratto generale e computo; poi l'anagrafica", () => {
    const fonti: FonteVecchia[] = [
      { fonte: "contratto_generale" as const, fonte_id: "g1", cig: "1234567ABC", cup: null, numero: "Contratto 5", data: "2026-01-10" },
      { fonte: "computo" as const, fonte_id: "k1", cig: "1234567ABC", cup: null, numero: null, data: null },
      { fonte: "computo" as const, fonte_id: "k2", cig: "SBAGLIATO", cup: null, numero: null, data: null },
    ];
    const daFonti = proponiDallaCommessa(COMMESSA, [], fonti, { id: "a", cig: "Z1A2B3C4D5" });
    expect(daFonti.map((r) => [r.numero, r.cig, r.sorgente_id])).toEqual([["Contratto 5", "1234567ABC", "contratto_generale:g1"], [null, "1234567ABC", "computo:k1"]]);
    const daAnagrafica = proponiDallaCommessa(COMMESSA, [], [], { id: "a", cig: "Z1A2B3C4D5", cup: "J51B21000140006" });
    expect(daAnagrafica).toHaveLength(1);
    expect(daAnagrafica[0]).toMatchObject({ origine: "anagrafica", cig: "Z1A2B3C4D5" });
    expect(etichettaOrigine(daAnagrafica[0])).toBe("dall'anagrafica");
    expect(proponiDallaCommessa(COMMESSA, [], [], null)).toEqual([]);
  });

  it("H: modificare sulla fattura segna «modificato qui», non tocca la riga della commessa, si ripristina", () => {
    const righeCommessaPrima = JSON.stringify(RIGHE_COMMESSA);
    const [c] = proponiDallaCommessa(COMMESSA, RIGHE_COMMESSA);
    const m = modificaRiferimento(c, { cig: "z9y8x7w6v5" });
    expect(m).toMatchObject({ cig: "Z9Y8X7W6V5", modificato: true });
    expect(etichettaOrigine(m)).toBe("dalla commessa DEMO2-0013, modificato qui");
    expect(JSON.stringify(RIGHE_COMMESSA)).toBe(righeCommessaPrima);
    expect(ripristinaRiferimento(m)).toMatchObject({ cig: "1234567ABC", modificato: false });
    // Tornare al valore di partenza a mano toglie «modificato».
    expect(modificaRiferimento(m, { cig: "1234567ABC" }).modificato).toBe(false);
    // «Non dovuto» e il codice non stanno mai insieme.
    const nd = modificaRiferimento(c, { cig_non_dovuto: true });
    expect(nd).toMatchObject({ cig: null, cig_non_dovuto: true, modificato: true });
    expect(modificaRiferimento(nd, { cig: "1234567ABC" })).toMatchObject({ cig_non_dovuto: false });
    // Una riga scritta qui non è mai «modificata»: è «scritta qui».
    expect(etichettaOrigine(modificaRiferimento(riferimentoManuale(), { numero: "X" }))).toBe("scritto qui");
  });

  it("I: «Aggiorna dalla commessa» aggiorna ciò che non è stato toccato e lascia ciò che è stato cambiato a mano", () => {
    const iniziali = proponiDallaCommessa(COMMESSA, RIGHE_COMMESSA);
    const conRighe = [{ ...iniziali[0], righe_id: ["r1"] }, modificaRiferimento(iniziali[1], { numero: "OdA 77/2026 bis" }), riferimentoManuale("convenzione")];
    // Sulla commessa: il contratto cambia CUP, l'ordine cambia CIG, nasce un riferimento nuovo.
    const commessaDopo: RigaRiferimentoCommessa[] = [
      { ...RIGHE_COMMESSA[0], cup: "J51B21000140007" },
      { ...RIGHE_COMMESSA[1], cig: "Z9Z9Z9Z9Z9" },
      { id: "rp-3", tipo: "convenzione", numero: "Conv. 9", data: null, cig: "9A1B2C3D4E", cup: null },
    ];
    const { risultato, cambi } = aggiornaDallaCommessa(conRighe, proponiDallaCommessa(COMMESSA, commessaDopo), "ord-13");
    expect(cambi.map((c) => c.esito)).toEqual(["aggiornato", "tenuto_modificato", "aggiunto"]);
    expect(cambi[0].differenze).toEqual([{ campo: "cup", fattura: "J51B21000140006", commessa: "J51B21000140007" }]);
    expect(risultato[0]).toMatchObject({ cup: "J51B21000140007", righe_id: ["r1"], chiave: conRighe[0].chiave });
    expect(risultato[1]).toMatchObject({ numero: "OdA 77/2026 bis", cig: "Z1A2B3C4D5", modificato: true });
    expect(risultato[1].originale?.cig).toBe("Z9Z9Z9Z9Z9");
    expect(risultato[2].origine).toBe("manuale");
    expect(risultato[3]).toMatchObject({ numero: "Conv. 9", origine: "commessa" });
    // Riga tolta dalla commessa: esce dalla fattura se non era stata cambiata.
    const tolta = aggiornaDallaCommessa(iniziali, proponiDallaCommessa(COMMESSA, [RIGHE_COMMESSA[0]]), "ord-13");
    expect(tolta.cambi.map((c) => c.esito)).toEqual(["tolto"]);
    expect(tolta.risultato).toHaveLength(1);
  });

  it("G: cambiando commessa i riferimenti della precedente si tolgono (anche se modificati); quelli scritti qui restano", () => {
    const vecchi = [...proponiDallaCommessa(COMMESSA, RIGHE_COMMESSA), riferimentoManuale()];
    vecchi[0] = modificaRiferimento(vecchi[0], { numero: "cambiato" });
    const { risultato, tolti } = togliCommessa(vecchi, "ord-13");
    expect(tolti).toHaveLength(2);
    expect(risultato.map((r) => r.origine)).toEqual(["manuale"]);
    const nuova = collegaCommessa(risultato, proponiDallaCommessa({ id: "ord-15", codice: "DEMO2-0015" }, [{ id: "x", tipo: "convenzione", numero: "Conv", data: null, cig: null, cig_non_dovuto: true, cup: "C33D21000780001" }]), "ord-15");
    expect(nuova.map((r) => [r.origine, r.order_id])).toEqual([["manuale", null], ["commessa", "ord-15"]]);
  });

  it("F: fattura scritta a mano, poi collegata alla commessa: i conflitti si mostrano e si sceglie", () => {
    const aMano = [modificaRiferimento(riferimentoManuale("contratto"), { numero: "Rep. 1234/2026", cig: "AAAAAAAAAA" })];
    const proposti = proponiDallaCommessa(COMMESSA, RIGHE_COMMESSA);
    const conflitti = conflittiCollegamento(aMano, proposti, "ord-13");
    expect(conflitti).toHaveLength(1);
    expect(conflitti[0].campi).toEqual(["cig"]);
    // Scelgo la commessa: la riga a mano esce.
    expect(collegaCommessa(aMano, proposti, "ord-13").map((r) => r.cig)).toEqual(["1234567ABC", "Z1A2B3C4D5"]);
    // Scelgo di tenere la mia: restano tutte e due le fonti, si vede da dove vengono.
    expect(collegaCommessa(aMano, proposti, "ord-13", [aMano[0].chiave]).map((r) => [r.cig, r.origine])).toEqual([
      ["AAAAAAAAAA", "manuale"], ["1234567ABC", "commessa"], ["Z1A2B3C4D5", "commessa"],
    ]);
    // Uguale a quello della commessa: niente doppioni.
    const uguale = [modificaRiferimento(riferimentoManuale("contratto"), { numero: "Rep. 1234/2026", data: "2026-03-01", cig: "1234567ABC", cup: "J51B21000140006" })];
    expect(conflittiCollegamento(uguale, proposti, "ord-13")).toEqual([]);
    expect(collegaCommessa(uguale, proposti, "ord-13")).toHaveLength(2);
  });

  it("J: fattura su due commesse, riferimenti per riga → RiferimentoNumeroLinea", () => {
    const a = proponiDallaCommessa(COMMESSA, [RIGHE_COMMESSA[0]]).map((r) => ({ ...r, righe_id: ["r1", "r2"] }));
    const b = proponiDallaCommessa({ id: "ord-15", codice: "DEMO2-0015" }, [{ id: "x", tipo: "convenzione", numero: "Conv. 3/2026", data: "2026-02-01", cig: null, cig_non_dovuto: true, cup: "C33D21000780001" }]).map((r) => ({ ...r, righe_id: ["r3"] }));
    const doc = documento({ riferimenti_pa: allineaRighe([...a, ...b], righe), ordine_id: "ord-13" });
    expect(controlliRiferimentiPa(doc, { commesseCollegate: ["ord-13", "ord-15"] }).filter((p) => p.severity !== "info")).toEqual([]);
    const xml = xmlDi(doc);
    validoESenzaScarti(xml);
    const d = dom(xml);
    expect(testi(d.getElementsByTagName("DatiContratto")[0], "RiferimentoNumeroLinea")).toEqual(["1", "2"]);
    expect(testi(d.getElementsByTagName("DatiConvenzione")[0], "RiferimentoNumeroLinea")).toEqual(["3"]);
    expect(testi(d.getElementsByTagName("DatiConvenzione")[0], "CodiceCIG")).toEqual([]);
  });

  it("K: salvo, ricarico, riapro: il jsonb torna identico e la riga tolta perde il riferimento", () => {
    const rif = allineaRighe([{ ...modificaRiferimento(proponiDallaCommessa(COMMESSA, RIGHE_COMMESSA)[0], { num_item: "Lotto 2" }), righe_id: ["r2", "r3"] }], righe);
    const ricaricato = normalizzaRiferimenti(JSON.parse(JSON.stringify(rif)));
    expect(ricaricato).toEqual(rif);
    expect(ricaricato[0].numeri_linea).toEqual([2, 3]);
    const senzaR2 = allineaRighe(ricaricato, [righe[0], righe[2]]);
    expect(senzaR2[0]).toMatchObject({ righe_id: ["r3"], numeri_linea: [2] });
    // Una riga scritta male nel jsonb non rompe niente: cade.
    expect(normalizzaRiferimenti([null, 3, "x", { tipo: "boh", cig: " 1234567abc " }])).toHaveLength(1);
    expect(normalizzaRiferimenti([{ tipo: "boh", cig: " 1234567abc " }])[0]).toMatchObject({ tipo: "contratto", cig: "1234567ABC" });
  });

  it("colonne vecchie allineate al primo CIG/CUP", () => {
    expect(colonneCompatibili(normalizzaRiferimenti([{ tipo: "contratto", cup: "J51B21000140006" }, { tipo: "ordine_acquisto", numero: "1", cig: "Z1A2B3C4D5" }])))
      .toEqual({ cig: "Z1A2B3C4D5", cup: "J51B21000140006", codice_commessa_convenzione: null });
  });
});
