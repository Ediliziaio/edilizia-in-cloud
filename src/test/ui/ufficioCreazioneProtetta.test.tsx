import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { OfficeWorkspace } from "@/components/orders/OfficeWorkspace";
const state = vi.hoisted(() => ({ insert: vi.fn(), response: null as Promise<unknown> | null, error: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "demo-company" }, user: { id: "me" }, role: "company_admin", profile: { first_name: "Demo", last_name: "Utente" } }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canEditOrders: true }) }));
vi.mock("@/components/orders/PlaybookEditorDialog", () => ({ PlaybookEditorDialog: (): null => null }));
vi.mock("@/components/orders/OfficeTemplateApplyDialog", () => ({ OfficeTemplateApplyDialog: (): null => null }));
vi.mock("@/lib/taskActivityLog", () => ({ logTaskActivity: vi.fn().mockResolvedValue(undefined) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: state.error } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: async () => ({ data: [] as unknown[], error: null as null }),
  from: () => {
    const q: Record<string, unknown> = {};
    for (const name of ["select", "eq", "order", "range", "in"]) q[name] = () => q;
    q.insert = (payload: unknown) => { state.insert(payload); return q; };
    q.single = () => state.response;
    q.then = (ok: (value: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok);
    return q;
  },
} }));
beforeEach(() => { state.insert.mockClear(); state.error.mockClear(); state.response = Promise.resolve({ data: { id: "new-demo" }, error: null }); vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} }); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
async function setup() {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><OfficeWorkspace orderId="order-demo" /></QueryClientProvider>);
  fireEvent.click(await screen.findByRole("button", { name: "Nuova attività d’ufficio" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Cosa c’è da fare" }), { target: { value: "Bozza demo" } });
  return document.getElementById("nuova-attivita-ufficio")!;
}
it("un doppio submit crea una sola attività e blocca campi/chiusura durante la richiesta", async () => {
  let finish!: (value: unknown) => void;
  state.response = new Promise(resolve => { finish = resolve; });
  const form = await setup();
  act(() => { fireEvent.submit(form); fireEvent.submit(form); });
  await waitFor(() => expect(state.insert).toHaveBeenCalledTimes(1));
  expect(state.insert).toHaveBeenCalledWith(expect.objectContaining({ company_id: "demo-company", order_id: "order-demo", activity_scope: "ufficio" }));
  expect(screen.getByRole("textbox", { name: "Cosa c’è da fare" })).toBeDisabled();
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
  await waitFor(() => expect(screen.getByRole("textbox", { name: "Cosa c’è da fare" })).toBeEnabled());
  expect(screen.getByRole("textbox", { name: "Cosa c’è da fare" })).toHaveValue("Bozza demo");
  state.response = Promise.resolve({ data: { id: "new-demo" }, error: null });
  fireEvent.submit(form);
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(state.insert).toHaveBeenCalledTimes(2);
});
