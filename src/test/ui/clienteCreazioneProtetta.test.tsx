import { afterEach, beforeEach, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
const state = vi.hoisted(() => ({ readonly: false, invoke: vi.fn(), toast: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "company-test", customer_portal_enabled: false }, user: { id: "user-test" } }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ solaLettura: state.readonly, canEditCustomers: true, isAdmin: true, isLoading: false }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: state.toast }) }));
vi.mock("@/hooks/useAppaltatoreModule", () => ({ useAppaltatoreModuleEnabled: () => false }));
vi.mock("@/hooks/useClientiSimili", () => ({ useClientiSimili: () => ({ simili: [] as unknown[] }) }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: state.invoke } } }));
vi.mock("@/utils/logger", () => ({ logger: { error: vi.fn() } }));
vi.mock("@/components/clients/DocumentiClienteInput", () => ({ DocumentiClienteInput: (): null => null }));
vi.mock("@/components/customers/CustomerAddressFields", () => ({
 CustomerAddressFields: (): null => null,
 makeEmptyCustomerAddresses: () => ({ billing: {}, site: {} }),
 billingToProfileFields: () => ({}), siteToProfileFields: () => ({}),
}));
import CreateCustomer from "@/pages/azienda/CreateCustomer";
beforeEach(() => { vi.clearAllMocks(); state.invoke.mockReset(); state.readonly = false; });
afterEach(cleanup);
function openForm() {
 render(<MemoryRouter><CreateCustomer /></MemoryRouter>);
 fireEvent.change(screen.getByRole("textbox", { name: "Nome *" }), { target: { value: "Mario" } });
 fireEvent.change(screen.getByRole("textbox", { name: "Cognome *" }), { target: { value: "Rossi" } });
 return screen.getByRole("button", { name: "Crea cliente" }).closest("form")!;
}
it("blocca invii ripetuti, campi e ritorno durante creazione e dopo il successo", async () => {
 let finish!: (value: unknown) => void;
 state.invoke.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
 const form = openForm();
 fireEvent.submit(form); fireEvent.submit(form);
 expect(state.invoke).toHaveBeenCalledOnce();
 expect(screen.getByRole("textbox", { name: "Nome *" })).toBeDisabled();
 expect(screen.getByRole("button", { name: "Torna indietro" })).toBeDisabled();
 expect(screen.getByRole("button", { name: "Annulla" })).toBeDisabled();
 finish({ data: { customer_id: "created", portal_account_created: false, welcome_email_sent: false }, error: null });
 await screen.findByRole("heading", { name: "Cliente creato con successo" });
 fireEvent.submit(form);
 expect(state.invoke).toHaveBeenCalledOnce();
 expect(state.invoke.mock.calls[0][1].body).toMatchObject({ create_portal_account: false, send_welcome_email: false });
});
it("dopo un errore conserva il modulo e permette una nuova creazione", async () => {
 state.invoke.mockRejectedValueOnce(new Error("Connessione assente")).mockResolvedValueOnce({ data: { customer_id: "created" }, error: null });
 const form = openForm();
 fireEvent.submit(form);
 await waitFor(() => expect(state.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Errore" })));
 expect(screen.getByRole("textbox", { name: "Nome *" })).toHaveValue("Mario");
 expect(screen.getByRole("button", { name: "Crea cliente" })).toBeEnabled();
 fireEvent.submit(form);
 await screen.findByRole("heading", { name: "Cliente creato con successo" });
 expect(state.invoke).toHaveBeenCalledTimes(2);
});
it("in sola lettura non crea clienti anche se viene inviato il form", () => {
 state.readonly = true;
 const form = openForm();
 expect(screen.getByRole("button", { name: "Crea cliente" })).toBeDisabled();
 fireEvent.submit(form);
 expect(state.invoke).not.toHaveBeenCalled();
});
