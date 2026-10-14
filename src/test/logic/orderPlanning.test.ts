import {describe, expect, it} from "vitest";
import {isPlanningDay, planningTime, validatePlanning, isArchivedAppointment, isLegacyPlanningMarker, comparePlanningAppointments, APPOINTMENT_LABELS, type OrderPlanningDates} from "@/lib/orders/planning";
const dates: OrderPlanningDates = {expected_date: null, warehouse_arrival_date: null, work_start_date: "2026-10-13", work_end_date: "2026-10-13", work_start_time: null, work_end_time: null};
describe("Pianificazione commessa", () => {
  it.each(["2026-02-30", "2026-13-01", "2026-01-00", "no", "2026-1-1", "2025-02-29"])("rifiuta data inesistente %s", value => expect(isPlanningDay(value)).toBe(false));
  it.each(["2024-02-29", "2026-10-13"])("accetta data valida %s", value => expect(isPlanningDay(value)).toBe(true));
  it("consente giornate intere e intervalli di più giorni", () => {
    expect(validatePlanning(dates)).toBeNull();
    expect(validatePlanning({...dates, work_start_time: "15:00", work_end_time: "17:00"})).toBeNull();
    expect(validatePlanning({...dates, work_end_date: "2026-10-14", work_start_time: "17:00", work_end_time: "09:00"})).toBeNull();
  });
  it("non accetta fine precedente, orari sovrapposti nello stesso giorno o orari senza date", () => {
    expect(validatePlanning({...dates, work_end_date: "2026-10-12"})).toMatch(/prima/);
    expect(validatePlanning({...dates, work_start_time: "17:00", work_end_time: "16:00"})).toMatch(/orario/);
    expect(validatePlanning({...dates, work_start_time: "17:00", work_end_time: "17:00"})).toMatch(/orario/);
    expect(validatePlanning({...dates, work_start_date: null, work_start_time: "08:00"})).toMatch(/prima/);
    expect(planningTime("25:20")).toBe("");
  });
  it("riconosce solo le vecchie tappe automatiche, non gli appuntamenti reali", () => {
    const marker = {appointment_date: "2026-10-13", appointment_type: "inizio_lavori", description: "Milestone operativo di avvio lavori collegato alla commessa."};
    expect(isLegacyPlanningMarker(marker)).toBe(true);
    expect(isArchivedAppointment(marker)).toBe(true);
    expect(isLegacyPlanningMarker({...marker, assigned_to: "worker"})).toBe(false);
    expect(isLegacyPlanningMarker({...marker, appointment_time: "08:00"})).toBe(false);
    expect(isLegacyPlanningMarker({...marker, description: "Visita con il cliente"})).toBe(false);
  });
  it("annullati e completati restano nello storico, gli aperti nell'agenda", () => {
    expect(isArchivedAppointment({appointment_date: "2026-10-13", status: "annullato"})).toBe(true);
    expect(isArchivedAppointment({appointment_date: "2026-10-13", is_completed: true})).toBe(true);
    expect(isArchivedAppointment({appointment_date: "2026-10-13", status: "confermato"})).toBe(false);
  });
  it("ordina per giorno e ora e riconosce i tipi operativi recenti", () => {
    expect(comparePlanningAppointments({appointment_date: "2026-10-13", appointment_time: "09:00"}, {appointment_date: "2026-10-13", appointment_time: "15:00"})).toBeLessThan(0);
    expect(APPOINTMENT_LABELS.rilievo_tecnico).toBe("Rilievo tecnico");
    expect(APPOINTMENT_LABELS.verifica_cantiere).toBe("Verifica cantiere");
  });
});
