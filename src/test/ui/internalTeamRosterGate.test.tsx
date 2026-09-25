import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: state.rpc } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "company" } }) }));
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

it("frontend locale con opt-in non contatta il backend remoto per le nuove squadre", async () => {
  vi.stubEnv("VITE_SUPABASE_URL", "https://not-local.supabase.co");
  vi.stubEnv("VITE_INTERNAL_TEAM_ROSTERS_LOCAL", "true");
  const { InternalTeamRosterDialog } = await import("@/components/employees/InternalTeamRosterDialog");
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={qc}><InternalTeamRosterDialog team={{ id: "team", name: "Squadra A" }} onClose={vi.fn()} /></QueryClientProvider>);
  expect(screen.getByRole("status")).toHaveTextContent("Composizione in preparazione");
  expect(screen.getByText(/Nessun dato è stato modificato/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Salva composizione" })).not.toBeInTheDocument();
  expect(state.rpc).not.toHaveBeenCalled(); qc.clear();
});
