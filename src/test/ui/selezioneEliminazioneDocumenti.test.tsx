import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const state = vi.hoisted(() => ({ company: "c1", blocked: false, malformed: false, fail: false, rpc: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: state.company } }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: state.rpc } }));
vi.mock("sonner", () => ({ toast: { success: state.success, error: state.error } }));
import { useOperationalDeletion } from "@/hooks/useOperationalDeletion";
function App({ ids = ["a", "b"], enabled = true }: { ids?: string[]; enabled?: boolean }) { const d = useOperationalDeletion("oda", ids.map(id => ({ id, label: `ODA-${id}` })), enabled); return <>{d.enabled && <div>{d.header}{ids.map(id => <div key={id}>{d.checkbox(id, `ODA-${id}`)}</div>)}</div>}{d.toolbar}{d.confirmation}</>; }
function mount() { const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } }); const view = render(<QueryClientProvider client={client}><App /></QueryClientProvider>); return { ...view, update: (ids: string[], enabled = true) => view.rerender(<QueryClientProvider client={client}><App ids={ids} enabled={enabled} /></QueryClientProvider>) }; }
beforeEach(() => {
 state.company = "c1"; state.blocked = false; state.malformed = false; state.fail = false; vi.clearAllMocks();
 state.rpc.mockImplementation(async (_name: string, args: { p_preview: boolean; p_ids: string[] }) => ({ data: state.malformed ? {} : { deleted: args.p_preview ? 0 : args.p_ids.length, documents: args.p_ids.map(id => ({ id, label: `ODA-${id}`, allowed: !state.blocked, reason: state.blocked ? "DDT collegato" : null, version: `v-${id}` })) }, error: state.fail ? { code: "P0001", message: "Documento modificato" } : null }));
});
afterEach(cleanup);
describe("Selezione ed eliminazione documenti", () => {
 it("seleziona la pagina e verifica prima di chiedere la cancellazione definitiva", async () => {
  mount(); fireEvent.click(screen.getByLabelText("Seleziona documenti di questa pagina"));
  expect(screen.getByText("2 documenti selezionati nella pagina corrente")).toBeVisible(); expect(state.rpc).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Elimina selezionati" })); await screen.findByRole("dialog");
  expect(state.rpc).toHaveBeenCalledTimes(1); expect(state.rpc.mock.calls[0][1]).toMatchObject({ p_preview: true, p_company_id: "c1", p_ids: ["a", "b"] });
  fireEvent.click(screen.getByRole("button", { name: "Elimina definitivamente 2 documenti" }));
  await waitFor(() => expect(state.success).toHaveBeenCalled());
  expect(state.rpc.mock.calls[1][1]).toMatchObject({ p_preview: false, p_expected: { a: "v-a", b: "v-b" } });
 });
 it("consente eliminazione singola e annullamento senza inviare la cancellazione", async () => {
  mount(); fireEvent.click(screen.getByLabelText("Seleziona ODA-a")); fireEvent.click(screen.getByRole("button", { name: "Elimina selezionati" })); await screen.findByRole("dialog");
  fireEvent.click(screen.getByRole("button", { name: "Annulla" })); expect(state.rpc).toHaveBeenCalledTimes(1); expect(state.success).not.toHaveBeenCalled();
 });
 it("impedisce di cancellare un lotto con un documento collegato", async () => {
  state.blocked = true; mount(); fireEvent.click(screen.getByLabelText("Seleziona ODA-a")); fireEvent.click(screen.getByRole("button", { name: "Elimina selezionati" })); await screen.findByRole("dialog");
  expect(screen.getByText("DDT collegato")).toBeVisible(); expect(screen.getByRole("button", { name: "Elimina definitivamente 1 documento" })).toBeDisabled(); expect(state.rpc).toHaveBeenCalledTimes(1);
 });
 it("non conserva selezioni nascoste dopo cambio pagina o azienda", () => {
  const view = mount(); fireEvent.click(screen.getByLabelText("Seleziona ODA-a")); view.update(["c"]); expect(screen.queryByRole("region", { name: "Azioni documenti selezionati" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByLabelText("Seleziona ODA-c")); state.company = "c2"; view.update(["c"]); expect(screen.getByLabelText("Seleziona ODA-c")).not.toBeChecked();
 });
 it("non espone selezione e cancellazione senza permesso", () => { const view = mount(); view.update(["a"], false); expect(screen.queryByRole("checkbox")).not.toBeInTheDocument(); expect(state.rpc).not.toHaveBeenCalled(); });
 it("rifiuta una verifica incompleta invece di abilitare la cancellazione", async () => {
  state.malformed = true; mount(); fireEvent.click(screen.getByLabelText("Seleziona ODA-a")); fireEvent.click(screen.getByRole("button", { name: "Elimina selezionati" })); await waitFor(() => expect(state.error).toHaveBeenCalled()); expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
 });
 it("un errore alla conferma non viene presentato come cancellazione riuscita", async () => {
  mount(); fireEvent.click(screen.getByLabelText("Seleziona ODA-a")); fireEvent.click(screen.getByRole("button", { name: "Elimina selezionati" })); await screen.findByRole("dialog"); state.fail = true;
  fireEvent.click(screen.getByRole("button", { name: "Elimina definitivamente 1 documento" })); expect(await screen.findByRole("alert")).toHaveTextContent("Documento modificato"); expect(state.success).not.toHaveBeenCalled();
 });
});
