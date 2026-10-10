import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PipelinesConfig } from "@/components/settings/PipelinesConfig";
import { CustomFieldsConfig } from "@/components/settings/CustomFieldsConfig";

const state = vi.hoisted(() => ({ loading: false, write: true, error: false, deletedError: false, writes: vi.fn(), confirm: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "c1" } }) }));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => "c1" }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canEditSettingsCustomization: state.write, isLoading: state.loading }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => {
  let deleted = false;
  const b = { select: () => b, eq: () => b, order: () => b, is: () => b, not: () => { deleted = true; return b; },
    insert: () => { state.writes(); return b; }, update: () => { state.writes(); return b; }, delete: () => { state.writes(); return b; },
    then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: [], error: state.error || (deleted && state.deletedError) ? new Error("Rete indisponibile") : null }).then(ok) };
  return b;
} } }));
function mount(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}
beforeEach(() => { vi.clearAllMocks(); Object.assign(state, { loading: false, write: true, error: false, deletedError: false }); vi.spyOn(window, "confirm").mockImplementation(state.confirm); state.confirm.mockReturnValue(false); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
describe("Personalizzazione: accessi, errori e bozze", () => {
  it("pipeline non modificabili prima della lettura permessi", async () => {
    state.loading = true; mount(<PipelinesConfig />);
    await screen.findByText("Nessuna pipeline creata");
    expect(screen.queryByRole("button", { name: "Nuova pipeline" })).not.toBeInTheDocument();
  });
  it("chiudere una pipeline modificata non perde la bozza", async () => {
    mount(<PipelinesConfig />); fireEvent.click(await screen.findByRole("button", { name: "Nuova pipeline" }));
    fireEvent.change(screen.getByLabelText("Nome della pipeline"), { target: { value: "Mia pipeline" } });
    fireEvent.click(screen.getByRole("button", { name: "Annulla" }));
    expect(state.confirm).toHaveBeenCalled(); expect(screen.getByRole("dialog")).toBeInTheDocument(); expect(state.writes).not.toHaveBeenCalled();
  });
  it("pipeline in errore: Riprova, non una falsa lista vuota", async () => {
    state.error = true; mount(<PipelinesConfig />);
    await screen.findByText("Pipeline non disponibili");
    expect(screen.queryByText("Nessuna pipeline creata")).not.toBeInTheDocument(); expect(state.writes).not.toHaveBeenCalled();
  });
  it("campo modificato resta aperto se si annulla l'uscita", async () => {
    mount(<CustomFieldsConfig />);
    const add = screen.getByRole("button", { name: "Aggiungi campo" });
    await waitFor(() => expect(add).toBeEnabled()); fireEvent.click(add);
    fireEvent.change(screen.getByPlaceholderText("es. Tipo di caldaia"), { target: { value: "Potenza" } });
    fireEvent.click(screen.getByRole("button", { name: "Annulla" }));
    expect(state.confirm).toHaveBeenCalled(); expect(screen.getByDisplayValue("Potenza")).toBeInTheDocument(); expect(state.writes).not.toHaveBeenCalled();
  });
  it("i campi sono in sola lettura mentre si caricano i permessi", async () => {
    state.loading = true; mount(<CustomFieldsConfig />);
    // «ID Contatto» ora compare due volte nella prima pagina (Contatto e Opportunità: «Contact ID» è stato tradotto):
    // basta che il dizionario sia disegnato.
    expect((await screen.findAllByText("ID Contatto")).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Aggiungi campo" })).not.toBeInTheDocument();
  });
  // La prova «errore cartelle distingue indisponibilità da nessuna cartella» è stata tolta il 10/10/2026 insieme alla
  // scheda «Cartelle» (nessun codice leggeva le cartelle dei campi). Che la scheda e i tre controlli morti non ci siano
  // più lo prova campiPersonalizzatiOnesti.test.tsx.
  it("errore archivio campi non viene mostrato come nessun campo eliminato", async () => {
    state.deletedError = true; mount(<CustomFieldsConfig />);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Campi eliminati" }), { button: 0, ctrlKey: false });
    await screen.findByText("Impossibile leggere i campi eliminati.");
    expect(screen.queryByText("Nessun campo eliminato")).not.toBeInTheDocument();
  });
});
