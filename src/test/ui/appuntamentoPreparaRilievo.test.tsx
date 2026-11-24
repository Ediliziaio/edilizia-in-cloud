import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AppointmentDialog } from "@/components/appointments/AppointmentDialog";

/**
 * «Fissa sopralluogo» prima creava solo l'appuntamento: il tecnico non aveva niente da
 * compilare. Ora, salvando, il rilievo nasce con l'appuntamento (piano sopralluoghi, lotto 1).
 */
const state = vi.hoisted(() => ({
  rpc: vi.fn(),
  rpcErrore: null as null | { message: string },
  esistente: null as null | { id: string; code: string },
}));
const toast = vi.hoisted(() => vi.fn());
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "demo" }, user: { id: "utente-demo" } }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ onlyAssigned: false, solaLettura: false, canViewSopralluoghi: true }) }));
vi.mock("@/hooks/useFeatureFlags", () => ({ useFeatureFlags: () => ({ isFeatureEnabled: (k: string) => k === "surveys_module" }) }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey, enabled }: { queryKey: unknown[]; enabled?: boolean }) => {
    if (enabled === false) return { data: undefined, isLoading: false };
    if (queryKey[0] === "rilievo-appuntamento-modelli") {
      return { data: { righe: [{ id: "m1", name: "Rilievo Bagno", category: "bagno" }, { id: "m2", name: "Rilievo Infissi", category: "infissi" }], ultimo: "m2" }, isLoading: false };
    }
    if (queryKey[0] === "rilievo-appuntamento") return { data: state.esistente, isLoading: false };
    return { data: [] as unknown[] };
  },
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("@/hooks/useCompanyStaffUsers", () => ({ useCompanyStaffUsers: () => ({ data: [] as unknown[] }) }));
vi.mock("@/hooks/useMembriMieSquadre", () => ({ useMembriMieSquadre: () => ({ data: [] as unknown[] }) }));
vi.mock("@/hooks/useGoogleCalendarSync", () => ({ useGoogleCalendarSync: () => ({ hasAnyCompanyGoogleConnection: false }) }));
vi.mock("@/hooks/use-toast", () => ({ toast }));
vi.mock("@/components/shared/EntityCustomFieldsSection", () => ({ EntityCustomFieldsSection: (): null => null }));
vi.mock("@/components/shared/AddressAutocomplete", () => ({ default: (): null => null, emptyAddress: { formatted_address: "", address_line: "", address_city: "", address_postal_code: "", address_province: "", address_country: "IT", address_notes: "", place_id: "", lat: null, lng: null } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: () => {
    const q = { insert: () => q, update: () => q, eq: () => q, select: () => q, single: async (): Promise<{ data: { id: string }; error: { message: string } | null }> => ({ data: { id: "app-1" }, error: null }) };
    return q;
  },
  rpc: async (nome: string, args: unknown): Promise<{ data: string | null; error: { message: string } | null }> => {
    state.rpc(nome, args);
    return state.rpcErrore ? { data: null, error: state.rpcErrore } : { data: "rilievo-1", error: null };
  },
} }));

// La tendina di Radix in jsdom vuole questi due metodi.
Element.prototype.scrollIntoView ??= vi.fn();
Element.prototype.hasPointerCapture ??= vi.fn(() => false);
beforeEach(() => { state.rpc.mockClear(); state.rpcErrore = null; state.esistente = null; toast.mockClear(); });
afterEach(cleanup);

const apri = (tipo: string) => {
  const onSaved = vi.fn();
  render(<MemoryRouter><AppointmentDialog open onOpenChange={vi.fn()} onSaved={onSaved} defaultTitle="Sopralluogo" defaultDate="2026-12-01"
    defaultAppointmentType={tipo} showOrderSelect={false} hideMarketingFields /></MemoryRouter>);
  return onSaved;
};

it("rilievo tecnico: spunta accesa, propone l'ultimo modello usato, salvando prepara il rilievo", async () => {
  const onSaved = apri("rilievo_tecnico");
  const spunta = screen.getByRole("checkbox", { name: "Prepara il rilievo per il tecnico" });
  expect(spunta).toBeChecked();
  expect(screen.getByRole("combobox", { name: "Modello del rilievo" }).textContent).toContain("Rilievo Infissi");
  fireEvent.click(screen.getByRole("button", { name: "Crea appuntamento" }));
  await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  expect(state.rpc).toHaveBeenCalledWith("sopralluogo_da_appuntamento", { p_appointment: "app-1", p_template: "m2", p_tipo: "tecnico", p_app_operai: true, p_su_carta: false });
  expect(toast).toHaveBeenCalledWith({ title: "Rilievo pronto per il tecnico" });
});

it("sopralluogo commerciale: spunta spenta, nessun rilievo se non la si accende", async () => {
  const onSaved = apri("sopralluogo_preventivo");
  expect(screen.getByRole("checkbox", { name: "Prepara il rilievo commerciale" })).not.toBeChecked();
  fireEvent.click(screen.getByRole("button", { name: "Crea appuntamento" }));
  await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  expect(state.rpc).not.toHaveBeenCalled();
});

it("accesa a mano sul commerciale, il rilievo nasce commerciale", async () => {
  const onSaved = apri("sopralluogo_preventivo");
  fireEvent.click(screen.getByRole("checkbox", { name: "Prepara il rilievo commerciale" }));
  fireEvent.click(screen.getByRole("button", { name: "Crea appuntamento" }));
  await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  expect(state.rpc).toHaveBeenCalledWith("sopralluogo_da_appuntamento", expect.objectContaining({ p_tipo: "commerciale" }));
});

it("se il rilievo non si prepara, l'appuntamento resta salvato e lo si dice", async () => {
  state.rpcErrore = { message: "Modello di sopralluogo non disponibile" };
  const onSaved = apri("rilievo_tecnico");
  fireEvent.click(screen.getByRole("button", { name: "Crea appuntamento" }));
  await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Appuntamento salvato, rilievo non preparato", description: "Modello di sopralluogo non disponibile" }));
});

it("un appuntamento qualunque non mostra il riquadro", () => {
  apri("generico");
  expect(screen.queryByRole("checkbox", { name: /Prepara il rilievo/ })).toBeNull();
});

it("su carta: si sceglie nella tendina e il rilievo nasce senza modulo", async () => {
  const onSaved = apri("rilievo_tecnico");
  fireEvent.click(screen.getByRole("combobox", { name: "Modello del rilievo" }));
  fireEvent.click(await screen.findByRole("option", { name: "Su carta: foto e PDF del foglio" }));
  expect(screen.getByText(/il tecnico fotografa il foglio dall'app/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Crea appuntamento" }));
  await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  expect(state.rpc).toHaveBeenCalledWith("sopralluogo_da_appuntamento", { p_appointment: "app-1", p_template: null, p_tipo: "tecnico", p_app_operai: true, p_su_carta: true });
});
