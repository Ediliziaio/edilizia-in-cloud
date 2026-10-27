import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { MassiveImportPanel } from "@/components/billing/MassiveImportPanel";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke } } }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
const view = () => render(<MemoryRouter><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MassiveImportPanel companyId="company-A" italaConnected /></QueryClientProvider></MemoryRouter>);
afterEach(cleanup);
beforeEach(() => { invoke.mockReset(); invoke.mockResolvedValue({ data: { requests: [] }, error: null }); });
describe("Recupero storico: costi confermati e azienda sempre esplicita", () => {
  it("preparare il modulo non invia richieste a pagamento", async () => {
    view();
    await waitFor(() => expect(invoke).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText("Dal"), { target: { value: "2026-01-01" } });
    fireEvent.change(screen.getByLabelText("Al"), { target: { value: "2026-03-31" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /Prepara richiesta/ }));
    expect(await screen.findByText("Conferma richiesta")).toBeInTheDocument();
    expect(invoke.mock.calls.every(([, options]) => options.body.action === "list")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Annulla" }));
    expect(invoke.mock.calls.every(([, options]) => options.body.action === "list")).toBe(true);
  });
  it("il pagamento manda esattamente il conteggio confermato e l'azienda selezionata", async () => {
    invoke.mockImplementation(async (_name, options) => options.body.action === "list"
      ? { data: { requests: [{ id: 42, stato: "PRONTO", num_documenti: 12, tipo_richiesta: "RICEVUTE" }] }, error: null }
      : { data: { success: true }, error: null });
    view();
    fireEvent.click(await screen.findByRole("button", { name: "Recupera · 12 crediti" }));
    expect(invoke.mock.calls.some(([, options]) => options.body.action === "pay")).toBe(false);
    expect(screen.getByText(/addebiterà 12 crediti/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Conferma" }));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("billing-massive", { body: { id: 42, confirm_credits: 12, action: "pay", company_id: "company-A", provider: "itala" } }));
  });
  it("la lista non richiede mai credenziali dal database del browser", async () => {
    view();
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("billing-massive", { body: { action: "list", company_id: "company-A", provider: "itala" } }));
  });
});
