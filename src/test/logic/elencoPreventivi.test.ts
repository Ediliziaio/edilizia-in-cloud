import { describe, expect, it } from "vitest";
import {
  appartieneAllaVista, contaPerStato, eBozzaVuota, eDaSeguire, etichettaEta, giorniDa, vistaDaTesto,
} from "@/lib/preventivi/elencoPreventivi";

const ADESSO = new Date("2026-10-02T12:00:00Z");
const giorniFa = (n: number) => new Date(ADESSO.getTime() - n * 86_400_000).toISOString();
const riga = (stato_unif: string, totale: number | null, data = giorniFa(0)) => ({ stato_unif, totale, data });

describe("bozze vuote", () => {
  it("è vuota la bozza senza importo, a zero o negativo", () => {
    expect(eBozzaVuota(riga("bozza", null))).toBe(true);
    expect(eBozzaVuota(riga("bozza", 0))).toBe(true);
    expect(eBozzaVuota(riga("bozza", -5))).toBe(true);
  });
  it("una bozza con importo, o un altro stato, non lo è", () => {
    expect(eBozzaVuota(riga("bozza", 335.5))).toBe(false);
    expect(eBozzaVuota(riga("in_corso", 0))).toBe(false);
    expect(eBozzaVuota(riga("perso", null))).toBe(false);
  });
});

describe("da seguire", () => {
  it("solo i preventivi in corso fermi da almeno 7 giorni", () => {
    expect(eDaSeguire(riga("in_corso", 100, giorniFa(7)), ADESSO)).toBe(true);
    expect(eDaSeguire(riga("in_corso", 100, giorniFa(6)), ADESSO)).toBe(false);
    expect(eDaSeguire(riga("bozza", 100, giorniFa(30)), ADESSO)).toBe(false);
    expect(eDaSeguire(riga("vinto", 100, giorniFa(30)), ADESSO)).toBe(false);
  });
  it("una data non valida non finisce tra quelli da seguire", () => {
    expect(eDaSeguire(riga("in_corso", 100, "boh"), ADESSO)).toBe(false);
  });
  it("la vista filtra come dichiarato", () => {
    const v = riga("in_corso", 10, giorniFa(20));
    expect(appartieneAllaVista(v, "tutte", ADESSO)).toBe(true);
    expect(appartieneAllaVista(v, "da_seguire", ADESSO)).toBe(true);
    expect(appartieneAllaVista(v, "bozze_vuote", ADESSO)).toBe(false);
  });
  it("testo sconosciuto nell'indirizzo = tutte", () => {
    expect(vistaDaTesto("da_seguire")).toBe("da_seguire");
    expect(vistaDaTesto("zzz")).toBe("tutte");
    expect(vistaDaTesto(null)).toBe("tutte");
  });
});

describe("quanto tempo fa", () => {
  it.each([
    [0, "oggi"], [1, "ieri"], [3, "3 giorni fa"], [13, "13 giorni fa"],
    [14, "2 sett. fa"], [45, "6 sett. fa"], [90, "3 mesi fa"], [400, "1 anno fa"], [800, "2 anni fa"],
  ])("%i giorni → %s", (g, atteso) => {
    expect(etichettaEta(giorniFa(g), ADESSO)).toBe(atteso);
  });
  it("data non valida → null; data nel futuro → oggi", () => {
    expect(etichettaEta("boh", ADESSO)).toBeNull();
    expect(giorniDa("boh", ADESSO)).toBeNull();
    expect(etichettaEta(giorniFa(-3), ADESSO)).toBe("oggi");
  });
});

describe("conteggi per stato", () => {
  it("la somma degli stati, «altro» compreso, torna col totale", () => {
    const c = contaPerStato([riga("bozza", 0), riga("bozza", 1), riga("in_corso", 1), riga("altro", 1)]);
    expect(c.all).toBe(4);
    expect((c.bozza ?? 0) + (c.in_corso ?? 0) + (c.vinto ?? 0) + (c.perso ?? 0) + (c.altro ?? 0)).toBe(c.all);
  });
});
