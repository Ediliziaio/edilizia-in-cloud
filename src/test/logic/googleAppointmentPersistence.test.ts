import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import ts from "typescript";
import {
  applyGoogleAppointmentChange, deleteGoogleAppointmentEvent, googleAppointmentEventId, googleImportedAppointmentId,
  importGoogleAppointment, insertGoogleAppointmentEvent, loadGoogleAppointmentMappings, saveGoogleAppointmentMapping,
} from "../../../supabase/functions/_shared/googleAppointmentPersistence";

beforeAll(() => vi.stubGlobal("crypto", webcrypto));
afterAll(() => vi.unstubAllGlobals());
const scope = { companyId: "company", userId: "user", calendarId: "calendar/space" };
const mapping = { id: "map", company_id: scope.companyId, user_id: scope.userId, google_calendar_id: scope.calendarId,
  appointment_id: "apt", google_event_id: "event", etag: "old" };
const response = (body: unknown, status = 200) => Response.json(body, { status });
const url = "https://www.googleapis.com/calendar/v3/calendars/calendar%2Fspace/events?conferenceDataVersion=1";

function database() {
  const rows: Record<string, Record<string, any>[]> = {
    appointments: [{ id: "apt", company_id: scope.companyId, updated_at: "before", title: "Original" }],
    google_calendar_event_map: [{ ...mapping }],
    google_calendar_busy_slots: [],
    google_calendar_connections: [{ id: "connection" }],
  };
  const state = { rows, operations: [] as { table: string; kind: string; filters: [string, unknown][] }[],
    fail: "", beforeWrite: undefined as (() => void) | undefined };
  const db = { from(table: string) {
    const query = { kind: "select", patch: {} as Record<string, any>, filters: [] as [string, unknown][], ignoreDuplicates: false,
      select() { return this; }, order() { return this; }, range() { return this; },
      eq(key: string, value: unknown) { this.filters.push([key, value]); return this; },
      is(key: string, value: unknown) { return this.eq(key, value); },
      update(patch: Record<string, any>) { this.kind = "update"; this.patch = patch; return this; },
      delete() { this.kind = "delete"; return this; },
      insert(patch: Record<string, any>) { this.kind = "insert"; this.patch = patch; return this; },
      upsert(patch: Record<string, any>, options: { ignoreDuplicates?: boolean }) {
        this.kind = "upsert"; this.patch = patch; this.ignoreDuplicates = !!options.ignoreDuplicates; return this;
      },
      async maybeSingle() { return this.run(); },
      async single() { return this.run(); },
      then(resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) { return Promise.resolve(this.run()).then(resolve, reject); },
      run(): { data: any; error: { message: string; code: string } | null } {
        state.operations.push({ table, kind: this.kind, filters: [...this.filters] });
        if (state.fail === `${table}:${this.kind}`) return { data: null, error: { message: "Database failure", code: "08006" } };
        if (this.kind !== "select") { state.beforeWrite?.(); state.beforeWrite = undefined; }
        const found = rows[table].find(row => this.filters.every(([key, value]: [string, unknown]) => row[key] === value));
        if (this.kind === "insert") {
          if (rows[table].some(row => row.appointment_id === this.patch.appointment_id)) return { data: null, error: { message: "Duplicate", code: "23505" } };
          rows[table].push({ ...this.patch });
        } else if (this.kind === "upsert") {
          const existing = rows[table].find(row => row.id === this.patch.id);
          if (!existing) { rows[table].push({ ...this.patch }); return { data: [{ id: this.patch.id }], error: null }; }
          else if (!this.ignoreDuplicates) Object.assign(existing, this.patch);
          return { data: [], error: null };
        } else if (this.kind === "update" && found) Object.assign(found, this.patch);
        else if (this.kind === "delete") rows[table] = rows[table].filter(row => !this.filters.every(([key, value]: [string, unknown]) => row[key] === value));
        return { data: found ? structuredClone(found) : null, error: null };
      },
    };
    return query;
  } };
  return { db, state };
}

describe("Retry-safe Google creation and imports", () => {
  it("uses stable, Google-compatible event IDs without leaking the original identifiers", async () => {
    const id = await googleAppointmentEventId("company", "apt");
    expect(id).toMatch(/^[a-v0-9]{5,1024}$/);
    expect(id).toBe(await googleAppointmentEventId("company", "apt"));
    expect(id).not.toBe(await googleAppointmentEventId("other-company", "apt"));
    expect(id).not.toContain("company");
  });
  it("creates a stable scoped UUID for imports, including shared-calendar readers", async () => {
    const id = await googleImportedAppointmentId(scope, "event");
    expect(id).toMatch(/^[\da-f]{8}-[\da-f]{4}-8[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/);
    expect(id).toBe(await googleImportedAppointmentId(scope, "event"));
    expect(id).toBe(await googleImportedAppointmentId({ ...scope, userId: "other-reader" }, "event"));
    for (const key of ["companyId", "calendarId"] as const) {
      expect(id).not.toBe(await googleImportedAppointmentId({ ...scope, [key]: "other" }, "event"));
    }
    expect(id).not.toBe(await googleImportedAppointmentId(scope, "other"));
  });
  it("adds the idempotency ID and private ownership without losing existing properties", async () => {
    const id = await googleAppointmentEventId("company", "apt");
    const fetcher = vi.fn().mockResolvedValue(response({ id, status: "confirmed" }));
    const result = await insertGoogleAppointmentEvent(url, "test", { summary: "Demo", extendedProperties: { private: { keep: "yes" }, shared: { keep: "also" } } }, "company", "apt", fetcher);
    expect(result.ok).toBe(true);
    const body = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(body).toMatchObject({ id, extendedProperties: { private: { keep: "yes", crm_company_id: "company", crm_appointment_id: "apt" }, shared: { keep: "also" } } });
  });
  it("recovers a successful previous POST on 409 instead of making another booking", async () => {
    const id = await googleAppointmentEventId("company", "apt");
    const existing = { id, status: "confirmed", summary: "Edited on Google", extendedProperties: { private: { crm_company_id: "company", crm_appointment_id: "apt" } } };
    const fetcher = vi.fn().mockResolvedValueOnce(response({}, 409)).mockResolvedValueOnce(response(existing));
    const result = await insertGoogleAppointmentEvent(url, "test", {}, "company", "apt", fetcher);
    expect(result.headers.get("x-eic-recovered")).toBe("true");
    expect(await result.json()).toEqual(existing); expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1][0]).toBe(`${url.split("?")[0]}/${id}`);
    expect(fetcher.mock.calls[1][1].method).toBeUndefined();
  });
  it.each(["wrong-company", "wrong-appointment", "cancelled", "missing-ownership"])("does not overwrite a 409 conflict with %s", async kind => {
    const id = await googleAppointmentEventId("company", "apt");
    const existing = { id, status: kind === "cancelled" ? "cancelled" : "confirmed", extendedProperties: kind === "missing-ownership" ? {} : { private: {
      crm_company_id: kind === "wrong-company" ? "other" : "company", crm_appointment_id: kind === "wrong-appointment" ? "other" : "apt",
    } } };
    const fetcher = vi.fn().mockResolvedValueOnce(response({}, 409)).mockResolvedValueOnce(response(existing));
    await expect(insertGoogleAppointmentEvent(url, "test", {}, "company", "apt", fetcher)).rejects.toThrow("Conflitto");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("preserves API errors and refuses a malformed creation result", async () => {
    const fetcher = vi.fn().mockResolvedValue(response({}, 403));
    expect((await insertGoogleAppointmentEvent(url, "test", {}, "company", "apt", fetcher)).status).toBe(403);
    await expect(insertGoogleAppointmentEvent(url, "test", {}, "company", "apt", vi.fn().mockResolvedValue(response({ id: "other" })))).rejects.toThrow("non verificabile");
  });
  it("a failed mapping insert cannot duplicate the CRM appointment on retry or reset its outcome", async () => {
    const x = database(); x.state.rows.appointments = []; x.state.rows.google_calendar_event_map = [];
    x.state.fail = "google_calendar_event_map:insert";
    await expect(importGoogleAppointment(x.db, scope, "new", { title: "Imported", status: "confermato" }, {})).rejects.toThrow("non salvato");
    expect(x.state.rows.appointments).toHaveLength(1);
    x.state.rows.appointments[0].status = "presentato"; x.state.rows.appointments[0].title = "Edited by user";
    x.state.fail = "";
    const result = await importGoogleAppointment(x.db, scope, "new", { title: "Imported", status: "confermato" }, {});
    expect(result.created).toBe(false);
    expect(x.state.rows.appointments).toHaveLength(1);
    expect(x.state.rows.appointments[0]).toMatchObject({ title: "Edited by user", status: "presentato" });
    expect(x.state.rows.google_calendar_event_map).toHaveLength(1);
  });
  it("a failed appointment import never creates a mapping", async () => {
    const x = database(); x.state.fail = "appointments:upsert";
    await expect(importGoogleAppointment(x.db, scope, "new", {}, {})).rejects.toThrow("Importazione");
    expect(x.state.operations.some(op => op.table === "google_calendar_event_map")).toBe(false);
  });
  it("accepts only an identical mapping saved concurrently, never a conflicting mapping", async () => {
    const x = database();
    await expect(saveGoogleAppointmentMapping(x.db, mapping)).resolves.toBeUndefined();
    await expect(saveGoogleAppointmentMapping(x.db, { ...mapping, google_event_id: "other" })).rejects.toThrow("non salvato");
    await expect(saveGoogleAppointmentMapping(x.db, { ...mapping, user_id: "other-reader" })).resolves.toBeUndefined();
  });
  it("un collegamento identico già salvato da un collega non si reinserisce: niente conflitto, niente errore nel database", async () => {
    // Calendario condiviso: più colleghi leggono lo stesso evento, l'id dell'appuntamento
    // è lo stesso. Prima si inseriva e si aspettava il conflitto: stesso esito, ma un
    // ERRORE nel database a ogni giro (228 al giorno).
    const x = database();
    await expect(saveGoogleAppointmentMapping(x.db, { ...mapping, user_id: "other-reader" })).resolves.toBeUndefined();
    const sulCollegamento = x.state.operations.filter(op => op.table === "google_calendar_event_map");
    expect(sulCollegamento.map(op => op.kind)).toEqual(["select"]);
    expect(x.state.rows.google_calendar_event_map).toHaveLength(1);
  });
  it("un collegamento nuovo si controlla e poi si inserisce", async () => {
    const x = database();
    await expect(saveGoogleAppointmentMapping(x.db, { ...mapping, appointment_id: "apt-nuovo", google_event_id: "event-nuovo" })).resolves.toBeUndefined();
    const sulCollegamento = x.state.operations.filter(op => op.table === "google_calendar_event_map");
    expect(sulCollegamento.map(op => op.kind)).toEqual(["select", "insert"]);
    expect(x.state.rows.google_calendar_event_map).toHaveLength(2);
  });
});

describe("Google deletion must succeed before local cleanup", () => {
  it("accepts a successful empty DELETE response", async () => {
    await expect(deleteGoogleAppointmentEvent("calendar", "event", "test", vi.fn().mockResolvedValue(new Response(null, { status: 204 })))).resolves.toBeUndefined();
  });
  it.each([401, 403, 404, 429, 500, 502])("never treats HTTP %s as confirmed deletion", async status => {
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(response({}, status)));
    await expect(deleteGoogleAppointmentEvent("calendar", "event", "test", fetcher)).rejects.toThrow("conservato");
  });
  it("a gone response requires an explicit tombstone, not an expired sync token", async () => {
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(response({ error: { errors: [{ reason: "fullSyncRequired" }] } }, 410)));
    await expect(deleteGoogleAppointmentEvent("calendar", "event", "test", fetcher)).rejects.toThrow();
    const gone = vi.fn().mockImplementation(() => Promise.resolve(response({ error: { errors: [{ reason: "deleted" }] } }, 410)));
    await expect(deleteGoogleAppointmentEvent("calendar", "event", "test", gone)).resolves.toBeUndefined();
  });
  it("a 404 may be accepted only after a matching explicit cancelled event is read", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(response({}, 404)).mockResolvedValueOnce(response({ id: "event", status: "cancelled" }));
    await expect(deleteGoogleAppointmentEvent("calendar", "event", "test", fetcher)).resolves.toBeUndefined();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("timeouts remain errors, never successful cleanup", async () => {
    await expect(deleteGoogleAppointmentEvent("calendar", "event", "test", vi.fn().mockRejectedValue(new Error("Timeout")))).rejects.toThrow("Timeout");
  });
});

describe("Mapping paging and checked CRM acknowledgements", () => {
  it("reads mappings beyond PostgREST's default page, in a stable order and scope", async () => {
    const calls: unknown[][] = []; let page = 0;
    const db = { from: () => ({ select() { return this; }, eq(key: string, value: unknown) { calls.push([key, value]); return this; },
      order(key: string) { calls.push(["order", key]); return this; }, range(start: number, end: number) { calls.push([start, end]); return Promise.resolve({ data: page++ === 0 ? Array.from({ length: 500 }, (_, n) => ({ id: String(n) })) : [{ id: "last" }], error: null }); } }) };
    expect(await loadGoogleAppointmentMappings(db, scope)).toHaveLength(501);
    expect(calls).toContainEqual([500, 999]); expect(calls).toContainEqual(["order", "id"]);
    for (const [key, value] of [["company_id", scope.companyId], ["user_id", scope.userId], ["google_calendar_id", scope.calendarId]]) expect(calls).toContainEqual([key, value]);
  });
  it("a failed mapping page is not a complete successful snapshot", async () => {
    let page = 0;
    const db = { from: () => ({ select() { return this; }, eq() { return this; }, order() { return this; },
      range() { return Promise.resolve(page++ === 0 ? { data: Array(500).fill(mapping), error: null } : { data: null, error: { message: "Timeout" } }); } }) };
    await expect(loadGoogleAppointmentMappings(db, scope)).rejects.toThrow("incompleta");
  });
  it("never acknowledges a Google change when the CRM update failed", async () => {
    const x = database(); x.state.fail = "appointments:update";
    await expect(applyGoogleAppointmentChange(x.db, scope, mapping, { title: "Google edit" }, "new")).rejects.toThrow("non salvata");
    expect(x.state.rows.google_calendar_event_map[0].etag).toBe("old");
    expect(x.state.operations.filter(op => op.kind === "update").map(op => op.table)).toEqual(["appointments"]);
  });
  it("preserves a concurrent CRM edit and leaves the old etag for retry", async () => {
    const x = database(); x.state.beforeWrite = () => { x.state.rows.appointments[0].updated_at = "newer"; x.state.rows.appointments[0].title = "User edit"; };
    await expect(applyGoogleAppointmentChange(x.db, scope, mapping, { title: "Google edit" }, "new")).rejects.toThrow("nel frattempo");
    expect(x.state.rows.appointments[0].title).toBe("User edit"); expect(x.state.rows.google_calendar_event_map[0].etag).toBe("old");
  });
  it("scopes both writes and acknowledges only after the appointment is saved", async () => {
    const x = database(); await applyGoogleAppointmentChange(x.db, scope, mapping, { title: "Google edit" }, "new");
    const writes = x.state.operations.filter(op => op.kind === "update");
    expect(writes.map(op => op.table)).toEqual(["appointments", "google_calendar_event_map"]);
    for (const write of writes) expect(write.filters).toContainEqual(["company_id", scope.companyId]);
    expect(writes[0].filters).toContainEqual(["updated_at", "before"]);
    expect(writes[1].filters).toContainEqual(["etag", "old"]);
    expect(x.state.rows.google_calendar_event_map[0].etag).toBe("new");
  });
  it("a failed acknowledgement is surfaced and leaves the change retryable", async () => {
    const x = database(); x.state.fail = "google_calendar_event_map:update";
    await expect(applyGoogleAppointmentChange(x.db, scope, mapping, { title: "Google edit" }, "new")).rejects.toThrow("da riprovare");
    expect(x.state.rows.appointments[0].title).toBe("Google edit"); expect(x.state.rows.google_calendar_event_map[0].etag).toBe("old");
  });
});

// Exercise the actual entrypoint functions, without Google requests or real DB writes.
const source = readFileSync(process.env.GCAL_TEST_ENTRYPOINT ?? "supabase/functions/google-calendar-sync/index.ts", "utf8");
function entryFunction(name: string, endMarker: string, dependencies: Record<string, unknown>) {
  const code = source.slice(source.indexOf(`async function ${name}(`), source.indexOf(endMarker, source.indexOf(`async function ${name}(`)));
  const compiled = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  return new Function(...Object.keys(dependencies), `${compiled};return ${name}`)(...Object.values(dependencies));
}
describe("Production calendar wiring", () => {
  it("does not acknowledge unapplied Google edits when a previous POST is recovered", async () => {
    const x = database(); x.state.rows.google_calendar_event_map = [];
    const save = vi.fn();
    const push = entryFunction("pushEvent", "// ---- UPDATE EVENT", {
      getSupabaseAdmin: () => x.db, risolviBersaglio: async () => ({ ok: true, bersaglio: { conn: { id: "connection" }, userId: "user", calendarId: "calendar" } }),
      preferenzeSync: async () => ({ attiva: true, direzione: "both" }), getValidAccessToken: async () => "test",
      shouldUseGoogleMeet: () => false, schedaPerEvento: async () => "", buildGoogleEvent: () => ({}), buildGoogleEventUrl: () => url,
      insertGoogleAppointmentEvent: async () => Response.json({ id: "event", etag: "unapplied-Google-version" }, { headers: { "x-eic-recovered": "true" } }),
      persistMeetDetails: async (): Promise<null> => null, saveGoogleAppointmentMapping: save, json: Response.json,
    });
    expect((await push("user", "company", "apt")).ok).toBe(true);
    expect(save.mock.calls[0][1].etag).toBeNull();
  });
  it("all-day bookings have an exclusive end on the next day, also across year end", () => {
    const body = source.slice(source.indexOf("function buildGoogleEvent("), source.indexOf("function addHour("));
    const compiled = ts.transpileModule(body, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
    const build = new Function("shouldUseGoogleMeet", `${compiled};return buildGoogleEvent`)(() => false);
    expect(build({ id: "apt", appointment_date: "2026-12-31" })).toMatchObject({ start: { date: "2026-12-31" }, end: { date: "2027-01-01" } });
    expect(() => build({ id: "apt", appointment_date: "2026-02-30" })).toThrow("non valida");
  });
  it("a failed Google DELETE cannot remove a mapping or local availability", async () => {
    const x = database();
    const remove = entryFunction("deleteEvent", "// Il ritorno da Google", {
      getSupabaseAdmin: () => x.db, getConnection: async () => ({ id: "connection" }), getValidAccessToken: async () => "test",
      deleteGoogleAppointmentEvent: async () => { throw new Error("Google unavailable"); }, json: Response.json,
    });
    await expect(remove("user", "company", "apt")).rejects.toThrow("Google unavailable");
    expect(x.state.operations.some(op => op.kind !== "select")).toBe(false);
  });
  it("a failed calendar reconciliation is surfaced rather than reported as success", async () => {
    const reconcile = entryFunction("reconcilePrimary", "/**\n * Ritorno da Google", {
      getSupabaseAdmin: () => ({}), getPlatformSetting: async () => "true", getSettings: async () => ({ primary_calendar_id: "calendar" }),
      preferenzeSync: async () => ({ attiva: true, direzione: "both" }), getConnection: async () => ({}), getValidAccessToken: async () => "test",
      calendariAgganciati: async (): Promise<unknown[]> => [], reconcileCalendario: async () => { throw new Error("Write failed"); },
    });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try { await expect(reconcile("user", "company")).rejects.toThrow("incompleta"); } finally { log.mockRestore(); }
  });
  it("never picks an arbitrary event to delete when the official mapping is missing", async () => {
    const x = database(); x.state.rows.google_calendar_event_map = [];
    const deleteEvent = vi.fn();
    const cleanup = entryFunction("cleanupCrmDuplicates", "// ---- FULL SYNC", {
      getSupabaseAdmin: () => x.db, getConnection: async () => ({}), getValidAccessToken: async () => "test",
      getSettings: async () => ({ primary_calendar_id: "calendar" }), listGoogleAppointmentEvents: async () => [
        { id: "one", description: "crm_appointment_id=11111111-1111-4111-8111-111111111111" },
        { id: "two", description: "crm_appointment_id=11111111-1111-4111-8111-111111111111" },
      ], deleteGoogleAppointmentEvent: deleteEvent, preferenzeSync: async () => ({ attiva: true, direzione: "both" }),
    });
    expect(await cleanup("user", "company")).toEqual({ cleaned: 0 }); expect(deleteEvent).not.toHaveBeenCalled();
  });
  it.each(["official-outside-window", "different-dates", "other-company", "same-event"])("duplicate cleanup protects %s", async kind => {
    const x = database(), aptId = "11111111-1111-4111-8111-111111111111";
    x.state.rows.google_calendar_event_map[0].appointment_id = aptId;
    x.state.rows.appointments[0].id = aptId;
    if (kind === "other-company") x.state.rows.appointments[0].company_id = "other";
    const original = { id: "event", description: `crm_appointment_id=${aptId}`, start: { date: "2026-10-14" }, end: { date: "2026-10-15" } };
    const copy = { ...original, id: "copy", start: { date: kind === "different-dates" ? "2026-10-20" : "2026-10-14" } };
    const deletion = vi.fn().mockResolvedValue(undefined);
    const cleanup = entryFunction("cleanupCrmDuplicates", "// ---- FULL SYNC", {
      getSupabaseAdmin: () => x.db, getConnection: async () => ({}), getValidAccessToken: async () => "test",
      getSettings: async () => ({ primary_calendar_id: scope.calendarId }), listGoogleAppointmentEvents: async () =>
        kind === "official-outside-window" ? [copy, { ...copy, id: "another-copy" }] : [original, copy], deleteGoogleAppointmentEvent: deletion,
      preferenzeSync: async () => ({ attiva: true, direzione: "both" }),
    });
    expect(await cleanup("user", "company")).toEqual({ cleaned: kind === "same-event" ? 1 : 0 });
    expect(deletion).toHaveBeenCalledTimes(kind === "same-event" ? 1 : 0);
    if (kind === "same-event") expect(deletion).toHaveBeenCalledWith(scope.calendarId, "copy", "test");
  });
  it("does not re-link a CRM marker copied from another company", async () => {
    const x = database(); x.state.rows.google_calendar_event_map = [];
    x.state.rows.appointments[0].company_id = "other";
    const save = vi.fn();
    const reconcile = entryFunction("reconcileCalendario", "// ---- RECONCILE PRIMARY", {
      listGoogleAppointmentEvents: async () => [{ id: "event", description: "copied" }],
      loadGoogleAppointmentMappings: async (): Promise<unknown[]> => [], isCrmOriginated: () => true,
      extractCrmAppointmentId: () => "apt", saveGoogleAppointmentMapping: save,
      reconcileMissingGoogleAppointments: async () => 0,
    });
    expect(await reconcile(x.db, "test", {}, "user", "company", scope.calendarId, null, true)).toEqual({ created: 0, updated: 0, removed: 0 });
    expect(save).not.toHaveBeenCalled();
  });
  it.each([{ attiva: false, direzione: "both" }, { attiva: true, direzione: "from_google" }])("does not delete Google duplicates when synchronization is paused/read-only %j", async pref => {
    const list = vi.fn(), deletion = vi.fn();
    const cleanup = entryFunction("cleanupCrmDuplicates", "// ---- FULL SYNC", {
      getSupabaseAdmin: () => ({}), getConnection: async () => ({}), preferenzeSync: async () => pref,
      listGoogleAppointmentEvents: list, deleteGoogleAppointmentEvent: deletion,
    });
    expect(await cleanup("user", "company")).toEqual({ cleaned: 0 });
    expect(list).not.toHaveBeenCalled(); expect(deletion).not.toHaveBeenCalled();
  });
});
