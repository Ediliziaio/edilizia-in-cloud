import { describe, expect, it } from "vitest";
import {
  avanzamentoComplessivo,
  barra,
  fasiCronoprogramma,
  giornoLocale,
  intervalloCronoprogramma,
  lavoroRealeFasi,
  ritardoFase,
  tacche,
  traguardiCommessa,
  type FaseInput,
} from "@/lib/orders/cronoprogramma";

/**
 * Cronoprogramma della commessa (06/10/2026): fasi previste e reali nel tempo,
 * ritardi, traguardi e avanzamento.
 */

const fase = (extra: Partial<FaseInput>): FaseInput => ({
  id: "f1", name: "Demolizioni", status: "da_iniziare", percentuale: 0,
  start_date: "2026-08-03", end_date: "2026-08-10", completata_il: null,
  ...extra,
});

describe("il giorno di un istante", () => {
  it("prende il giorno di calendario di un timestamp, e lascia stare una data già pulita", () => {
    expect(giornoLocale("2026-08-14T12:00:00Z")).toBe("2026-08-14");
    expect(giornoLocale("non è una data")).toBe("non è una ");
  });
});

describe("lavoro reale dai rapportini", () => {
  it("primo e ultimo giorno e ore per fase, solo dai rapportini inviati o approvati", () => {
    const reale = lavoroRealeFasi([
      { data_lavoro: "2026-08-05", stato: "approvato", fasi_lavorate: [{ phase_id: "f1", ore: 8 }] },
      { data_lavoro: "2026-08-04", stato: "inviato", fasi_lavorate: [{ phase_id: "f1", ore: 6 }, { phase_id: "f2", ore: 2 }] },
      { data_lavoro: "2026-08-12", stato: "approvato", fasi_lavorate: [{ phase_id: "f1", ore: 4 }] },
      { data_lavoro: "2026-08-01", stato: "rifiutato", fasi_lavorate: [{ phase_id: "f1", ore: 8 }] },
      { data_lavoro: "2026-08-02", stato: "bozza", fasi_lavorate: [{ phase_id: "f1", ore: 8 }] },
      { data_lavoro: "2026-08-03", stato: "approvato", fasi_lavorate: [{ ore: 8 }, null, "f1"] },
      { data_lavoro: "2026-08-03", stato: "approvato", fasi_lavorate: null },
    ]);
    expect(reale.get("f1")).toEqual({ primo: "2026-08-04", ultimo: "2026-08-12", ore: 18, rapportini: 3 });
    expect(reale.get("f2")).toEqual({ primo: "2026-08-04", ultimo: "2026-08-04", ore: 2, rapportini: 1 });
  });
});

describe("le fasi nel tempo", () => {
  const oggi = "2026-08-20";

  it("una fase chiusa tardi: inizio dal primo rapportino, fine dalla chiusura, ritardi in giorni", () => {
    const reale = new Map([["f1", { primo: "2026-08-05", ultimo: "2026-08-12", ore: 40, rapportini: 5 }]]);
    const [f] = fasiCronoprogramma([fase({ status: "completata", percentuale: 80, completata_il: "2026-08-14" })], reale, oggi);
    expect(f).toMatchObject({
      realeInizio: "2026-08-05", realeFine: "2026-08-14", ritardoInizio: 2, ritardoFine: 4, avanzamento: 100, ore: 40,
    });
  });

  it("partita tardi ma chiusa in tempo: non è in ritardo", () => {
    const reale = new Map([["f1", { primo: "2026-08-06", ultimo: "2026-08-10", ore: 30, rapportini: 4 }]]);
    const [f] = fasiCronoprogramma([fase({ status: "completata", completata_il: "2026-08-10" })], reale, oggi);
    expect(f).toMatchObject({ ritardoInizio: 3, ritardoFine: 0 });
    expect(ritardoFase(f)).toBeNull();
  });

  it("senza data di chiusura la fine reale è l'ultimo rapportino; finita in anticipo: nessun ritardo", () => {
    const reale = new Map([["f1", { primo: "2026-08-02", ultimo: "2026-08-08", ore: 16, rapportini: 2 }]]);
    const [f] = fasiCronoprogramma([fase({ status: "completata" })], reale, oggi);
    expect(f).toMatchObject({ realeInizio: "2026-08-02", realeFine: "2026-08-08", ritardoInizio: 0, ritardoFine: 0 });
  });

  it("una fase ancora aperta oltre la fine prevista è in ritardo fino a oggi, e non ha fine reale", () => {
    const reale = new Map([["f1", { primo: "2026-08-03", ultimo: "2026-08-19", ore: 70, rapportini: 9 }]]);
    const [f] = fasiCronoprogramma([fase({ status: "in_corso", percentuale: 60 })], reale, oggi);
    expect(f).toMatchObject({ realeFine: null, ritardoFine: 10, ritardoInizio: 0, avanzamento: 60 });
    expect(ritardoFase(f)).toEqual({ giorni: 10, su: "fine" });
  });

  it("mai iniziata e con la fine prevista passata: conta la fine, non l'inizio", () => {
    const [f] = fasiCronoprogramma([fase({})], new Map(), oggi);
    expect(f).toMatchObject({ ritardoInizio: 17, ritardoFine: 10 });
    expect(ritardoFase(f)).toEqual({ giorni: 10, su: "fine" });
  });

  it("una fase non ancora iniziata dopo l'inizio previsto è in ritardo sull'inizio", () => {
    const [f] = fasiCronoprogramma([fase({ start_date: "2026-08-15", end_date: "2026-08-30" })], new Map(), oggi);
    expect(f).toMatchObject({ realeInizio: null, ritardoInizio: 5, ritardoFine: 0 });
    expect(ritardoFase(f)).toEqual({ giorni: 5, su: "inizio" });
  });

  it("senza date previste nessun ritardo", () => {
    const [f] = fasiCronoprogramma([fase({ start_date: null, end_date: null, status: "in_corso", percentuale: 140 })], new Map(), oggi);
    expect(f).toMatchObject({ ritardoInizio: 0, ritardoFine: 0, avanzamento: 100 });
  });
});

describe("traguardi della commessa", () => {
  it("il contratto firmato viene dalla firma del preventivo; inizio, fine e consegna solo se ci sono", () => {
    expect(traguardiCommessa({
      firmaPreventivo: "2026-07-12", aperturaCommessa: "2026-07-14", inizioLavori: "2026-08-03",
      fineLavori: "2026-09-15", consegna: null,
    })).toEqual([
      { tipo: "contratto", data: "2026-07-12", etichetta: "Contratto firmato" },
      { tipo: "inizio_lavori", data: "2026-08-03", etichetta: "Inizio lavori previsto" },
      { tipo: "fine_lavori", data: "2026-09-15", etichetta: "Fine lavori prevista" },
    ]);
  });

  it("senza firma del preventivo vale l'apertura della commessa, detta così e non «contratto»", () => {
    expect(traguardiCommessa({ firmaPreventivo: null, aperturaCommessa: "2026-07-14", inizioLavori: null, fineLavori: null, consegna: "2026-07-30" }))
      .toEqual([
        { tipo: "apertura", data: "2026-07-14", etichetta: "Commessa aperta" },
        { tipo: "consegna", data: "2026-07-30", etichetta: "Consegna prevista" },
      ]);
  });
});

describe("l'asse del tempo", () => {
  it("va da tre giorni prima della data più vecchia a tre dopo la più recente, oggi compreso", () => {
    const fasi = fasiCronoprogramma([fase({ start_date: "2026-08-03", end_date: "2026-08-10" })], new Map(), "2026-08-20");
    const asse = intervalloCronoprogramma(fasi, [{ tipo: "contratto", data: "2026-07-30", etichetta: "Contratto firmato" }], "2026-08-20");
    expect(asse).toEqual({ da: "2026-07-27", a: "2026-08-23", giorni: 28 });
  });

  it("una barra occupa i suoi giorni, estremi compresi, e non esce dall'asse", () => {
    const asse = { da: "2026-08-01", giorni: 10 };
    expect(barra("2026-08-01", "2026-08-05", asse)).toEqual({ left: 0, width: 50 });
    expect(barra("2026-08-06", "2026-08-06", asse)).toEqual({ left: 50, width: 10 });
    expect(barra("2026-07-20", "2026-08-02", asse)).toEqual({ left: 0, width: 20 });
    expect(barra("2026-08-09", "2026-08-30", asse)).toEqual({ left: 80, width: 20 });
  });

  it("le tacche sono i lunedì fino a 120 giorni, poi i primi del mese", () => {
    const corte = tacche({ da: "2026-08-01", a: "2026-08-20", giorni: 20 });
    expect(corte.map((t) => t.data)).toEqual(["2026-08-03", "2026-08-10", "2026-08-17"]);
    expect(corte[0].left).toBe(10);
    const lunghe = tacche({ da: "2026-01-15", a: "2026-06-30", giorni: 167 });
    expect(lunghe.map((t) => t.data)).toEqual(["2026-02-01", "2026-03-01", "2026-04-01", "2026-05-01", "2026-06-01"]);
    expect(lunghe.every((t) => t.mese)).toBe(true);
  });
});

describe("avanzamento della commessa", () => {
  it("la media delle fasi, una completata vale 100: lo stesso conto della testata della commessa", () => {
    const fasi = fasiCronoprogramma([
      fase({ id: "a", status: "completata", percentuale: 0 }),
      fase({ id: "b", status: "in_corso", percentuale: 50 }),
      fase({ id: "c", percentuale: 0 }),
      fase({ id: "d", status: "in_corso", percentuale: 15 }),
    ], new Map(), "2026-08-20");
    expect(avanzamentoComplessivo(fasi)).toBe(41); // (100 + 50 + 0 + 15) / 4 = 41,25
    expect(avanzamentoComplessivo([])).toBe(0);
  });
});
