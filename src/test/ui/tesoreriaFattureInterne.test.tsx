import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  invoke: vi.fn(),
  fail: false,
}));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({
    canReconcileBankTransactions: true,
    canViewPrimaNota: true,
    isAdmin: true,
    canViewMezzi: true,
  }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: mocks.invoke } },
}));
vi.mock("@/lib/finance/bankWorkspace", async (original) => ({
  ...(await original<object>()),
  bankRpc: mocks.rpc,
}));
vi.mock("@/components/tesoreria/MovimentoSenzaFattura", () => ({
  MovimentoSenzaFattura: (): null => null,
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
}));
import { BankMovementDetail } from "@/components/tesoreria/BankMovementDetail";
const movement = {
  id: "tx",
  company_id: "azienda",
  account_id: "conto",
  account_name: "Principale",
  booking_date: "2026-11-12",
  amount: 1000,
  currency: "EUR",
  transaction_type: "credit",
  status: "booked",
  description: "Saldo due fatture",
  reconciliation_status: "pending",
  links: {
    financial: [] as unknown[],
    contexts: [] as unknown[],
    history: [] as unknown[],
    matched: 0,
    remaining: 1000,
    revision: 0,
  },
};
const candidates = [
  {
    key: "documento:doc1",
    tipo: "documento",
    id: "doc1",
    titolo: "FT-001",
    sottotitolo: "Cliente Alfa",
    residuo: 400,
  },
  {
    key: "invoice:inv2",
    tipo: "invoice",
    id: "inv2",
    titolo: "FPR-002",
    sottotitolo: "Cliente Beta",
    residuo: 600,
  },
];
function view() {
  render(
    <MemoryRouter>
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <BankMovementDetail company="azienda" id="tx" onClose={vi.fn()} />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.fail = false;
  mocks.invoke.mockResolvedValue({ data: { ok: true }, error: null });
  mocks.rpc.mockImplementation(async (name: string) => {
    if (name === "bank_movimento_dettaglio") return structuredClone(movement);
    if (name === "bank_candidati_movimento") return structuredClone(candidates);
    if (name === "bank_conferma_ripartizione") {
      if (mocks.fail) throw new Error("Quota non valida");
      return {
        esterne: [
          {
            invoice_id: "inv2",
            provider: "fattureincloud",
            saldata: false,
            importo: 600,
            numero: "FPR-002",
          },
        ],
      };
    }
    return [];
  });
});
describe("fatture native e importate: un unico pagamento bancario", () => {
  it("mostra entrambe le fonti, senza conferme automatiche", async () => {
    view();
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Collega fatture e scadenze",
      }),
    );
    expect(await screen.findByText("FT-001")).toBeInTheDocument();
    expect(screen.getByText("FPR-002")).toBeInTheDocument();
    expect(
      mocks.rpc.mock.calls.some((c) => c[0] === "bank_conferma_ripartizione"),
    ).toBe(false);
  });
  it("conferma due quote atomiche e aggiorna anche Fatture in Cloud per la quota importata", async () => {
    view();
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Collega fatture e scadenze",
      }),
    );
    fireEvent.click(
      await screen.findByRole("checkbox", { name: "Scegli FT-001" }),
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Scegli FPR-002" }));
    fireEvent.click(screen.getByRole("button", { name: /^Conferma$/ }));
    await waitFor(() =>
      expect(mocks.rpc).toHaveBeenCalledWith("bank_conferma_ripartizione", {
        p_company: "azienda",
        p_tx: "tx",
        p_rows: [
          { tipo: "documento", id: "doc1", importo: 400 },
          { tipo: "invoice", id: "inv2", importo: 600 },
        ],
        p_note: null,
      }),
    );
    await waitFor(() =>
      expect(mocks.invoke).toHaveBeenCalledWith("billing-payment-push", {
        body: {
          invoice_id: "inv2",
          paid_date: "2026-11-12",
          azione: "incassa",
          importo: 600,
        },
      }),
    );
  });
  it("se la conferma fallisce conserva selezione e quote senza inviare pagamenti al gestionale esterno", async () => {
    mocks.fail = true;
    view();
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Collega fatture e scadenze",
      }),
    );
    fireEvent.click(
      await screen.findByRole("checkbox", { name: "Scegli FT-001" }),
    );
    fireEvent.click(screen.getByRole("button", { name: /^Conferma$/ }));
    await waitFor(() =>
      expect(mocks.rpc).toHaveBeenCalledWith(
        "bank_conferma_ripartizione",
        expect.anything(),
      ),
    );
    expect(
      screen.getByRole("checkbox", { name: "Scegli FT-001" }),
    ).toBeChecked();
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
});
