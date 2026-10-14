import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrderAttachments } from "@/components/orders/OrderAttachments";
const state = vi.hoisted(() => ({from: vi.fn(), rpc: vi.fn(), folderError: false, attachmentError: false, clientError: false, deniedUpdate: false, rows: [] as object[], retryFolders: vi.fn(), download: vi.fn(), update: vi.fn(), success: vi.fn(), error: vi.fn(), scopes: [] as [string, unknown][]}));
vi.mock("sonner", () => ({toast: {success: state.success, error: state.error}}));
vi.mock("@/integrations/supabase/client", () => ({supabase: {from: state.from, rpc: state.rpc}}));
vi.mock("@/hooks/usePermissions", () => ({usePermissions: () => ({isAdmin: false, canEditSettingsOrders: false})}));
vi.mock("@/hooks/useCartelleDocumenti", () => ({useCartelleDocumenti: () => ({cartelle: [{id: "quote", nome: "Preventivi", archiviata_at: null as string | null, obbligatoria: false}], isLoading: false, isError: state.folderError, refetch: state.retryFolders})}));
vi.mock("@/components/orders/CaricaDocumentiDialog", () => ({CaricaDocumentiDialog: (): null => null}));
vi.mock("@/components/orders/filePreview", () => ({FileThumb: () => <span>Anteprima</span>}));
vi.mock("@/components/orders/filePreviewUtils", () => ({useUrlMiniature: () => ({data: {}}), toStoragePath: (x: string) => x, fmtBytes: () => "2 KB", fileKind: () => "pdf", KIND_LABEL: {pdf: "PDF"}, KIND_TINT: {pdf: ""}, scaricaAllegato: state.download}));
const document = {id: "doc", order_id: "order", file_name: "Preventivo completo con nome lungo.pdf", file_url: "orders/order/file.pdf", file_type: "application/pdf", file_size: 2000, created_at: "2026-10-13", folder_id: "quote", visible_to_customer: false};
function draw(editable = false) {
  const client = new QueryClient({defaultOptions: {queries: {retry: false, retryDelay: 0}}});
  const ui = (orderId: string) => <QueryClientProvider client={client}><MemoryRouter><OrderAttachments orderId={orderId} editable={editable} actions={<button>Genera contratto</button>} /></MemoryRouter></QueryClientProvider>;
  const view = render(ui("order"));
  return {...view, changeOrder: (id: string) => view.rerender(ui(id))};
}
beforeEach(() => {
  localStorage.clear(); state.folderError = false; state.attachmentError = false; state.clientError = false; state.rows = [document];
  state.from.mockReset(); state.rpc.mockReset(); state.download.mockReset(); state.retryFolders.mockReset();
  state.update.mockReset(); state.success.mockReset(); state.error.mockReset(); state.deniedUpdate = false; state.scopes = [];
  state.from.mockImplementation(() => {
    let patch: {visible_to_customer: boolean} | null = null;
    const q = {select: () => q, eq: (name: string, value: unknown) => { if (patch) state.scopes.push([name, value]); return q; },
      update: (value: {visible_to_customer: boolean}) => { patch = value; state.update(value); return q; },
      maybeSingle: async () => {
        if (state.deniedUpdate) return {data: null, error: null};
        state.rows = state.rows.map(row => ({...row, ...patch}));
        return {data: {id: "doc", ...patch}, error: null as null};
      },
      order: () => q,
      range: async (from: number, to: number) => ({data: state.rows.slice(from, to + 1), error: state.attachmentError ? {message: "Rete"} : null})}; return q;
  });
  state.rpc.mockImplementation(async () => ({data: [], error: state.clientError ? {message: "Rete"} : null}));
});
afterEach(cleanup);
describe("Documenti commessa: elenco e letture affidabili", () => {
  it("parte in elenco, conserva nome completo e indica che il documento è interno", async () => {
    draw(); await screen.findByRole("button", {name: document.file_name});
    expect(screen.getByRole("button", {name: "Vista elenco"})).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Interno", {exact: true})).toBeInTheDocument();
    expect(screen.getByRole("button", {name: document.file_name})).not.toHaveClass("truncate");
  });
  it("mantiene download e categoria senza scritture", async () => {
    draw(); await screen.findByRole("button", {name: document.file_name});
    fireEvent.click(screen.getByRole("button", {name: document.file_name}));
    expect(state.download).toHaveBeenCalledWith(document.file_url, document.file_name, undefined);
    expect(screen.getByRole("combobox", {name: "Categoria documenti"})).toBeInTheDocument();
    expect(state.rpc).toHaveBeenCalledWith("documenti_cliente_della_commessa", {p_order_id: "order"});
  });
  it("rispetta una preferenza griglia già salvata", async () => {
    localStorage.setItem("documenti-commessa-vista", "griglia"); draw(); await screen.findByText(document.file_name);
    expect(screen.getByRole("button", {name: "Vista con anteprime"})).toHaveAttribute("aria-pressed", "true");
  });
  it("non mostra un archivio vuoto se la lettura degli allegati fallisce", async () => {
    state.rows = []; state.attachmentError = true; draw();
    expect(await screen.findByRole("alert")).toHaveTextContent("Documenti o categorie non disponibili");
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });
  it("segnala separatamente i documenti cliente mancanti per errore", async () => {
    state.clientError = true; draw();
    expect(await screen.findByRole("alert")).toHaveTextContent("solo gli allegati della commessa");
    expect(screen.getByRole("button", {name: document.file_name})).toBeInTheDocument();
  });
  it("non permette operazioni usando una configurazione delle categorie non caricata", async () => {
    state.folderError = true; draw(true); await screen.findByRole("alert");
    expect(screen.queryByRole("button", {name: "Carica file"})).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {name: "Riprova"})); expect(state.retryFolders).toHaveBeenCalledOnce();
  });
  it("nasconde caricamento e strumenti di generazione in sola lettura", async () => {
    draw(); await screen.findByRole("button", {name: document.file_name});
    expect(screen.queryByRole("button", {name: "Carica file"})).not.toBeInTheDocument();
    expect(screen.queryByRole("button", {name: "Genera contratto"})).not.toBeInTheDocument();
    expect(screen.queryByRole("button", {name: /Visibilità di/})).not.toBeInTheDocument();
    expect(screen.queryByRole("button", {name: /Altre azioni per/})).not.toBeInTheDocument();
  });
  it("filtra condivisi e interni e ripristina l'elenco senza chiamate aggiuntive", async () => {
    state.rows = [document, {...document, id: "shared", file_name: "Contratto firmato.pdf", visible_to_customer: true}];
    draw(); await screen.findByRole("button", {name: document.file_name});
    const reads = state.from.mock.calls.length;
    fireEvent.click(screen.getByRole("button", {name: "Condivisi con cliente: 1 documenti"}));
    expect(screen.queryByRole("button", {name: document.file_name})).not.toBeInTheDocument();
    expect(screen.getByRole("button", {name: "Contratto firmato.pdf"})).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {name: "Interni: 1 documenti"}));
    expect(screen.queryByRole("button", {name: "Contratto firmato.pdf"})).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {name: "Azzera filtri"}));
    expect(screen.getByRole("button", {name: "Contratto firmato.pdf"})).toBeInTheDocument();
    expect(state.from).toHaveBeenCalledTimes(reads); expect(state.update).not.toHaveBeenCalled();
  });
  it("offre ricerca anche con un solo file e recupera da risultati vuoti", async () => {
    draw(); await screen.findByRole("button", {name: document.file_name});
    fireEvent.change(screen.getByRole("textbox", {name: "Cerca documenti"}), {target: {value: "assente"}});
    expect(screen.getByText("Nessun documento con questi filtri.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {name: "Mostra tutti i documenti"}));
    expect(screen.getByRole("textbox", {name: "Cerca documenti"})).toHaveValue("");
    expect(screen.getByRole("button", {name: document.file_name})).toBeInTheDocument();
  });
  it("richiede conferma prima di condividere e annullare non scrive", async () => {
    draw(true); await screen.findByRole("button", {name: document.file_name});
    fireEvent.click(screen.getByRole("button", {name: /Visibilità di/}));
    expect(screen.getByRole("alertdialog")).toHaveTextContent("La condivisione può inviare una notifica");
    expect(state.update).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", {name: "Annulla"}));
    expect(state.update).not.toHaveBeenCalled();
  });
  it("conferma l'aggiornamento della visibilità solo dopo il riscontro e lo limita alla commessa", async () => {
    draw(true); await screen.findByRole("button", {name: document.file_name});
    fireEvent.click(screen.getByRole("button", {name: /Visibilità di/}));
    fireEvent.click(screen.getByRole("button", {name: "Condividi documento"}));
    await waitFor(() => expect(state.success).toHaveBeenCalledWith("Ora il cliente vede il documento"));
    expect(state.scopes).toEqual([["id", "doc"], ["order_id", "order"]]);
    expect(await screen.findByRole("button", {name: /Visibilità di .*condiviso con cliente/})).toBeInTheDocument();
  });
  it("non dichiara successo quando il server non aggiorna alcuna riga", async () => {
    state.deniedUpdate = true; draw(true); await screen.findByRole("button", {name: document.file_name});
    fireEvent.click(screen.getByRole("button", {name: /Visibilità di/}));
    fireEvent.click(screen.getByRole("button", {name: "Condividi documento"}));
    await waitFor(() => expect(state.error).toHaveBeenCalledWith("Visibilità non aggiornata"));
    expect(state.success).not.toHaveBeenCalled();
    expect(screen.getByRole("button", {name: /Visibilità di .*interno/})).toBeInTheDocument();
  });
  it("mantiene la conferma anche dalla vista griglia", async () => {
    localStorage.setItem("documenti-commessa-vista", "griglia"); draw(true);
    await screen.findByRole("button", {name: `Altre azioni per ${document.file_name}`});
    fireEvent.keyDown(screen.getByRole("button", {name: `Altre azioni per ${document.file_name}`}), {key: "ArrowDown"});
    fireEvent.click(await screen.findByRole("menuitem", {name: "Mostra al cliente"}));
    expect(await screen.findByRole("alertdialog")).toHaveTextContent("Condividere con il cliente?");
    expect(state.update).not.toHaveBeenCalled();
  });
  it("prima di nascondere spiega che non può revocare copie già scaricate", async () => {
    state.rows = [{...document, visible_to_customer: true}]; draw(true);
    await screen.findByRole("button", {name: document.file_name});
    fireEvent.click(screen.getByRole("button", {name: /Visibilità di/}));
    expect(screen.getByRole("alertdialog")).toHaveTextContent("Eventuali copie già scaricate restano al cliente");
    fireEvent.click(screen.getByRole("button", {name: "Annulla"}));
    expect(state.update).not.toHaveBeenCalled();
  });
  it("i documenti personali del cliente non entrano nei condivisi e non offrono azioni di modifica", async () => {
    state.rpc.mockResolvedValue({data: [{id: "identity", document_type: "identity", file_name: "Identita.pdf", file_path: "customer/identity.pdf", file_type: "application/pdf", file_size: 1000, created_at: "2026-10-13", thumb_path: null}], error: null});
    draw(true); await screen.findByRole("button", {name: "Identita.pdf"});
    expect(screen.queryByRole("button", {name: "Altre azioni per Identita.pdf"})).not.toBeInTheDocument();
    expect(screen.queryByRole("button", {name: /Visibilità di Identita/})).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {name: "Condivisi con cliente: 0 documenti"}));
    expect(screen.queryByRole("button", {name: "Identita.pdf"})).not.toBeInTheDocument();
  });
  it("azzera ricerca, categoria e visibilità passando a un'altra commessa", async () => {
    const view = draw(); await screen.findByRole("button", {name: document.file_name});
    fireEvent.change(screen.getByRole("combobox", {name: "Categoria documenti"}), {target: {value: "quote"}});
    fireEvent.change(screen.getByRole("textbox", {name: "Cerca documenti"}), {target: {value: "assente"}});
    fireEvent.click(screen.getByRole("button", {name: "Condivisi con cliente: 0 documenti"}));
    view.changeOrder("other");
    await screen.findByRole("button", {name: document.file_name});
    expect(screen.getByRole("combobox", {name: "Categoria documenti"})).toHaveValue("__tutti");
    expect(screen.getByRole("textbox", {name: "Cerca documenti"})).toHaveValue("");
    expect(screen.getByRole("button", {name: "Tutti: 1 documenti"})).toHaveAttribute("aria-pressed", "true");
  });
});
