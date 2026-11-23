/**
 * Contabilità generale, 23/11/2026: un'impresa che tiene la contabilità in casa segnalava
 * - «il n. non corrisponde al n. della fattura emessa… mette il n. 1 al bilancio di apertura»;
 * - «come posso stampare i registri IVA? non li ho trovati»;
 * - «in contabilità generale non fa scaricare l'IVA».
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { numeriGiornale, riferimentoDocumento, type Scrittura } from "@/lib/contabilita/libroGiornale";
import {
  csvLiquidazioneContabile,
  differenzaLipe,
  importiPeriodo,
  htmlLiquidazioneContabile,
  righeLiquidazione,
  statoLiquidazione,
  totaliLiquidazione,
  type EsitoLiquidazione,
} from "@/lib/contabilita/liquidazioneContabile";

const scrittura = (id: string, numero: number, data: string, extra: Partial<Scrittura> = {}): Scrittura => ({
  id, esercizio: 2026, numero, data_registrazione: data, causale: "Fattura emessa", descrizione: null,
  documento_numero: null, documento_data: null, origine: "fattura_emessa", storno_di: null, contabilita_righe: [], ...extra,
});

describe("numero di scrittura e numero del documento", () => {
  it("il libro giornale numera in ordine di data, con l'apertura per prima", () => {
    const n = numeriGiornale([
      scrittura("fattura-ottobre", 2, "2026-10-20"),
      scrittura("apertura", 1, "2026-01-01", { origine: "apertura", causale: "Apertura conti" }),
      // Registrata dopo, con una data precedente: nel giornale va prima.
      scrittura("fattura-luglio", 3, "2026-07-31"),
    ]);
    expect(n.get("apertura")).toBe(1);
    expect(n.get("fattura-luglio")).toBe(2);
    expect(n.get("fattura-ottobre")).toBe(3);
  });

  it("a parità di data resta l'ordine di registrazione, e ogni esercizio ricomincia da 1", () => {
    const n = numeriGiornale([
      scrittura("b", 5, "2026-03-01"),
      scrittura("a", 4, "2026-03-01"),
      { ...scrittura("anno-dopo", 1, "2027-01-01"), esercizio: 2027 },
    ]);
    expect([n.get("a"), n.get("b"), n.get("anno-dopo")]).toEqual([1, 2, 1]);
  });

  it("dice il numero e la data della fattura, non quello della scrittura", () => {
    expect(riferimentoDocumento(scrittura("x", 20, "2026-10-20", { documento_numero: "47", documento_data: "2026-10-20" })))
      .toBe("Fattura 47 del 20/10/2026");
    expect(riferimentoDocumento(scrittura("x", 21, "2026-10-20", { causale: "Nota di credito emessa", documento_numero: "48", documento_data: "2026-10-20" })))
      .toBe("Nota di credito 48 del 20/10/2026");
    expect(riferimentoDocumento(scrittura("x", 1, "2026-01-01", { origine: "apertura", causale: "Apertura conti" }))).toBe("");
    expect(riferimentoDocumento(scrittura("x", 9, "2026-05-01", { origine: "prima_nota", documento_numero: "F24-5" }))).toBe("Doc. F24-5");
    expect(riferimentoDocumento(scrittura("x", 9, "2026-05-01", { origine: "incasso", documento_numero: "39" }))).toBe("Fattura 39");
    expect(riferimentoDocumento(scrittura("x", 9, "2026-05-01", { origine: "prima_nota", documento_numero: "Segnata pagata dalla fattura ricevuta" })))
      .toBe("Segnata pagata dalla fattura ricevuta");
  });
});

const esito = (e: Partial<EsitoLiquidazione>): EsitoLiquidazione => ({
  iva_vendite: 0, iva_acquisti: 0, saldo: 0, credito_precedente: 0, compensato: 0, da_versare: 0, a_credito: 0, gia_liquidato: false, ...e,
});

describe("liquidazioni IVA della contabilità: stampa ed esportazione", () => {
  const periodi = [
    { dal: "2026-01-01", al: "2026-03-31", nome: "1° trimestre 2026" },
    { dal: "2026-04-01", al: "2026-06-30", nome: "2° trimestre 2026" },
    { dal: "2026-07-01", al: "2026-09-30", nome: "3° trimestre 2026" },
  ];
  const esiti = [
    esito({ iva_vendite: 1000, iva_acquisti: 400, da_versare: 600, interessi: 6, gia_liquidato: true }),
    esito({ iva_vendite: 100, iva_acquisti: 300, a_credito: 200 }),
    esito({}),
  ];

  it("somma i periodi, interessi compresi nel da versare", () => {
    const t = totaliLiquidazione(righeLiquidazione(periodi, esiti));
    expect(t).toEqual({ ivaVendite: 1100, ivaAcquisti: 700, daVersare: 606, aCredito: 200 });
  });

  it("dice lo stato di ogni periodo", () => {
    expect(esiti.map(statoLiquidazione)).toEqual(["Registrata", "Da registrare dalla LIPE", "Senza movimenti"]);
    expect(statoLiquidazione(esito({ iva_vendite: 10, sotto_minimo: true, fonte: "lipe", soglia: 100 }))).toMatch(/sotto 100,00\s€: si versa col periodo dopo/);
    expect(statoLiquidazione(esito({ iva_vendite: 10, fonte: "scritture" }))).toBe("Anteprima dalle scritture: conferma la LIPE");
  });

  it("il CSV è all'italiana: punto e virgola e decimali con la virgola", () => {
    const righe = csvLiquidazioneContabile(righeLiquidazione(periodi, esiti)).split("\r\n");
    expect(righe[0]).toBe("Periodo;IVA vendite;IVA acquisti;Credito precedente usato;Interessi;Da versare;A credito;Stato");
    expect(righe[1]).toBe("1° trimestre 2026;1000,00;400,00;0,00;6,00;606,00;0,00;Registrata");
    expect(righe).toHaveLength(4);
  });

  it("il foglio di stampa ha la testata dell'azienda, i periodi e il totale da versare", () => {
    const html = htmlLiquidazioneContabile({ azienda: { ragione_sociale: "Impresa Prova Srl", partita_iva: "01234567890" }, anno: 2026, trimestrale: true, righe: righeLiquidazione(periodi, esiti) });
    expect(html).toContain("Impresa Prova Srl");
    expect(html).toContain("Liquidazioni IVA trimestrali");
    expect(html).toContain("2° trimestre 2026");
    expect(html).toContain("Totale da versare");
  });
});

describe("Contabilità generale: l'IVA con gli stessi strumenti di Fatture → Fiscalità", () => {
  const pagina = readFileSync("src/components/contabilita/ContabilitaGenerale.tsx", "utf8");
  const fiscale = readFileSync("src/pages/azienda/ContabilitaFiscale.tsx", "utf8");
  const registro = readFileSync("src/pages/azienda/fatturazione/RegistroIVA.tsx", "utf8");

  it("la vista IVA mostra i registri, la liquidazione con LIPE e F24 e il giroconto", () => {
    expect(pagina).toContain('["iva", "IVA"]');
    expect(pagina).toMatch(/<RegistroIVA embedded onApriLiquidazione=/);
    expect(pagina).toMatch(/<LiquidazioneIvaEF24 chiaveVista="iva_vista"/);
    expect(pagina).toMatch(/<LiquidazioneIva companyId=/);
  });

  it("accanto alla stampa del libro giornale c'è la stampa dei registri IVA", () => {
    expect(pagina).toMatch(/periodo\.set\(\{ vista: "iva", iva: "registri" \}\)[\s\S]{0,200}Stampa registri IVA/);
  });

  it("la liquidazione in contabilità si stampa e si scarica", () => {
    expect(pagina).toContain("htmlLiquidazioneContabile(");
    expect(pagina).toContain("csvLiquidazioneContabile(");
  });

  it("dentro la Contabilità generale i pannelli non scrivono «vista», che è la linguetta della pagina", () => {
    expect(fiscale).not.toMatch(/p\.set\(\{ vista: "(iva|f24|ritenute_bancarie|impostazioni_iva)" \}\)/);
    expect(fiscale).toContain("p.params.get(chiaveVista)");
    expect(registro).toContain('onApriLiquidazione ?? (() => p.set({ sezione: "contabilita", vista: "iva" }))');
  });

  it("l'elenco delle scritture ha la colonna del documento accanto al numero di scrittura", () => {
    expect(pagina).toContain(">N. scrittura</th>");
    expect(pagina).toContain(">Documento</th>");
    expect(pagina).toContain("riferimentoDocumento(s)");
  });
});

describe("liquidazione su un periodo coi documenti col solo totale", () => {
  it("il foglio e il CSV dicono che gli importi sono parziali", () => {
    const periodi = [{ dal: "2026-07-01", al: "2026-07-31", nome: "luglio 2026" }];
    const righe = righeLiquidazione(periodi, [esito({ iva_vendite: 100, iva_acquisti: 20, da_versare: 80, gia_liquidato: true })], [{ emesse: 6, ricevute: 94 }]);
    expect(righe[0].avviso).toBe("6 emesse e 94 ricevute senza importi");
    expect(csvLiquidazioneContabile(righe).split("\r\n")[1]).toMatch(/Registrata · 6 emesse e 94 ricevute senza importi: importi parziali$/);
    expect(htmlLiquidazioneContabile({ azienda: {}, anno: 2026, trimestrale: false, righe })).toContain("importi parziali");
  });
});

describe("un solo calcolo IVA: la contabilità registra la LIPE confermata", () => {
  it("un periodo registrato mostra gli importi della sua scrittura", () => {
    const e = esito({ gia_liquidato: true, registrata_iva_vendite: 500, registrata_iva_acquisti: 200 });
    expect(importiPeriodo(e)).toMatchObject({ iva_vendite: 500, iva_acquisti: 200 });
    expect(importiPeriodo(esito({ iva_vendite: 7 }))).toMatchObject({ iva_vendite: 7 });
  });

  it("dice quando la scrittura registrata non è la LIPE", () => {
    expect(differenzaLipe(esito({ fonte: "lipe", gia_liquidato: true, iva_vendite: 500, iva_acquisti: 200, registrata_iva_vendite: 500, registrata_iva_acquisti: 200 }))).toBe("");
    expect(differenzaLipe(esito({ fonte: "lipe", gia_liquidato: true, iva_vendite: 500, iva_acquisti: 200, registrata_iva_vendite: 480, registrata_iva_acquisti: 200 })))
      .toMatch(/^Registrata con importi diversi dalla LIPE.*storna/);
  });

  it("da registrare: la differenza con le scritture resta sui conti IVA, e lo dice", () => {
    expect(differenzaLipe(esito({ fonte: "lipe", iva_vendite: 100, iva_acquisti: 50, scritture_iva_vendite: 100, scritture_iva_acquisti: 80 })))
      .toMatch(/^Nelle scritture: vendite 100,00\s€, acquisti 80,00\s€/);
    expect(differenzaLipe(esito({ fonte: "lipe", iva_vendite: 100, iva_acquisti: 50, scritture_iva_vendite: 100, scritture_iva_acquisti: 50 }))).toBe("");
    expect(differenzaLipe(esito({ fonte: "scritture", iva_vendite: 1, scritture_iva_vendite: 2 }))).toBe("");
  });
});

describe("la migrazione del calcolo unico", () => {
  const sql = readFileSync("supabase/migrations/20290527100000_contabilita_liquida_iva_dalla_lipe.sql", "utf8");
  it("registra solo dalla LIPE confermata dello stesso periodo", () => {
    expect(sql).toMatch(/f\.period_start = p_dal AND f\.period_end = p_al/);
    expect(sql).toMatch(/IF v_lipe IS NULL THEN\s+RAISE EXCEPTION 'Conferma prima la liquidazione periodica \(LIPE\)/);
    expect(sql).toContain("{righi,vp4}");
    expect(sql).toContain("{righi,vp5}");
    expect(sql).toContain("{righi,vp12}");
  });
  it("soglia di 100 € dal 2024, chiusa ad anon", () => {
    expect(sql).toMatch(/< 2024 THEN 25\.82 ELSE 100/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.contabilita_liquida_iva\(uuid, date, date, boolean\) FROM PUBLIC, anon/);
  });
});

