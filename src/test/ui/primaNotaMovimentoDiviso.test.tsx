import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import NewEntryDialog from "@/components/prima-nota/NewEntryDialog";

const documenti = [
  { tipo: "documento", id: "d1", numero: "12", data: "2026-09-01", controparte: "Rossi Costruzioni", totale: 1000, residuo: 1000, order_id: "o1", order_code: "C-01" },
  { tipo: "invoice", id: "i1", numero: "FT/40", data: "2026-10-01", controparte: "Rossi Costruzioni", totale: 2500.5, residuo: 2500.5, order_id: null, order_code: null },
  { tipo: "documento", id: "d2", numero: "13", data: "2026-10-05", controparte: "Bianchi", totale: 700, residuo: 700, order_id: null, order_code: null },
];
const rpc = vi.fn(async (fn: string, _args?: unknown): Promise<{ data: unknown; error: null }> => {
  if (fn === "prima_nota_documenti_aperti") return { data: documenti, error: null };
  if (fn === "prima_nota_registra_divisa") return { data: { gruppo_id: "g1", righe: [] }, error: null };
  return { data: [], error: null };
});
vi.mock("@/hooks/useContiPrimaNota", () => ({ useContiPrimaNota: () => ({ data: [] as unknown[], isError: false, isPending: false }) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "demo" } }) }));
vi.mock("@/hooks/usePrimaNota", () => ({ allineaFattureInCloud: vi.fn(async () => "ok") }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (fn: string, a: unknown) => rpc(fn, a), from: () => {
  const q = { select: () => q, eq: () => q, order: () => q, not: () => q, is: () => q, limit: () => q, then: (r: unknown) => Promise.resolve({ data: [], error: null }).then(r as never) };
  return q;
} } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
Element.prototype.scrollIntoView ??= () => {};

it("un bonifico in entrata diviso su due fatture dello stesso cliente: proposta esatta, barra e salvataggio unico", async () => {
  const onOpenChange = vi.fn();
  render(<QueryClientProvider client={new QueryClient()}><NewEntryDialog open onOpenChange={onOpenChange} onConfirm={vi.fn()} isPending={false} /></QueryClientProvider>);
  fireEvent.click(screen.getByRole("button", { name: "↓ Entrata" }));
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.change(screen.getByLabelText("Importo"), { target: { value: "3500.50" } });
  // Le due fatture di Rossi fanno esattamente l'importo: il popup lo propone.
  const proposta = await screen.findByRole("button", { name: /Queste 2 fatture fanno esattamente/ });
  fireEvent.click(proposta);
  expect(screen.getByText(/tutto assegnato/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Registra 2 quote" }));
  await waitFor(() => expect(rpc).toHaveBeenCalledWith("prima_nota_registra_divisa", expect.objectContaining({
    p_company: "demo",
    p_testata: expect.objectContaining({ direction: "entrata", importo: 3500.5 }),
    p_quote: [{ tipo: "documento", id: "d1", importo: 1000 }, { tipo: "invoice", id: "i1", importo: 2500.5 }],
  })));
  await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
});

it("cercando il cliente la quota propone quello che manca (acconto) e la voce senza fattura chiude il resto", async () => {
  render(<QueryClientProvider client={new QueryClient()}><NewEntryDialog open onOpenChange={vi.fn()} onConfirm={vi.fn()} isPending={false} /></QueryClientProvider>);
  fireEvent.click(screen.getByRole("button", { name: "↓ Entrata" }));
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.change(screen.getByLabelText("Importo"), { target: { value: "500" } });
  fireEvent.change(screen.getByLabelText("Cerca cliente o fattura"), { target: { value: "bianchi" } });
  fireEvent.click(await screen.findByRole("option", { name: /Bianchi/ }));
  expect((screen.getByLabelText("Importo della quota") as HTMLInputElement).value).toBe("500.00");
  expect(screen.getByText("acconto")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Importo della quota"), { target: { value: "450" } });
  expect(screen.getByText(/mancano 50,00/)).toBeTruthy();
  expect(screen.getByRole("button", { name: "Registra" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: /Voce senza fattura/ }));
  expect((screen.getAllByLabelText("Importo della quota")[1] as HTMLInputElement).value).toBe("50.00");
  expect(screen.getByText("Scegli la categoria per una voce senza fattura.")).toBeTruthy();
});
