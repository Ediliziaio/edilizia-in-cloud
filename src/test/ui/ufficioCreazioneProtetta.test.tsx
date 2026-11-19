import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { setupRadixMenus, scegliNelMenu } from "@/test/helpers/radixMenus";
setupRadixMenus();
import { OfficeWorkspace } from "@/components/orders/OfficeWorkspace";
const state = vi.hoisted(() => ({ insert: vi.fn(), response: null as Promise<unknown> | null, error: vi.fn(), offices: [] as { id: string; nome: string; membri: string[] }[], officeError: false }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "demo-company" }, user: { id: "me" }, role: "company_admin", profile: { first_name: "Demo", last_name: "Utente" } }) }));
vi.mock("@/hooks/useUffici", () => ({ useUfficiAttivi: () => ({ data: state.offices, isLoading: false, isError: state.officeError, refetch: vi.fn() }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canEditOrders: true }) }));
vi.mock("@/components/orders/PlaybookEditorDialog", () => ({ PlaybookEditorDialog: (): null => null }));
vi.mock("@/components/orders/OfficeTemplateApplyDialog", () => ({ OfficeTemplateApplyDialog: (): null => null }));
vi.mock("@/lib/taskActivityLog", () => ({ logTaskActivity: vi.fn().mockResolvedValue(undefined) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: state.error } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: async () => ({ data: [{ id: "anna", first_name: "Anna", last_name: "Rossi", roles: ["company_staff"] }], error: null as null }),
  from: () => {
    const q: Record<string, unknown> = {};
    for (const name of ["select", "eq", "order", "range", "in"]) q[name] = () => q;
    q.insert = (payload: unknown) => { state.insert(payload); return q; };
    q.single = () => state.response;
    q.then = (ok: (value: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok);
    return q;
  },
} }));
beforeEach(() => { state.offices = [{ id: "technical", nome: "Tecnico", membri: ["me", "anna"] }, { id: "admin", nome: "Amministrazione", membri: ["anna"] }]; state.officeError = false; state.insert.mockClear(); state.error.mockClear(); state.response = Promise.resolve({ data: { id: "new-demo" }, error: null }); vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} }); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
async function setup() {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><OfficeWorkspace orderId="order-demo" /></QueryClientProvider>);
  fireEvent.click(await screen.findByRole("button", { name: "Nuova attività d’ufficio" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Titolo *" }), { target: { value: "Bozza demo" } });
  await waitFor(() => expect(screen.getByRole("button", { name: "Crea attività" })).toBeEnabled());
  return document.getElementById("nuova-attivita-ufficio")!;
}
it("un doppio submit crea una sola attività e blocca campi/chiusura durante la richiesta", async () => {
  let finish!: (value: unknown) => void;
  state.response = new Promise(resolve => { finish = resolve; });
  const form = await setup();
  act(() => { fireEvent.submit(form); fireEvent.submit(form); });
  await waitFor(() => expect(state.insert).toHaveBeenCalledTimes(1));
  expect(state.insert).toHaveBeenCalledWith(expect.objectContaining({ company_id: "demo-company", order_id: "order-demo", activity_scope: "ufficio" }));
  expect(screen.getByRole("textbox", { name: "Titolo *" })).toBeDisabled();
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  finish({ data: { id: "new-demo" }, error: null });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});
it("un errore lascia i dati della bozza e sblocca il tentativo successivo", async () => {
  state.response = Promise.resolve({ data: null, error: { message: "offline" } });
  const form = await setup();
  fireEvent.submit(form);
  await waitFor(() => expect(state.error).toHaveBeenCalled());
  await waitFor(() => expect(screen.getByRole("textbox", { name: "Titolo *" })).toBeEnabled());
  expect(screen.getByRole("textbox", { name: "Titolo *" })).toHaveValue("Bozza demo");
  state.response = Promise.resolve({ data: { id: "new-demo" }, error: null });
  fireEvent.submit(form);
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(state.insert).toHaveBeenCalledTimes(2);
});

it("salva l’area nella stessa attività della commessa, senza assegnarla all’autore", async () => {
  const form = await setup();
  await scegliNelMenu("Area / Ufficio", "Tecnico");
  expect(screen.getByRole("combobox", { name: "Assegna a" })).toHaveTextContent("Da prendere in carico");
  fireEvent.submit(form);
  await waitFor(() => expect(state.insert).toHaveBeenCalledWith(expect.objectContaining({ order_id: "order-demo", activity_scope: "ufficio", ufficio_id: "technical", assigned_to: null })));
});
it("salva insieme area e persona e azzera la persona quando cambia area", async () => {
  const form = await setup();
  await scegliNelMenu("Area / Ufficio", "Tecnico");
  await scegliNelMenu("Assegna a", "Me stesso");
  await scegliNelMenu("Area / Ufficio", "Amministrazione");
  expect(screen.getByRole("combobox", { name: "Assegna a" })).toHaveTextContent("Da prendere in carico");
  await scegliNelMenu("Assegna a", "Anna Rossi");
  fireEvent.submit(form);
  await waitFor(() => expect(state.insert).toHaveBeenCalledWith(expect.objectContaining({ ufficio_id: "admin", assigned_to: "anna" })));
});
it("un errore delle aree impedisce il salvataggio e conserva la bozza", async () => {
  const form = await setup();
  state.officeError = true;
  fireEvent.change(screen.getByRole("textbox", { name: "Titolo *" }), { target: { value: "Bozza con area da controllare" } });
  expect(screen.getByRole("button", { name: "Crea attività" })).toBeDisabled();
  fireEvent.submit(form);
  await waitFor(() => expect(state.error).toHaveBeenCalled());
  expect(state.insert).not.toHaveBeenCalled();
  expect(screen.getByRole("textbox", { name: "Titolo *" })).toHaveValue("Bozza con area da controllare");
});
