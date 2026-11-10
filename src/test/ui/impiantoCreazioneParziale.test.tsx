import { useState } from "react";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const api = vi.hoisted(() => ({ impianti: vi.fn(), readImpianto: vi.fn(), contratti: vi.fn(), readContratto: vi.fn(), piani: vi.fn(), tickets: vi.fn(), success: vi.fn(), error: vi.fn(), completed: vi.fn() }));
vi.mock("@tanstack/react-query", async (original) => ({ ...await original<typeof import("@tanstack/react-query")>(), useQuery: () => ({ data: [] as unknown[] }) }));
vi.mock("@/hooks/useCompanyCustomers", () => ({ useCompanyCustomers: () => ({ data: [{ id: "cliente-test", first_name: "Cliente", last_name: "test" }] }) }));
vi.mock("@/hooks/useCompanyStaffUsers", () => ({ useCompanyStaffUsers: () => ({ data: [] as unknown[] }) }));
vi.mock("@/lib/manutenzione/tipiManutenzione", () => ({ useTipiImpianto: () => ({ data: [] as unknown[] }), useTipiIntervento: () => ({ data: [] as unknown[] }) }));
vi.mock("@/lib/manutenzione/prezzoIntervento", () => ({ usePrezzoIntervento: () => ({ data: null as null, isFetching: false }) }));
vi.mock("@/components/orders/CreateCustomerDialog", () => ({ CreateCustomerDialog: (): null => null }));
vi.mock("sonner", () => ({ toast: { success: api.success, error: api.error } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (table: string) => {
  if (table === "impianti_cliente") return { insert: (payload: unknown) => { api.impianti(payload); return { select: () => ({ single: api.readImpianto }) }; } };
  if (table === "contratti_manutenzione") return { insert: (payload: unknown) => { api.contratti(payload); return { select: () => ({ single: api.readContratto }) }; } };
  if (table === "piani_manutenzione") return { insert: api.piani };
  if (table === "tickets") return { insert: api.tickets };
  throw new Error(`Tabella inattesa: ${table}`);
} } }));
import { NuovoImpiantoWizard } from "@/components/manutenzione/NuovoImpiantoWizard";
function Form() { const [open, setOpen] = useState(true); return <NuovoImpiantoWizard open={open} onClose={() => setOpen(false)} companyId="company-test" onSuccess={api.completed} />; }
const originalFocus = HTMLElement.prototype.focus;
let focusDepth = 0;
const pointerDescriptors = new Map<string, PropertyDescriptor | undefined>();
beforeAll(() => {
  // JSDOM: i due FocusScope Radix (dialog + select) possono richiamarsi in ciclo.
  // Il percorso nel browser reale è verificato separatamente con CUA.
  HTMLElement.prototype.focus = function (this: HTMLElement, options?: FocusOptions) {
    if (focusDepth >= 3) return;
    focusDepth++;
    try { originalFocus.call(this, options); } finally { focusDepth--; }
  };
  for (const [name, value] of Object.entries({ hasPointerCapture: (): boolean => false, releasePointerCapture: () => {}, setPointerCapture: () => {}, scrollIntoView: () => {} })) {
    pointerDescriptors.set(name, Object.getOwnPropertyDescriptor(Element.prototype, name));
    Object.defineProperty(Element.prototype, name, { configurable: true, writable: true, value });
  }
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
});
afterAll(() => {
  HTMLElement.prototype.focus = originalFocus;
  for (const [name, descriptor] of pointerDescriptors) {
    if (descriptor) Object.defineProperty(Element.prototype, name, descriptor);
    else Reflect.deleteProperty(Element.prototype, name);
  }
  vi.unstubAllGlobals();
});
beforeEach(() => {
  vi.clearAllMocks();
  api.readImpianto.mockReset().mockImplementation(async () => ({ data: { id: `impianto-${api.impianti.mock.calls.length}` }, error: null as null }));
  api.readContratto.mockReset().mockImplementation(async () => ({ data: { id: `contratto-${api.contratti.mock.calls.length}` }, error: null as null }));
  api.piani.mockReset().mockResolvedValue({ error: null as null });
  api.tickets.mockReset().mockResolvedValue({ error: null as null });
});
afterEach(cleanup);
async function scegli(label: string, option: string | RegExp) {
  fireEvent.pointerDown(screen.getByRole("combobox", { name: label }), { button: 0, ctrlKey: false, pointerType: "mouse" });
  fireEvent.click(await screen.findByRole("option", { name: option }));
}
async function setup() {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}><Form /></QueryClientProvider>);
  await scegli("Cliente *", "Cliente test"); await scegli("Tipo impianto *", /Infissi/);
  fireEvent.click(screen.getByRole("button", { name: /Avanti/ }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Aggiungi piano di manutenzione" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Programma il primo intervento" }));
  fireEvent.change(screen.getByLabelText(/^Data e ora/), { target: { value: "2030-01-15T10:00" } });
  fireEvent.click(screen.getByRole("button", { name: /Avanti/ }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Crea contratto di manutenzione" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Nome contratto" }), { target: { value: "Contratto locale test" } });
  fireEvent.change(screen.getByRole("spinbutton", { name: "Importo canone (€)" }), { target: { value: "100" } });
}
it("riprende il primo intervento fallito senza ricreare impianto, contratto e piano", async () => {
  api.tickets.mockResolvedValueOnce({ error: new Error("Intervento offline") });
  await setup();
  fireEvent.click(screen.getByRole("button", { name: "Salva Impianto" }));
  await waitFor(() => expect(api.error).toHaveBeenCalled());
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("già stato registrato"));
  expect(screen.getByRole("textbox", { name: "Nome contratto" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: /Salva Impianto|Completa impianto/ }));
  await waitFor(() => expect(api.completed).toHaveBeenCalledOnce());
  expect(api.impianti).toHaveBeenCalledOnce(); expect(api.contratti).toHaveBeenCalledOnce(); expect(api.piani).toHaveBeenCalledOnce(); expect(api.tickets).toHaveBeenCalledTimes(2);
});
it("riprende un piano fallito mantenendo il contratto già registrato", async () => {
  api.piani.mockResolvedValueOnce({ error: new Error("Piano offline") });
  await setup();
  fireEvent.click(screen.getByRole("button", { name: "Salva Impianto" }));
  await waitFor(() => expect(api.error).toHaveBeenCalled());
  fireEvent.click(screen.getByRole("button", { name: /Salva Impianto|Completa impianto/ }));
  await waitFor(() => expect(api.completed).toHaveBeenCalledOnce());
  expect(api.impianti).toHaveBeenCalledOnce(); expect(api.contratti).toHaveBeenCalledOnce();
  expect(api.piani.mock.calls.map(([row]) => row.contratto_id)).toEqual(["contratto-1", "contratto-1"]);
});
it("blocca il doppio salvataggio e la chiusura finché la richiesta è in corso", async () => {
  let resolve!: (value: { data: { id: string }; error: null }) => void;
  api.readImpianto.mockImplementation(() => new Promise<{ data: { id: string }; error: null }>((done) => { resolve = done; }));
  await setup();
  const save = screen.getByRole("button", { name: "Salva Impianto" }); fireEvent.click(save); fireEvent.click(save);
  await waitFor(() => expect(api.impianti).toHaveBeenCalledOnce());
  expect(screen.getByRole("textbox", { name: "Nome contratto" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Chiudi" })); fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  await act(async () => { resolve({ data: { id: "impianto-1" }, error: null }); });
  await waitFor(() => expect(api.completed).toHaveBeenCalledOnce());
});

it("richiede data e ora quando si sceglie di programmare il primo intervento", async () => {
  render(<QueryClientProvider client={new QueryClient()}><Form /></QueryClientProvider>);
  await scegli("Cliente *", "Cliente test"); await scegli("Tipo impianto *", /Infissi/);
  fireEvent.click(screen.getByRole("button", { name: /Avanti/ }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Programma il primo intervento" }));
  expect(screen.getByRole("button", { name: /Avanti/ })).toBeDisabled();
  expect(screen.getByText("Indica data e ora per programmare il primo intervento.")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText(/^Data e ora/), { target: { value: "2030-01-15T10:00" } });
  expect(screen.getByRole("button", { name: /Avanti/ })).toBeEnabled();
  expect(api.impianti).not.toHaveBeenCalled();
});
