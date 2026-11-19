import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { StornaPagamentiCosto } from "@/components/prima-nota/StornaPagamentiCosto";
import type { PrimaNotaEntry } from "@/hooks/usePrimaNota";

const state = vi.hoisted(() => ({ conferma: vi.fn(), storna: vi.fn(), aggiorna: vi.fn(), errore: vi.fn() }));
vi.mock("@/components/ui/confirm-dialog", () => ({ useConfirm: () => state.conferma }));
vi.mock("@/lib/costi/annulloCosto", () => ({ stornaPagamentiCosto: state.storna }));
vi.mock("@/lib/orders/financialRefresh", () => ({ refreshFinancialQueries: state.aggiorna }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: state.errore } }));
const base = { id: "pn1", cost_id: "c1", direction: "uscita", auto_source: "company_cost_payment", is_auto: true } as PrimaNotaEntry;
const apri = (righe = [base]) => render(<QueryClientProvider client={new QueryClient()}><StornaPagamentiCosto righe={righe} /></QueryClientProvider>);
beforeEach(() => { vi.clearAllMocks(); state.conferma.mockResolvedValue(true); state.storna.mockResolvedValue(undefined); });
afterEach(cleanup);

it("annulla tutti i pagamenti del costo una sola volta anche scegliendo due suoi acconti", async () => {
  apri([base, { ...base, id: "pn2" }]);
  fireEvent.click(screen.getByRole("button", { name: "Storna pagamenti dei costi" }));
  await waitFor(() => expect(state.storna).toHaveBeenCalledExactlyOnceWith("c1"));
  expect(state.conferma.mock.calls[0][0].description).toContain("TUTTI i pagamenti");
  expect(state.conferma.mock.calls[0][0].description).toContain("fuori da questa pagina");
  expect(state.aggiorna).toHaveBeenCalledOnce();
});
it("non scrive se la conferma viene rifiutata", async () => {
  state.conferma.mockResolvedValue(false); apri();
  fireEvent.click(screen.getByRole("button"));
  await waitFor(() => expect(state.conferma).toHaveBeenCalledOnce());
  expect(state.storna).not.toHaveBeenCalled();
});
it("esclude storni, pagamenti già stornati, banca, SAL e altre origini", () => {
  for (const patch of [{ reversal_of: "pn0" }, { stornata: true }, { bank_transaction_id: "b" }, { sal_sub_id: "s" }, { auto_source: "bank" }, { direction: "entrata" }]) {
    apri([{ ...base, ...patch } as PrimaNotaEntry]);
    expect(screen.queryByRole("button")).toBeNull();
    cleanup();
  }
  apri([{ ...base, stornata: true }]);
  expect(screen.queryByRole("button")).toBeNull();
});
it("rende visibile il rifiuto del database senza fingere che tutti i costi siano stornati", async () => {
  state.storna.mockRejectedValue(new Error("Pagamento collegato a banca o SAL")); apri();
  fireEvent.click(screen.getByRole("button"));
  await waitFor(() => expect(state.errore).toHaveBeenCalledWith("1 costi non stornati", expect.objectContaining({ description: "Pagamento collegato a banca o SAL" })));
});
