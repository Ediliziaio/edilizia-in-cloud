import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const state = vi.hoisted(() => ({ company: "c1", blocked: false, malformed: false, fail: false, rpc: vi.fn(), success: vi.fn(), error: vi.fn(), save: vi.fn(), csv: vi.fn(), excel: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: state.company }, user: { id: "user1" } }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: state.rpc } }));
vi.mock("sonner", () => ({ toast: { success: state.success, error: state.error } }));
vi.mock("@/lib/api/pipelineTransitions", () => ({ savePipelineTransition: state.save }));
vi.mock("@/lib/csvExport", () => ({ exportToCSV: state.csv, exportToXLSX: state.excel }));
import { useOperationalDeletion } from "@/hooks/useOperationalDeletion";
function App({ ids = ["a", "b"], enabled = true }: { ids?: string[]; enabled?: boolean }) { const d = useOperationalDeletion("oda", ids.map(id => ({ id, label: `ODA-${id}` })), enabled); return <>{d.enabled && <div>{d.header}{ids.map(id => <div key={id}>{d.checkbox(id, `ODA-${id}`)}</div>)}</div>}{d.toolbar}{d.confirmation}</>; }
function mount() { const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } }); const view = render(<QueryClientProvider client={client}><App /></QueryClientProvider>); return { ...view, update: (ids: string[], enabled = true) => view.rerender(<QueryClientProvider client={client}><App ids={ids} enabled={enabled} /></QueryClientProvider>) }; }
beforeEach(() => {
 state.company = "c1"; state.blocked = false; state.malformed = false; state.fail = false; vi.clearAllMocks(); state.save.mockReset(); state.excel.mockReset(); state.csv.mockReset();
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

function BulkApp({ canWrite = true, ids = ["a", "b"], mixed = false }: { canWrite?: boolean; ids?: string[]; mixed?: boolean }) {
 const d = useOperationalDeletion("oda", ids.map(id => ({ id, label: `ODA-${id}`, href: `/detail/${id}`, values: { fornitore: `Fornitore ${id}` }, phase: { id, label: `ODA-${id}`, href: `/detail/${id}`, status: mixed && id === "b" ? "ricevuto" : "bozza", stage: mixed && id === "b" ? "consegnato" : "da_ordinare" } })), true, { canDelete: canWrite, canChangePhase: canWrite, columns: [{ key: "documento", label: "Ordine" }, { key: "fornitore", label: "Fornitore" }] });
 return <>{d.header}{ids.map(id => <div key={id}>{d.checkbox(id, `ODA-${id}`)}</div>)}{d.toolbar}{d.confirmation}</>;
}
function mountBulk(props: Parameters<typeof BulkApp>[0] = {}) {
 const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
 const view = render(<QueryClientProvider client={client}><BulkApp {...props} /></QueryClientProvider>);
 return { ...view, update: (next: Parameters<typeof BulkApp>[0]) => view.rerender(<QueryClientProvider client={client}><BulkApp {...next} /></QueryClientProvider>) };
}
describe("Altre azioni sui documenti selezionati", () => {
 it("esporta soltanto la selezione e riporta gli errori Excel", async () => {
  mountBulk(); fireEvent.click(screen.getByLabelText("Seleziona ODA-b"));
  fireEvent.click(screen.getByRole("button", { name: "Esporta CSV" }));
  expect(state.csv.mock.calls[0][0]).toEqual([{ documento: "ODA-b", fornitore: "Fornitore b" }]);
  expect(state.rpc).not.toHaveBeenCalled(); expect(state.save).not.toHaveBeenCalled();
  state.excel.mockRejectedValueOnce(new Error("File non creato"));
  fireEvent.click(screen.getByRole("button", { name: "Esporta Excel" }));
  await waitFor(() => expect(state.error).toHaveBeenCalledWith("File non creato"));
 });
 it("mostra solo i dettagli selezionati senza aprire finestre automaticamente", () => {
  mountBulk(); fireEvent.click(screen.getByLabelText("Seleziona ODA-b")); fireEvent.click(screen.getByRole("button", { name: "Apri dettagli" }));
  expect(screen.getByRole("link", { name: /ODA-b/ })).toHaveAttribute("href", "/detail/b");
  expect(screen.queryByRole("link", { name: /ODA-a/ })).not.toBeInTheDocument();
 });
 it("richiede conferma per il cambio fase e mostra un esito per ogni documento", async () => {
  state.save.mockImplementation(async (plan: { document: { id: string } }) => { if (plan.document.id === "b") throw new Error("Modificato da un collega"); });
  mountBulk(); fireEvent.click(screen.getByLabelText("Seleziona documenti di questa pagina"));
  fireEvent.change(screen.getByRole("combobox", { name: "Azione sui documenti selezionati" }), { target: { value: "ordinato" } });
  expect(state.save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Conferma su 2 documenti" }));
  expect(await screen.findByText("Modificato da un collega")).toBeVisible();
  expect(screen.getByText("Aggiornato")).toBeVisible();
  expect(screen.getByLabelText("Seleziona ODA-a")).not.toBeChecked();
  expect(screen.getByLabelText("Seleziona ODA-b")).toBeChecked();
  expect(screen.queryByRole("button", { name: "Conferma su 2 documenti" })).not.toBeInTheDocument();
  expect(state.save).toHaveBeenCalledTimes(2);
  expect(state.error).toHaveBeenCalledWith(expect.stringContaining("1 aggiornati, 1 non aggiornati"));
 });
 it("blocca prima della conferma una selezione di documenti incompatibili", () => {
  mountBulk({ mixed: true }); fireEvent.click(screen.getByLabelText("Seleziona documenti di questa pagina"));
  fireEvent.change(screen.getByRole("combobox", { name: "Azione sui documenti selezionati" }), { target: { value: "ordinato" } });
  expect(screen.getByRole("button", { name: "Conferma su 2 documenti" })).toBeDisabled();
  expect(state.save).not.toHaveBeenCalled();
 });
 it("permette di limitare la selezione alla consultazione e all'esportazione", () => {
  mountBulk({ canWrite: false }); fireEvent.click(screen.getByLabelText("Seleziona ODA-a"));
  expect(screen.getByRole("button", { name: "Esporta CSV" })).toBeEnabled();
  expect(screen.queryByRole("button", { name: "Elimina selezionati" })).not.toBeInTheDocument();
  expect(screen.queryByRole("combobox", { name: "Azione sui documenti selezionati" })).not.toBeInTheDocument();
 });
 it("durante il salvataggio blocca i comandi e interrompe il lotto se cambia azienda", async () => {
  let release!: () => void;
  state.save.mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
  const view = mountBulk(); fireEvent.click(screen.getByLabelText("Seleziona documenti di questa pagina"));
  fireEvent.change(screen.getByRole("combobox", { name: "Azione sui documenti selezionati" }), { target: { value: "ordinato" } });
  fireEvent.click(screen.getByRole("button", { name: "Conferma su 2 documenti" }));
  expect(screen.getByLabelText("Seleziona ODA-a")).toBeDisabled();
  state.company = "c2"; view.update({}); release();
  await waitFor(() => expect(state.error).toHaveBeenCalled());
  expect(state.save).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText("Seleziona ODA-a")).not.toBeChecked();
 });
});
