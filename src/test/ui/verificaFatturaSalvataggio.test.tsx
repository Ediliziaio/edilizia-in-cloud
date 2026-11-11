import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const fake = vi.hoisted(() => ({
  rpc: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...p: unknown[]) => fake.rpc(...p) },
}));
vi.mock("sonner", () => ({
  toast: { success: fake.success, error: fake.error },
}));
vi.mock("@/components/orders/TabellaCommessa", () => ({
  StatoPill: ({ children }: { children: unknown }) => (
    <span>{children as never}</span>
  ),
}));
import { VerificaFatturaPill } from "@/components/fatturazione/VerificaFatturaPill";
function monta() {
  const q = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalida = vi.spyOn(q, "invalidateQueries");
  render(
    <QueryClientProvider client={q}>
      <VerificaFatturaPill id="f" numero="QA" verificata={false} puoCambiare />
    </QueryClientProvider>,
  );
  return invalida;
}
async function segna() {
  fireEvent.pointerDown(
    screen.getByRole("button", { name: "Cambia la verifica della fattura QA" }),
    { button: 0, ctrlKey: false },
  );
  fireEvent.click(
    await screen.findByRole("menuitem", { name: "Verificata", exact: true }),
  );
}
beforeEach(() => {
  vi.clearAllMocks();
});
describe("verifica fattura: salvataggio confermato dal server", () => {
  it("invalida lista e dettaglio solo dopo la conferma valida", async () => {
    fake.rpc.mockResolvedValue({
      data: { fattura_id: "f", verificata: true },
      error: null,
    });
    const invalida = monta();
    await segna();
    await waitFor(() => expect(fake.success).toHaveBeenCalled());
    expect(invalida).toHaveBeenCalledWith({ queryKey: ["fatture-ricevute"] });
    expect(invalida).toHaveBeenCalledWith({
      queryKey: ["fattura-ricevuta-riepilogo"],
    });
  });
  it("un rifiuto RLS è visibile anche nel popup e non restituisce successo", async () => {
    fake.rpc.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "denied" },
    });
    monta();
    await segna();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /Acquisti o Costi/,
    );
    expect(fake.success).not.toHaveBeenCalled();
  });
  it("una risposta vuota non viene spacciata per verifica salvata", async () => {
    fake.rpc.mockResolvedValue({ data: null, error: null });
    monta();
    await segna();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /non ha confermato/,
    );
    expect(fake.success).not.toHaveBeenCalled();
  });
});
