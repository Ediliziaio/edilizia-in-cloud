import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  company: "company" as string | null, user: "me" as string | null, admin: false, team: false, teamCalendar: false, people: false, loading: false,
  options: [] as { queryKey: unknown[]; enabled: boolean; queryFn: () => Promise<{ id: string }[]> }[],
  calls: [] as { table: string; method: string; args: unknown[] }[], count: 1101,
  assignments: [] as { id: string; order_id: string }[], ownOrders: null as { id: string }[] | null, fieldOrders: [] as { id: string }[], assignmentError: false, profileLeaves: null as { id: string }[] | null, userLeaves: [] as { id: string; user_id: string }[],
}));
vi.mock("@tanstack/react-query", async () => ({ ...await vi.importActual<typeof import("@tanstack/react-query")>("@tanstack/react-query"), useQuery: (options: typeof state.options[number]) => { state.options.push(options); return options; } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: state.company ? { id: state.company } : null, user: state.user ? { id: state.user } : null }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ isAdmin: state.admin, canViewTeamTasks: state.team, canViewAllTeamCalendar: state.teamCalendar, canViewPersone: state.people, canViewOrders: true, canViewScadenzario: true, canViewMarketingAppointments: true, isLoading: state.loading }) }));
vi.mock("@/lib/orders/archivedOrderScope", () => ({ loadArchivedOrderIds: async () => [] as string[], excludeArchivedOrders: (query: unknown) => query }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (table: string) => {
  let range = [0, 249]; let isField = false; let userLeave = false;
  const b: Record<string, unknown> = {};
  for (const method of ["select", "eq", "gte", "lte", "is", "not", "or", "order", "range", "in"]) b[method] = (...args: unknown[]) => {
    state.calls.push({ table, method, args }); if (method === "range") range = args as number[]; if (method === "in") isField = true; if (method === "eq" && table === "hr_richieste" && args[0] === "user_id") userLeave = true; return b;
  };
  b.then = (ok: (value: unknown) => unknown) => {
    const rows = table === "hr_richieste" && state.profileLeaves ? userLeave ? state.userLeaves : state.profileLeaves : table === "order_campo_assignments" ? state.assignments : table === "orders" && state.ownOrders ? isField ? state.fieldOrders : state.ownOrders : Array.from({ length: state.count }, (_, i) => ({ id: `${table}-${i}` }));
    return Promise.resolve({ data: rows.slice(range[0], range[1] + 1), error: table === "order_campo_assignments" && state.assignmentError ? { message: "Accessi non disponibili" } : null }).then(ok);
  };
  return b;
} } }));
import { QueryClient } from "@tanstack/react-query";
import { useDashboardTasks } from "@/hooks/useDashboardTasks";
import { useDashboardAgenda } from "@/hooks/useDashboardAgenda";

beforeEach(() => {
  state.company = "company"; state.user = "me"; state.admin = false; state.team = false; state.teamCalendar = false; state.people = false; state.loading = false;
  state.options = []; state.calls = []; state.count = 1101; state.assignments = []; state.ownOrders = null; state.fieldOrders = []; state.assignmentError = false; state.profileLeaves = null; state.userLeaves = [];
});
const called = (table: string, method: string, args: unknown[]) => expect(state.calls).toContainEqual({ table, method, args });
const layers = () => new Set<"task" | "order" | "appointment" | "leave">(["task", "order", "appointment", "leave"]);
describe("Dashboard: agenda personale e team autorizzato", () => {
  it("legge tutte le attività personali, con identificativo commessa e ordine stabile", async () => {
    useDashboardTasks(); const rows = await state.options[0].queryFn(); expect(rows).toHaveLength(1101);
    called("tasks", "eq", ["company_id", "company"]); called("tasks", "eq", ["assigned_to", "me"]);
    called("tasks", "order", ["id"]); called("tasks", "range", [1000, 1249]);
    expect(state.calls.find(c => c.method === "select")?.args[0]).toContain("order_id, stock_item_id");
  });
  it.each(["admin", "team", "teamCalendar", "people"] as const)("il permesso %s non allarga le attività personali", async permission => {
    state[permission] = true; useDashboardTasks(); await state.options[0].queryFn(); called("tasks", "eq", ["assigned_to", "me"]);
  });
  it("personale e team hanno cache separate e la Regia le invalida entrambe", async () => {
    state.team = true; useDashboardTasks(); useDashboardTasks("team");
    const [personal, team] = state.options.map(o => o.queryKey); expect(personal).not.toEqual(team);
    const client = new QueryClient(); client.setQueryData(personal, []); client.setQueryData(team, []);
    await client.invalidateQueries({ queryKey: ["tasks"] });
    expect(client.getQueryState(personal)?.isInvalidated).toBe(true); expect(client.getQueryState(team)?.isInvalidated).toBe(true); client.clear();
  });
  it("le fonti personali seguono le invalidazioni e si aggiornano tornando alla Dashboard", () => {
    useDashboardAgenda("2026-10-14", "2026-10-14", layers());
    expect(state.options.map(o => o.queryKey[0])).toEqual(["calendar-orders", "appointments", "hr-richieste", "hr-festivita"]);
    expect(state.options.every(o => (o as unknown as { refetchOnMount: string }).refetchOnMount === "always")).toBe(true);
    expect(state.options[0].queryKey).toContain("me");
  });
  it("senza permesso team anche un refetch manuale è rifiutato", async () => {
    state.teamCalendar = true; state.people = true; useDashboardTasks("team");
    expect(state.options[0].enabled).toBe(false);
    await expect(state.options[0].queryFn()).rejects.toThrow("Non hai accesso"); expect(state.calls).toEqual([]);
  });
  it.each(["admin", "team"] as const)("%s può leggere le priorità team, sempre nella propria azienda", async permission => {
    state[permission] = true; useDashboardTasks("team"); expect(state.options[0].enabled).toBe(true);
    await state.options[0].queryFn(); called("tasks", "eq", ["company_id", "company"]);
    expect(state.calls.some(c => c.method === "eq" && c.args[0] === "assigned_to")).toBe(false);
  });
  it.each(["company", "user", "loading"] as const)("non carica attività con %s mancante/non pronto", async condition => {
    if (condition === "loading") state.loading = true; else state[condition] = null;
    useDashboardTasks(); expect(state.options[0].enabled).toBe(false); await expect(state.options[0].queryFn()).rejects.toThrow();
  });
  it("le quattro fonti sono paginate nella stessa azienda e non interrogano lo scadenzario", async () => {
    useDashboardAgenda("2026-10-26", "2026-11-01", layers());
    for (const option of state.options) expect(await option.queryFn()).toHaveLength(1101);
    for (const table of ["orders", "appointments", "hr_richieste", "hr_festivita"]) {
      called(table, "eq", ["company_id", "company"]); called(table, "range", [1000, 1249]);
    }
    called("appointments", "eq", ["assigned_to", "me"]); called("hr_richieste", "eq", ["profilo.user_id", "me"]);
    called("appointments", "lte", ["appointment_date", "2026-11-01"]);
    expect(state.calls.some(c => c.table === "scadenze")).toBe(false);
  });
  it("commesse personali uniscono responsabile e accessi squadre/fasi senza duplicati", async () => {
    state.assignments = [{ id: "a", order_id: "shared" }, { id: "b", order_id: "field" }];
    state.ownOrders = [{ id: "own" }, { id: "shared" }]; state.fieldOrders = [{ id: "shared" }, { id: "field" }];
    useDashboardAgenda("2026-10-14", "2026-10-14", layers());
    expect((await state.options[0].queryFn()).map(o => o.id)).toEqual(["field", "own", "shared"]);
    called("order_campo_assignments", "eq", ["user_id", "me"]); called("order_campo_assignments", "eq", ["company_id", "company"]);
    called("orders", "or", ["assigned_to.eq.me,capomastro_user_id.eq.me"]); called("orders", "in", ["id", ["shared", "field"]]);
  });
  it("un errore sugli accessi non mostra tutte le commesse come ripiego", async () => {
    state.assignmentError = true; useDashboardAgenda("2026-10-14", "2026-10-14", layers());
    await expect(state.options[0].queryFn()).rejects.toThrow("Accessi non disponibili");
    expect(state.calls.some(c => c.table === "orders")).toBe(false);
  });
  it.each(["admin", "teamCalendar", "people"] as const)("%s vede solo i propri appuntamenti e le proprie assenze nell'agenda", async permission => {
    state[permission] = true; useDashboardAgenda("2026-10-14", "2026-10-14", layers());
    await state.options[1].queryFn(); await state.options[2].queryFn();
    called("appointments", "eq", ["assigned_to", "me"]); called("hr_richieste", "eq", ["profilo.user_id", "me"]);
  });
  it("le assenze personali includono richieste Campo senza profilo HR e non duplicano le righe", async () => {
    state.profileLeaves = [{ id: "shared" }, { id: "hr" }]; state.userLeaves = [{ id: "shared", user_id: "me" }, { id: "campo", user_id: "me" }];
    useDashboardAgenda("2026-10-14", "2026-10-14", layers());
    const rows = await state.options[2].queryFn(); expect(rows.map(r => r.id)).toEqual(["campo", "hr", "shared"]);
    expect(rows[0]).toMatchObject({ user_id: "me", profilo: null });
    called("hr_richieste", "eq", ["user_id", "me"]);
  });
  it("un altro utente non riusa la cache dell’agenda personale precedente", () => {
    useDashboardAgenda("2026-10-14", "2026-10-14", layers()); const previous = state.options.map(o => o.queryKey);
    state.options = []; state.user = "other"; useDashboardAgenda("2026-10-14", "2026-10-14", layers());
    state.options.slice(0, 3).forEach((o, i) => expect(o.queryKey).not.toEqual(previous[i]));
  });
  it("le fonti spente e le query senza utente rimangono disabilitate", () => {
    useDashboardAgenda("2026-10-14", "2026-10-14", new Set()); expect(state.options.slice(0, 3).every(o => !o.enabled)).toBe(true);
    state.options = []; state.user = null; useDashboardAgenda("2026-10-14", "2026-10-14", layers()); expect(state.options.every(o => !o.enabled)).toBe(true);
  });
});
