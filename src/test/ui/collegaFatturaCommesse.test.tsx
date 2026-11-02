import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const stato = vi.hoisted(() => ({ righe: null as unknown, costo: null as unknown, rpc: vi.fn(), chiudi: vi.fn(), scelte: 0 }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: (f: string, a: unknown) => { stato.rpc(f, a); return Promise.resolve({ data: {}, error: null }); },
  from: (t: string) => {
    const q: Record<string, unknown> = {};
    Object.assign(q, { select: () => q, eq: () => q, maybeSingle: () => Promise.resolve({ data: t === "fatture_ricevute" ? { righe: stato.righe } : stato.costo, error: null }) });
    return q;
  },
} }));
vi.mock("@/lib/orders/financialRefresh", () => ({ refreshFinancialQueries: vi.fn() }));
vi.mock("@/components/warehouse/OrderSelectCombobox", () => ({
  OrderSelectCombobox: ({ value, onChange, placeholder }: { value?: string; onChange: (id: string) => void; placeholder?: string }) => (
    <button type="button" aria-label={placeholder} onClick={() => onChange(`c${++stato.scelte}`)}>{value ?? "nessuna"}</button>
  ),
}));
import { CollegaFatturaCommesseDialog } from "@/components/fatturazione/CollegaFatturaCommesseDialog";

const fattura = { id: "f1", numero: "F1", fornitore: "Aluplast", imponibile: 1000, totale: 1220, companyCostId: "k1" };
const mostra = (extra = {}) => render(<QueryClientProvider client={new QueryClient()}><CollegaFatturaCommesseDialog companyId="co" onChiudi={stato.chiudi} fattura={{ ...fattura, ...extra }} /></QueryClientProvider>);
beforeEach(() => { vi.clearAllMocks(); stato.righe = null; stato.costo = { order_id: null, allocations: [] }; stato.scelte = 0; });
afterEach(cleanup);

describe("Collegare una fattura alle commesse", () => {
  it("una commessa con tutto l'imponibile", async () => {
    mostra();
    fireEvent.click(await screen.findByRole("button", { name: "Cerca la commessa…" }));
    fireEvent.click(screen.getByRole("button", { name: "Salva" }));
    await waitFor(() => expect(stato.rpc).toHaveBeenCalledWith("fattura_collega_commesse", { p_fattura_id: "f1", p_quote: [{ order_id: "c1", importo: 1000 }] }));
    await waitFor(() => expect(stato.chiudi).toHaveBeenCalled());
  });
  it("due commesse a importi: propone il residuo e dice se si sfora", async () => {
    mostra();
    fireEvent.click(await screen.findByRole("button", { name: "Cerca la commessa…" }));
    fireEvent.change(screen.getByLabelText("Importo della commessa 1"), { target: { value: "600" } });
    expect(screen.getByText(/Restano .*400,00/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi una commessa" }));
    expect(screen.getByLabelText("Importo della commessa 2")).toHaveValue("400");
    fireEvent.click(screen.getAllByRole("button", { name: "Cerca la commessa…" })[1]);
    fireEvent.change(screen.getByLabelText("Importo della commessa 2"), { target: { value: "500" } });
    expect(screen.getByRole("alert")).toHaveTextContent("superano");
    expect(screen.getByRole("button", { name: "Salva" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Importo della commessa 2"), { target: { value: "400" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva" }));
    await waitFor(() => expect(stato.rpc).toHaveBeenCalledWith("fattura_collega_commesse", { p_fattura_id: "f1", p_quote: [{ order_id: "c1", importo: 600 }, { order_id: "c2", importo: 400 }] }));
  });
  it("voce per voce: ogni voce va sulla sua commessa", async () => {
    stato.righe = [{ numero_linea: 1, descrizione: "Moduli", imponibile: 700 }, { numero_linea: 2, descrizione: "Trasporto", imponibile: 300 }];
    mostra();
    fireEvent.click(await screen.findByRole("button", { name: "Voce per voce" }));
    const [a, b] = screen.getAllByRole("button", { name: "Commessa…" });
    fireEvent.click(a); fireEvent.click(b);
    fireEvent.click(screen.getByRole("button", { name: "Salva" }));
    await waitFor(() => expect(stato.rpc).toHaveBeenCalledWith("fattura_collega_commesse", { p_fattura_id: "f1", p_quote: [{ order_id: "c1", importo: 700, righe: [1] }, { order_id: "c2", importo: 300, righe: [2] }] }));
  });
  it("riparte da com'è, e si può scollegare", async () => {
    stato.costo = { order_id: null, allocations: [{ order_id: "x", pct: 60, importo: 600 }, { order_id: "y", pct: 40, importo: 400 }] };
    mostra();
    await waitFor(() => expect(screen.getByLabelText("Importo della commessa 2")).toHaveValue("400"));
    fireEvent.click(screen.getByRole("button", { name: "Scollega" }));
    await waitFor(() => expect(stato.rpc).toHaveBeenCalledWith("fattura_collega_commesse", { p_fattura_id: "f1", p_quote: [] }));
  });
  it("sull'ordine d'acquisto non si salva: la commessa viene da lì", async () => {
    mostra({ purchaseOrderId: "po1" });
    expect(await screen.findByRole("status")).toHaveTextContent("ordine d’acquisto");
    expect(screen.queryByRole("button", { name: "Salva" })).toBeNull();
  });
});
