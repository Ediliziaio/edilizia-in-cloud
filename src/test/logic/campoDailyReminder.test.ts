import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { useCampoRapportiniDaCompilare } from "@/hooks/useCampoRapportiniDaCompilare";
import type { CampoPunch } from "@/lib/campo/timeSummary";
const state = vi.hoisted(() => ({
  options: {} as { queryFn: () => Promise<unknown>; enabled: boolean; queryKey: string[] },
  company: "company" as string | null, punches: [] as CampoPunch[], load: vi.fn(), calls: [] as unknown[],
  reports: [] as { order_id: string; data_lavoro: string; stato: string }[], error: false,
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ profile: { company_id: state.company } }) }));
vi.mock("@/hooks/campo/useCampoWorkDay", () => ({ useCampoWorkDay: () => "2026-09-24" }));
vi.mock("@tanstack/react-query", () => ({ useQuery: (options: typeof state.options) => { state.options = options; return {}; } }));
vi.mock("@/lib/campo/loadTimePunches", () => ({ loadCampoDayPunches: async (...args: unknown[]) => { state.load(...args); return state.punches; } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (table: string) => {
  const response = { data: table === "campo_rapportini" ? state.reports : ["A", "B"].map(id => ({ id, order_code: id })), error: state.error ? new Error("read failed") : null };
  const q = { select: () => q, eq: (...args: unknown[]) => { state.calls.push([table, ...args]); return q; }, in: () => q,
    then: Promise.resolve(response).then.bind(Promise.resolve(response)) }; return q;
} } }));
const punch = (day: string, time: string, tipo: string, order_id: string): CampoPunch => ({ tipo, order_id, timestamp_evento: `${day}T${time}:00+02:00` });
beforeEach(() => {
  vi.clearAllMocks(); state.company = "company"; state.reports = []; state.error = false; state.calls = [];
  state.punches = [punch("2026-09-23", "08:00", "entrata", "A"), punch("2026-09-23", "12:00", "uscita", "A"), punch("2026-09-23", "13:00", "entrata", "B"), punch("2026-09-23", "16:00", "uscita", "B"), punch("2026-09-24", "08:00", "entrata", "A"), punch("2026-09-24", "09:00", "uscita", "A")];
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-09-24T15:00:00+02:00"));
});
afterEach(() => vi.useRealTimers());
describe("Promemoria per giornata e cantiere", () => {
  it("ordina ieri prima di oggi e separa due cantieri nella stessa giornata", async () => {
    useCampoRapportiniDaCompilare("worker");
    expect(await state.options.queryFn()).toMatchObject([
      { order_id: "A", data_lavoro: "2026-09-23", ore_in_cantiere_stimate: 4 },
      { order_id: "B", data_lavoro: "2026-09-23", ore_in_cantiere_stimate: 3 },
      { order_id: "A", data_lavoro: "2026-09-24", ore_in_cantiere_stimate: 1 },
    ]);
    expect(state.load).toHaveBeenCalledWith("worker", "company", "2026-09-23", true);
    expect(state.calls).toContainEqual(["campo_rapportini", "company_id", "company"]);
    expect(state.calls).toContainEqual(["campo_rapportini", "user_id", "worker"]);
  });
  it.each(["inviato", "bozza", "rifiutato"])("un rapportino %s di oggi non copre ieri, né propone doppioni", async stato => {
    state.reports = [{ order_id: "A", data_lavoro: "2026-09-24", stato }];
    useCampoRapportiniDaCompilare("worker");
    expect(await state.options.queryFn()).toMatchObject([{ data_lavoro: "2026-09-23", order_id: "A" }, { data_lavoro: "2026-09-23", order_id: "B" }]);
  });
  it("un errore di lettura non equivale a giornata già compilata", async () => {
    state.error = true; useCampoRapportiniDaCompilare("worker"); await expect(state.options.queryFn()).rejects.toThrow("read failed");
  });
  it("senza azienda non abilita il caricamento", () => {
    state.company = null; useCampoRapportiniDaCompilare("worker"); expect(state.options.enabled).toBe(false);
  });
});
