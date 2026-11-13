import { beforeEach, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
const mock = vi.hoisted(() => ({
  rpc: vi.fn(),
  load: vi.fn(),
  close: vi.fn(),
}));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ canReconcileBankTransactions: true, isAdmin: true }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: vi.fn() } },
}));
vi.mock("@/lib/orders/financialRefresh", () => ({
  refreshFinancialQueries: vi.fn(),
}));
vi.mock("@/components/tesoreria/BankMovementDetail", () => ({
  BankMovementDetail: (): null => null,
}));
vi.mock("@/lib/finance/bankWorkspace", async (original) => ({
  ...(await original<object>()),
  bankRpc: mock.rpc,
  loadBankPage: mock.load,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), warning: vi.fn() } }));
import { BankReconciliationWorkspace } from "@/components/tesoreria/BankReconciliationWorkspace";
import { EMPTY_BANK_FILTERS } from "@/lib/finance/bankWorkspace";
const m = {
  id: "tx-1",
  account_id: "a",
  account_name: "Banca Alfa",
  booking_date: "2026-11-13",
  amount: 100,
  currency: "EUR",
  description: "Causale completa FT-2026-001",
  debtor_name: "Cliente Alfa",
  transaction_type: "credit",
  status: "booked",
  reconciliation_status: "pending",
  links: {
    remaining: 100,
    matched: 0,
    revision: 0,
    financial: [] as never[],
    contexts: [] as never[],
    history: [] as never[],
  },
};
const c = {
  id: "doc1",
  key: "documento:doc1",
  tipo: "documento",
  titolo: "FT-2026-001",
  residuo: 100,
  forte: true,
  punteggio: 100,
  motivi: ["Numero documento nella causale", "Controparte corrispondente"],
  incongruenze: [] as string[],
};
function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <BankReconciliationWorkspace
          company="company"
          filters={EMPTY_BANK_FILTERS}
          accounts={[
            { id: "a", account_name: "Banca Alfa" },
            { id: "b", account_name: "Banca Beta" },
          ]}
          onClose={mock.close}
        />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  mock.load.mockResolvedValue({
    rows: [m],
    count: 1,
    totals: [
      {
        currency: "EUR",
        n: 1,
        unreconciled_count: 1,
        unreconciled_amount: 100,
      },
    ],
  });
  mock.rpc.mockImplementation((name: string, args: Record<string, unknown>) => {
    if (name === "bank_proposte_lotto") return Promise.resolve({ "tx-1": [c] });
    if (name === "bank_proposte_movimento")
      return Promise.resolve(args.p_search === "Altro" ? [] : [c]);
    if (name === "bank_conferma_lotto")
      return Promise.resolve({
        count: 1,
        items: [{ id: "tx-1", booking_date: "2026-11-13", result: {} }],
      });
    return Promise.resolve([]);
  });
});
it("conserva lavoro, quote e selezione cambiando ricerca documenti, conto e sezione", async () => {
  mount();
  fireEvent.click(await screen.findByText("Cliente Alfa"));
  fireEvent.click(
    await screen.findByRole("checkbox", {
      name: "Scegli documento FT-2026-001",
    }),
  );
  const input = screen.getByRole("textbox", { name: "Quota per FT-2026-001" });
  fireEvent.change(input, { target: { value: "70" } });
  fireEvent.change(
    screen.getByRole("combobox", { name: "Gestione differenza" }),
    { target: { value: "Acconto o pagamento parziale" } },
  );
  fireEvent.change(
    screen.getByRole("textbox", { name: "Ricerca documenti nel lotto" }),
    { target: { value: "Altro" } },
  );
  await waitFor(() =>
    expect(mock.rpc).toHaveBeenCalledWith(
      "bank_proposte_movimento",
      expect.objectContaining({ p_search: "Altro" }),
    ),
  );
  expect(
    screen.getByRole("textbox", { name: "Quota per FT-2026-001" }),
  ).toHaveValue("70");
  fireEvent.change(
    screen.getByRole("combobox", { name: "Conto da riconciliare" }),
    { target: { value: "b" } },
  );
  fireEvent.click(screen.getByRole("button", { name: "Pagamenti" }));
  expect(screen.getByText("1 movimenti selezionati")).toBeInTheDocument();
  expect(
    screen.getByRole("textbox", { name: "Quota per FT-2026-001" }),
  ).toHaveValue("70");
  fireEvent.click(
    screen.getByRole("button", { name: "Chiudi riconciliazione" }),
  );
  expect(
    screen.getByText(
      "Hai operazioni non confermate. Chiudendo verranno scartate.",
    ),
  ).toBeInTheDocument();
  expect(mock.close).not.toHaveBeenCalled();
});
it("non conferma le proposte prima del comando esplicito e invia un solo lotto", async () => {
  mount();
  await screen.findByText("Cliente Alfa");
  fireEvent.click(screen.getByRole("button", { name: "Trova proposte" }));
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Seleziona riscontri forti" }),
    ).toBeEnabled(),
  );
  expect(mock.rpc.mock.calls.some((x) => x[0] === "bank_conferma_lotto")).toBe(
    false,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Seleziona riscontri forti" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Conferma 1 movimenti" }));
  await waitFor(() =>
    expect(mock.rpc).toHaveBeenCalledWith(
      "bank_conferma_lotto",
      expect.objectContaining({
        p_company: "company",
        p_request: expect.any(String),
        p_items: [
          expect.objectContaining({
            id: "tx-1",
            proposal_key: "documento:doc1",
            rows: [{ tipo: "documento", id: "doc1", importo: 100 }],
          }),
        ],
      }),
    ),
  );
});
it("una proposta ambigua non è selezionabile in blocco", async () => {
  mock.rpc.mockImplementation((name: string) =>
    Promise.resolve(
      name === "bank_proposte_lotto"
        ? { "tx-1": [c, { ...c, id: "doc2", key: "documento:doc2" }] }
        : [],
    ),
  );
  mount();
  await screen.findByText("Cliente Alfa");
  fireEvent.click(screen.getByRole("button", { name: "Trova proposte" }));
  await screen.findByText("Da verificare singolarmente");
  expect(
    screen.getByRole("button", { name: "Seleziona riscontri forti" }),
  ).toBeDisabled();
});
