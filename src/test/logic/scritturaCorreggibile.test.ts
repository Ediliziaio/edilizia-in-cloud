/**
 * Correggere il giornale quando c'è un errore (25/11/2026). Fino a ieri una scrittura
 * nata da una fattura non si poteva né modificare né eliminare: l'unica via era rifare
 * il documento. Adesso, finché il periodo è provvisorio, si corregge e si elimina com'è;
 * nei periodi stampati e negli esercizi chiusi resta lo storno.
 */
import { describe, expect, it } from "vitest";
import type { Scrittura } from "@/lib/contabilita/libroGiornale";
import {
  percheScritturaNonCorreggibile,
  percheScritturaNonRettificabile,
  scritturaProvvisoria,
} from "@/lib/contabilita/rettificaScrittura";

const scrittura = (extra: Partial<Scrittura> = {}): Scrittura => ({
  id: "s1", esercizio: 2026, numero: 317, data_registrazione: "2026-09-30",
  causale: "Fattura ricevuta", descrizione: "INERTI VALFINO SRL", documento_numero: "2026-FT1-0001855",
  documento_data: "2026-09-30", origine: "fattura_ricevuta", storno_di: null, contabilita_righe: [], ...extra,
});

type StatoEsercizio = { chiuso_il: string | null; stampato_fino_al: string | null };
const aperto: StatoEsercizio = { chiuso_il: null, stampato_fino_al: null };
const nessunoStorno = new Set<string>();
const stampato: StatoEsercizio = { chiuso_il: null, stampato_fino_al: "2026-10-31" };

describe("quando una scrittura si può correggere", () => {
  it("una scrittura da fattura in un periodo provvisorio si corregge", () => {
    expect(percheScritturaNonCorreggibile(scrittura(), nessunoStorno, aperto)).toBeNull();
  });

  it("col giornale stampato fino a quella data serve lo storno", () => {
    const motivo = percheScritturaNonCorreggibile(scrittura(), nessunoStorno, stampato);
    expect(motivo).toContain("documento");
    expect(scritturaProvvisoria(scrittura(), stampato)).toBe(false);
  });

  it("con l'esercizio chiuso serve lo storno", () => {
    expect(percheScritturaNonCorreggibile(scrittura(), nessunoStorno, { chiuso_il: "2027-03-31", stampato_fino_al: null } as StatoEsercizio)).not.toBeNull();
  });

  it("uno storno e una scrittura già stornata restano intoccabili", () => {
    expect(percheScritturaNonCorreggibile(scrittura({ storno_di: "s0", origine: "storno" }), nessunoStorno, aperto)).toBe("È già uno storno.");
    expect(percheScritturaNonCorreggibile(scrittura({ stornata: true }), nessunoStorno, aperto)).toBe("La scrittura è già stata stornata.");
    expect(percheScritturaNonCorreggibile(scrittura(), new Set(["s1"]), aperto)).toBe("La scrittura è già stata stornata.");
  });

  it("una scrittura a mano resta correggibile come prima", () => {
    expect(percheScritturaNonCorreggibile(scrittura({ origine: "manuale" }), nessunoStorno, aperto)).toBeNull();
    expect(percheScritturaNonRettificabile(scrittura({ origine: "manuale" }), nessunoStorno)).toBeNull();
  });

  it("la regola vecchia dello storno non è cambiata: da documento, solo il documento", () => {
    expect(percheScritturaNonRettificabile(scrittura(), nessunoStorno)).toContain("nasce da un documento");
  });

  it("senza lo stato dell'esercizio non si rischia: vale la regola vecchia", () => {
    expect(percheScritturaNonCorreggibile(scrittura(), nessunoStorno, undefined)).toContain("nasce da un documento");
  });
});
