/**
 * Quello che il preventivo conserva del risparmio energetico (06/10/2026): campi arrotondati come le colonne, e
 * spegnere il risparmio azzera anche l'importo (il PDF decide dall'importo, non dal segno di spunta).
 */
import { describe, expect, it } from "vitest";
import { calcolaCashflow } from "@/lib/serramenti/ecobonus";
import { calcolaRisparmio } from "@/lib/serramenti/risparmio";
import { campiRisparmio, paybackAtteso } from "@/lib/serramenti/risparmioPreventivo";

const calcolo = calcolaRisparmio({ zona_climatica: "E", m2_serramenti: 6.72, uw_attuale: 2.8, uw_nuovo: 1.1 });

describe("campiRisparmio", () => {
  it("acceso: importo al centesimo, CO₂ al chilo di tonnellata, zona del calcolo", () => {
    const campi = campiRisparmio(calcolo, { totale: 11_000, detrazioneEurAnno: 550 });
    expect(campi.risparmio_calcolato).toBe(true);
    expect(campi.risparmio_eur_anno).toBe(Math.round(calcolo.risparmio_eur_anno * 100) / 100);
    expect(campi.co2_risparmiata_t_anno).toBe(Math.round((calcolo.co2_risparmiata_kg_anno / 1000) * 1000) / 1000);
    expect(campi.cantiere_zona_climatica).toBe("E");
  });

  it("il payback si calcola dal risparmio GIÀ arrotondato, quello che resta scritto", () => {
    const campi = campiRisparmio(calcolo, { totale: 4_000, detrazioneEurAnno: 550 });
    expect(campi.payback_anni).toBe(paybackAtteso({ totale: 4_000, risparmioEurAnno: campi.risparmio_eur_anno as number, detrazioneEurAnno: 550 }));
    expect(campi.payback_anni).not.toBeNull();
  });

  it("senza detrazione non c'è payback da scrivere: il campo manca, non è null", () => {
    const campi = campiRisparmio(calcolo, { totale: 11_000, detrazioneEurAnno: null });
    expect("payback_anni" in campi).toBe(false);
  });

  it("spento (o senza serramenti): si azzera tutto, importo compreso — il PDF decide da lì — ma non la zona", () => {
    const campi = campiRisparmio(null, { totale: 11_000, detrazioneEurAnno: 550 });
    expect(campi).toEqual({ risparmio_calcolato: false, risparmio_eur_anno: null, co2_risparmiata_t_anno: null, payback_anni: null });
    expect("cantiere_zona_climatica" in campi).toBe(false);
  });
});

describe("paybackAtteso", () => {
  it("è l'anno di pareggio di calcolaCashflow, con l'inflazione di sempre (3%)", () => {
    const direct = calcolaCashflow({ costo_iniziale: 8_000, risparmio_eur_anno: 400, detrazione_eur_anno: 400, inflazione_energia_pct: 3 });
    expect(paybackAtteso({ totale: 8_000, risparmioEurAnno: 400, detrazioneEurAnno: 400 })).toBe(direct.payback_anni);
  });
  it("oltre i 10 anni non c'è un anno di pareggio: null", () => {
    expect(paybackAtteso({ totale: 22_000, risparmioEurAnno: 100, detrazioneEurAnno: 100 })).toBeNull();
  });
});
