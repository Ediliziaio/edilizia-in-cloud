/**
 * Test motore finanziario FV — focus sul CAP autoconsumo (F6).
 *
 * Bug: la cassa cumulata 25 anni calcolava `auto = produzione × autoconsumo_pct`
 * SENZA limitare all'energia effettivamente consumata, sovrastimando il risparmio
 * bolletta su impianti sovradimensionati (produzione > consumo).
 * Fix: `auto = min(produzione × autoconsumo_pct, consumo_annuo_kwh)` quando il
 * consumo è fornito; nessun cap se `consumo_annuo_kwh` è omesso (comportamento storico).
 */

import { describe, it, expect } from "vitest";
import {
  calcolaCassaCumulata,
  type InputCassaCumulata,
} from "./finanziaria";

const BASE: InputCassaCumulata = {
  investimento_iniziale: 12000,
  produzione_anno_1_kwh: 8000,
  autoconsumo_pct: 0.6,
  costo_kwh_attuale: 0.3,
  prezzo_rid_kwh: 0.1,
  detrazione_annua_eur: 0,
  durata_detrazione_anni: 10,
  inflazione_energia_pct: 0, // niente inflazione → anno 1 facile da verificare a mano
  inflazione_rid_pct: 0,
  degradazione_pannelli_pct: 0, // niente degrado → produzione costante
  costo_manutenzione_anno_eur: 0,
  costo_sostituzione_inverter_eur: 0,
  anno_sostituzione_inverter: 12,
  orizzonte_anni: 25,
};

describe("calcolaCassaCumulata — cap autoconsumo (F6)", () => {
  it("limita l'autoconsumo al consumo annuo su impianto sovradimensionato", () => {
    // prod 8000 × 60% = 4800 kWh, ma consumo è 3000 → auto deve fermarsi a 3000.
    const cassa = calcolaCassaCumulata({ ...BASE, consumo_annuo_kwh: 3000 });
    const anno1 = cassa.find((f) => f.anno === 1)!;

    // Autoconsumo cap a 3000 kWh × 0.30 €/kWh = 900 €
    expect(anno1.risparmio_bolletta_eur).toBe(900);
    // Immessa = 8000 - 3000 = 5000 kWh × 0.10 €/kWh = 500 €
    expect(anno1.ricavi_rid_eur).toBe(500);
    // Flusso netto = 900 + 500 = 1400 €
    expect(anno1.flusso).toBe(1400);
  });

  it("NON limita quando l'autoconsumo teorico è sotto il consumo", () => {
    // prod 8000 × 60% = 4800 kWh, consumo 6000 → cap non vincola, auto = 4800.
    const cassa = calcolaCassaCumulata({ ...BASE, consumo_annuo_kwh: 6000 });
    const anno1 = cassa.find((f) => f.anno === 1)!;

    // 4800 kWh × 0.30 = 1440 €
    expect(anno1.risparmio_bolletta_eur).toBe(1440);
    // Immessa = 8000 - 4800 = 3200 kWh × 0.10 = 320 €
    expect(anno1.ricavi_rid_eur).toBe(320);
    expect(anno1.flusso).toBe(1760);
  });

  it("senza consumo_annuo_kwh mantiene il comportamento storico (nessun cap)", () => {
    const cassa = calcolaCassaCumulata({ ...BASE }); // consumo omesso
    const anno1 = cassa.find((f) => f.anno === 1)!;

    // Nessun cap: auto = 4800 kWh × 0.30 = 1440 € (identico al caso consumo 6000)
    expect(anno1.risparmio_bolletta_eur).toBe(1440);
    expect(anno1.ricavi_rid_eur).toBe(320);
  });

  it("il cap si applica a tutti gli anni dell'orizzonte", () => {
    const cassa = calcolaCassaCumulata({ ...BASE, consumo_annuo_kwh: 3000 });
    // Senza degrado/inflazione tutti gli anni 1..25 sono uguali e cappati a 3000.
    for (const f of cassa.filter((x) => x.anno >= 1)) {
      expect(f.risparmio_bolletta_eur).toBe(900);
      expect(f.ricavi_rid_eur).toBe(500);
    }
  });
});
