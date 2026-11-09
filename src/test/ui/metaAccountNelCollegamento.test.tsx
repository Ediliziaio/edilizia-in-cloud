import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PageSelectionStep } from "@/components/integrations/steps/PageSelectionStep";
import { AdAccountSelectionStep } from "@/components/integrations/steps/AdAccountSelectionStep";

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

function setup(accounts: unknown[] = [], pagesOnly = false) {
  const hook = { companyId: "cliente", assets: accounts, pages: [{ id: "pagina", asset_name: "Pagina cliente", asset_id: "123", selected: true }], isLoadingPages: false, togglePageSelection: { mutate: vi.fn(), isPending: false } };
  const client = new QueryClient();
  const invalidate = vi.spyOn(client, "invalidateQueries");
  render(<QueryClientProvider client={client}>{pagesOnly ? <PageSelectionStep hook={hook} /> : <AdAccountSelectionStep hook={hook as unknown as Parameters<typeof AdAccountSelectionStep>[0]["hook"]} />}</QueryClientProvider>);
  return { invalidate };
}

describe("Collegamento Meta in un solo popup", () => {
  it("sceglie il conto senza eliminare risorse prima della conferma", async () => {
    setup([{ id: "conto", asset_type: "ad_account", asset_id: "act_456", asset_name: "Conto cliente", integration_id: "integrazione", selected: false }]);
    fireEvent.click(screen.getByRole("button", { name: /Conto cliente/ }));
    await waitFor(() => expect(updates).toHaveLength(2));
    expect(updates[0].filters).toContainEqual(["company_id", "cliente"]);
    expect(updates[0].filters).toContainEqual(["asset_type", "ad_account"]);
    expect(updates[1].filters).toContainEqual(["asset_id", "act_456"]);
    expect(updates[1].values).toMatchObject({ selected: true });
    expect(invoke).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("deseleziona il conto attivo senza cambiare le pagine né selezionarne un altro", async () => {
    const { invalidate } = setup([{ id: "conto", asset_type: "ad_account", asset_id: "act_456", asset_name: "Conto cliente", integration_id: "integrazione", selected: true }]);
    const account = screen.getByRole("button", { name: /Conto cliente/ });
    expect(account.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(account);
    await waitFor(() => expect(updates).toHaveLength(1));
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ["meta-ad-accounts", "cliente"] }));
    expect(updates[0].values).toMatchObject({ selected: false });
    expect(updates[0].filters).toContainEqual(["company_id", "cliente"]);
    expect(updates[0].filters).toContainEqual(["asset_type", "ad_account"]);
    expect(invoke).not.toHaveBeenCalled();
  });
  it("mostra soltanto le pagine nel primo passaggio", () => {
    setup([{ id: "conto", asset_type: "ad_account", asset_id: "act_456", asset_name: "Conto cliente", selected: true }], true);
    expect(screen.getByText("Pagina cliente")).toBeTruthy();
    expect(screen.queryByText("Conto cliente")).toBeNull();
  });
  it("permette di configurare i lead anche senza conto pubblicitario", () => {
    setup();
    expect(screen.getByText(/Nessun account pubblicitario disponibile/)).toBeTruthy();
  });
});
