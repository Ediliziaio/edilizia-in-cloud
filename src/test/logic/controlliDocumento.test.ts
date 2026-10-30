/**
 * Controlli deterministici sulle letture AI dei documenti (30/10/2026).
 *
 * Il caso che conta: la fattura nella forma che scrive davvero ai-fattura-ricevuta-ocr
 * (`cedente.piva`, `imponibile_totale`, `iva_totale`, `totale_documento`,
 * `righe[].totale_riga`). Il vecchio controllo dell'analizzatore cercava altri
 * nomi, quindi una fattura letta bene prendeva due avvisi falsi e i controlli
 * veri non giravano mai.
 */
import { describe, expect, it } from "vitest";
import {
  conAvvisi,
  controllaDocumento,
  isValidPiva,
  num,
  statoAnalisi,
  verificaPiva,
} from "../../../supabase/functions/_shared/controlliDocumento";

/** Dieci cifre + la cifra di controllo giusta. */
function pivaCon(prime10: string): string {
  let somma = 0;
  for (let i = 0; i < 10; i++) {
    const d = Number(prime10[i]);
    somma += i % 2 === 0 ? d : d * 2 > 9 ? d * 2 - 9 : d * 2;
  }
  return prime10 + String((10 - (somma % 10)) % 10);
}

const OGGI = new Date("2026-10-30T12:00:00Z");
const PIVA = pivaCon("0123456789");
const codici = (tipo: string, campi: Record<string, unknown> | null) =>
  controllaDocumento(tipo, campi, OGGI).warnings.map((w) => w.code);

/** La fattura come la scrive ai-fattura-ricevuta-ocr. */
const fattura = (extra: Record<string, unknown> = {}) => ({
  numero_fattura: "FT-2026/118",
  data_fattura: "2026-10-12",
  data_scadenza: "2026-11-11",
  tipo_documento: "TD01",
  cedente: { ragione_sociale: "Edil Forniture Rossi S.r.l.", piva: `IT${PIVA}`, cf: null as string | null, comune: "Bergamo" },
  imponibile_totale: 1000,
  iva_totale: 220,
  totale_documento: 1220,
  righe: [
    { descrizione: "Cemento", quantita: 10, um: "q", prezzo_unit: 60, totale_riga: 600, iva_pct: 22 },
    { descrizione: "Sabbia", quantita: 8, um: "mc", prezzo_unit: 50, totale_riga: 400, iva_pct: 22 },
  ],
  riepilogo_iva: [{ aliquota: 22, imponibile: 1000, imposta: 220 }],
  note: null as string | null,
  confidence: 0.93,
  ...extra,
});

describe("num: numeri scritti all'italiana", () => {
  it.each([
    [1234.5, 1234.5],
    ["1.234,56", 1234.56],
    ["€ 12,5", 12.5],
    ["12.5", 12.5],
    ["1.234", 1234],
    ["-45,00", -45],
    ["0", 0],
  ])("%j → %j", (ingresso, atteso) => {
    expect(num(ingresso)).toBe(atteso);
  });
  it.each([["abc"], [""], [null], [undefined], [NaN], ["12,3,4"], [{}]])("%j non è un numero", (v) => {
    expect(num(v)).toBeNull();
  });
});

describe("P.IVA", () => {
  it("riconosce la cifra di controllo", () => {
    expect(verificaPiva(PIVA)).toBe("ok");
    expect(verificaPiva(`IT ${PIVA}`)).toBe("ok");
    expect(verificaPiva(`it${PIVA.slice(0, 10)}${(Number(PIVA[10]) + 1) % 10}`)).toBe("non_valida");
    expect(verificaPiva("1234")).toBe("non_valida");
    expect(verificaPiva("")).toBe("mancante");
    expect(verificaPiva(null)).toBe("mancante");
    expect(isValidPiva(PIVA)).toBe(true);
    expect(isValidPiva("12345678901")).toBe(false);
  });
  it("un numero con il prefisso di un altro paese non si giudica", () => {
    expect(verificaPiva("DE123456789")).toBe("estera");
    expect(verificaPiva("FR12345678901")).toBe("estera");
  });
});

describe("fattura", () => {
  it("la fattura letta bene dal parser non ha avvisi (prima ne aveva due falsi)", () => {
    const esito = controllaDocumento("fattura", fattura(), OGGI);
    expect(esito.warnings).toEqual([]);
    expect(esito.score).toBe(1);
    expect(esito.daVerificare).toEqual([]);
  });

  it("legge anche i nomi vecchi (piva_cedente, imponibile, iva, totale)", () => {
    const vecchia = {
      piva_cedente: PIVA,
      imponibile: 1000,
      iva: 220,
      totale: 1220,
      numero_fattura: "7",
      data_fattura: "2026-10-12",
    };
    expect(codici("fattura", vecchia)).toEqual([]);
    expect(codici("fattura_passiva", { ...vecchia, totale: 1300 })).toEqual(["totale_imponibile_iva_mismatch"]);
  });

  it("P.IVA con la cifra di controllo sbagliata è un errore, e il campo va guardato", () => {
    const sbagliata = `${PIVA.slice(0, 10)}${(Number(PIVA[10]) + 3) % 10}`;
    const esito = controllaDocumento("fattura", fattura({ cedente: { ragione_sociale: "X", piva: sbagliata } }), OGGI);
    expect(esito.warnings.map((w) => [w.code, w.severity])).toEqual([["invalid_piva_cedente", "error"]]);
    expect(esito.daVerificare).toEqual(["piva_cedente"]);
    expect(esito.score).toBe(0.75);
  });

  it("P.IVA estera: solo un'informazione, nessun errore", () => {
    const esito = controllaDocumento("fattura", fattura({ cedente: { ragione_sociale: "Bau GmbH", piva: "DE123456789" } }), OGGI);
    expect(esito.warnings.map((w) => [w.code, w.severity])).toEqual([["foreign_piva_cedente", "info"]]);
    expect(esito.score).toBe(1);
    expect(esito.daVerificare).toEqual([]);
  });

  it("P.IVA mancante e numero mancante sono avvisi", () => {
    const esito = controllaDocumento("fattura", fattura({ cedente: { ragione_sociale: "X", piva: null }, numero_fattura: null }), OGGI);
    expect(esito.warnings.map((w) => w.code).sort()).toEqual(["missing_numero_fattura", "missing_piva_cedente"]);
    expect(esito.daVerificare.sort()).toEqual(["numero_fattura", "piva_cedente"]);
  });

  it("il totale che non è imponibile + IVA è un errore", () => {
    const esito = controllaDocumento("fattura", fattura({ totale_documento: 1250 }), OGGI);
    expect(esito.warnings.map((w) => [w.code, w.severity])).toEqual([["totale_imponibile_iva_mismatch", "error"]]);
    expect(esito.warnings[0].message).toContain("1250.00");
  });

  it("tollera i centesimi di arrotondamento", () => {
    expect(codici("fattura", fattura({ totale_documento: 1220.04 }))).toEqual([]);
    expect(codici("fattura", fattura({ totale_documento: 1220.2 }))).toEqual(["totale_imponibile_iva_mismatch"]);
  });

  it("totale non rilevato", () => {
    expect(codici("fattura", fattura({ totale_documento: null }))).toEqual(["missing_totale"]);
  });

  it("il riepilogo IVA deve sommare ai totali e ogni imposta essere imponibile × aliquota", () => {
    const incoerente = fattura({ riepilogo_iva: [{ aliquota: 22, imponibile: 1000, imposta: 200 }] });
    expect(codici("fattura", incoerente).sort()).toEqual(["riepilogo_aliquota_mismatch", "riepilogo_iva_mismatch"]);
    const duePezzi = fattura({
      riepilogo_iva: [
        { aliquota: 22, imponibile: 600, imposta: 132 },
        { aliquota: 22, imponibile: 400, imposta: 88 },
      ],
    });
    expect(codici("fattura", duePezzi)).toEqual([]);
    const imponibileDiverso = fattura({ riepilogo_iva: [{ aliquota: 22, imponibile: 900, imposta: 198 }] });
    expect(codici("fattura", imponibileDiverso).sort()).toEqual(["riepilogo_imponibile_mismatch", "riepilogo_iva_mismatch"]);
  });

  it("la somma delle righe diversa dall'imponibile è solo un avviso (sconti, bollo, rivalse)", () => {
    const esito = controllaDocumento(
      "fattura",
      fattura({ righe: [{ descrizione: "Cemento", quantita: 10, totale_riga: 600 }, { descrizione: "Sabbia", quantita: 8, totale_riga: 300 }] }),
      OGGI,
    );
    expect(esito.warnings.map((w) => [w.code, w.severity])).toEqual([["righe_imponibile_mismatch", "warn"]]);
  });

  it("le date devono esistere, non stare nel futuro e la scadenza non precede la fattura", () => {
    expect(codici("fattura", fattura({ data_fattura: "2026-13-45" }))).toContain("data_non_valida");
    expect(codici("fattura", fattura({ data_fattura: "12/10/2026" }))).toContain("data_non_valida");
    expect(codici("fattura", fattura({ data_fattura: "2027-03-01", data_scadenza: "2027-04-01" }))).toContain("data_futura");
    expect(codici("fattura", fattura({ data_fattura: "2012-01-05", data_scadenza: "2012-02-05" }))).toContain("data_molto_vecchia");
    expect(codici("fattura", fattura({ data_scadenza: "2026-10-01" }))).toEqual(["scadenza_prima_della_data"]);
    // un giorno di scarto sul fuso non è un errore
    expect(codici("fattura", fattura({ data_fattura: "2026-10-31", data_scadenza: "2026-11-30" }))).toEqual([]);
  });

  it("la ricevuta non chiede P.IVA né numero", () => {
    expect(codici("ricevuta", { totale: 50, imponibile: 40.98, iva: 9.02 })).toEqual([]);
  });
});

describe("DDT", () => {
  const ddt = (extra: Record<string, unknown> = {}) => ({
    intestazione: { numero_ddt: "883", data_ddt: "2026-10-20", causale: "Vendita" },
    mittente: { ragione_sociale: "Laterizi Bianchi S.p.A.", partita_iva: pivaCon("0987654321") },
    destinatario: { ragione_sociale: "Impresa Verdi S.r.l.", partita_iva: null as string | null },
    righe_merce: [{ descrizione: "Mattoni forati", unita_misura: "pz", quantita: 1200, importo_eur: 480 }],
    totali: { imponibile_eur: 480, iva_eur: 105.6, totale_documento_eur: 585.6 },
    ...extra,
  });

  it("un DDT letto bene non ha avvisi", () => {
    expect(codici("ddt", ddt())).toEqual([]);
  });
  it("mancano mittente, destinatario, numero, righe", () => {
    const vuoto = ddt({ mittente: null, destinatario: { ragione_sociale: "" }, intestazione: {}, righe_merce: [] });
    expect(codici("ddt", vuoto).sort()).toEqual(["missing_destinatario", "missing_mittente", "missing_numero_ddt", "no_righe"]);
  });
  it("mittente e destinatario uguali: il caso dei due riquadri confusi", () => {
    const stesso = ddt({ destinatario: { ragione_sociale: "laterizi bianchi s.p.a." } });
    expect(codici("ddt_in", stesso)).toEqual(["mittente_uguale_destinatario"]);
  });
  it("righe senza quantità e P.IVA scritta male", () => {
    const sporco = ddt({
      righe_merce: [{ descrizione: "A", quantita: 0 }, { descrizione: "B", quantita: null }, { descrizione: "C", quantita: 3 }],
      mittente: { ragione_sociale: "Laterizi Bianchi", partita_iva: "12345678900" },
    });
    expect(codici("ddt", sporco).sort()).toEqual(["invalid_piva_mittente", "righe_senza_quantita"]);
  });
  it("il totale che non quadra è un avviso, non un errore (i DDT si compilano a mano)", () => {
    const esito = controllaDocumento("ddt", ddt({ totali: { imponibile_eur: 480, iva_eur: 105.6, totale_documento_eur: 600 } }), OGGI);
    expect(esito.warnings.map((w) => [w.code, w.severity])).toEqual([["totale_imponibile_iva_mismatch", "warn"]]);
  });
  it("legge anche la forma vecchia (mittente e destinatario come testo)", () => {
    expect(codici("ddt", { mittente: "A", destinatario: "B", righe: [{ quantita: 2 }], numero_ddt: "1" })).toEqual([]);
  });
});

describe("computo e preventivo", () => {
  it("la somma delle voci deve dare il totale lavori, con un euro di tolleranza", () => {
    const voci = [{ importo: 100 }, { importo: 250.5 }, { importo: 49.5 }];
    expect(codici("computo_metrico", { totale_lavori: 400, righe: voci })).toEqual([]);
    expect(codici("computo_metrico", { totale_lavori: 400.9, righe: voci })).toEqual([]);
    expect(codici("preventivo", { totale: 450, voci })).toEqual(["righe_totale_mismatch"]);
  });
  it("nessuna riga è un avviso", () => {
    expect(codici("computo_metrico", { totale: 100, righe: [] })).toEqual(["no_righe"]);
  });
});

describe("casi limite", () => {
  it("nessun campo → un avviso e punteggio 0,4", () => {
    const esito = controllaDocumento("fattura", null, OGGI);
    expect(esito.warnings.map((w) => w.code)).toEqual(["no_fields"]);
    expect(esito.score).toBe(0.4);
    expect(controllaDocumento("fattura", undefined, OGGI).score).toBe(0.4);
  });
  it("un tipo che non conosce non produce avvisi", () => {
    const esito = controllaDocumento("polizza_assicurativa", { numero: "1" }, OGGI);
    expect(esito).toEqual({ warnings: [], score: 1, daVerificare: [] });
  });
  it("il punteggio non scende sotto zero", () => {
    const peggio = {
      cedente: { piva: "12345678900" },
      cessionario: { piva: "00000000001" },
      imponibile_totale: 1,
      iva_totale: 1,
      totale_documento: 99,
      data_fattura: "boh",
    };
    const esito = controllaDocumento("fattura", peggio, OGGI);
    expect(esito.score).toBeGreaterThanOrEqual(0);
    expect(esito.score).toBeLessThan(0.5);
  });
});

describe("statoAnalisi: cosa si mostra e cosa si salva", () => {
  it("tutto a posto → riuscita, mostrata e salvata", () => {
    expect(statoAnalisi({ haErrori: false, score: 0.95, passoFallito: false })).toEqual({ mostrato: "success", salvato: "success" });
  });
  it("punteggio sotto 0,6 o errori → da rivedere, e si salva così", () => {
    expect(statoAnalisi({ haErrori: false, score: 0.59, passoFallito: false })).toEqual({ mostrato: "review_required", salvato: "review_required" });
    expect(statoAnalisi({ haErrori: true, score: 0.95, passoFallito: false })).toEqual({ mostrato: "review_required", salvato: "review_required" });
  });
  it("0,6 giusto basta per «riuscita»", () => {
    expect(statoAnalisi({ haErrori: false, score: 0.6, passoFallito: false }).mostrato).toBe("success");
  });
  it("il passo che legge i dati è fallito → all'utente «da rivedere», ma si salva «failed»", () => {
    // Un risultato monco salvato come «da rivedere» verrebbe riusato per impronta del file
    // e lo stesso documento, rimandato dopo la ricarica, non sarebbe mai riletto.
    expect(statoAnalisi({ haErrori: false, score: 1, passoFallito: true })).toEqual({ mostrato: "review_required", salvato: "failed" });
    expect(statoAnalisi({ haErrori: true, score: 0.2, passoFallito: true })).toEqual({ mostrato: "review_required", salvato: "failed" });
  });
});

describe("conAvvisi: avvisi trovati fuori dal documento", () => {
  const registrata = { code: "fattura_gia_registrata", field: "numero_fattura", message: "Questa fattura risulta già registrata", severity: "warn" as const };

  it("senza avvisi in più restituisce lo stesso esito, senza ricalcolare", () => {
    const base = controllaDocumento("fattura", fattura(), OGGI);
    expect(conAvvisi(base, [])).toBe(base);
  });
  it("aggiunge l'avviso, abbassa il punteggio e segna il campo da guardare", () => {
    const base = controllaDocumento("fattura", fattura(), OGGI);
    expect(base.warnings).toEqual([]);
    const con = conAvvisi(base, [registrata]);
    expect(con.warnings.map((w) => w.code)).toEqual(["fattura_gia_registrata"]);
    expect(con.score).toBeCloseTo(0.9, 10);
    expect(con.daVerificare).toEqual(["numero_fattura"]);
  });
  it("non tocca l'esito di partenza", () => {
    const base = controllaDocumento("fattura", fattura({ totale_documento: 1300 }), OGGI);
    const prima = JSON.stringify(base);
    conAvvisi(base, [registrata]);
    expect(JSON.stringify(base)).toBe(prima);
  });
  it("un avviso informativo non abbassa il punteggio né chiede di guardare un campo", () => {
    const base = controllaDocumento("fattura", fattura(), OGGI);
    const con = conAvvisi(base, [{ code: "nota", field: "note", message: "Per tua informazione", severity: "info" }]);
    expect(con.score).toBe(1);
    expect(con.daVerificare).toEqual([]);
  });
});
