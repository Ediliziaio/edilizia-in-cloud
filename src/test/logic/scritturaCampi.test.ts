/**
 * «Scrivere solo se è cambiato» (06/10/2026): lo step Economia scrive nel preventivo senza pulsante e non deve
 * scrivere a vuoto, nemmeno per come tornano i dati dal database.
 */
import { describe, expect, it } from "vitest";
import { valoriDiversi } from "@/lib/serramenti/scritturaCampi";

describe("valoriDiversi", () => {
  it("vuoto è uguale a vuoto: null, undefined", () => {
    expect(valoriDiversi(null, undefined)).toBe(false);
    expect(valoriDiversi(undefined, null)).toBe(false);
  });

  it("vuoto contro un valore è una differenza, anche se il valore è zero o falso", () => {
    expect(valoriDiversi(null, 0)).toBe(true);
    expect(valoriDiversi(undefined, false)).toBe(true);
    expect(valoriDiversi(40, null)).toBe(true);
  });

  it("i numeri che tornano come testo dal database sono quelli di prima", () => {
    expect(valoriDiversi("40.00", 40)).toBe(false);
    expect(valoriDiversi(40, "40.00")).toBe(false);
    expect(valoriDiversi("40.00", 45)).toBe(true);
  });

  it("i numeri si confrontano con una piccola tolleranza (la colonna arrotonda)", () => {
    expect(valoriDiversi(201.6, 201.60000000001)).toBe(false);
    expect(valoriDiversi(201.6, 201.61)).toBe(true);
  });

  it("le liste e gli oggetti si confrontano per contenuto", () => {
    expect(valoriDiversi([{ a: 1 }], [{ a: 1 }])).toBe(false);
    expect(valoriDiversi([{ a: 1 }], [{ a: 2 }])).toBe(true);
    expect(valoriDiversi([], [])).toBe(false);
    expect(valoriDiversi([], [1])).toBe(true);
  });

  // Il database restituisce le liste (jsonb) con le chiavi in un altro ordine da quello in cui le scrive il codice: per
  // lunghezza e poi in ordine alfabetico (when, label, percentuale), mentre il codice scrive label, percentuale, when.
  const dalDatabase = [{ when: "Firma contratto", label: "Acconto alla firma", percentuale: 30 }, { when: null, label: "Saldo", percentuale: 70 }];
  const dalCodice = [{ label: "Acconto alla firma", percentuale: 30, when: "Firma contratto" }, { label: "Saldo", percentuale: 70, when: null }];

  it("le liste di oggetti si confrontano senza guardare l'ordine delle chiavi (database: when, label, percentuale; codice: label, percentuale, when)", () => {
    expect(JSON.stringify(dalDatabase)).not.toBe(JSON.stringify(dalCodice)); // è il motivo per cui JSON.stringify non basta
    expect(valoriDiversi(dalDatabase, dalCodice)).toBe(false);
    expect(valoriDiversi(dalCodice, dalDatabase)).toBe(false);
    expect(valoriDiversi({ a: 1, b: { c: 2, d: 3 } }, { b: { d: 3, c: 2 }, a: 1 })).toBe(false);
  });

  it("una differenza vera si vede lo stesso: un numero, un testo, un elemento in più o in meno, l'ordine degli elementi", () => {
    expect(valoriDiversi(dalDatabase, dalCodice.map((r, i) => (i === 0 ? { ...r, percentuale: 35 } : r)))).toBe(true);
    expect(valoriDiversi(dalDatabase, dalCodice.map((r, i) => (i === 1 ? { ...r, label: "Saldo finale" } : r)))).toBe(true);
    expect(valoriDiversi(dalDatabase, dalCodice.map((r, i) => (i === 0 ? { ...r, when: "Posa" } : r)))).toBe(true);
    expect(valoriDiversi(dalDatabase, dalCodice.slice(0, 1))).toBe(true);
    expect(valoriDiversi(dalDatabase.slice(0, 1), dalDatabase)).toBe(true);
    expect(valoriDiversi(dalDatabase, [...dalCodice].reverse())).toBe(true);
    expect(valoriDiversi({ a: 1 }, { a: 1, b: 2 })).toBe(true);
    expect(valoriDiversi({ a: 1, b: 2 }, { a: 1 })).toBe(true); // il campo in più può stare da una parte o dall'altra
    expect(valoriDiversi([{ label: "Saldo", when: "Posa" }], [{ label: "Saldo" }])).toBe(true);
    expect(valoriDiversi([{ label: "Saldo" }], [{ label: "Saldo", when: "Posa" }])).toBe(true);
    expect(valoriDiversi({ a: { c: 2 } }, { a: { c: 3 } })).toBe(true);
  });

  it("un campo mancante e un campo vuoto sono la stessa cosa anche dentro le liste; vuoto contro un valore è una differenza", () => {
    expect(valoriDiversi([{ label: "Saldo", percentuale: 70 }], [{ label: "Saldo", percentuale: 70, when: null }])).toBe(false);
    expect(valoriDiversi([{ label: "Saldo", percentuale: 70, when: undefined }], [{ label: "Saldo", percentuale: 70, when: null }])).toBe(false);
    expect(valoriDiversi([{ label: "Saldo", percentuale: 70 }], [{ label: "Saldo", percentuale: 70, when: "Fine lavori" }])).toBe(true);
    expect(valoriDiversi([{ label: "Saldo", percentuale: 70, when: 0 }], [{ label: "Saldo", percentuale: 70, when: null }])).toBe(true);
  });

  it("i numeri dentro le liste si confrontano come quelli fuori: testo del database e piccola tolleranza", () => {
    expect(valoriDiversi([{ percentuale: "30.00" }], [{ percentuale: 30 }])).toBe(false);
    expect(valoriDiversi([{ rata: 201.6 }], [{ rata: 201.60000000001 }])).toBe(false);
    expect(valoriDiversi([{ rata: 201.6 }], [{ rata: 201.61 }])).toBe(true);
  });

  it("dentro una lista due testi che somigliano a numeri restano due testi: il nome di una rata «1» non è «1.0»", () => {
    expect(valoriDiversi([{ label: "1" }], [{ label: "1.0" }])).toBe(true);
    expect(valoriDiversi([{ label: "1" }], [{ label: "1" }])).toBe(false);
    expect(valoriDiversi({ when: "02" }, { when: "2" })).toBe(true);
    // di fuori, come sempre, il testo del database vale come numero
    expect(valoriDiversi("40.00", "40")).toBe(false);
  });

  it("i testi e i booleani si confrontano esatti; un testo non numerico non diventa numero", () => {
    expect(valoriDiversi("acconto_finanziato", "acconto_finanziato")).toBe(false);
    expect(valoriDiversi("tre_step", "personalizzato")).toBe(true);
    expect(valoriDiversi(true, false)).toBe(true);
    expect(valoriDiversi("E", "E")).toBe(false);
    expect(valoriDiversi("", 0)).toBe(true);
  });
});
