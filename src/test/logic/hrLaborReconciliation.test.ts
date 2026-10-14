import { describe, expect, it } from "vitest";
import { hrMonthBounds, reconcileHrLabor, type HrCostDay, type HrCostReport } from "@/lib/personale/laborReconciliation";

const day = (patch: Partial<HrCostDay> = {}): HrCostDay => ({ data: "2026-10-13", stato: "presente", ore_lavorate: 8, ore_straordinario: 2, anomalia: false, ...patch });
const report = (patch: Partial<HrCostReport> = {}): HrCostReport => ({ id: "r", company_id: "c", order_id: "o", user_id: "u", data_lavoro: "2026-10-13", stato: "approvato", updated_at: "now", ore_lavorate: 6, ore_straordinario: 2,
  presenze: [], costo_registrato_at: "now", presenze_registrate: [{ employee_id: "e", ore: 8, costo: 200 }], order: { order_code: "COMM-1", description: null }, ...patch });
const run = (reports: HrCostReport[] | null = [report()], days = [day()]) => reconcileHrLabor({ companyId: "c", employeeId: "e", userId: "u", month: "2026-10", days, reports });
describe("Riconciliazione HR e costi commesse per persona", () => {
  it("straordinario incluso nelle ore HR, non 8+2=10", () => expect(run()).toMatchObject({ hrHours: 8, overtime: 2, registeredHours: 8, registeredCost: 200, gapHours: 0 }));
  it("non riprezza il costo storico in base al contratto attuale", () => expect(run([report({ presenze_registrate: [{ employee_id: "e", ore: 8, costo: 177.77 }] })]).registeredCost).toBe(177.77));
  it("capo rendiconta due operai, ma il confronto conta solo le proprie presenze", () => {
    const r = report({ user_id: "capo", ore_lavorate: 24, presenze: [{ employee_id: "e", ore: 4 }, { employee_id: "altro", ore: 8 }], presenze_registrate: [{ employee_id: "e", ore: 4, costo: 100 }, { employee_id: "altro", ore: 8, costo: 240 }] });
    expect(run([r])).toMatchObject({ registeredHours: 4, registeredCost: 100, gapHours: 4 });
  });
  it("capo autore senza propria presenza non acquisisce le ore della squadra", () => {
    expect(run([report({ presenze: [{ employee_id: "altro", ore: 8 }], presenze_registrate: [{ employee_id: "altro", ore: 8, costo: 200 }] })]).registeredHours).toBe(0);
  });
  it("due cantieri lo stesso giorno restano distinti ma la persona totalizza 8 ore", () => {
    const rs = [report({ presenze_registrate: [{ employee_id: "e", ore: 3, costo: 75 }] }), report({ id: "r2", order_id: "o2", presenze_registrate: [{ employee_id: "e", ore: 5, costo: 150 }] })];
    expect(run(rs)).toMatchObject({ registeredHours: 8, registeredCost: 225, gapHours: 0 }); expect(run(rs).rows).toHaveLength(2);
  });
  it("un rapportino in attesa non genera costo né ore approvate", () => {
    expect(run([report({ stato: "inviato", costo_registrato_at: null, presenze_registrate: null })])).toMatchObject({ registeredHours: 0, registeredCost: 0, pendingHours: 8, gapHours: null });
  });
  it("presenze della squadra sostituiscono l'autore anche in attesa", () => {
    expect(run([report({ stato: "inviato", user_id: "capo", presenze: [{ employee_id: "e", ore: 3 }], presenze_registrate: null })]).pendingHours).toBe(3);
  });
  it("rapporto cliente senza ore non aggiunge costi solo perché è approvato", () => {
    expect(run([report(), report({ id: "cliente", ore_lavorate: 0, ore_straordinario: 0, presenze_registrate: [] })]).registeredCost).toBe(200);
  });
  it("approvato senza snapshot non appare come costo zero completo", () => {
    expect(run([report({ costo_registrato_at: null, presenze_registrate: null })])).toMatchObject({ incomplete: true, missingSnapshots: 1, gapHours: null });
  });
  it("ore approvate a costo zero richiedono verifica", () => expect(run([report({ presenze_registrate: [{ employee_id: "e", ore: 8, costo: 0 }] })])).toMatchObject({ incomplete: true, unpricedSnapshots: 1 }));
  it.each([[{ employee_id: "e", ore: 4, costo: 100 }, { employee_id: "e", ore: 4, costo: 100 }], [{ employee_id: "e", ore: "NaN", costo: 100 }], [{ employee_id: "e", ore: 25, costo: 100 }], [{ employee_id: "e", ore: 4, costo: -1 }]].map(presenze_registrate => ({ presenze_registrate })))("snapshot non valido $presenze_registrate non forma un totale completo", ({ presenze_registrate }) => {
    expect(run([report({ presenze_registrate })])).toMatchObject({ incomplete: true, invalidSnapshots: 1, registeredHours: 0 });
  });
  it("un rapporto ripetuto nella risposta non è contato due volte", () => expect(run([report(), report()]).registeredCost).toBe(200));
  it("altre aziende, mesi e stati sono esclusi anche prima della somma", () => {
    expect(run([report({ company_id: "altra" }), report({ data_lavoro: "2026-09-30" }), report({ stato: "rifiutato" }), report({ stato: "bozza" })]).registeredCost).toBe(0);
  });
  it("senza diritto ai rapportini non dice che il dipendente costa zero", () => expect(run(null)).toMatchObject({ reportsAvailable: false, gapHours: null }));
  it("giornata aperta/anomala non è zero ore regolari", () => expect(run([report()], [day({ anomalia: true })])).toMatchObject({ hrHours: 0, anomalousDays: 1, missingHrDays: 1, gapHours: null }));
  it("ferie e malattia non diventano ore del cantiere", () => {
    expect(run([], [day({ stato: "ferie", ore_lavorate: 0, ore_straordinario: 0 }), day({ data: "2026-10-14", stato: "malattia", ore_lavorate: 0, ore_straordinario: 0 })])).toMatchObject({ absenceDays: 2, hrHours: 0, registeredHours: 0 });
  });
  it("assenza parziale conserva le ore effettive senza creare 8 ore di ferie", () => expect(run([], [day({ stato: "permesso", ore_lavorate: 4, ore_straordinario: 0 })])).toMatchObject({ absenceDays: 1, hrHours: 4 }));
  it("giornate duplicate sono anomalie, non doppio lavoro", () => expect(run([report()], [day(), day()])).toMatchObject({ hrHours: 0, anomalousDays: 2, gapHours: null }));
  it("ore HR assenti sul giorno di un rapporto non danno un confronto valido", () => expect(run([report()], [day({ data: "2026-10-14" })])).toMatchObject({ missingHrDays: 1, gapHours: null }));
  it("oltre le ore HR il confronto è negativo e non viene azzerato", () => expect(run([report()], [day({ ore_lavorate: 6 })]).gapHours).toBe(-2));
  it.each(["2026-00", "2026-13", "2026-1", "NaN", "", "1800-01"])("non interroga periodi invalidi %s", month => expect(() => hrMonthBounds(month)).toThrow());
  it("fine febbraio è calcolata senza timezone UTC/locale o overflow mese", () => {
    expect(hrMonthBounds("2024-02")).toEqual({ start: "2024-02-01", end: "2024-02-29" }); expect(hrMonthBounds("2026-02").end).toBe("2026-02-28");
  });
});
