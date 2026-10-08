import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CompanyProfileForm } from "@/components/settings/CompanyProfileForm";

const state = vi.hoisted(() => ({
  company: { id: "company-1", business_name: "Impresa Demo", sector: "ristrutturazioni", phone: "123", operational_address: "Via Roma 1", operational_city: "Milano", operational_province: "MI", operational_postal_code: "20100" },
  prefixError: false, writeError: false, updates: [] as Record<string, unknown>[],
  geocode: vi.fn(async (): Promise<null> => null), refresh: vi.fn(async (): Promise<void> => {}), success: vi.fn(), error: vi.fn(),
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: state.company, refreshAuth: state.refresh }) }));
vi.mock("@/lib/geocoding", () => ({ forwardGeocode: state.geocode }));
vi.mock("sonner", () => ({ toast: { success: state.success, error: state.error } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => {
  const builder = {
    select: () => builder, eq: () => builder,
    maybeSingle: async () => ({ data: state.prefixError ? null : { order_code_prefix: "DEMO" }, error: state.prefixError ? { message: "read error" } : null }),
    update: (value: Record<string, unknown>) => { state.updates.push(value); return builder; },
    single: async () => ({ data: state.writeError ? null : { id: state.company.id }, error: state.writeError ? { message: "denied" } : null }),
  };
  return builder;
} } }));
beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  state.prefixError = false; state.writeError = false; state.updates.length = 0;
  state.company = { id: "company-1", business_name: "Impresa Demo", sector: "ristrutturazioni", phone: "123", operational_address: "Via Roma 1", operational_city: "Milano", operational_province: "MI", operational_postal_code: "20100" };
  state.refresh.mockClear(); state.geocode.mockClear(); state.success.mockClear(); state.error.mockClear();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
async function loaded() {
  await waitFor(() => expect(screen.getByLabelText(/Prefisso Codice Commessa/)).toHaveValue("DEMO"));
}

describe("Profilo aziendale: bozza e aggiornamenti parziali", () => {
  it("al caricamento non segnala modifiche inesistenti", async () => {
    render(<CompanyProfileForm />); await loaded();
    expect(screen.getByRole("button", { name: "Salva Dati Aziendali" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Nessuna modifica");
  });
  it("modificare il telefono non riscrive indirizzi o altri campi", async () => {
    render(<CompanyProfileForm />); await loaded();
    fireEvent.change(screen.getByLabelText("Telefono"), { target: { value: "456" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva Dati Aziendali" }));
    await waitFor(() => expect(state.success).toHaveBeenCalledOnce());
    expect(state.updates).toEqual([{ phone: "456" }]);
    expect(state.geocode).not.toHaveBeenCalled();
  });
  it("il refetch non cancella un telefono ancora da salvare", async () => {
    const { rerender } = render(<CompanyProfileForm />); await loaded();
    fireEvent.change(screen.getByLabelText("Telefono"), { target: { value: "456" } });
    state.company = { ...state.company, phone: "789" };
    rerender(<CompanyProfileForm />);
    expect(screen.getByLabelText("Telefono")).toHaveValue("456");
  });
  it("se il prefisso non si carica non lo sostituisce con un valore predefinito", async () => {
    state.prefixError = true;
    render(<CompanyProfileForm />);
    await screen.findByText(/Prefisso commessa non caricato/);
    expect(screen.getByLabelText(/Prefisso Codice Commessa/)).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Telefono"), { target: { value: "456" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva Dati Aziendali" }));
    await waitFor(() => expect(state.success).toHaveBeenCalledOnce());
    expect(state.updates).toEqual([{ phone: "456" }]);
  });
  it("non conserva coordinate obsolete se cambia l'indirizzo e la geocodifica fallisce", async () => {
    render(<CompanyProfileForm />); await loaded();
    fireEvent.change(screen.getByLabelText("Indirizzo", { selector: "#operationalAddress" }), { target: { value: "Via Nuova 2" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva Dati Aziendali" }));
    await waitFor(() => expect(state.success).toHaveBeenCalledOnce());
    expect(state.updates).toEqual([{ operational_address: "Via Nuova 2", operational_lat: null, operational_lng: null }]);
  });
  it("un errore di salvataggio mantiene la bozza", async () => {
    state.writeError = true;
    render(<CompanyProfileForm />); await loaded();
    fireEvent.change(screen.getByLabelText("Telefono"), { target: { value: "456" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva Dati Aziendali" }));
    await waitFor(() => expect(state.error).toHaveBeenCalledOnce());
    expect(screen.getByLabelText("Telefono")).toHaveValue("456");
    expect(screen.getByRole("status")).toHaveTextContent("Modifiche non salvate");
    expect(state.success).not.toHaveBeenCalled();
  });
});
