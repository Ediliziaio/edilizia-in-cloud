import {describe, expect, it} from "vitest";
import {barra, confrontoTempi, fasiCronoprogramma, intervalloCronoprogramma, lavoroRealeFasi, riepilogoCronoprogramma, tacche, traguardiCommessa, type FaseInput} from "@/lib/orders/cronoprogramma";
const oggi = "2026-10-13";
const input = (extra: Partial<FaseInput> = {}): FaseInput => ({id: "f", name: "Demolizioni", status: "completata", percentuale: 0, start_date: "2025-03-25", end_date: "2025-03-30", completata_il: "2026-10-09", ...extra});
const fasi = (extra: Partial<FaseInput> = {}) => fasiCronoprogramma([input(extra)], new Map(), oggi);
describe("cronoprogramma operativo e storico", () => {
  it("la demo chiusa con 558 giorni non diventa un ritardo aperto", () => {
    const summary = riepilogoCronoprogramma(fasi());
    expect(summary.tutteChiuse).toBe(true); expect(summary.aperteInRitardo).toEqual([]);
    expect(summary.chiuseOltre[0].ritardoFine).toBe(558);
    expect(summary.senzaFineReale).toEqual([]);
    expect(confrontoTempi(fasi()[0], oggi).giorniReali).toBeNull();
  });
  it("separa fasi aperte, chiuse tardi e chiuse senza prove delle date", () => {
    const rows = fasiCronoprogramma([input(), input({id: "a", status: "in_corso", completata_il: null}), input({id: "b", completata_il: null})], new Map(), oggi);
    const summary = riepilogoCronoprogramma(rows);
    expect(summary.aperteInRitardo.map(f => f.id)).toEqual(["a"]);
    expect(summary.chiuseOltre.map(f => f.id)).toEqual(["f"]);
    expect(summary.senzaFineReale.map(f => f.id)).toEqual(["b"]); expect(summary.tutteChiuse).toBe(false);
  });
  it("il periodo previsto non include oggi, chiusure tardive o apertura amministrativa", () => {
    const axis = intervalloCronoprogramma(fasi(), [{tipo: "apertura", data: "2025-12-15", etichetta: "Commessa aperta"}], oggi, "previsto");
    expect(axis).toEqual({da: "2025-03-22", a: "2025-04-02", giorni: 12});
  });
  it("il confronto completo contiene le chiusure ma non continua a crescere dopo la fine", () => {
    const axis = intervalloCronoprogramma(fasi(), [], oggi, "confronto");
    expect(axis.a).toBe("2026-10-12");
    expect(intervalloCronoprogramma(fasi(), [], "2027-05-01", "confronto")).toEqual(axis);
  });
  it("il confronto di una fase ancora aperta arriva a oggi", () => {
    expect(intervalloCronoprogramma(fasi({status: "in_corso", completata_il: null}), [], oggi, "confronto").a).toBe("2026-10-16");
  });
  it("lavori futuri non si allungano artificialmente nel passato fino a oggi", () => {
    expect(intervalloCronoprogramma(fasi({status: "da_iniziare", completata_il: null, start_date: "2027-02-01", end_date: "2027-02-05"}), [], oggi, "confronto").da).toBe("2027-01-29");
  });
  it("anche senza piano una chiusura registrata resta rappresentabile", () => {
    const rows = fasi({start_date: null, end_date: null});
    expect(intervalloCronoprogramma(rows, [], oggi, "previsto").da).toBe("2026-10-06");
    expect(rows[0]).toMatchObject({realeInizio: null, realeFine: "2026-10-09"});
    expect(riepilogoCronoprogramma(rows).senzaPiano).toHaveLength(1);
  });
  it.each(["2026-02-30", "non data", "2026-13-01"])("non usa una data corrotta %s nei conti o nell'asse", day => {
    const rows = fasi({start_date: day, completata_il: day});
    expect(rows[0]).toMatchObject({previstoInizio: null, realeFine: null, dateIncoerenti: true, ritardoFine: 0});
    expect(confrontoTempi(rows[0], oggi).giorniPrevisti).toBeNull();
    expect(Number.isFinite(intervalloCronoprogramma(rows, [], oggi, "confronto").giorni)).toBe(true);
  });
  it("non dichiara una durata di un giorno per date invertite", () => {
    const row = fasi({start_date: "2025-04-05"})[0];
    expect(row.dateIncoerenti).toBe(true); expect(row.ritardoFine).toBe(0);
    expect(confrontoTempi(row, oggi).giorniPrevisti).toBeNull();
  });
  it("segnala una chiusura antecedente al primo rapportino senza inventare durata", () => {
    const [row] = fasiCronoprogramma([input()], new Map([["f", {primo: "2026-10-12", ultimo: "2026-10-12", ore: 8, rapportini: 1}]]), oggi);
    expect(row.dateIncoerenti).toBe(true); expect(confrontoTempi(row, oggi).giorniReali).toBeNull();
  });
  it("non conteggia ore negative/infinite o rapportini con data invalida", () => {
    const real = lavoroRealeFasi([
      {data_lavoro: "2026-02-30", stato: "approvato", fasi_lavorate: [{phase_id: "f", ore: 8}]},
      {data_lavoro: "2026-10-12", stato: "inviato", fasi_lavorate: [{phase_id: "f", ore: -8}, {phase_id: "f", ore: Infinity}, {phase_id: "f", ore: 3}]},
    ]);
    expect(real.get("f")).toEqual({primo: "2026-10-12", ultimo: "2026-10-12", ore: 3, rapportini: 1});
  });
  it("una barra completamente fuori dal periodo non esce dal riquadro", () => {
    const axis = {da: "2026-10-01", giorni: 10};
    expect(barra("2027-01-01", "2027-02-01", axis)).toEqual({left: 100, width: 0});
    expect(barra("2025-01-01", "2025-02-01", axis)).toEqual({left: 0, width: 0});
  });
  it("anche intervalli estremi generano un numero limitato di tacche", () => {
    expect(tacche({da: "1900-01-01", a: "9998-12-31", giorni: 2_958_000}).length).toBeLessThanOrEqual(125);
  });
  it("lo zoom settimane mantiene tacche settimanali anche oltre quattro mesi", () => {
    const axis = {da: "2026-01-01", a: "2026-08-01", giorni: 213};
    const weekly = tacche(axis, "settimane");
    expect(weekly[0].data).toBe("2026-01-05"); expect(weekly[1].data).toBe("2026-01-12");
    expect(weekly.every(t => !t.mese)).toBe(true);
    expect(tacche(axis, "mesi")[0]).toMatchObject({data: "2026-01-01", mese: true});
  });
  it("traguardi corrotti non fanno cadere il rendering", () => {
    expect(traguardiCommessa({firmaPreventivo: null, aperturaCommessa: "corrotta", inizioLavori: "2026-10-13", fineLavori: null, consegna: "2026-02-30"})).toHaveLength(1);
  });
});
