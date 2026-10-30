/**
 * Misurare la lettura dei documenti (30/10/2026).
 *
 * Il confronto fra «letto dall'AI» e «scritto davvero» deve dire la stessa cosa
 * che direbbe un contabile: 1.220,00 e 1220 sono lo stesso importo, «IT 01234567897»
 * e «01234567897» la stessa partita IVA, una cifra cambiata no. E deve separare i modi
 * di sbagliare: un valore sbagliato, uno non letto, uno inventato.
 */
import { describe, expect, it } from "vitest";
import {
  correzioniUtente,
  riepilogaSerie,
  senzaConfidenze,
  valutaLettura,
} from "../../../supabase/functions/_shared/valutaLettura";

// 13 campi da leggere: 7 della testata (cedente.cf è null: il documento non lo riporta) e 3 per ciascuna delle due righe.
const FATTURA = {
  numero_fattura: "FT-2026/118",
  data_fattura: "2026-10-12",
  cedente: { ragione_sociale: "Edil Forniture Rossi S.r.l.", piva: "01234567897", cf: null as string | null },
  imponibile_totale: 1000,
  iva_totale: 220,
  totale_documento: 1220,
  righe: [
    { descrizione: "Cemento", quantita: 10, totale_riga: 600 },
    { descrizione: "Sabbia", quantita: 8, totale_riga: 400 },
  ],
};

const esito = (v: ReturnType<typeof valutaLettura>, percorso: string) => v.campi.find((c) => c.percorso === percorso)?.esito;

describe("lettura identica", () => {
  const v = valutaLettura(FATTURA, structuredClone(FATTURA));
  it("tutto esatto, accuratezza 1, perfetta", () => {
    expect(v.conteggi).toEqual({ esatto: 13, equivalente: 0, errato: 0, mancante: 0, inventato: 0 });
    expect(v.accuratezza).toBe(1);
    expect(v.perfetta).toBe(true);
  });
  it("i campi che il documento non riporta (null) non contano", () => {
    expect(v.campi.map((c) => c.percorso)).not.toContain("cedente.cf");
  });
});

describe("valori equivalenti: stesso valore scritto in un altro modo", () => {
  const letto = {
    numero_fattura: " FT-2026/118 ",
    data_fattura: "12/10/2026",
    cedente: { ragione_sociale: "EDIL FORNITURE ROSSI SRL", piva: "IT 01234567897", cf: null as string | null },
    imponibile_totale: "1.000,00",
    iva_totale: "€ 220,00",
    totale_documento: "1220",
    righe: [
      { descrizione: "cemento", quantita: "10", totale_riga: "600,00" },
      { descrizione: "SABBIA", quantita: 8, totale_riga: 400 },
    ],
  };
  const v = valutaLettura(FATTURA, letto);
  it("non sono errori", () => {
    expect(v.conteggi.errato + v.conteggi.mancante + v.conteggi.inventato).toBe(0);
    expect(v.accuratezza).toBe(1);
    expect(v.perfetta).toBe(true);
  });
  it("ma si vede che non erano identici", () => {
    expect(esito(v, "numero_fattura")).toBe("esatto"); // gli spazi attorno non cambiano niente
    expect(esito(v, "data_fattura")).toBe("equivalente");
    expect(esito(v, "cedente.piva")).toBe("equivalente");
    expect(esito(v, "cedente.ragione_sociale")).toBe("equivalente");
    expect(esito(v, "imponibile_totale")).toBe("equivalente");
    expect(esito(v, "totale_documento")).toBe("equivalente");
    expect(esito(v, "righe[1].quantita")).toBe("esatto");
  });
});

describe("i quattro modi di sbagliare", () => {
  const letto = {
    numero_fattura: "FT-2026/119", // errato: una cifra
    data_fattura: "2026-10-12",
    cedente: { ragione_sociale: "Edil Forniture Rossi S.r.l.", piva: "01234567879", cf: "RSSMRA80A01H501U" }, // piva errata; cf inventato
    imponibile_totale: 1000,
    iva_totale: 220,
    totale_documento: null as number | null, // mancante
    righe: [{ descrizione: "Cemento", quantita: 10, totale_riga: 600 }], // manca la seconda riga (3 campi)
  };
  const v = valutaLettura(FATTURA, letto);
  it("conta ognuno per conto suo", () => {
    expect(v.conteggi).toEqual({ esatto: 7, equivalente: 0, errato: 2, mancante: 4, inventato: 1 });
    expect(esito(v, "numero_fattura")).toBe("errato");
    expect(esito(v, "cedente.piva")).toBe("errato");
    expect(esito(v, "cedente.cf")).toBe("inventato");
    expect(esito(v, "totale_documento")).toBe("mancante");
    expect(["righe[1].descrizione", "righe[1].quantita", "righe[1].totale_riga"].map((p) => esito(v, p))).toEqual(["mancante", "mancante", "mancante"]);
  });
  it("l'accuratezza è sui campi attesi; l'inventato non la alza né la abbassa, ma toglie la «perfetta»", () => {
    expect(v.accuratezza).toBeCloseTo(7 / 13, 10);
    expect(v.perfetta).toBe(false);
  });
});

describe("numeri", () => {
  const conTotale = (letto: unknown) => esito(valutaLettura({ totale: 1220 }, { totale: letto }), "totale");
  it("la tolleranza è mezzo centesimo", () => {
    expect(conTotale(1219.996)).toBe("esatto");
    expect(conTotale(1220.01)).toBe("errato");
    expect(conTotale("1.220,01")).toBe("errato");
  });
  it("qualcosa che non è un numero è sbagliato", () => {
    expect(conTotale("circa mille")).toBe("errato");
  });
  it("lo zero è un valore: letto null è mancante, non «tutto a posto»", () => {
    expect(esito(valutaLettura({ iva: 0 }, { iva: 0 }), "iva")).toBe("esatto");
    expect(esito(valutaLettura({ iva: 0 }, { iva: null }), "iva")).toBe("mancante");
  });
});

describe("testi", () => {
  const confronta = (atteso: string, letto: string) => esito(valutaLettura({ x: atteso }, { x: letto }), "x");
  it("maiuscole, accenti e punteggiatura non fanno la differenza", () => {
    expect(confronta("Società Edile S.r.l.", "SOCIETA EDILE SRL")).toBe("equivalente");
    expect(confronta("Via Roma, 12", "Via Roma 12")).toBe("equivalente");
  });
  it("una cifra o una lettera diversa sì", () => {
    expect(confronta("FT-2026/118", "FT-2026/119")).toBe("errato");
    expect(confronta("Rossi", "Rosso")).toBe("errato");
  });
  it("il punto decimale fra due cifre non sparisce: 12.5 non è 125", () => {
    expect(confronta("12.5", "125")).toBe("errato");
    expect(confronta("1,5 kg", "15 kg")).toBe("errato");
  });
  it("un oggetto oltre la profondità massima si confronta per il suo contenuto, non come «[object Object]»", () => {
    let a: unknown = { x: 1 };
    let b: unknown = { x: 2 };
    for (let i = 0; i < 12; i++) {
      a = { n: a };
      b = { n: b };
    }
    const v = valutaLettura(a, b);
    expect(v.conteggi.errato).toBe(1);
  });
});

describe("partita IVA, codice fiscale e date", () => {
  const confronta = (campo: string, atteso: string, letto: string) => esito(valutaLettura({ [campo]: atteso }, { [campo]: letto }), campo);
  it("la partita IVA si confronta senza prefisso, spazi e punti", () => {
    expect(confronta("piva", "01234567897", "IT01234567897")).toBe("equivalente");
    expect(confronta("partita_iva", "01234567897", "012.345.678-97")).toBe("equivalente");
    expect(confronta("piva", "01234567897", "IT01234567879")).toBe("errato");
  });
  it("una partita IVA estera resta com'è", () => {
    expect(confronta("piva", "DE123456789", "de 123456789")).toBe("equivalente");
    expect(confronta("piva", "DE123456789", "DE123456788")).toBe("errato");
  });
  it("il codice fiscale ignora maiuscole e spazi", () => {
    expect(confronta("codice_fiscale", "RSSMRA80A01H501U", "rssmra80a01h501u")).toBe("equivalente");
  });
  it("le date si riconoscono in più formati, anche con l'ora", () => {
    expect(confronta("data_fattura", "2026-10-12", "12/10/2026")).toBe("equivalente");
    expect(confronta("data_scadenza", "2026-11-05", "5-11-2026")).toBe("equivalente");
    expect(confronta("ddt_date", "2026-10-12", "2026-10-12T00:00:00Z")).toBe("equivalente");
    expect(confronta("data_fattura", "2026-10-12", "21/10/2026")).toBe("errato");
  });
});

describe("liste e valori semplici", () => {
  it("le righe si abbinano per posizione: scambiate sono sbagliate", () => {
    const atteso = { righe: [{ d: "A" }, { d: "B" }] };
    const v = valutaLettura(atteso, { righe: [{ d: "B" }, { d: "A" }] });
    expect(v.conteggi.errato).toBe(2);
  });
  it("righe in più sono inventate", () => {
    const v = valutaLettura({ righe: [{ d: "A" }] }, { righe: [{ d: "A" }, { d: "B" }] });
    expect(v.conteggi).toMatchObject({ esatto: 1, inventato: 1 });
  });
  it("un valore solo ha il percorso «(valore)»", () => {
    const v = valutaLettura("ABC", "abc");
    expect(v.campi).toEqual([{ percorso: "(valore)", atteso: "ABC", letto: "abc", esito: "equivalente" }]);
  });
  it("i booleani si confrontano alla lettera", () => {
    expect(esito(valutaLettura({ ok: true }, { ok: "true" }), "ok")).toBe("errato");
    expect(esito(valutaLettura({ ok: true }, { ok: true }), "ok")).toBe("esatto");
  });
  it("niente da leggere → accuratezza null, e una lettura vuota è perfetta", () => {
    const v = valutaLettura({ a: null, b: "" }, { a: null });
    expect(v.accuratezza).toBeNull();
    expect(v.perfetta).toBe(true);
  });
  it("documenti enormi non bloccano: le foglie sono limitate", () => {
    const grande = { righe: Array.from({ length: 6000 }, (_, i) => ({ d: `riga ${i}` })) };
    const v = valutaLettura(grande, grande);
    expect(v.campi.length).toBeLessThanOrEqual(4000);
  });
});

describe("correzioniUtente: cosa ha cambiato chi ha confermato", () => {
  it("niente cambiato → niente correzioni (anche se scritto in un altro formato)", () => {
    expect(correzioniUtente(FATTURA, { ...FATTURA, data_fattura: "12/10/2026" })).toEqual([]);
  });
  it("un valore cambiato, uno aggiunto, uno tolto", () => {
    const letto = { totale: 1220, piva: "IT01234567879", cf: "XXXX", note: null as string | null };
    const confermato = { totale: 1200, piva: "01234567879", cf: null as string | null, note: "pagata" };
    expect(correzioniUtente(letto, confermato).map((c) => [c.percorso, c.letto, c.confermato])).toEqual([
      ["totale", 1220, 1200],
      ["cf", "XXXX", null],
      ["note", null, "pagata"],
    ]);
  });
});

describe("riepilogaSerie: su più documenti", () => {
  const buono = valutaLettura(FATTURA, FATTURA);
  const cattivo = valutaLettura(FATTURA, {
    ...FATTURA,
    totale_documento: 999,
    righe: [{ descrizione: "Cemento", quantita: 11, totale_riga: 600 }, FATTURA.righe[1]],
    cedente: { ...FATTURA.cedente, cf: "INVENTATO" },
  });
  const r = riepilogaSerie([buono, cattivo]);

  it("conta i documenti e quelli perfetti", () => {
    expect(r.documenti).toBe(2);
    expect(r.perfetti).toBe(1);
  });
  it("l'accuratezza è su tutti i campi attesi di tutti i documenti", () => {
    expect(r.accuratezza).toBeCloseTo((13 + 11) / 26, 10);
  });
  it("i campi delle righe si raggruppano senza la posizione, e i peggiori vengono per primi", () => {
    const quantita = r.perCampo.find((c) => c.campo === "righe[].quantita")!;
    expect(quantita).toMatchObject({ attesi: 4, giusti: 3, errati: 1, accuratezza: 0.75 });
    expect(r.perCampo[0].campo).toBe("totale_documento");
    expect(r.perCampo[0]).toMatchObject({ attesi: 2, giusti: 1, errati: 1, accuratezza: 0.5 });
  });
  it("un campo inventato e mai atteso non ha accuratezza", () => {
    const cf = r.perCampo.find((c) => c.campo === "cedente.cf")!;
    expect(cf).toMatchObject({ attesi: 0, inventati: 1, accuratezza: null });
  });
  it("serie vuota", () => {
    expect(riepilogaSerie([])).toEqual({ documenti: 0, perfetti: 0, accuratezza: null, perCampo: [] });
  });
});

describe("senzaConfidenze: le bozze delle email scrivono i campi come {valore, conf}", () => {
  const BOZZA = {
    tipo: "fattura",
    campi: {
      numero: { valore: "FT-2026/118", conf: 0.97 },
      totale: { valore: 1220, conf: 0.99 },
      iban: { valore: null as string | null, conf: 0 },
      righe: [{ descrizione: { valore: "Cemento", conf: 0.9 }, quantita: 10 }],
    },
  };
  it("tiene il solo valore, anche dentro le liste", () => {
    expect(senzaConfidenze(BOZZA.campi)).toEqual({
      numero: "FT-2026/118",
      totale: 1220,
      iban: null,
      righe: [{ descrizione: "Cemento", quantita: 10 }],
    });
  });
  it("un oggetto che ha anche altro accanto a «valore» resta com'è", () => {
    const v = { valore: 5, unita: "mq" };
    expect(senzaConfidenze(v)).toEqual(v);
  });
  it("senza togliere le confidenze, ogni «conf» sembrerebbe un campo inventato", () => {
    const scritto = { numero: "FT-2026/118", totale: 1220 };
    expect(valutaLettura(scritto, BOZZA.campi).conteggi.inventato).toBeGreaterThan(0);
    expect(valutaLettura(scritto, senzaConfidenze({ numero: BOZZA.campi.numero, totale: BOZZA.campi.totale })).perfetta).toBe(true);
  });
  it("valori semplici passano invariati", () => {
    for (const v of [null, 3, "x", true, undefined]) expect(senzaConfidenze(v)).toBe(v);
  });
});
