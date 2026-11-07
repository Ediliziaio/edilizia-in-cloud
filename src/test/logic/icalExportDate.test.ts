import { afterEach, describe, expect, it, vi } from "vitest";
import { exportAppointmentsIcal } from "@/lib/icalExport";
import type { CalendarAppointment, CalendarOrder } from "@/types/calendar";

const base: CalendarAppointment = {
  id: "demo", title: "Sopralluogo", description: "Cancello; lato nord", appointment_date: "2026-11-05",
  appointment_time: "23:30", appointment_type: "sopralluogo", assigned_to: null, order_id: null,
  is_completed: false, company_id: "azienda", created_by: "utente",
};
async function exported(appointment: CalendarAppointment, orders: CalendarOrder[] = []) {
  let content = "";
  class TestBlob { constructor(parts: string[]) { content = parts.join(""); } }
  vi.stubGlobal("Blob", TestBlob);
  vi.stubGlobal("URL", { createObjectURL: () => "blob:demo", revokeObjectURL: vi.fn() });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  exportAppointmentsIcal([appointment], orders);
  return content;
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
describe("esportazione appuntamenti: campi reali e cambio giorno", () => {
  it("conserva descrizione e orario di fine esplicito", async () => {
    const text = await exported({ ...base, appointment_time: "09:15", appointment_end_time: "11:45" });
    expect(text).toContain("DTSTART:20261105T091500");
    expect(text).toContain("DTEND:20261105T114500");
    expect(text).toContain("DESCRIPTION:Cancello\\; lato nord");
  });
  it("la durata predefinita attraversa mezzanotte senza produrre ore 24/25", async () => {
    expect(await exported(base)).toContain("DTEND:20261106T003000");
  });
  it("interpreta la fine antecedente all'inizio come giorno successivo", async () => {
    expect(await exported({ ...base, appointment_end_time: "00:10" })).toContain("DTEND:20261106T001000");
  });
  it("usa uno stato VEVENT valido e conserva il completamento nella descrizione", async () => {
    const text = await exported({ ...base, is_completed: true, description: "Prima\r\nSeconda\rTerza" });
    expect(text).toContain("STATUS:CONFIRMED");
    expect(text).not.toContain("STATUS:COMPLETED");
    expect(text).toContain("DESCRIPTION:Prima\\nSeconda\\nTerza\\nCompletato in Edilizia in Cloud");
  });
  it("la commessa di un giorno termina il giorno dopo anche fuori dal fuso italiano", async () => {
    const ordine: CalendarOrder = {
      id: "ordine", order_code: "DEMO", description: "Prova", expected_date: null,
      work_start_date: "2026-11-05", work_end_date: "2026-11-05", warehouse_arrival_date: null,
      created_at: "2026-11-01", customer_id: "cliente", current_status_id: null,
      customer: { first_name: "Demo", last_name: "Prova" }, status: null,
    };
    const text = await exported(base, [ordine]);
    expect(text).toContain("DTSTART;VALUE=DATE:20261105");
    expect(text).toContain("DTEND;VALUE=DATE:20261106");
  });
  it("DTSTAMP usa UTC e non etichetta come UTC l'ora locale", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-05T20:30:00Z"));
    expect(await exported(base)).toContain("DTSTAMP:20261105T203000Z");
  });
});
