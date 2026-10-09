import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import SettingsCartelleDocumenti from "@/pages/azienda/settings/SettingsCartelleDocumenti";

const state = vi.hoisted(() => ({ edit: true, readError: false, pending: false, mutate: vi.fn(), refetch: vi.fn(), countError: false }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ isAdmin: false, canEditSettingsOrders: state.edit }) }));
// La pagina dice se l'area clienti è spenta: legge l'azienda da AuthContext.
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "company-1", customer_portal_enabled: false } }) }));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => "company-1" }));
vi.mock("@/components/billing/SpazioArchiviazioneCard", () => ({ SpazioArchiviazioneCard: (): null => null }));
vi.mock("@/hooks/useCartelleDocumenti", () => ({
  useCartelleDocumenti: () => ({ cartelle: [{ id: "f1", nome: "Contratti", visibile_cliente: false, obbligatoria: false, archiviata_at: null as string | null }], isLoading: false, isError: state.readError, refetch: state.refetch }),
  useSalvaCartella: () => ({ mutate: state.mutate, isPending: state.pending }), useRiordinaCartelle: () => ({ mutate: state.mutate, isPending: false }),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({ select: () => ({ eq: async () => ({ count: 3, error: state.countError ? { message: "errore conteggio" } : null }) }) }) } }));
const open = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><SettingsCartelleDocumenti /></QueryClientProvider>);
beforeEach(() => { state.edit = true; state.readError = false; state.pending = false; state.countError = false; state.mutate.mockClear(); state.refetch.mockClear(); });
afterEach(cleanup);
describe("Cartelle documenti", () => {
  it("un errore non viene presentato come assenza di cartelle", () => {
    state.readError = true; open();
    expect(screen.getByRole("alert")).toHaveTextContent("Nessuna modifica verrà salvata");
    expect(screen.queryByLabelText("Nuova cartella")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Riprova" }));
    expect(state.refetch).toHaveBeenCalledOnce();
  });
  it("blocca i comandi per chi può solo leggere", () => {
    state.edit = false; open();
    expect(screen.getAllByRole("switch").every(el => el.hasAttribute("disabled"))).toBe(true);
    expect(screen.queryByRole("button", { name: "Archivia «Contratti»" })).toBeNull();
  });
  it("conserva l'input finché la creazione non riesce", () => {
    open(); fireEvent.change(screen.getByLabelText("Nuova cartella"), { target: { value: "Progetti" } });
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi" }));
    expect(state.mutate.mock.calls[0][0]).toEqual({ nome: "Progetti" });
    expect(screen.getByLabelText("Nuova cartella")).toHaveValue("Progetti");
  });
  it("durante il salvataggio blocca modifiche concorrenti", () => {
    state.pending = true; open();
    expect(screen.getByLabelText("Nuova cartella")).toBeDisabled();
    expect(screen.getAllByRole("switch").every(el => el.hasAttribute("disabled"))).toBe(true);
  });
  it("su mobile usa righe a scheda invece di una tabella larga", () => {
    const { container } = open();
    expect(container.querySelector("table")).toHaveClass("block", "md:table");
    expect(container.querySelector("tbody tr")).toHaveClass("grid", "grid-cols-2");
  });
  it("i conteggi falliti sono sconosciuti, non zero", async () => {
    state.countError = true; open();
    expect(await screen.findByText("Conteggi non disponibili: non sono zero.")).toBeInTheDocument();
  });
});
