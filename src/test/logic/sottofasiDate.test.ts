// src/test/logic/sottofasiDate.test.ts
import { describe, expect, it } from "vitest";
import {
  avanzamentoDaSottofasi, dateFaseConSottofasi, fineDaGiorni, giorniFinestra, intervalloSottofase, pesiDaGiorni, pianoInSequenza, calendarioCantiere, fasiDaSpostare, realeSottofase, pianoSottofase, sottofaseDaRiga,
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

describe("pianoInSequenza", () => {
  const fase = { start_date: "2025-09-15", end_date: "2025-09-22" };
  const s = (id: string, giorni: number | null, extra: Record<string, unknown> = {}) =>
    ({ id, name: id, fatta: false, data_inizio: null as string | null, data_fine: null as string | null, giorni, ...extra });

  it("mette le sottofasi in fila dall'inizio della fase e dice i giorni liberi", () => {
    const p = pianoInSequenza(fase, [s("a", 3), s("b", 2)], "2025-10-01");
    expect(p.passi.map(x => [x.data_inizio, x.data_fine])).toEqual([["2025-09-15", "2025-09-17"], ["2025-09-18", "2025-09-19"]]);
    expect(p.giorniFase).toBe(8);
    expect(p.giorniLiberi).toBe(3);
    expect(p.giorniInPiu).toBe(0);
  });

  it("con più giorni della fase dice quanti sono in più e quale sottofase esce", () => {
    const p = pianoInSequenza(fase, [s("a", 5), s("b", 4)], "2025-10-01");
    expect(p.fine).toBe("2025-09-23");
    expect(p.giorniInPiu).toBe(1);
    expect(p.passi.map(x => x.oltreLaFase)).toEqual([false, true]);
  });

  it("le fatte e datate restano ferme, chi non ha giorni resta fuori, senza date della fase parte da oggi", () => {
    const p = pianoInSequenza(fase, [s("a", 2, { fatta: true, data_inizio: "2025-09-15", data_fine: "2025-09-16" }), s("b", null), s("c", 1)], "2025-10-01");
    expect(p.passi.map(x => [x.id, x.data_inizio, x.ferma])).toEqual([["a", "2025-09-15", true], ["c", "2025-09-17", false]]);
    expect(p.senzaGiorni).toEqual(["b"]);
    expect(pianoInSequenza({ start_date: null, end_date: null }, [s("a", 2)], "2025-10-01").passi[0].data_inizio).toBe("2025-10-01");
  });
});

describe("sottofasiCronoprogramma con i soli giorni", () => {
  it("le mette in fila dopo la precedente, segnate come stimate", () => {
    const righe = sottofasiCronoprogramma(
      { previstoInizio: "2025-09-15", previstoFine: "2025-09-22" },
      [
        { id: "a", name: "A", fatta: false, data_inizio: "2025-09-15", data_fine: "2025-09-17", giorni: 3 },
        { id: "b", name: "B", fatta: false, giorni: 4 },
        { id: "c", name: "C", fatta: false, giorni: 2 },
        { id: "d", name: "D", fatta: false },
      ],
      "2025-09-01",
    );
    expect(righe.map(r => [r.id, r.previstoInizio, r.previstoFine, r.stimata, r.fuoriDallaFase])).toEqual([
      ["a", "2025-09-15", "2025-09-17", false, false],
      ["b", "2025-09-18", "2025-09-21", true, false],
      ["c", "2025-09-22", "2025-09-23", true, true],
    ]);
  });
});

describe("calendario del cantiere, parallelo, reale, fasi da spostare", () => {
  // 15/09/2025 è un lunedì; l'8/12 è festa.
  const lun_ven = calendarioCantiere({ sabato: false, chiusure: new Set(["2025-12-08"]) });
  const fase = { start_date: "2025-09-15", end_date: "2025-09-22" };
  const s = (id: string, giorni: number, extra: Record<string, unknown> = {}) =>
    ({ id, name: id, fatta: false, data_inizio: null as string | null, data_fine: null as string | null, giorni, ...extra });

  it("conta solo i giorni di lavoro: 5 giorni dal lunedì finiscono il venerdì, i 4 dopo saltano il weekend", () => {
    const p = pianoInSequenza(fase, [s("a", 5), s("b", 4)], "2025-09-01", lun_ven);
    expect(p.passi.map(x => [x.data_inizio, x.data_fine])).toEqual([["2025-09-15", "2025-09-19"], ["2025-09-22", "2025-09-25"]]);
    expect(p.giorniInPiu).toBe(3);
  });

  it("col sabato lavorativo e saltando le chiusure dell'azienda", () => {
    const con_sabato = calendarioCantiere({ sabato: true, chiusure: new Set() });
    expect(pianoInSequenza(fase, [s("a", 6)], "2025-09-01", con_sabato).passi[0].data_fine).toBe("2025-09-20");
    expect(pianoInSequenza({ start_date: "2025-12-05", end_date: null }, [s("a", 2)], "2025-09-01", lun_ven).passi[0].data_fine).toBe("2025-12-09");
  });

  it("una sottofase in parallelo parte con la precedente, e la fila riprende dopo la più lunga", () => {
    const p = pianoInSequenza(fase, [s("a", 2), s("b", 3, { in_parallelo: true }), s("c", 1)], "2025-09-01");
    expect(p.passi.map(x => [x.id, x.data_inizio, x.data_fine])).toEqual([
      ["a", "2025-09-15", "2025-09-16"], ["b", "2025-09-15", "2025-09-17"], ["c", "2025-09-18", "2025-09-18"],
    ]);
  });

  it("previsto e reale: finita due giorni dopo, o uno prima", () => {
    const base = { fatta: true, data_inizio: "2025-09-15", data_fine: "2025-09-17", giorni: 3 };
    expect(realeSottofase({ ...base, fatta_il: "2025-09-19T10:00:00" })).toEqual({ finita: "2025-09-19", scarto: 2 });
    expect(realeSottofase({ ...base, fatta_il: "2025-09-16T10:00:00" })).toEqual({ finita: "2025-09-16", scarto: -1 });
    expect(realeSottofase({ ...base, fatta: false, fatta_il: null })).toBeNull();
  });

  it("le fasi dopo che si sovrappongono: di quanto spostarle", () => {
    const dopo = [
      { id: "f2", name: "Impianti", start_date: "2025-09-20", end_date: "2025-09-30" },
      { id: "f3", name: "Finiture", start_date: "2025-10-01", end_date: "2025-10-10" },
      { id: "f4", name: "Senza date", start_date: null, end_date: null },
    ];
    expect(fasiDaSpostare("2025-09-23", dopo)).toEqual({ sovrapposte: ["Impianti"], giorni: 4, daSpostare: ["f2", "f3"] });
    expect(fasiDaSpostare("2025-09-19", dopo).giorni).toBe(0);
  });
});
