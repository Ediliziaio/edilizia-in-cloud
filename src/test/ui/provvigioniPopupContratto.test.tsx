import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { CommissionContract } from "@/lib/orders/commissionContractDetails";

const state = vi.hoisted(() => ({ fail: false }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "company-demo" } }) }));
vi.mock("@/hooks/useCommesseGenerali", () => ({ useIncassiUnita: () => ({ data: { incassi: 0, permute: 0 }, isFetching: false }) }));
vi.mock("@/lib/orders/commissionContractDetails", async (original) => {
  const actual = await original<typeof import("@/lib/orders/commissionContractDetails")>();
  return { ...actual, loadCommissionContract: vi.fn(async () => {
    if (state.fail) throw new Error("lettura negata");
    const order: CommissionContract = {
      id: "order-demo", order_code: "ORD-2026-1", description: "Ristrutturazione bagno", created_at: "2026-01-01",
      total_amount: 1000, vat_rate: 22, financing_cost: 0, payment_type: "standard", workflow_kind: "commessa", parent_contract_id: null,
      customer: { first_name: "Marco", last_name: "Cliente" }, status: { name: "In lavorazione" }, variazioni: [], installments: [
        { id: "r1", position: 0, label: "Acconto", type: "deposit", amount: 220, is_paid: true, paid_date: "2026-01-05" },
        { id: "r2", position: 1, label: "Saldo", type: "balance", amount: 0, is_paid: false, expected_date: "2026-02-01" },
      ],
    };
    return { original: order, order };
  }) };
});
import { CommissionContractDetails } from "@/components/orders/CommissionContractDetails";
import { loadCommissionContract } from "@/lib/orders/commissionContractDetails";
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter><CommissionContractDetails orderId="order-demo" /></MemoryRouter></QueryClientProvider>);
}
afterEach(() => { cleanup(); state.fail = false; vi.clearAllMocks(); });

describe("Popup contratto e incassi", () => {
  it("carica la commessa scelta per l'azienda corrente e separa incassi e provvigione", async () => {
    mount();
    expect(await screen.findByRole("region", { name: "Contratto e incassi cliente" })).toBeVisible();
    expect(loadCommissionContract).toHaveBeenCalledWith("company-demo", "order-demo");
    expect(screen.getByText("ORD-2026-1 · Marco Cliente")).toBeVisible();
    expect(screen.getByText("Ristrutturazione bagno")).toBeVisible();
    expect(screen.getByText("Incassato parzialmente")).toBeVisible();
    expect(screen.getByText(/Il pagamento del cliente è distinto/)).toBeVisible();
    const balance = screen.getByText("Saldo").closest("tr")!;
    expect(within(balance).getByText("Scaduta")).toBeVisible();
    expect(within(balance).getByText("01/02/2026")).toBeVisible();
    expect(screen.getByRole("columnheader", { name: "Incassato" })).toBeVisible();
  });
  it("non presenta un errore di lettura come cliente non pagante", async () => {
    state.fail = true; mount();
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Contratto e incassi non disponibili"));
    expect(screen.queryByText("Non ancora incassato")).not.toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Riprova" })).toBeVisible();
  });
});
