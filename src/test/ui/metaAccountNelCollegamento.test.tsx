import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PageSelectionStep } from "@/components/integrations/steps/PageSelectionStep";

const { updates, invoke } = vi.hoisted(() => ({ updates: [] as Array<{ values: unknown; filters: unknown[] }>, invoke: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: () => ({ update: (values: unknown) => {
    const op = { values, filters: [] as unknown[] }; updates.push(op);
    const b = { eq: (...filter: unknown[]) => { op.filters.push(filter); return b; }, then: (resolve: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve) };
    return b;
  } }), functions: { invoke },
} }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
afterEach(() => { cleanup(); updates.length = 0; invoke.mockClear(); });

function setup(accounts: unknown[] = []) {
  const hook = { companyId: "cliente", assets: accounts, pages: [{ id: "pagina", asset_name: "Pagina cliente", asset_id: "123", selected: true }], isLoadingPages: false, togglePageSelection: { mutate: vi.fn(), isPending: false } };
  render(<QueryClientProvider client={new QueryClient()}><PageSelectionStep hook={hook} /></QueryClientProvider>);
}

describe("Collegamento Meta in un solo popup", () => {
  it("sceglie il conto nello stesso passo delle pagine senza eliminare risorse prima della conferma", async () => {
    setup([{ id: "conto", asset_type: "ad_account", asset_id: "act_456", asset_name: "Conto cliente", integration_id: "integrazione", selected: false }]);
    expect(screen.getByText("Pagina cliente")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Conto cliente/ }));
    await waitFor(() => expect(updates).toHaveLength(2));
    expect(updates[0].filters).toContainEqual(["company_id", "cliente"]);
    expect(updates[0].filters).toContainEqual(["asset_type", "ad_account"]);
    expect(updates[1].filters).toContainEqual(["asset_id", "act_456"]);
    expect(updates[1].values).toMatchObject({ selected: true });
    expect(invoke).not.toHaveBeenCalled();
    expect(screen.getByText("Pagina cliente")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("permette di configurare i lead anche senza conto pubblicitario", () => {
    setup();
    expect(screen.getByText(/Nessun account pubblicitario disponibile/)).toBeTruthy();
    expect(screen.getByText("Pagina cliente")).toBeTruthy();
  });
});
