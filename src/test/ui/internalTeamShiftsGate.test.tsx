import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ rpc: vi.fn(), auth: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: state.rpc } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: state.auth }));
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

it("nessuna query o nuova azione turni sul backend condiviso, anche con opt-in", async () => {
  vi.stubEnv("VITE_SUPABASE_URL", "https://not-local.supabase.co");
  vi.stubEnv("VITE_INTERNAL_TEAM_ROSTERS_LOCAL", "true");
  const { InternalTeamShifts } = await import("@/components/orders/InternalTeamShifts");
  render(<InternalTeamShifts orderId="order" teams={[{ id: "t", label: "Squadra", kind: "interna" }]} phases={[]} canPlan />);
  expect(screen.queryByRole("region", { name: "Turni squadre interne" })).not.toBeInTheDocument();
  expect(state.rpc).not.toHaveBeenCalled(); expect(state.auth).not.toHaveBeenCalled();
});
