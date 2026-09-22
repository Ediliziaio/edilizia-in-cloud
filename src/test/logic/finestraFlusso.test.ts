import { describe, it, expect } from "vitest";
import {
  minutiAllApertura, regolaGiorno, scriviRegolaGiorno, type FinestraFlusso,
} from "../../../supabase/functions/_shared/finestraFlusso";

const h = (ore: number, min = 0) => ore * 60 + min;
const LUN = 1, VEN = 5, SAB = 6, DOM = 7;

// La finestra del «Flusso Appuntamenti»: feriali 8:30-19:30, sabato 9-13, domenica chiuso.
const appuntamenti: FinestraFlusso = { apre: h(8, 30), chiude: h(19, 30), sabato: "09:00-13:00", domenica: "chiuso" };
// Una finestra di prima: stessa fascia tutti i giorni.
const diPrima: FinestraFlusso = { apre: h(9), chiude: h(18) };

describe("finestra del flusso, giorno per giorno", () => {
  it("dentro la fascia: si invia subito", () => {
    expect(minutiAllApertura(h(10), LUN, appuntamenti)).toBe(0);
    expect(minutiAllApertura(h(12, 59), SAB, appuntamenti)).toBe(0);
  });

  it("lead arrivato alle 2 di notte: il messaggio parte alle 8:30", () => {
    expect(minutiAllApertura(h(2), LUN, appuntamenti)).toBe(h(6, 30));
  });

  it("dopo le 19:30 di un feriale: il mattino dopo alle 8:30", () => {
    expect(minutiAllApertura(h(20), LUN, appuntamenti)).toBe(h(4) + h(8, 30));
  });

  it("venerdì sera: sabato alle 9, non alle 8:30", () => {
    expect(minutiAllApertura(h(20), VEN, appuntamenti)).toBe(h(4) + h(9));
  });

  it("sabato dopo le 13 e domenica: lunedì alle 8:30", () => {
    expect(minutiAllApertura(h(14), SAB, appuntamenti)).toBe(h(10) + 1440 + h(8, 30));
    expect(minutiAllApertura(h(10), DOM, appuntamenti)).toBe(h(14) + h(8, 30));
  });

  it("senza regole per il weekend: come prima, ogni giorno uguale", () => {
    expect(minutiAllApertura(h(10), DOM, diPrima)).toBe(0);
    expect(minutiAllApertura(h(19), SAB, diPrima)).toBe(h(5) + h(9));
    expect(minutiAllApertura(h(7), DOM, diPrima)).toBe(h(2));
  });

  it("finestra incoerente (chiude prima di aprire): non blocca la sequenza", () => {
    expect(minutiAllApertura(h(20), LUN, { apre: h(18), chiude: h(9), sabato: "chiuso", domenica: "chiuso" })).toBe(0);
  });
});

describe("regola di un giorno", () => {
  it("legge e riscrive", () => {
    expect(regolaGiorno(null)).toEqual({ tipo: "uguale" });
    expect(regolaGiorno("chiuso")).toEqual({ tipo: "chiuso" });
    expect(regolaGiorno("9:00-13:00")).toEqual({ tipo: "fascia", da: h(9), a: h(13) });
    expect(scriviRegolaGiorno({ tipo: "fascia", da: h(9), a: h(13) })).toBe("09:00-13:00");
    expect(scriviRegolaGiorno({ tipo: "uguale" })).toBeNull();
  });

  it("un valore illeggibile vale «come gli altri giorni»", () => {
    expect(regolaGiorno("13:00-9:00")).toEqual({ tipo: "uguale" });
    expect(regolaGiorno("mattina")).toEqual({ tipo: "uguale" });
  });
});
