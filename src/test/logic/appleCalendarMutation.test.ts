/// <reference types="node" />
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

type ReadResult = { data: unknown; error: Error | null };
function fixture(name: "pushEvent" | "updateEvent" | "deleteEvent", options: { status?: number; networkError?: boolean; mappingCompany?: string; readError?: boolean; missingMap?: boolean; insertError?: boolean; deleteError?: boolean } = {}) {
  const source = ts.createSourceFile("index.ts", readFileSync("supabase/functions/apple-calendar-sync/index.ts", "utf8"), ts.ScriptTarget.Latest, true);
  let declaration: ts.FunctionDeclaration | undefined;
  const visit = (node: ts.Node): void => { if (ts.isFunctionDeclaration(node) && node.name?.text === name) declaration = node; ts.forEachChild(node, visit); }; visit(source);
  if (!declaration) throw new Error("Funzione Apple non trovata");
  const mapping = { id: "map-a", appointment_id: "apt-a", company_id: options.mappingCompany ?? "company-a", user_id: "owner-b", caldav_event_url: "https://p42-caldav.icloud.com/calendar/event.ics" };
  let deleted = false;
  const writes: string[] = [];
  const db = { from: (table: string) => {
    const filters: Record<string, unknown> = {}; let action = "select";
    const q: Record<string, unknown> = {};
    const result = (): ReadResult => {
      if (table === "appointments") return { data: { id: "apt-a", company_id: "company-a" }, error: null };
      const found = !options.missingMap && Object.entries(filters).every(([key, value]) => mapping[key as keyof typeof mapping] === value);
      if (action === "select") return { data: found ? mapping : null, error: options.readError ? new Error("read failed") : null };
      if (action === "insert") return { data: null, error: options.insertError ? new Error("insert failed") : null };
      if (action === "delete" && found) {
        if (options.deleteError) return { data: null, error: new Error("delete failed") };
        writes.push("delete"); deleted = true;
      }
      return { data: found ? { id: mapping.id } : null, error: null };
    };
    q.select = () => q; q.eq = (key: string, value: unknown) => { filters[key] = value; return q; };
    for (const operation of ["update", "delete", "insert"]) q[operation] = () => { action = operation; return q; };
    q.maybeSingle = async (): Promise<ReadResult> => result(); q.single = async (): Promise<ReadResult> => result();
    q.then = (resolve: (value: ReadResult) => unknown) => Promise.resolve(result()).then(resolve);
    return q;
  } };
  const network = vi.fn(async () => {
    if (options.networkError) throw new Error("network failed");
    return new Response(null, { status: options.status ?? 204 });
  });
  const push = vi.fn(async () => Response.json({ success: true }));
  const creds = { appleId: "synthetic@icloud.test", appPassword: "synthetic-password", conn: { user_id: "owner-b" } };
  const context = vm.createContext({
    console, getSupabaseAdmin: () => db, getConnectionWithCredentials: async () => creds,
    risolviBersaglio: async () => ({ ok: true, creds, userId: "owner-b", calendarUrl: "https://p42-caldav.icloud.com/calendar/" }),
    buildICalendar: () => "synthetic ICS", caldavRequest: network, pushEvent: push,
    json: (body: unknown, status = 200) => Response.json(body, { status }),
  });
  vm.runInContext(ts.transpileModule(`${declaration.getText(source)}\nglobalThis.handler = ${name};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return { network, push, writes, deleted: () => deleted, run: () => context.handler("user-a", "company-a", "apt-a") as Promise<Response> };
}
describe("Apple: errori e isolamento aziendale nelle funzioni reali", () => {
  it.each([{ status: 503 }, { networkError: true }, { readError: true }])("conserva la mappa dopo una cancellazione non confermata: %j", async options => {
    const f = fixture("deleteEvent", options); await expect(f.run()).rejects.toThrow();
    expect(f.deleted()).toBe(false); expect(f.writes).toEqual([]);
  });
  it("non usa una mappa di un'altra azienda nemmeno in una chiamata di servizio", async () => {
    const f = fixture("deleteEvent", { mappingCompany: "company-b" }); expect((await f.run()).status).toBe(200);
    expect(f.network).not.toHaveBeenCalled(); expect(f.deleted()).toBe(false);
  });
  it("rimuove la mappa dopo la cancellazione confermata", async () => {
    const f = fixture("deleteEvent"); expect((await f.run()).status).toBe(200); expect(f.deleted()).toBe(true);
  });
  it("non dichiara successo se la pulizia locale fallisce", async () => {
    const f = fixture("deleteEvent", { deleteError: true }); await expect(f.run()).rejects.toThrow("collegamento locale");
  });
  it("un aggiornamento senza mappa passa alla creazione idempotente", async () => {
    const f = fixture("updateEvent", { missingMap: true }); expect((await f.run()).status).toBe(200);
    expect(f.push).toHaveBeenCalledWith("user-a", "company-a", "apt-a");
  });
  it("non annuncia successo se l'inserimento della mappa fallisce", async () => {
    const f = fixture("pushEvent", { missingMap: true, insertError: true }); await expect(f.run()).rejects.toThrow("collegamento locale");
    expect(f.network).toHaveBeenCalledTimes(1);
  });
});
