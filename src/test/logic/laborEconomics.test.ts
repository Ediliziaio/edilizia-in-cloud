import { describe, expect, it } from "vitest";
import { externalLaborNet, laborAmount, laborEconomics, sumLaborAmounts, type LaborLedgerRow, type ExternalLaborRow } from "@/lib/orders/laborEconomics";
import { costoOrarioDipendente, oreContrattualiMese } from "@/lib/costoOrarioDipendente";

const row = (patch: Partial<LaborLedgerRow> = {}): LaborLedgerRow => ({
  id: "r1", employee_id: "e1", hours_worked: 4, total_cost: 100, cost_preventivo: 150, hourly_rate: 25,
  employee: { id: "e1", user_id: "u1", first_name: "Mario", last_name: "Rossi", costo_orario: 30 }, ...patch,
});
describe("Costo orario coerente con l'approvazione dei rapportini", () => {
  it("INPS zero rimane zero, non diventa quello del tipo", () => expect(costoOrarioDipendente({ gross_salary: 2000, monthly_hours: 160, inps_rate: 0 })).toBe(19.08));
  it("solo INPS assente usa quello del tipo (operaio edile 29,6%)", () => expect(costoOrarioDipendente({ gross_salary: 2000, monthly_hours: 160, inps_rate: null })).toBe(23.2));
  it("ore mensili mancanti non vengono inventate, neppure da quelle settimanali", () => {
    expect(costoOrarioDipendente({ gross_salary: 2000, ore_settimana: 40 })).toBe(0);
    expect(oreContrattualiMese({})).toBe(173); // distinta API di pianificazione conservata
  });
  it.each([0, -1, "", "NaN", "Infinity"])("ore mensili %s non producono costi presunti", monthly_hours => {
    expect(costoOrarioDipendente({ gross_salary: 2000, monthly_hours })).toBe(0);
  });
  it("tariffa manuale prevale anche senza stipendio e ore", () => expect(costoOrarioDipendente({ costo_orario: 25.555 })).toBe(25.555));
  it("arrotonda il mezzo centesimo come numeric PostgreSQL", () => expect(costoOrarioDipendente({ gross_salary: 160.8, monthly_hours: 160, inps_rate: 0 }, { operaio: { mensilita: 12, inps: 0, inail: 0, cassa_edile: 0, tfr: 0, altri: 0, ore_produttive: 100 } })).toBe(1.01));
});
describe("Registro della manodopera: non ricalcola né duplica lo storico", () => {
  it("raggruppa due fasi di una persona sommando i costi salvati", () => {
    const actual = laborEconomics([row(), row({ id: "r2", hours_worked: 6, total_cost: 180, cost_preventivo: 200, hourly_rate: 30 })], true);
    expect(actual.hours).toBe(10); expect(actual.cost).toBe(280); expect(actual.budget).toBe(350);
    expect(actual.people).toHaveLength(1); expect(actual.people[0].averageRate).toBe(28);
    expect(actual.people[0].rate?.amount).toBe(30); // non 10 × 30 = 300
  });
  it("tariffa storica arrotondata non ricostruisce il totale", () => {
    const actual = laborEconomics([row({ hours_worked: 3, total_cost: 100, hourly_rate: 33.33 })], true);
    expect(actual.cost).toBe(100); expect(actual.people[0].averageRate).toBe(33.33);
  });
  it("due persone hanno ore-persona, non una durata di turno", () => {
    const actual = laborEconomics([row(), row({ employee_id: "e2", employee: null })], false);
    expect(actual.people).toHaveLength(2); expect(actual.hours).toBe(8); expect(actual.cost).toBe(200);
    expect(actual.people.every(p => p.rate === null)).toBe(true);
  });
  it("zero costo con ore positive è da verificare anche se la tariffa attuale è completa", () => {
    const actual = laborEconomics([row({ total_cost: 0 })], true);
    expect(actual.unpricedPeople).toBe(1); expect(actual.cost).toBe(0); expect(actual.people[0].rate?.amount).toBe(30);
  });
  it("un'assegnazione a zero ore non segnala un costo mancante storico", () => expect(laborEconomics([row({ hours_worked: 0, total_cost: 0 })], true).unpricedPeople).toBe(0));
  it("una tariffa ora mancante non cancella il costo storico", () => {
    const actual = laborEconomics([row({ employee: { id: "e1", user_id: null } })], true);
    expect(actual.cost).toBe(100); expect(actual.people[0].rate?.amount).toBeNull();
  });
  it("budget mancante non è zero né un confronto parziale", () => {
    const actual = laborEconomics([row(), row({ id: "r2", cost_preventivo: null })], true);
    expect(actual.budget).toBeNull(); expect(actual.people[0].overBudget).toBe(false);
  });
  it("budget esplicitamente zero è distinto da assente", () => expect(laborEconomics([row({ cost_preventivo: 0 })], true).people[0].overBudget).toBe(true));
  it("registro vuoto non inventa un budget", () => expect(laborEconomics([], true)).toMatchObject({ people: [], hours: 0, cost: 0, budget: null }));
  it("totali non validi non si trasformano in un margine favorevole", () => {
    const actual = laborEconomics([row({ total_cost: "NaN", hours_worked: null })], true);
    expect(actual.cost).toBeNull(); expect(actual.hours).toBeNull(); expect(actual.people[0].averageRate).toBeNull();
  });
  it("somma monetaria al centesimo", () => expect(sumLaborAmounts([0.1, 0.2, 1.005])).toBe(1.31));
  it.each([null, undefined, "", " ", "NaN", "Infinity", "0x10", -1, Number.MAX_VALUE, true as unknown as number])("non accetta %s come importo valido", value => expect(laborAmount(value)).toBeNull());
  it("non lascia traboccare la somma anche con righe singolarmente valide", () => expect(sumLaborAmounts([5e13, 5e13])).toBeNull());
});
describe("Subappalti separati dalla tariffa dipendente", () => {
  const team: ExternalLaborRow = { id: "t1", total_cost: 122, cost_preventivo: 150, vat_rate: 22, team: null };
  it("toglie l'IVA al lordo come il conto economico", () => expect(externalLaborNet(team)).toBe(100));
  it("IVA zero non si trasforma in 22%", () => expect(externalLaborNet({ ...team, vat_rate: 0 })).toBe(122));
  it("solo IVA mancante usa il fallback storico", () => expect(externalLaborNet({ ...team, vat_rate: null })).toBe(100));
  it.each([-1, "NaN", 101])("IVA non valida %s non produce un netto falso", vat_rate => expect(externalLaborNet({ ...team, vat_rate })).toBeNull());
});

describe("Previsione ore separata dal consuntivo",()=>{
 it("conserva ore previste senza trasformarle in ore lavorate",()=>{const r=laborEconomics([row({planned_hours:16,planned_hourly_rate:25,cost_preventivo:400,hours_worked:0,total_cost:0})],true);expect(r.plannedHours).toBe(16);expect(r.hours).toBe(0);expect(r.budget).toBe(400);expect(r.cost).toBe(0);});
 it("le vecchie assegnazioni non inventano ore previste dalla tariffa attuale",()=>{expect(laborEconomics([row()],true).plannedHours).toBeNull();});
});
