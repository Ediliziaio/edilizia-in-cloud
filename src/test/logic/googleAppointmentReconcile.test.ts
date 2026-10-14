import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  googleAppointmentDeletionConfirmed, listGoogleAppointmentEvents, mayCancelMissingGoogleAppointment,
  reconcileMissingGoogleAppointments, type MappedGoogleAppointment, type ReconciledAppointment,
} from "../../../supabase/functions/_shared/googleAppointmentReconcile";

const now = new Date("2026-10-13T10:00:00Z"), timeMax = "2026-12-12T10:00:00Z";
const scope = { companyId: "company", userId: "user", calendarId: "calendar/with space", accessToken: "test-only", timeMax };
const appointment = (patch: Partial<ReconciledAppointment> = {}): ReconciledAppointment => ({
  id: "apt", appointment_date: "2026-10-14", appointment_time: "15:00:00", status: "confermato",
  is_completed: false, updated_at: "2026-10-12T10:00:00Z", internal_notes: "Original note", ...patch,
});
const mapping = (patch: Partial<MappedGoogleAppointment> = {}): MappedGoogleAppointment => ({
  id: "map", appointment_id: "apt", google_event_id: "google/event", company_id: scope.companyId,
  user_id: scope.userId, google_calendar_id: scope.calendarId, ...patch,
});
const response = (body: unknown, status = 200) => Response.json(body, { status });

function database(apt = appointment()) {
  const state = { appointments: [{ ...apt, company_id: scope.companyId }], mappings: [mapping()],
    writes: [] as { table: string; kind: string; filters: [string, unknown][] }[], readError: false, writeError: false, mapError: false };
  const db = { from(table: string) {
    const query = { kind: "select", patch: {} as Record<string, unknown>, filters: [] as [string, unknown][],
      select() { return this; }, eq(key: string, value: unknown) { this.filters.push([key, value]); return this; },
      update(patch: Record<string, unknown>) { this.kind = "update"; this.patch = patch; return this; },
      delete() { this.kind = "delete"; return this; },
      async maybeSingle() { return this.run(); },
      then(resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) { return Promise.resolve(this.run()).then(resolve, reject); },
      run(): { data: unknown; error: { message: string } | null } {
        const rows = table === "appointments" ? state.appointments : state.mappings;
        const found = rows.find(row => this.filters.every(([key, value]: [string, unknown]) => (row as Record<string, unknown>)[key] === value));
        const error = (this.kind === "select" && state.readError) || (this.kind === "update" && state.writeError) || (this.kind === "delete" && state.mapError);
        if (error) return { data: null, error: { message: "Simulated database failure" } };
        if (this.kind !== "select") state.writes.push({ table, kind: this.kind, filters: [...this.filters] });
        if (!found) return { data: null, error: null };
        if (this.kind === "update") Object.assign(found, this.patch);
        if (this.kind === "delete") state.mappings = state.mappings.filter(row => row !== found);
        return { data: structuredClone(found), error: null };
      },
    };
    return query;
  } };
  return { db, state };
}

describe("Google appointment window and history protection", () => {
  it("reproduces the 7-day boundary without cancelling the appointment or losing its map", async () => {
    const x = database(appointment({ appointment_date: "2026-09-28", appointment_time: "12:00:00" })), fetcher = vi.fn();
    expect(await reconcileMissingGoogleAppointments(x.db, scope, [mapping()], new Set(), { now: () => new Date("2026-10-05T10:49:20Z"), fetcher })).toBe(0);
    expect(fetcher).not.toHaveBeenCalled(); expect(x.state.writes).toEqual([]); expect(x.state.mappings).toHaveLength(1);
  });
  it.each(["presentato", "no_show", "da_preventivare", "preventivo_inviato", "venduto", "perso", "non_qualificato", "riprogrammato", "completato", "annullato"])("preserves the recorded outcome %s", status => {
    expect(mayCancelMissingGoogleAppointment(appointment({ status }), now, timeMax)).toBe(false);
  });
  it("preserves completion even when the status is still confirmed", () => {
    expect(mayCancelMissingGoogleAppointment(appointment({ is_completed: true }), now, timeMax)).toBe(false);
  });
  it.each([
    { appointment_date: "2026-10-13", appointment_time: "12:00:30" },
    { appointment_date: "2026-10-13", appointment_time: "11:30:00" },
    { appointment_date: "2026-12-12", appointment_time: "11:00:00" },
    { appointment_date: "2026-02-30" }, { appointment_time: null }, { appointment_time: "27:00:00" }, { updated_at: null },
  ])("preserves in-progress, out-of-window or unverifiable appointments %j", patch => {
    expect(mayCancelMissingGoogleAppointment(appointment(patch), now, timeMax)).toBe(false);
  });
  it("uses Italian time through the autumn DST change and never relies on the server timezone", () => {
    const apt = appointment({ appointment_date: "2026-10-25", appointment_time: "02:30:00" });
    expect(mayCancelMissingGoogleAppointment(apt, new Date("2026-10-25T00:45:00Z"), timeMax)).toBe(false);
    expect(mayCancelMissingGoogleAppointment(appointment({ appointment_time: "16:00" }), now, timeMax)).toBe(true);
  });
});

describe("Complete Google event list", () => {
  it("reads every page and deduplicates before returning the complete snapshot", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(response({ items: [{ id: "one" }], nextPageToken: "next" }))
      .mockResolvedValueOnce(response({ items: [{ id: "one" }, { id: "two" }] }));
    expect(await listGoogleAppointmentEvents(scope.calendarId, "test", "2026-10-06T10:00:00Z", timeMax, fetcher)).toEqual([{ id: "one" }, { id: "two" }]);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(new URL(fetcher.mock.calls[1][0]).searchParams.get("pageToken")).toBe("next");
    expect(fetcher.mock.calls[0][0]).toContain("calendar%2Fwith%20space");
  });
  it("a failure on the next page cannot become an empty or partial successful read", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(response({ items: [{ id: "one" }], nextPageToken: "next" }))
      .mockResolvedValueOnce(response({ error: "access denied" }, 403));
    await expect(listGoogleAppointmentEvents("calendar", "test", "min", "max", fetcher)).rejects.toThrow("incompleta");
  });
  it.each([{ items: "bad" }, { items: [{ status: "confirmed" }] }, { error: { message: "bad" } }, { nextPageToken: "" }])("fails closed on malformed response %j", async body => {
    await expect(listGoogleAppointmentEvents("calendar", "test", "min", "max", vi.fn().mockResolvedValue(response(body)))).rejects.toThrow();
  });
  it("does not loop on repeated page tokens", async () => {
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(response({ items: [], nextPageToken: "repeated" })));
    await expect(listGoogleAppointmentEvents("calendar", "test", "min", "max", fetcher)).rejects.toThrow("Paginazione");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("does not reconcile after reaching the bounded page limit", async () => {
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(response({ items: [], nextPageToken: String(fetcher.mock.calls.length) })));
    await expect(listGoogleAppointmentEvents("calendar", "test", "min", "max", fetcher)).rejects.toThrow("Limite pagine");
    expect(fetcher).toHaveBeenCalledTimes(20);
  });
});

describe("Explicit Google deletion evidence", () => {
  it.each([401, 403, 404, 429, 500, 502])("HTTP %s is not evidence of cancellation", async status => {
    expect(await googleAppointmentDeletionConfirmed("calendar", "event", "test", vi.fn().mockResolvedValue(response({}, status)))).toBe(false);
  });
  it("410 requires the deleted reason, not an expired sync token", async () => {
    for (const reason of ["fullSyncRequired", "updatedMinTooLongAgo", "deleted"]) {
      expect(await googleAppointmentDeletionConfirmed("calendar", "event", "test", vi.fn().mockResolvedValue(response({ error: { errors: [{ reason }] } }, 410)))).toBe(reason === "deleted");
    }
  });
  it("requires the exact event ID and the explicit cancelled status", async () => {
    for (const event of [{ id: "event", status: "confirmed" }, { id: "other", status: "cancelled" }, { id: "event", status: "cancelled" }]) {
      expect(await googleAppointmentDeletionConfirmed("calendar", "event", "test", vi.fn().mockResolvedValue(response(event)))).toBe(event.id === "event" && event.status === "cancelled");
    }
  });
  it("preserves state after network or malformed JSON failures", async () => {
    expect(await googleAppointmentDeletionConfirmed("calendar", "event", "test", vi.fn().mockRejectedValue(new Error("Timeout")))).toBe(false);
    expect(await googleAppointmentDeletionConfirmed("calendar", "event", "test", vi.fn().mockResolvedValue(new Response("bad json")))).toBe(false);
  });
});

describe("Missing appointment reconciliation", () => {
  it("absence alone never causes a cancellation", async () => {
    const x = database(), fetcher = vi.fn().mockResolvedValue(response({ id: "google/event", status: "confirmed" }));
    expect(await reconcileMissingGoogleAppointments(x.db, scope, [mapping()], new Set(), { now: () => now, fetcher })).toBe(0);
    expect(x.state.writes).toEqual([]);
  });
  it("updates only a confirmed future appointment with explicit deletion evidence and keeps its notes", async () => {
    const x = database(), fetcher = vi.fn().mockResolvedValue(response({ id: "google/event", status: "cancelled" }));
    expect(await reconcileMissingGoogleAppointments(x.db, scope, [mapping()], new Set(), { now: () => now, fetcher })).toBe(1);
    expect(x.state.appointments[0].status).toBe("annullato");
    expect(x.state.appointments[0].internal_notes).toContain("Original note\nAnnullato");
    expect(x.state.appointments[0].internal_notes).toContain("cancellazione verificata");
    expect(x.state.mappings).toEqual([]);
    for (const write of x.state.writes) expect(write.filters).toContainEqual(["company_id", scope.companyId]);
    expect(x.state.writes[0].filters).toContainEqual(["updated_at", appointment().updated_at]);
    expect(x.state.writes[1].filters).toContainEqual(["user_id", scope.userId]);
    expect(fetcher.mock.calls[0][0]).toContain("/events/google%2Fevent");
  });
  it.each(["company_id", "user_id", "google_calendar_id"])("never crosses %s ownership", async field => {
    const x = database(), fetcher = vi.fn();
    expect(await reconcileMissingGoogleAppointments(x.db, scope, [mapping({ [field]: "other" })], new Set(), { now: () => now, fetcher })).toBe(0);
    expect(fetcher).not.toHaveBeenCalled(); expect(x.state.writes).toEqual([]);
  });
  it("does not touch an event present on a later list page", async () => {
    const x = database(), fetcher = vi.fn();
    await reconcileMissingGoogleAppointments(x.db, scope, [mapping()], new Set(["google/event"]), { now: () => now, fetcher });
    expect(fetcher).not.toHaveBeenCalled(); expect(x.state.writes).toEqual([]);
  });
  it("a completion made while Google is being queried wins over cancellation", async () => {
    const x = database(), fetcher = vi.fn().mockImplementation(async () => {
      x.state.appointments[0].is_completed = true;
      return response({ id: "google/event", status: "cancelled" });
    });
    expect(await reconcileMissingGoogleAppointments(x.db, scope, [mapping()], new Set(), { now: () => now, fetcher })).toBe(0);
    expect(x.state.appointments[0].status).toBe("confermato"); expect(x.state.mappings).toHaveLength(1);
  });
  it("a reschedule or any newer version made while Google is queried wins", async () => {
    const x = database(), fetcher = vi.fn().mockImplementation(async () => {
      x.state.appointments[0].updated_at = "2026-10-13T10:01:00Z";
      return response({ id: "google/event", status: "cancelled" });
    });
    expect(await reconcileMissingGoogleAppointments(x.db, scope, [mapping()], new Set(), { now: () => now, fetcher })).toBe(0);
    expect(x.state.appointments[0].status).toBe("confermato"); expect(x.state.mappings).toHaveLength(1);
  });
  it("the appointment remains protected if its start passes during the Google request", async () => {
    const x = database(appointment({ appointment_date: "2026-10-13", appointment_time: "12:01:00" }));
    const clock = vi.fn().mockReturnValueOnce(now).mockReturnValueOnce(new Date("2026-10-13T10:02:00Z"));
    expect(await reconcileMissingGoogleAppointments(x.db, scope, [mapping()], new Set(), {
      now: clock, fetcher: vi.fn().mockResolvedValue(response({ id: "google/event", status: "cancelled" })),
    })).toBe(0);
    expect(x.state.writes).toEqual([]);
  });
  it.each(["readError", "writeError"])("does not delete a mapping after a database %s", async error => {
    const x = database(); x.state[error as "readError" | "writeError"] = true;
    await expect(reconcileMissingGoogleAppointments(x.db, scope, [mapping()], new Set(), {
      now: () => now, fetcher: vi.fn().mockResolvedValue(response({ id: "google/event", status: "cancelled" })),
    })).rejects.toThrow();
    expect(x.state.mappings).toHaveLength(1);
  });
  it("the production function uses the guarded helper instead of the date-only cancellation loop", () => {
    const source = readFileSync("supabase/functions/google-calendar-sync/index.ts", "utf8");
    const body = source.slice(source.indexOf("async function reconcileCalendario("), source.indexOf("// ---- RECONCILE PRIMARY"));
    expect(body).toContain("await listGoogleAppointmentEvents"); expect(body).toContain("await reconcileMissingGoogleAppointments");
    expect(body).not.toContain("const giornoMin"); expect(body).not.toContain('status: "annullato"');
  });
});
