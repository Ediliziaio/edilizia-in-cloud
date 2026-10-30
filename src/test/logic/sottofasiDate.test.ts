// src/test/logic/sottofasiDate.test.ts
import { describe, expect, it } from "vitest";
import {
  avanzamentoDaSottofasi, dateFaseConSottofasi, fineDaGiorni, giorniFinestra, intervalloSottofase, pesiDaGiorni, pianoSottofase, sottofaseDaRiga,
} from "@/lib/orders/sottofasi";
import { sottofasiCronoprogramma } from "@/lib/orders/cronoprogramma";

/** Date e tempo necessario delle sottofasi (29/10/2026): specchio di 20281029213000. */
describe("sottofasi con date e giorni", () => {
  it("inizio + giorni danno la fine, due date danno i giorni, anche a cavallo di mese", () => {
    expect(fineDaGiorni("2026-10-30", 3)).toBe("2026-11-01");
    expect(giorniFinestra("2026-10-30", "2026-11-01")).toBe(3);
    expect(pianoSottofase({ data_inizio: "2026-10-01", data_fine: null, giorni: 5 })).toEqual({ data_inizio: "2026-10-01", data_fine: "2026-10-05", giorni: 5 });
    expect(pianoSottofase({ data_inizio: "2026-10-01", data_fine: "2026-10-07", giorni: null })).toEqual({ data_inizio: "2026-10-01", data_fine: "2026-10-07", giorni: 7 });
    // tre giorni di lavoro in una settimana: si tengono entrambi
    expect(pianoSottofase({ data_inizio: "2026-10-01", data_fine: "2026-10-07", giorni: 3 }).giorni).toBe(3);
  });

  it("l'intervallo: una data sola vale quel giorno; date invertite o assenti, nessuna barra", () => {
    expect(intervalloSottofase({ data_inizio: "2026-10-01", data_fine: null, giorni: null })).toEqual(["2026-10-01", "2026-10-01"]);
    expect(intervalloSottofase({ data_inizio: "2026-10-05", data_fine: "2026-10-01", giorni: null })).toBeNull();
    expect(intervalloSottofase({ data_inizio: null, data_fine: null, giorni: 4 })).toBeNull();
  });

  it("la fase si allarga a contenere le sottofasi, non si stringe mai", () => {
    const fase = { start_date: "2026-06-27", end_date: "2026-06-29" };
    const sotto = [
      { data_inizio: "2026-06-25", data_fine: null, giorni: 3 },
      { data_inizio: "2026-06-28", data_fine: "2026-07-01", giorni: null },
      { data_inizio: "2026-06-29", data_fine: "2026-07-04", giorni: 2 },
    ];
    // gli stessi numeri della prova sul database: 27→29/06 diventa 25/06→04/07
    expect(dateFaseConSottofasi(fase, sotto)).toEqual({ start_date: "2026-06-25", end_date: "2026-07-04" });
    expect(dateFaseConSottofasi({ start_date: "2026-06-01", end_date: "2026-07-31" }, sotto)).toEqual({ start_date: "2026-06-01", end_date: "2026-07-31" });
    expect(dateFaseConSottofasi({ start_date: null, end_date: null }, sotto)).toEqual({ start_date: "2026-06-25", end_date: "2026-07-04" });
  });

  it("pesare per giorni: solo se tutte hanno i giorni; il peso arriva al massimo a 100", () => {
    const s = [
      { id: "a", peso: 1, giorni: 10 },
      { id: "b", peso: 1, giorni: 1 },
      { id: "c", peso: 1, giorni: 250 },
    ];
    expect(pesiDaGiorni(s)).toEqual([{ id: "a", peso: 10 }, { id: "c", peso: 100 }]);
    expect(pesiDaGiorni([...s, { id: "d", peso: 1, giorni: null }])).toEqual([]);
    expect(pesiDaGiorni([{ id: "a", peso: 1, giorni: 10 }])).toEqual([]);
    // con i pesi per giorni, la sottofase da 10 giorni fatta vale molto più di quella da 1
    expect(avanzamentoDaSottofasi([{ peso: 10, fatta: true }, { peso: 1, fatta: false }, { peso: 100, fatta: false }])).toBe(9);
  });

  it("dalla riga del database: date e giorni ripuliti", () => {
    const r = sottofaseDaRiga({ id: "x", phase_id: "p", name: "Cavi", position: 1, peso: 2, fatta: false, data_inizio: "2026-10-01", data_fine: "boh", giorni: 0 });
    expect(r).toMatchObject({ data_inizio: "2026-10-01", data_fine: null, giorni: null });
  });

  it("le righe del cronoprogramma: ritardo solo se non fatta, fuori dalla fase segnalato", () => {
    const righe = sottofasiCronoprogramma(
      { previstoInizio: "2026-08-17", previstoFine: "2026-09-05" },
      [
        { id: "1", name: "Massetto", fatta: true, data_inizio: "2026-08-01", data_fine: "2026-08-03" },
        { id: "2", name: "Posa", fatta: false, data_inizio: "2026-08-18", giorni: 2 },
        { id: "3", name: "Pulizia", fatta: false },
      ],
      "2026-08-25",
    );
    expect(righe.map((r) => [r.id, r.previstoFine, r.ritardo, r.fuoriDallaFase])).toEqual([
      ["1", "2026-08-03", 0, true],
      ["2", "2026-08-19", 6, false],
    ]);
  });
});
