import { describe, expect, it } from "vitest";
import { calendarPeriod, employeeAssignedOnDate, normalizePlanningOrder, orderInCalendarPeriod, filterPlanningAppointments, type RawPlanningOrder } from "@/lib/calendar/planning";
import { calcolaConflitti } from "@/hooks/useConflictDetection";
import type { CalendarAppointment } from "@/types/calendar";

const employee = { id: "worker", first_name: "Mario", last_name: "Rossi" };
function order(id: string, extra: Partial<RawPlanningOrder> = {}): RawPlanningOrder {
  return { id, order_code: id, description: "Casa", expected_date: null, work_start_date: "2026-10-01", work_end_date: "2026-12-31", warehouse_arrival_date: null, created_at: "", customer_id: "customer", current_status_id: null, customer: { first_name: "", last_name: "Cliente" }, status: null, order_employees: [], order_external_teams: [], ...extra };
}
function appointment(id: string, extra: Partial<CalendarAppointment> = {}): CalendarAppointment {
  return { id, title: id, description: null, appointment_date: "2026-10-14", appointment_time: "09:00", appointment_end_time: "10:00", appointment_type: "altro", assigned_to: "user", order_id: null, is_completed: false, company_id: "company", created_by: "user", ...extra };
}
const bridge = new Map([["user", { id: "worker", name: "Mario Rossi" }]]);

describe("Periodi e sorgenti del calendario lavori", () => {
  it("mese e settimana usano giorni locali e includono il cambio mese", () => {
    expect(calendarPeriod(new Date(2026, 9, 31), "month")).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(calendarPeriod(new Date(2026, 9, 31), "week")).toEqual({ from: "2026-10-26", to: "2026-11-01" });
    expect(calendarPeriod(new Date(2026, 9, 14), "day")).toEqual({ from: "2026-10-14", to: "2026-10-14" });
  });
  it("il periodo del Gantt segue il suo zoom, anche l’anno completo", () => {
    expect(calendarPeriod(new Date(2026, 9, 14), "gantt", "quarter")).toEqual({ from: "2026-10-01", to: "2026-12-31" });
    expect(calendarPeriod(new Date(2026, 9, 14), "gantt", "year")).toEqual({ from: "2026-01-01", to: "2026-12-31" });
  });
  it("il riepilogo comprende intervalli sovrapposti e singole consegne nel periodo", () => {
    expect(orderInCalendarPeriod(order("long"), "2026-10-14", "2026-10-14")).toBe(true);
    expect(orderInCalendarPeriod(order("future", { work_start_date: "2026-11-01", work_end_date: "2026-11-10" }), "2026-10-01", "2026-10-31")).toBe(false);
    expect(orderInCalendarPeriod(order("delivery", { work_start_date: null, work_end_date: null, warehouse_arrival_date: "2026-10-14" }), "2026-10-14", "2026-10-14")).toBe(true);
  });
  it("le sorgenti spente non gonfiano i conteggi del riepilogo", () => {
    const meetingOnly = { work: false, installation: false, warehouse: false };
    expect(orderInCalendarPeriod(order("A"), "2026-10-01", "2026-10-31", meetingOnly)).toBe(false);
    const delivery = order("delivery", { work_start_date: null, work_end_date: null, warehouse_arrival_date: "2026-10-14" });
    expect(orderInCalendarPeriod(delivery, "2026-10-01", "2026-10-31", { ...meetingOnly, warehouse: true })).toBe(true);
  });
  it("il commerciale resta visibile con gli operativi spenti", () => {
    const rows = [appointment("work", { order_id: "order" }), appointment("marketing", { calendar_id: "calendar" }), appointment("generic")];
    expect(filterPlanningAppointments(rows, false, true).map(r => r.id)).toEqual(["marketing"]);
    expect(filterPlanningAppointments(rows, true, false).map(r => r.id)).toEqual(["work", "generic"]);
  });
  it("annullati e mancati appuntamenti escono, gli appuntamenti completati restano nello storico", () => {
    const rows = [appointment("cancel", { status: "annullato" }), appointment("missed", { status: "no_show" }), appointment("done", { is_completed: true, status: "completato" })];
    expect(filterPlanningAppointments(rows, true, true).map(r => r.id)).toEqual(["done"]);
  });
  it("assegnatario e ricerca si combinano senza estendere i risultati", () => {
    const rows = [appointment("SAL", { assigned_to: "other" }), appointment("SAL mio"), appointment("Posa")];
    expect(filterPlanningAppointments(rows, true, true, "user", "sal").map(r => r.id)).toEqual(["SAL mio"]);
  });
});
describe("Risorse canoniche e conteggi", () => {
  it("una persona su due fasi si conta una sola volta, con due intervalli distinti", () => {
    const normalized = normalizePlanningOrder(order("A", { order_employees: [
      { employee, phase_id: "first", phase: { name: "Demolizione", start_date: "2026-10-14", end_date: "2026-10-15" } },
      { employee, phase_id: "second", phase: { name: "Posa", start_date: "2026-11-01", end_date: "2026-11-03" } },
    ] }));
    expect(normalized.order_employees).toHaveLength(1); expect(normalized.resource_bookings).toHaveLength(2);
    expect(normalized.resource_bookings?.map(b => b.start_date)).toEqual(["2026-10-14", "2026-11-01"]);
  });
  it("anche il carico per persona usa le date della fase, non l’intero cantiere", () => {
    const normalized = normalizePlanningOrder(order("A", { order_employees: [{ employee, phase_id: "phase", phase: { name: "Posa", start_date: "2026-10-14", end_date: "2026-10-15" } }] }));
    expect(employeeAssignedOnDate(normalized, "worker", "2026-10-14")).toBe(true);
    expect(employeeAssignedOnDate(normalized, "worker", "2026-10-16")).toBe(false);
    expect(employeeAssignedOnDate(normalized, "other", "2026-10-14")).toBe(false);
  });
  it("le squadre commessa entrano nel calendario e non raddoppiano il team sulla fase", () => {
    const team = { id: "team", name: "Squadra interna" };
    const normalized = normalizePlanningOrder(order("A", { order_external_teams: [{ external_team: team, phase_id: "phase", phase: { name: "Posa", start_date: "2026-10-14", end_date: "2026-10-15" } }], squadre_commesse: [{ squadra: team, dal: "2026-10-14", al: "2026-10-15" }] }));
    expect(normalized.order_external_teams).toHaveLength(1); expect(normalized.resource_bookings).toHaveLength(1);
  });
  it("una fase senza date non occupa automaticamente tutta la commessa", () => {
    const normalized = normalizePlanningOrder(order("A", { order_employees: [{ employee, phase_id: "phase", phase: { name: "Posa", start_date: null, end_date: null } }] }));
    expect(normalized.resource_bookings).toEqual([]); expect(normalized.order_employees).toHaveLength(1);
  });
  it("preserva assegnazioni generali e posa esterna all’intervallo lavori", () => {
    const normalized = normalizePlanningOrder(order("A", { expected_date: "2027-01-03", order_employees: [{ employee }] }));
    expect(normalized.resource_bookings).toHaveLength(2);
  });
  it("ignora relazioni mancanti e intervalli invertiti senza perdere il cliente di riserva", () => {
    const normalized = normalizePlanningOrder(order("A", { customer: null, order_employees: [{ employee: null }, { employee, phase_id: "phase", phase: { name: "Posa", start_date: "2026-10-20", end_date: "2026-10-10" } }] }));
    expect(normalized.customer.last_name).toBe("Cliente non associato"); expect(normalized.resource_bookings).toEqual([]);
  });
});
describe("Avvisi di sovrapposizione verificabili", () => {
  it("fasi distinte di due commesse non occupano la stessa persona per mesi", () => {
    const phase = (start: string) => [{ employee, phase_id: start, phase: { name: "Posa", start_date: start, end_date: start } }];
    const orders = [normalizePlanningOrder(order("A", { order_employees: phase("2026-10-14") })), normalizePlanningOrder(order("B", { order_employees: phase("2026-10-16") }))];
    expect(calcolaConflitti(orders, [], bridge, "2026-10-14", { from: "2026-10-01", to: "2026-10-31" })).toEqual([]);
  });
  it("gli avvisi sono limitati alle date visibili anche per commesse molto lunghe", () => {
    const rows = ["A", "B"].map(id => normalizePlanningOrder(order(id, { order_employees: [{ employee }] })));
    expect(calcolaConflitti(rows, [], bridge, "2026-10-14", { from: "2026-10-14", to: "2026-10-15" }).map(c => c.date)).toEqual(["2026-10-14", "2026-10-15"]);
  });
  it("due appuntamenti consecutivi con orari noti non confliggono", () => {
    expect(calcolaConflitti([], [appointment("A"), appointment("B", { appointment_time: "10:00:00", appointment_end_time: "11:00:00" })], bridge, "2026-10-14")).toEqual([]);
  });
  it("due appuntamenti sovrapposti si segnalano, anche se della stessa commessa", () => {
    expect(calcolaConflitti([], [appointment("A", { order_id: "same" }), appointment("B", { order_id: "same", appointment_time: "09:30" })], bridge, "2026-10-14")).toHaveLength(1);
  });
  it("un appuntamento della propria commessa non raddoppia l’impegno di cantiere", () => {
    const own = normalizePlanningOrder(order("A", { order_employees: [{ employee }] }));
    expect(calcolaConflitti([own], [appointment("SAL", { order_id: "A" })], bridge, "2026-10-14")).toEqual([]);
  });
  it("orari mancanti producono una verifica, senza dichiarare un conflitto certo", () => {
    const entries = calcolaConflitti([], [appointment("A", { appointment_end_time: null }), appointment("B")], bridge, "2026-10-14");
    expect(entries[0].severity).toBe("warning"); expect(entries[0].reason).toContain("orari mancanti");
  });
  it("gli appuntamenti conclusi o annullati non impegnano una risorsa", () => {
    expect(calcolaConflitti([], [appointment("A"), appointment("B", { is_completed: true }), appointment("C", { status: "annullato" })], bridge, "2026-10-14")).toEqual([]);
  });
});
