import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  queries: [] as { queryKey: unknown[]; enabled: boolean; queryFn: () => Promise<unknown> }[],
  rows: {} as Record<string, Record<string, unknown>[]>,
  requests: [] as { table: string; from: number; filtri: [string, unknown][]; ordine: string[] }[],
  failPage: false,
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: (q: (typeof state.queries)[number]) => { state.queries.push(q); return {}; },
  useMutation: () => ({}), useQueryClient: () => ({}),
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "azienda" } }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (table: string) => {
  const filtri: [string, unknown][] = [], ordine: string[] = [];
  const q = { select: () => q, eq: (key: string, val: unknown) => { filtri.push([key, val]); return q; },
    order: (key: string) => { ordine.push(key); return q; },
    range: async (from: number, to: number) => {
      state.requests.push({ table, from, filtri, ordine });
      if (state.failPage && from >= 250) return { data: null as null, error: { message: "Lettura interrotta" } };
      return { data: (state.rows[table] ?? []).filter(r => filtri.every(([k, v]) => r[k] === v)).slice(from, to + 1), error: null as null };
    },
  }; return q;
} } }));
import { useOrderStatusUsage } from "@/hooks/useOrderStatusUsage";
import { useSquadre, useConnessioniGoogleAzienda, useCalendarLinks, useSubappaltatoriAzienda } from "@/hooks/useCalendariLavori";
beforeEach(() => { state.queries = []; state.rows = {}; state.requests = []; state.failPage = false; });
describe("Letture complete degli stati e dei calendari", () => {
  it("il conteggio degli stati comprende le commesse oltre la prima pagina ed esclude altre aziende", async () => {
    state.rows.orders = Array.from({ length: 1101 }, (_, i) => ({ id: `o${i}`, company_id: "azienda", current_status_id: "stato" }));
    state.rows.orders.push({ id: "altro", company_id: "altra", current_status_id: "stato" });
    useOrderStatusUsage("azienda", true);
    expect(await state.queries[0].queryFn()).toEqual({ stato: 1101 });
    expect(state.requests.map(r => r.from)).toEqual([0, 250, 500, 750, 1000]);
    for (const r of state.requests) expect(r.filtri).toContainEqual(["company_id", "azienda"]);
  });
  it("non avvia la lettura del conteggio senza permesso di consultare le commesse", () => {
    useOrderStatusUsage("azienda", false);
    expect(state.queries[0].enabled).toBe(false);
  });
  it("nessuna azienda selezionata non significa leggere tutte le aziende", () => {
    useOrderStatusUsage(undefined, true);
    expect(state.queries[0].enabled).toBe(false);
  });
  it.each([
    ["external_teams", useSquadre],
    ["google_calendar_connections", useConnessioniGoogleAzienda],
    ["company_calendar_links", useCalendarLinks],
    ["subappaltatori", useSubappaltatoriAzienda],
  ] as const)("%s viene letto completamente e separato per azienda", async (table, hook) => {
    state.rows[table] = Array.from({ length: 1101 }, (_, i) => ({ id: `r${i}`, company_id: "azienda", is_active: true }));
    state.rows[table].push({ id: "altro", company_id: "altra", is_active: true });
    hook(); expect(await state.queries[0].queryFn()).toHaveLength(1101);
    for (const r of state.requests) {
      expect(r.filtri).toContainEqual(["company_id", "azienda"]);
      expect(r.ordine.at(-1)).toBe("id");
    }
  });
  it("un errore a metà non produce un numero di commesse parziale", async () => {
    state.rows.orders = Array.from({ length: 300 }, (_, i) => ({ id: `o${i}`, company_id: "azienda", current_status_id: "stato" }));
    state.failPage = true; useOrderStatusUsage("azienda", true);
    await expect(state.queries[0].queryFn()).rejects.toThrow("Lettura interrotta");
  });
});
