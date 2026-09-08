import { describe, it, expect } from "vitest";
import { costruisciEventoPosa, leggiDateDaEventoGoogle, giornoDopo, stesseDate } from "../../../supabase/functions/_shared/posaEvento";

const base = { id: "o1", company_id: "c1", order_code: "DEMO-0042", client_name: "Rossi Mario", description: "Finestre", indirizzo_lavori: "Via Roma 1, Meda" };

describe("costruisciEventoPosa", () => {
  it("con orari fa un evento a orario, in Europe/Rome", () => {
    const e = costruisciEventoPosa({ ...base, work_start_date: "2026-09-10", work_end_date: "2026-09-10", work_start_time: "08:00:00", work_end_time: "12:00:00" });
    expect(e.summary).toBe("Posa · DEMO-0042 · Rossi Mario");
    expect(e.start).toEqual({ dateTime: "2026-09-10T08:00:00", timeZone: "Europe/Rome" });
    expect(e.end).toEqual({ dateTime: "2026-09-10T12:00:00", timeZone: "Europe/Rome" });
    expect(e.location).toBe("Via Roma 1, Meda");
    expect(e.extendedProperties.private.eic_order_id).toBe("o1");
  });
  it("senza orari fa un evento tutto-il-giorno con fine esclusiva", () => {
    const e = costruisciEventoPosa({ ...base, work_start_date: "2026-09-10", work_end_date: "2026-09-12", work_start_time: null, work_end_time: null });
    expect(e.start).toEqual({ date: "2026-09-10" });
    expect(e.end).toEqual({ date: "2026-09-13" });
  });
  it("senza fine usa l'inizio", () => {
    const e = costruisciEventoPosa({ ...base, work_start_date: "2026-09-10", work_end_date: null, work_start_time: null, work_end_time: null });
    expect(e.end).toEqual({ date: "2026-09-11" });
  });
});

describe("leggiDateDaEventoGoogle", () => {
  it("evento a orario → date e ore", () => {
    expect(leggiDateDaEventoGoogle({ start: { dateTime: "2026-09-11T09:30:00+02:00" }, end: { dateTime: "2026-09-11T13:00:00+02:00" } }))
      .toEqual({ work_start_date: "2026-09-11", work_end_date: "2026-09-11", work_start_time: "09:30:00", work_end_time: "13:00:00" });
  });
  it("tutto-il-giorno → fine inclusiva, ore nulle", () => {
    expect(leggiDateDaEventoGoogle({ start: { date: "2026-09-10" }, end: { date: "2026-09-13" } }))
      .toEqual({ work_start_date: "2026-09-10", work_end_date: "2026-09-12", work_start_time: null, work_end_time: null });
  });
  it("giornoDopo non sbaglia il cambio mese", () => {
    expect(giornoDopo("2026-09-30")).toBe("2026-10-01");
  });
  it("stesseDate riconosce l'eco di un nostro push", () => {
    const a = { work_start_date: "2026-09-10", work_end_date: "2026-09-10", work_start_time: "08:00:00", work_end_time: "12:00:00" };
    expect(stesseDate(a, { ...a })).toBe(true);
    expect(stesseDate(a, { ...a, work_end_time: "13:00:00" })).toBe(false);
  });
});
