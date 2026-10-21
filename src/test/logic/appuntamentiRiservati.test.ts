import { describe, expect, it } from "vitest";
import { appuntamentiPerCalendarioLavori } from "@/lib/calendar/appuntamentiRiservati";
import type { CalendarAppointment } from "@/types/calendar";

const base = (x: Partial<CalendarAppointment>): CalendarAppointment => ({
  id: "a", title: "Sopralluogo Rossi", description: "Via Roma 1", appointment_date: "2026-10-22",
  appointment_time: "10:00", appointment_type: "sopralluogo", assigned_to: "collega", order_id: null,
  is_completed: false, company_id: "c", created_by: "collega",
  contact: { first_name: "Mario", last_name: "Rossi" }, formatted_address: "Via Roma 1, Torino",
  ...x,
});

describe("appuntamenti del CRM nel calendario dei lavori", () => {
  it("chi non vede il CRM vede «Occupato» per l'appuntamento commerciale di un collega", () => {
    const [a] = appuntamentiPerCalendarioLavori([base({})], { userId: "io", vedeCrm: false });
    expect(a.title).toBe("Occupato");
    expect(a.riservato).toBe(true);
    expect(a.contact).toBeNull();
    expect(a.description).toBeNull();
    expect(a.formatted_address).toBeUndefined();
    expect(a.appointment_time).toBe("10:00");
    expect(a.assigned_to).toBe("collega");
  });

  it("restano leggibili i propri e quelli di una commessa", () => {
    const righe = appuntamentiPerCalendarioLavori(
      [base({ id: "1", assigned_to: "io" }), base({ id: "2", created_by: "io" }), base({ id: "3", order_id: "o" })],
      { userId: "io", vedeCrm: false },
    );
    expect(righe.map((r) => r.title)).toEqual(["Sopralluogo Rossi", "Sopralluogo Rossi", "Sopralluogo Rossi"]);
  });

  it("chi vede il CRM vede tutto", () => {
    const [a] = appuntamentiPerCalendarioLavori([base({})], { userId: "io", vedeCrm: true });
    expect(a.title).toBe("Sopralluogo Rossi");
  });
});
