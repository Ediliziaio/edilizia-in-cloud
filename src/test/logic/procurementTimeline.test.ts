import { describe, expect, it } from "vitest";
import { MONDAY_FRIDAY, civilDay, shiftCivilDays, todayInRome } from "@/lib/orders/civilDate";
import { planProcurementTimeline, type ProcurementTimelineInput } from "@/lib/orders/procurementTimeline";
const input = (patch: Partial<ProcurementTimelineInput> = {}): ProcurementTimelineInput => ({
  asOf: "2026-10-01", contractDate: "2026-10-01", requiredOnSite: "2026-11-15",
  leadMinDays: 28, leadMaxDays: 35, logisticsDays: 2, bufferDays: 3, preparationDays: 2,
  gates: [{ id: "release", label: "Misure e acconto", date: "2026-10-05", state: "planned" }], ...patch,
});
describe("guida ordine dal contratto e dalla data d'uso", () => {
  it("serramenti: finestra 4–5 settimane, acconto e misure prima dell'avvio", () => {
    const result = planProcurementTimeline(input());
    expect(result).toMatchObject({ latestDelivery: "2026-11-10", latestLaunch: "2026-10-06", latestDecision: "2026-10-04", earliestLaunch: "2026-10-05", earliestDelivery: "2026-11-02", prudentDelivery: "2026-11-09", readyOnSite: "2026-11-14", delayDays: 0, status: "conditional" });
  });
  it("acconto tardivo sposta consegna; non basta la firma", () => expect(planProcurementTimeline(input({ gates: [{ id: "pay", label: "Acconto accreditato", date: "2026-10-12", state: "planned" }] }))).toMatchObject({ earliestLaunch: "2026-10-12", readyOnSite: "2026-11-21", delayDays: 6, status: "late" }));
  it("prerequisito senza data conserva scadenze a ritroso ma non promette la consegna", () => expect(planProcurementTimeline(input({ gates: [{ id: "survey", label: "Rilievo", date: null, state: "planned" }] }))).toMatchObject({ status: "incomplete", latestLaunch: "2026-10-06", earliestLaunch: null, prudentDelivery: null, missing: ["Rilievo"] }));
  it("contratto mancante non diventa created_at della commessa", () => expect(planProcurementTimeline(input({ contractDate: null })).status).toBe("incomplete"));
  it("lead time mancante non diventa zero", () => expect(planProcurementTimeline(input({ leadMaxDays: null }))).toMatchObject({ status: "incomplete", latestLaunch: null, prudentDelivery: null }));
  it("un ricalcolo oggi non offre una finestra già passata", () => expect(planProcurementTimeline(input({ asOf: "2026-10-20" }))).toMatchObject({ launchDeadlinePassed: true, earliestLaunch: "2026-10-22", status: "late" }));
  it("fotovoltaico: più prerequisiti, avvio dal più tardivo", () => expect(planProcurementTimeline(input({ leadMinDays: 7, leadMaxDays: 14, gates: [{ id: "struct", label: "Verifica copertura", date: "2026-10-02", state: "planned" }, { id: "grid", label: "Progetto approvato", date: "2026-10-10", state: "planned" }] })).earliestLaunch).toBe("2026-10-10"));
  it("fornitura immediata: zero esplicito è valido", () => expect(planProcurementTimeline(input({ leadMinDays: 0, leadMaxDays: 0, gates: [], preparationDays: 0, logisticsDays: 0, bufferDays: 0 }))).toMatchObject({ status: "feasible", earliestDelivery: "2026-10-01" }));
  it("gestisce weekend e festività del fornitore", () => {
    expect(shiftCivilDays("2026-10-02", 2, { ...MONDAY_FRIDAY, holidays: ["2026-10-05"] })).toBe("2026-10-07");
    expect(shiftCivilDays("2026-10-07", -2, { ...MONDAY_FRIDAY, holidays: ["2026-10-05"] })).toBe("2026-10-02");
  });
  it("scadenza sabato: ritroso garantisce arrivo lavorativo prima del termine", () => {
    const r = planProcurementTimeline(input({ requiredOnSite: "2026-10-10", supplierCalendar: MONDAY_FRIDAY, logisticsDays: 0, bufferDays: 0, preparationDays: 0, leadMinDays: 1, leadMaxDays: 1, gates: [] }));
    expect(r.latestLaunch).toBe("2026-10-08");
    expect(shiftCivilDays(r.latestLaunch!, 1, MONDAY_FRIDAY)).toBe("2026-10-09");
  });
  it("date civili stabili al cambio dell'ora", () => expect(civilDay(shiftCivilDays("2026-10-24", 3)) - civilDay("2026-10-24")).toBe(3));
  it("il giorno di oggi usa Europe/Rome, indipendente dal processo", () => expect(todayInRome(new Date("2026-10-01T22:30:00Z"))).toBe("2026-10-02"));
  it.each([{ leadMinDays: -1 }, { leadMinDays: 36 }, { logisticsDays: 0.5 }, { bufferDays: NaN }, { requiredOnSite: "2026-02-30" }, { supplierCalendar: { workingWeekdays: [], holidays: [] } }])("rifiuta input invalido %j", patch => expect(() => planProcurementTimeline(input(patch))).toThrow());
  it("rifiuta conferme effettive future e prerequisiti duplicati", () => {
    expect(() => planProcurementTimeline(input({ gates: [{ id: "a", label: "a", date: "2026-10-02", state: "confirmed" }] }))).toThrow();
    expect(() => planProcurementTimeline(input({ gates: [{ id: "a", label: "a", date: null, state: "planned" }, { id: "a", label: "a", date: null, state: "planned" }] }))).toThrow();
  });
  it("valida il calendario anche con fornitura immediata", () => expect(() => planProcurementTimeline(input({ leadMinDays: 0, leadMaxDays: 0, supplierCalendar: { workingWeekdays: [], holidays: [] } }))).toThrow());
  it("non produce date troncate superando l'anno 9999", () => expect(() => shiftCivilDays("9999-12-31", 1)).toThrow());
});
