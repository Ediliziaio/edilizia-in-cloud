import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AppointmentDialog } from "@/components/appointments/AppointmentDialog";
const state = vi.hoisted(() => ({ insert: vi.fn(), response: null as unknown as Promise<unknown>, readonly: false }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "demo" }, user: { id: "utente-demo" } }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ onlyAssigned: false, solaLettura: state.readonly }) }));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: [] as unknown[] }), useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock("@/hooks/useCompanyStaffUsers", () => ({ useCompanyStaffUsers: () => ({ data: [] as unknown[] }) }));
vi.mock("@/hooks/useMembriMieSquadre", () => ({ useMembriMieSquadre: () => ({ data: [] as unknown[] }) }));
vi.mock("@/hooks/useGoogleCalendarSync", () => ({ useGoogleCalendarSync: () => ({ hasAnyCompanyGoogleConnection: false }) }));
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));
vi.mock("@/components/shared/EntityCustomFieldsSection", () => ({ EntityCustomFieldsSection: (): null => null }));
vi.mock("@/components/shared/AddressAutocomplete", () => ({ default: (): null => null, emptyAddress: { formatted_address: "", address_line: "", address_city: "", address_postal_code: "", address_province: "", address_country: "IT", address_notes: "", place_id: "", lat: null, lng: null } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => {
  const q = { insert: (payload: unknown) => { state.insert(payload); return q; }, select: () => q, single: () => state.response };
  return q;
} } }));
let finishSave: (value: unknown) => void;
beforeEach(() => { state.insert.mockClear(); state.readonly = false; state.response = new Promise(resolve => { finishSave = resolve; }); });
afterEach(cleanup);

it("nomina i controlli e mantiene il modulo stabile durante il salvataggio", async () => {
  const onSaved = vi.fn(); const onOpenChange = vi.fn();
  render(<AppointmentDialog open showOrderSelect onOpenChange={onOpenChange} onSaved={onSaved} defaultTitle="Appuntamento di prova" defaultDate="2026-11-09" />);
  for (const name of ["Tipo", "Assegna a", "Durata", "Tipo riferimento"]) expect(screen.getByRole("combobox", { name })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Crea appuntamento" }));
  expect(screen.getByLabelText("Titolo *")).toBeDisabled();
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  expect(onOpenChange).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Salvataggio..." }));
  expect(state.insert).toHaveBeenCalledTimes(1);
  finishSave({ data: { id: "demo-salvato" }, error: null });
  await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  expect(onOpenChange).toHaveBeenCalledWith(false);
});
it("in sola lettura i campi e il salvataggio sono disabilitati", () => {
  state.readonly = true;
  render(<AppointmentDialog open onOpenChange={vi.fn()} onSaved={vi.fn()} defaultTitle="Appuntamento" defaultDate="2026-11-09" />);
  expect(screen.getByLabelText("Titolo *")).toBeDisabled();
  expect(screen.getByRole("combobox", { name: "Tipo" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Crea appuntamento" })).toBeDisabled();
  expect(state.insert).not.toHaveBeenCalled();
});
