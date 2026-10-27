import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const state = vi.hoisted(() => ({ progetto: {} as Record<string, unknown>, edit: true, invoke: vi.fn(), signed: vi.fn(), download: vi.fn(), error: vi.fn() }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canEditPreventivi: state.edit, canViewMargins: false, canViewCosts: false }) }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/lib/fotovoltaico/queries", () => ({
  useProgetto: () => ({ data: state.progetto, isLoading: false }), useComponentiProgetto: () => ({ data: [] }),
  useManodoperaProgetto: () => ({ data: [] }), useServiziProgetto: () => ({ data: [] }), useEliminaProgetto: () => ({}),
}));
vi.mock("@/components/moduli/ConvertiInCommessaCard", () => ({ ConvertiInCommessaCard: () => null }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: state.invoke } } }));
vi.mock("@/lib/preventivi/pdfFirmatoPreventivo", () => ({ pdfFirmatoPreventivo: state.signed, scaricaCopiaPdf: state.download }));
vi.mock("sonner", () => ({ toast: { error: state.error, loading: vi.fn(), success: vi.fn() } }));
import FotovoltaicoDettaglio from "@/pages/azienda/fotovoltaico/FotovoltaicoDettaglio";
beforeEach(() => {
  state.edit = true; state.invoke.mockReset(); state.signed.mockReset(); state.download.mockReset(); state.error.mockReset();
  state.progetto = { id: "p1", company_id: "c1", stato: "emesso", archetipo: "privato_prima", numero: "FV-TEST", titolo: "Preventivo QA", indirizzo: "Via Roma 1", potenza_kwp: 6,
    cliente_nome: "Mario", cliente_cognome: "Rossi", cliente_email: "mario@example.test", cliente_telefono: "3331234567", pdf_vendita_url: "c1/p1/originale.html", created_at: "2026-10-26", modello_snapshot: { template: { scadenza_validita_preventivo_giorni: 15 } } };
  state.invoke.mockResolvedValue({ data: { success: true, token: "a".repeat(32), request_id: "r1" }, error: null });
});
afterEach(cleanup);
function page() {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><MemoryRouter initialEntries={[`/fv/${state.progetto.id}`]}><Routes><Route path="/fv/:id" element={<FotovoltaicoDettaglio />} /></Routes></MemoryRouter></QueryClientProvider>);
}
describe("La scheda FV usa davvero il percorso di firma dell'app", () => {
  it.each(["p1", "copia-p2"])("cliente, telefono, validità e id del preventivo %s arrivano alla richiesta", async id => {
    state.progetto.id = id; page();
    fireEvent.click(screen.getByRole("button", { name: "Richiedi firma" }));
    expect(screen.getByLabelText("Email destinatario *")).toHaveValue("mario@example.test");
    expect(screen.getByLabelText("Nome destinatario")).toHaveValue("Mario Rossi");
    expect(screen.getByLabelText("Cellulare (opzionale)")).toHaveValue("3331234567");
    fireEvent.change(screen.getByLabelText(/Messaggio personalizzato/), { target: { value: "Messaggio QA" } });
    fireEvent.click(screen.getByRole("button", { name: "Invia per la firma" }));
    await waitFor(() => expect(state.invoke).toHaveBeenCalledWith("fea-richiedi-firma", { body: expect.objectContaining({ tipo_documento: "fv", documento_id: id, signer_email: "mario@example.test", signer_name: "Mario Rossi", signer_phone: "3331234567", expires_giorni: 15, note: "Messaggio QA" }) }));
    expect(await screen.findByText("Offerta inviata con successo!")).toBeInTheDocument();
  });
  it("senza permesso non offre l'invio", () => {
    state.edit = false; page();
    expect(screen.queryByRole("button", { name: "Richiedi firma" })).toBeNull();
  });
  it("dopo la firma scarica la copia conservata invece di ristampare il modello corrente", async () => {
    state.progetto.stato = "firmato";
    const file = { blob: new Blob(["%PDF-1.7 firmato"]), nomeFile: "firmato.pdf" }; state.signed.mockResolvedValue(file);
    page(); fireEvent.click(screen.getAllByRole("button", { name: /Scarica PDF/ })[0]);
    await waitFor(() => expect(state.download).toHaveBeenCalledWith(file));
    expect(state.signed).toHaveBeenCalledWith({ companyId: "c1", progettoId: "p1", tipo: "fv" });
  });
  it("gli errori del convertitore sono visibili e non mostrano invio riuscito", async () => {
    state.invoke.mockResolvedValue({ data: null, error: { message: "non-2xx", context: { json: async () => ({ error: "Il PDF completo non è disponibile" }) } } });
    page(); fireEvent.click(screen.getByRole("button", { name: "Richiedi firma" })); fireEvent.click(screen.getByRole("button", { name: "Invia per la firma" }));
    await waitFor(() => expect(state.error).toHaveBeenCalledWith(expect.stringContaining("Il PDF completo non è disponibile")));
    expect(screen.queryByText("Offerta inviata con successo!")).toBeNull();
  });
});
