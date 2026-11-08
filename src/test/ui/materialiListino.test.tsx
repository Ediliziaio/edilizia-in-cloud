import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import SettingsCatalog from "@/pages/azienda/settings/SettingsCatalog";
import type { MaterialeListino } from "@/hooks/useMaterialiListino";

const state = vi.hoisted(() => ({ company: "a", edit: true, rows: [] as MaterialeListino[], updates: [] as Array<{ values: Record<string, unknown>; filters: Record<string, unknown> }>, error: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ role: "company_staff", effectiveCompany: { id: state.company } }) }));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => state.company }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canViewSettingsPricing: true, canEditSettingsPricing: state.edit }) }));
vi.mock("@/hooks/useFamilies", () => ({ useFamilies: () => ({ families: [] as unknown[], isLoading: false }) }));
vi.mock("@/components/listino/FamilyCatalog", () => ({ FamilyCatalog: () => <p>Prodotti con varianti</p> }));
vi.mock("@/components/listino/MacroCategorieManager", () => ({ MacroCategorieManager: (): null => null }));
vi.mock("@/components/listino/ListinoGuide", () => ({ ListinoGuide: (): null => null }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: state.error } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => {
  const filters: Record<string, unknown> = {}; let start = 0, end = Infinity; let values: Record<string, unknown> | null = null;
  const q = {
    select: () => q, eq: (key: string, value: unknown) => { filters[key] = value; return q; },
    is: () => q, order: () => q, abortSignal: () => q,
    range: (from: number, to: number) => { start = from; end = to; return q; },
    update: (data: Record<string, unknown>) => { values = data; return q; },
    single: async () => { state.updates.push({ values: values!, filters }); return { data: { id: filters.id }, error: null }; },
    then: (resolve: (r: unknown) => unknown) => Promise.resolve({ data: state.rows.filter(r => Object.entries(filters).every(([key, value]) => (r as unknown as Record<string, unknown>)[key] === value)).slice(start, end + 1), error: null as null }).then(resolve),
  }; return q;
} } }));

const row = (id: string, extra: Partial<MaterialeListino> = {}): MaterialeListino => ({
  id, company_id: "a", name: "Laterizio " + id, sku: id, category: "Laterizi", supplier_id: "s1",
  suppliers: { name: "Fornace Uno" }, standard_cost: 1.22625, prezzo_acquisto_netto: 1.2263,
  prezzo_vendita: null, unit_of_measure: "pz", vat_rate: null, attivo: true,
  note_interne: "Condizioni da fonte", custom_field_values: { source_file: "listino.pdf", source_page: 2, source_sha256: "hash", import_batch: "lotto" }, ...extra,
});
function open() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter><SettingsCatalog /></MemoryRouter></QueryClientProvider>);
}
beforeEach(() => { state.company = "a"; state.edit = true; state.updates = []; state.error.mockReset(); state.rows = [row("uno"), row("due", { attivo: false, standard_cost: null, prezzo_acquisto_netto: null, supplier_id: "s2", suppliers: { name: "Fornace Due" } }), row("estraneo", { company_id: "b" })]; });
afterEach(cleanup);

describe("Materiali nel Listino", () => {
  it("apre i materiali già importati, mantiene le voci inattive consultabili e filtra per fornitore e stato", async () => {
    open();
    expect(await screen.findByText("Laterizio uno")).toBeInTheDocument();
    expect(screen.queryByText("Laterizio estraneo")).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Materiali e servizi (2)" })).toHaveAttribute("data-state", "active");
    expect(screen.getByText("Laterizio due")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "Fornitore" }), { target: { value: "s2" } });
    expect(screen.queryByText("Laterizio uno")).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "Stato materiale" }), { target: { value: "attivi" } });
    expect(screen.getByText("Nessuna voce corrisponde ai filtri.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Azzera filtri" }));
    expect(screen.getByText("Laterizio uno")).toBeInTheDocument();
  });
  it("legge oltre il limite REST e mantiene la tabella paginata", async () => {
    state.rows = Array.from({ length: 501 }, (_, i) => row(String(i)));
    open();
    expect(await screen.findByText("501 voci su 501 · 501 attive")).toBeInTheDocument();
    expect(screen.getByText("Pagina 1 di 11")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Cerca materiale" }), { target: { value: "Laterizio 500" } });
    expect(screen.getByText("Laterizio 500")).toBeInTheDocument();
  });
  it("la sola consultazione non offre azioni di scrittura", async () => {
    state.edit = false; open();
    fireEvent.click(await screen.findByRole("button", { name: "Apri Laterizio uno" }));
    expect(screen.getByLabelText("Costo netto (€)")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Salva materiale" })).not.toBeInTheDocument();
    expect(state.updates).toHaveLength(0);
  });
  it("richiede il costo per l’attivazione e salva decimali, unità e provenienza nella sola società corrente", async () => {
    open(); fireEvent.click(await screen.findByRole("button", { name: "Apri Laterizio due" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Voce attiva, utilizzabile per nuove righe" }));
    fireEvent.click(screen.getByRole("button", { name: "Salva materiale" }));
    await waitFor(() => expect(state.error).toHaveBeenCalledWith("Per attivare la voce devi confermare il costo netto."));
    expect(state.updates).toHaveLength(0);
    fireEvent.change(screen.getByLabelText("Costo netto (€)"), { target: { value: "1,22625" } });
    fireEvent.change(screen.getByLabelText("Unità di misura"), { target: { value: "m3" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva materiale" }));
    await waitFor(() => expect(state.updates).toHaveLength(1));
    expect(state.updates[0]).toMatchObject({ filters: { company_id: "a", id: "due" }, values: { standard_cost: 1.22625, prezzo_acquisto_netto: 1.22625, unit_of_measure: "m3", prezzo_vendita: null, vat_rate: null, attivo: true, custom_field_values: { source_sha256: "hash", import_batch: "lotto", source_import_cost: null } } });
  });
});
