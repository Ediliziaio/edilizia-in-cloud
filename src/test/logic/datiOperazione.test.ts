import { describe, expect, it } from "vitest";
import { datiMancanti, giorniA, leggiDatiSezioni, SEZIONI_PER_MODELLO } from "@/lib/orders/generali/datiOperazione";

/** Dati della commessa generale per tipologia (14/11/2026). */
const base = { clienteId: null, indirizzo: null, inizio: null, fine: null, dati: {} };

describe("dati per tipologia", () => {
  it("ogni tipologia ha le sue sezioni", () => {
    expect(SEZIONI_PER_MODELLO.appalto.map((s) => s.id)).toEqual(["appalto"]);
    expect(SEZIONI_PER_MODELLO.sviluppo.map((s) => s.id)).toEqual(["area", "titolo", "tecnici"]);
    expect(SEZIONI_PER_MODELLO.compravendita.map((s) => s.id)).toEqual(["immobile", "ristrutturazione", "rivendita"]);
  });

  it("cosa manca, per tipologia", () => {
    expect(datiMancanti({ ...base, modello: "appalto" }).map((m) => m.id)).toEqual(["cliente", "tipo", "indirizzo", "inizio"]);
    expect(datiMancanti({ ...base, modello: "sviluppo" }).map((m) => m.id)).toEqual(["indirizzo", "inizio", "titolo"]);
    expect(datiMancanti({ ...base, modello: "compravendita" }).map((m) => m.id)).toEqual(["indirizzo", "inizio", "immobile"]);
    // Compravendita: l'indirizzo dell'immobile acquistato basta come indirizzo.
    expect(datiMancanti({ ...base, modello: "compravendita", inizio: "2027-01-01", dati: { immobile: { indirizzo: "Via Po 1", prezzo: 200000, data_rogito: "2027-01-10" } } })).toEqual([]);
    expect(datiMancanti({ ...base, modello: "appalto", clienteId: "c", indirizzo: "x", inizio: "2027-01-01", dati: { appalto: { tipo: "Pubblico" } } })).toEqual([]);
  });

  it("la lettura dal database scarta quello che non è un valore semplice", () => {
    expect(leggiDatiSezioni({ note: "ok", titolo: { tipo: "SCIA", x: { a: 1 }, n: 3 }, rotto: "testo", lista: [1] })).toEqual({ note: "ok", titolo: { tipo: "SCIA", n: 3 } });
    expect(leggiDatiSezioni(null)).toEqual({});
  });

  it("giorni a una data", () => {
    const oggi = new Date(2026, 10, 14);
    expect(giorniA("2026-11-24", oggi)).toBe(10);
    expect(giorniA("2026-11-04", oggi)).toBe(-10);
    expect(giorniA(null, oggi)).toBeNull();
  });
});
