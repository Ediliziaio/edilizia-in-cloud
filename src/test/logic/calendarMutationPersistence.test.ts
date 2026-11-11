/// <reference types="node" />
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { rollbackAppointmentTiming } from "@/lib/marketing/appointmentEdit";
import { addMinutesToTimeStr, timeToMin } from "@/lib/marketingCalendarConstants";

type Row = { id: string; company_id: string; appointment_date: string; appointment_time: string; appointment_end_time: string; description: string };
function scenario(name: string, succeeds = false) {
  const filename = name === "handleStatusChange" ? "src/components/marketing/MarketingAppointmentsList.tsx" : "src/pages/azienda/marketing/MarketingCalendar.tsx";
  const source = ts.createSourceFile(filename, readFileSync(filename, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let initializer: ts.Expression | undefined;
  const visit = (node: ts.Node): void => { if (ts.isVariableDeclaration(node) && node.name.getText(source) === name) initializer = node.initializer; ts.forEachChild(node, visit); }; visit(source);
  if (!initializer) throw new Error(`Gestore mancante: ${name}`);
  const initial: Row[] = [{ id: "apt-a", company_id: "company-a", appointment_date: "2026-11-12", appointment_time: "09:00:00", appointment_end_time: "09:30:00", description: "Nota originale" }, { id: "apt-b", company_id: "company-a", appointment_date: "2026-11-12", appointment_time: "11:00:00", appointment_end_time: "11:30:00", description: "Altra nota" }];
  let cache = structuredClone(initial), stored = structuredClone(initial[0]), beforeReply = (): void => {};
  const sync = vi.fn(), refetch = vi.fn(), refresh = vi.fn();
  const toast = Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn(), info: vi.fn() });
  const db = { from: () => {
    const filters: Record<string, string> = {}; let payload: Partial<Row> = {};
    const query = { update: (value: Partial<Row>) => { payload = value; return query; }, eq: (key: string, value: string) => { filters[key] = value; return query; }, select: () => query,
      single: async (): Promise<{ data: { id: string } | null; error: null }> => {
        beforeReply(); beforeReply = (): void => {};
        const matches = Object.entries(filters).every(([key, value]) => String(stored[key as keyof Row]).slice(0, key.includes("time") ? 5 : undefined) === (key.includes("time") ? value.slice(0, 5) : value));
        if (!succeeds || !matches) return { data: null, error: null };
        stored = { ...stored, ...payload }; return { data: { id: stored.id }, error: null };
      } }; return query;
  } };
  const context = vm.createContext({
    console, appointments: initial, companyId: "company-a", permissions: { onlyAssigned: false }, user: { id: "u1" }, showOperativi: false, dateRange: { start: "2026-11-01", end: "2026-11-30" },
    queryClient: { getQueryData: () => cache, setQueryData: (_key: unknown, update: unknown): void => { cache = typeof update === "function" ? update(cache) : update as Row[]; }, invalidateQueries: (): void => {} },
    supabase: db, toast, rollbackAppointmentTiming, addMinutesToTimeStr, timeToMin, refetchAppointments: refetch, onRefresh: refresh,
    syncExternalCalendarsForAppointment: sync, syncExternalCalendarsForStatus: sync, useCallback: (fn: unknown) => fn,
  });
  vm.runInContext(ts.transpileModule(`globalThis.handler = ${initializer.getText(source)}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return { run: (...args: unknown[]) => context.handler(...args) as Promise<void>, cache: () => cache, setCache: (rows: Row[]): void => { cache = rows; }, stored: () => stored, setStored: (patch: Partial<Row>): void => { stored = { ...stored, ...patch }; }, before: (fn: () => void): void => { beforeReply = fn; }, sync, refetch, refresh, toast };
}
describe("calendario: zero righe aggiornate e concorrenza", () => {
  it.each(["handleDropAppointment", "handleResizeAppointment"])("%s ripristina solo l'appuntamento coinvolto e conserva gli altri aggiornamenti", async name => {
    const f = scenario(name);
    f.before(() => { f.setCache(f.cache().map(row => row.id === "apt-b" ? { ...row, description: "Nota arrivata da un collega" } : row)); });
    await f.run("apt-a", name === "handleDropAppointment" ? "2026-11-13" : "10:30", ...(name === "handleDropAppointment" ? ["10:00"] : []));
    expect(f.cache()[0].appointment_time).toBe("09:00:00"); expect(f.cache()[0].appointment_end_time).toBe("09:30:00");
    expect(f.cache()[1].description).toBe("Nota arrivata da un collega");
    expect(f.sync).not.toHaveBeenCalled(); expect(f.refetch).toHaveBeenCalled(); expect(f.toast.success).not.toHaveBeenCalled();
  });
  it("un cambio stato respinto non elimina Google e non annuncia successo", async () => {
    const f = scenario("handleStatusChange"); await f.run("apt-a", "annullato");
    expect(f.sync).not.toHaveBeenCalled(); expect(f.refresh).not.toHaveBeenCalled();
    expect(f.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Stato non aggiornato" }));
  });
  it("Annulla spostamento non sovrascrive un nuovo spostamento del collega", async () => {
    const f = scenario("handleDropAppointment", true); await f.run("apt-a", "2026-11-13", "10:00");
    f.setStored({ appointment_date: "2026-11-15" });
    await f.toast.success.mock.calls[0][1].action.onClick();
    expect(f.stored().appointment_date).toBe("2026-11-15"); expect(f.toast.error).toHaveBeenCalledWith("Errore nell'annullamento");
    expect(f.sync).toHaveBeenCalledTimes(1);
  });
});
