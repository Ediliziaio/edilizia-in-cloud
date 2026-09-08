import { describe, it, expect } from "vitest";
import { statoSyncSquadra } from "@/types/squadre";

describe("statoSyncSquadra", () => {
  it("senza calendario è «non collegata»", () => {
    expect(statoSyncSquadra({ google_calendar_id: null, google_sync_enabled: false, google_last_error: null })).toBe("non_collegata");
  });
  it("con calendario ma interruttore spento è «disattivata»", () => {
    expect(statoSyncSquadra({ google_calendar_id: "abc@group.calendar.google.com", google_sync_enabled: false, google_last_error: null })).toBe("disattivata");
  });
  it("con errore recente è «errore», anche se attiva", () => {
    expect(statoSyncSquadra({ google_calendar_id: "abc", google_sync_enabled: true, google_last_error: "Calendario non trovato" })).toBe("errore");
  });
  it("attiva e senza errori è «attiva»", () => {
    expect(statoSyncSquadra({ google_calendar_id: "abc", google_sync_enabled: true, google_last_error: null })).toBe("attiva");
  });
});
