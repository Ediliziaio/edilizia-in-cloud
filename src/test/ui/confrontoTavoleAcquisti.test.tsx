import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { ConfrontoTavoleAcquisti } from "@/components/orders/materiali/ConfrontoTavoleAcquisti";
const state = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: state.rpc } }));
vi.mock("@/hooks/usePianoAcquistiComputo", () => ({ caricaContestoPianoAcquisti: async () => ({ magazzino: [], coperture: [], fasi: [], fornitori: [], esistenti: [
  { id: "articolo", updated_at: "r1", chiave_materiale: "serramento", name: "Serramento A", quantity: 10, quantita_calcolata: 10, unita_misura: "pz", phase_id: "f1", origini: [{ tipo: "computo", voce_id: "v1", quantita: 10 }], stock_item_id: null },
] }) }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const conteggi = [{ id: "c1", updated_at: "v1", documento_id: "d1", documento_nome: "Pianta.pdf", pagina: 1, simbolo: "S1", descrizione_legenda: "Serramento A", quantita: 13, unita: "pz", phase_id: "f1", locale: null, confermato: true }];
function mostra(puoScrivere = true) { return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ConfrontoTavoleAcquisti companyId="azienda" orderId="ordine" conteggi={conteggi} puoScrivere={puoScrivere} onAggiornati={() => {}} /></QueryClientProvider>); }
it("confronta e richiede identità e ambito prima di sostituire la quantità", async () => {
  state.rpc.mockResolvedValue({ error: null }); mostra();
  await waitFor(() => expect(screen.queryByText("Leggo materiali, ordini e magazzino…")).not.toBeInTheDocument());
  fireEvent.click(screen.getByRole("button", { name: /Serramento A · 13 pz/ }));
  expect(screen.getByRole("combobox", { name: "Articolo da confrontare" })).toHaveValue("articolo");
  const button = screen.getByRole("button", { name: "Usa questa quantità negli acquisti" }); expect(button).toBeDisabled(); expect(state.rpc).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("checkbox")); fireEvent.click(button);
  await waitFor(() => expect(state.rpc).toHaveBeenCalledWith("materiale_quantita_da_tavola", expect.objectContaining({ p_item: "articolo", p_order: "ordine", p_versione: "r1", p_conteggi: [{ id: "c1", versione: "v1" }] })));
});
it("conserva confronto e messaggio quando un altro utente cambia la riga", async () => {
  state.rpc.mockResolvedValue({ error: { message: "L’articolo è cambiato: aggiorna il confronto" } }); mostra();
  await waitFor(() => expect(screen.queryByText("Leggo materiali, ordini e magazzino…")).not.toBeInTheDocument());
  fireEvent.click(screen.getByRole("button", { name: /Serramento A · 13 pz/ })); fireEvent.click(screen.getByRole("checkbox")); fireEvent.click(screen.getByRole("button", { name: "Usa questa quantità negli acquisti" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("L’articolo è cambiato"); expect(screen.getByRole("combobox")).toHaveValue("articolo");
});
it("chi può soltanto leggere vede il confronto senza poter applicare modifiche", async () => {
  mostra(false); await waitFor(() => expect(screen.queryByText("Leggo materiali, ordini e magazzino…")).not.toBeInTheDocument());
  fireEvent.click(screen.getByRole("button", { name: /Serramento A · 13 pz/ })); expect(screen.getByRole("checkbox")).toBeDisabled();
  expect(screen.getByRole("button", { name: "Usa questa quantità negli acquisti" })).toBeDisabled(); expect(state.rpc).not.toHaveBeenCalled();
});
