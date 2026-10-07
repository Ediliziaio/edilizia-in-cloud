// src/test/ui/salvaFasiComeModello.test.tsx
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SalvaFasiComeModello } from "@/components/orders/SalvaFasiComeModello";

const state = vi.hoisted(() => ({ rpc: vi.fn(), successo: vi.fn(), errore: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: state.successo, error: state.errore } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "company" } }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => state.rpc(...a) } }));

const disegna = (props: Partial<Parameters<typeof SalvaFasiComeModello>[0]> = {}) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SalvaFasiComeModello orderId="order" numeroFasi={3} {...props} />
    </QueryClientProvider>,
  );
beforeEach(() => { vi.clearAllMocks(); state.rpc.mockResolvedValue({ data: "nuovo-modello", error: null }); });
afterEach(cleanup);

describe("SalvaFasiComeModello", () => {
  it("senza fasi non compare", () => {
    const { container } = disegna({ numeroFasi: 0 });
    expect(container).toBeEmptyDOMElement();
  });

  it("senza nome il pulsante è spento; col nome salva e lo dice", async () => {
    disegna();
    const salva = screen.getByRole("button", { name: "Salva come modello" });
    expect(salva).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Nome del nuovo modello"), { target: { value: "  Bagno chiavi in mano " } });
    fireEvent.click(salva);
    await waitFor(() => expect(state.rpc).toHaveBeenCalledWith("salva_commessa_come_modello", { p_order_id: "order", p_nome: "Bagno chiavi in mano" }));
    await waitFor(() => expect(state.successo).toHaveBeenCalled());
  });

  it("se il nome esiste già lo dice con parole semplici", async () => {
    state.rpc.mockResolvedValue({ data: null, error: { code: "23505", message: "duplicate key" } });
    disegna();
    fireEvent.change(screen.getByLabelText("Nome del nuovo modello"), { target: { value: "Bagno" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva come modello" }));
    await waitFor(() => expect(state.errore).toHaveBeenCalledWith("Esiste già un modello con questo nome."));
  });
});
