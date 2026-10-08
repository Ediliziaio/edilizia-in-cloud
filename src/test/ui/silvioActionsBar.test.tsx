import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SilvioActionsBar } from "@/components/silvio/SilvioActionsBar";
const mocks = vi.hoisted(() => ({ count: 2, error: null as unknown, eq: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "demo" }, user: { id: "actor" } }) }));
vi.mock("@/components/silvio/SilvioActionProposals", () => ({ SilvioActionProposals: () => <p>Proposte e risultati salvati</p> }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => {
  const q = { select: () => q, eq: (key: string, value: string) => { mocks.eq(key, value); return q; }, then: (resolve: (value: unknown) => void) => Promise.resolve({ count: mocks.count, error: mocks.error }).then(resolve) };
  return q;
} } }));
let client: QueryClient;
beforeEach(() => { mocks.count = 2; mocks.error = null; mocks.eq.mockClear(); client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); });
afterEach(() => { cleanup(); client.clear(); });
const view = () => render(<QueryClientProvider client={client}><SilvioActionsBar /></QueryClientProvider>);
describe("Actions access survives completion", () => {
  it("keeps results reachable after the last pending proposal completes", async () => {
    view(); const button = await screen.findByRole("button", { name: "Azioni e risultati · 2 da verificare" });
    fireEvent.click(button); expect(button).toHaveAttribute("aria-expanded", "true");
    mocks.count = 0;
    await act(async () => { await client.invalidateQueries({ queryKey: ["silvio-proposals-count"] }); });
    expect(await screen.findByRole("button", { name: "Azioni e risultati", exact: true })).toBeVisible();
    expect(screen.getByText("Proposte e risultati salvati")).toBeVisible();
    expect(mocks.eq).toHaveBeenCalledWith("company_id", "demo"); expect(mocks.eq).toHaveBeenCalledWith("user_id", "actor");
  });
  it("does not present failed counts as verified pending work", async () => {
    mocks.error = new Error("offline"); view();
    await waitFor(() => expect(client.getQueryState(["silvio-proposals-count", "demo", "actor"])?.status).toBe("error"));
    expect(screen.getByRole("button", { name: "Azioni e risultati" })).toBeVisible();
    expect(screen.queryByText(/2 da verificare/)).toBeNull();
  });
});
