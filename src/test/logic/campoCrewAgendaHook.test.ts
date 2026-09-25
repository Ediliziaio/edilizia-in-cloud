import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ user: "worker-a", company: "company-a", query: vi.fn() }));
vi.mock("@tanstack/react-query", () => ({ useQuery: state.query }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: state.user }, profile: { company_id: state.company } }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn() } }));
beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); state.user = "worker-a"; state.company = "company-a"; vi.stubEnv("VITE_SUPABASE_URL", "http://127.0.0.1:58321"); vi.stubEnv("VITE_INTERNAL_TEAM_ROSTERS_LOCAL", "true"); });
afterEach(() => vi.unstubAllEnvs());
describe("Query agenda isolata per identità, azienda e giorno", () => {
  it("cambia chiave al cambio utente, azienda e giorno senza mantenere dati precedenti", async () => {
    const { useCampoCrewAgenda } = await import("@/hooks/campo/useCampoCrewAgenda");
    useCampoCrewAgenda("2026-09-24");
    expect(state.query.mock.calls[0][0]).toMatchObject({ queryKey: ["campo-crew-agenda", "company-a", "worker-a", "2026-09-24", "2026-09-24"], enabled: true, refetchOnWindowFocus: "always", refetchOnReconnect: "always", refetchInterval: 30000, refetchIntervalInBackground: false, retry: false });
    state.user = "worker-b"; state.company = "company-b"; useCampoCrewAgenda("2026-09-25");
    expect(state.query.mock.calls[1][0].queryKey).toEqual(["campo-crew-agenda", "company-b", "worker-b", "2026-09-25", "2026-09-25"]);
    expect(state.query.mock.calls[1][0]).not.toHaveProperty("placeholderData");
  });
  it.each(["remote", "missing-user", "missing-company", "invalid-date"])("non abilita letture per %s", async scenario => {
    if (scenario === "remote") vi.stubEnv("VITE_SUPABASE_URL", "https://shared.supabase.co");
    if (scenario === "missing-user") state.user = "";
    if (scenario === "missing-company") state.company = "";
    const { useCampoCrewAgenda } = await import("@/hooks/campo/useCampoCrewAgenda");
    useCampoCrewAgenda(scenario === "invalid-date" ? "invalid" : "2026-09-24");
    expect(state.query.mock.calls[0][0].enabled).toBe(false);
  });
});
