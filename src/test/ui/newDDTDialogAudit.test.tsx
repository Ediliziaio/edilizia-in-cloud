import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";
import { ContestoDocumentoPopup } from "@/lib/orders/documentoPopup";
const m = vi.hoisted(() => ({
  create: vi.fn(), upload: vi.fn(), close: vi.fn(), created: vi.fn(), invoke: vi.fn(), carica: vi.fn(),
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "azienda" } }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ solaLettura: false, canEditWarehouse: true, isAdmin: false }) }));
vi.mock("@/hooks/useWarehouses", () => ({
  useWarehouses: () => ({ warehouses: [{ id: "w" }], isLoading: false, isFetched: true, error: null as null }),
}));
vi.mock("@/hooks/usePurchaseOrders", () => ({ usePurchaseOrders: () => ({ orders: [{ id: "p", oda_number: "ODA-P", status: "bozza", order_id: null as string | null, suppliers: { name: "Fornitore demo" } }] }) }));
vi.mock("@/hooks/useDDTRicezione", () => ({ useDDTRicezioneMutations: () => ({ createDDT: { mutateAsync: m.create } }), useDDTAttachments: () => ({ uploadMainDDT: { mutateAsync: m.upload }, uploadAttachments: { mutateAsync: m.upload } }) }));
vi.mock("@/integrations/supabase/client", () => {
  const q: Record<string, unknown> = {};
  Object.assign(q, { select: () => q, eq: () => q, is: () => q, order: () => q, limit: () => Promise.resolve({ data: [], error: null }) });
  return { supabase: { from: () => q, functions: { invoke: m.invoke } } };
});
vi.mock("@/lib/ddt/caricoAlSalvataggio", async (orig) => ({
  ...(await orig<typeof import("@/lib/ddt/caricoAlSalvataggio")>()),
  caricaAlSalvataggio: m.carica,
  avvisaEsitoCarico: vi.fn(),
}));
vi.mock("@/lib/ddt/dividiPdf", () => ({ paginePdfComeImmagini: vi.fn().mockResolvedValue([]) }));
vi.mock("@/components/warehouse/WarehouseSelect", () => ({ WarehouseSelect: (): null => null }));
vi.mock("@/components/warehouse/OrderSelectCombobox", () => ({ OrderSelectCombobox: (): null => null }));
vi.mock("@/components/orders/SupplierSelect", () => ({ SupplierSelect: (): null => null }));
vi.mock("@/components/ddt/DDTAttachmentUploader", () => ({
  DDTAttachmentUploader: ({ onFilesSelected, title }: { onFilesSelected: (f: { file: File; kind: string }[]) => void; title?: string }) =>
    title ? (
      <button type="button" onClick={() => onFilesSelected([
        { file: new File(["a"], "pagina1.jpg", { type: "image/jpeg" }), kind: "ddt" },
        { file: new File(["b"], "pagina2.jpg", { type: "image/jpeg" }), kind: "ddt" },
      ])}>Carica foto finta</button>
    ) : null,
}));
import { NewDDTDialog } from "@/components/ddt/NewDDTDialog";
beforeEach(() => {
  m.create.mockReset().mockResolvedValue({ id: "d" });
  m.upload.mockReset().mockResolvedValue(undefined);
  m.close.mockReset(); m.created.mockReset();
  m.invoke.mockReset();
  m.carica.mockReset().mockResolvedValue({ stato: "caricato", righe: 1, escluse: [] });
  URL.createObjectURL = vi.fn(() => "blob:foto");
  URL.revokeObjectURL = vi.fn();
});
afterEach(cleanup);
function open(prefill: string | null = "p") {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><NewDDTDialog open prefillPurchaseOrderId={prefill} restaQui onOpenChange={m.close} onCreated={m.created} /></MemoryRouter></QueryClientProvider>);
}
const compila = () => fireEvent.click(screen.getByRole("button", { name: "Compila ora" }));

describe("Nuovo DDT in un solo passaggio (12/11/2026)", () => {
  it("dal popup della generale registra col nuovo flusso e apre il DDT senza cambiare pagina", async () => {
    const vai = vi.fn(() => true);
    function Indirizzo() { return <output aria-label="Indirizzo attuale">{useLocation().pathname}</output>; }
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={["/azienda/ordini/generale"]}><ContestoDocumentoPopup value={{ vai, dentroIlPopup: true }}><NewDDTDialog open prefillPurchaseOrderId="p" onOpenChange={m.close} /></ContestoDocumentoPopup><Indirizzo /></MemoryRouter></QueryClientProvider>);
    compila();
    fireEvent.change(screen.getByLabelText("Numero bolla"), { target: { value: "DDT-SIM" } });
    fireEvent.change(screen.getByLabelText("Quantità ricevuta"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Registra DDT" }));
    await waitFor(() => expect(vai).toHaveBeenCalledWith("/azienda/ddt/d"));
    expect(screen.getByLabelText("Indirizzo attuale")).toHaveTextContent("/azienda/ordini/generale");
    expect(m.create).toHaveBeenCalledTimes(1);
  });

  it("senza documento non si salva «dopo»; compilando, numero e contenuto bloccano la registrazione", () => {
    open();
    expect(screen.getByRole("button", { name: "Salva e compila dopo" })).toBeDisabled();
    compila();
    const registra = screen.getByRole("button", { name: "Registra DDT" });
    expect(registra).toBeDisabled();
    expect(screen.getByText(/manca il numero/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Numero bolla"), { target: { value: "DDT-SIM" } });
    expect(registra).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Quantità ricevuta"), { target: { value: "5" } });
    expect(registra).toBeEnabled();
    expect(m.create).not.toHaveBeenCalled();
  });

  it("il pulsante finale invia una sola registrazione e chiude soltanto a salvataggio completato", async () => {
    let done!: (v: { id: string }) => void;
    m.create.mockImplementation(() => new Promise((r) => { done = r; }));
    open(); compila();
    fireEvent.change(screen.getByLabelText("Numero bolla"), { target: { value: "DDT-SIM" } });
    fireEvent.change(screen.getByLabelText("Quantità ricevuta"), { target: { value: "5" } });
    const b = screen.getByRole("button", { name: "Registra DDT" });
    fireEvent.click(b); fireEvent.click(b);
    expect(m.create).toHaveBeenCalledTimes(1);
    expect(m.close).not.toHaveBeenCalled();
    expect(m.create).toHaveBeenCalledWith(expect.objectContaining({ purchase_order_id: "p", numero_ddt: "DDT-SIM", quantita_ricevuta: 5, destinazione: "magazzino" }));
    done({ id: "d" });
    await waitFor(() => expect(m.close).toHaveBeenCalledWith(false));
    expect(m.created).toHaveBeenCalledWith("d");
    expect(m.upload).not.toHaveBeenCalled();
    // Con l'ordine e «ricevuto completo» la merce la carica l'arrivo dell'ordine.
    expect(m.carica).not.toHaveBeenCalled();
  });

  it("l'errore di registrazione lascia i dati e permette di riprovare", async () => {
    m.create.mockRejectedValueOnce(new Error("Connessione assente"));
    open(); compila();
    fireEvent.change(screen.getByLabelText("Numero bolla"), { target: { value: "DDT-SIM" } });
    fireEvent.change(screen.getByLabelText("Quantità ricevuta"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Registra DDT" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Registra DDT" })).toBeEnabled());
    expect(screen.getByLabelText("Quantità ricevuta")).toHaveValue(3);
    expect(m.close).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Registra DDT" }));
    await waitFor(() => expect(m.close).toHaveBeenCalledWith(false));
    expect(m.create).toHaveBeenCalledTimes(2);
  });

  it("Annulla chiude senza creare bolla né allegati", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "Annulla" }));
    expect(m.close).toHaveBeenCalledWith(false);
    expect(m.create).not.toHaveBeenCalled();
  });

  it("«Salva e compila dopo»: la bolla nasce col solo documento, tutte le pagine allegate", async () => {
    open(null);
    fireEvent.click(screen.getByRole("button", { name: "Carica foto finta" }));
    fireEvent.click(screen.getByRole("button", { name: "Salva e compila dopo" }));
    await waitFor(() => expect(m.close).toHaveBeenCalledWith(false));
    expect(m.create.mock.calls[0][0]).toMatchObject({ numeroFacoltativo: true, soloDocumento: true, numero_ddt: "", righe: [], quantita_ricevuta: 0 });
    expect(m.upload).toHaveBeenNthCalledWith(1, { ddtId: "d", file: expect.objectContaining({ name: "pagina1.jpg" }) });
    expect(m.upload).toHaveBeenNthCalledWith(2, { ddtId: "d", files: [{ file: expect.objectContaining({ name: "pagina2.jpg" }), kind: "bolla" }] });
    expect(m.invoke).not.toHaveBeenCalled();
  });

  it("«Compila ora» con l'AI riempie testata e righe, prezzo compreso, e al salvataggio carica il magazzino", async () => {
    m.invoke.mockResolvedValue({
      data: { success: true, ddt: { intestazione: { numero_ddt: "B-77", data_ddt: "2026-11-10" }, righe_merce: [{ descrizione: "Coppi", quantita: 40, unita_misura: "pz", prezzo_unitario_eur: 1.2 }] } },
      error: null,
    });
    open(null);
    fireEvent.click(screen.getByRole("button", { name: "Carica foto finta" }));
    compila();
    expect(await screen.findByDisplayValue("Coppi")).toBeInTheDocument();
    expect(screen.getByLabelText("Prezzo riga 1")).toHaveValue(1.2);
    expect(screen.getByRole("checkbox", { name: "Carica in magazzino" })).toBeChecked();
    if (!(screen.getByLabelText("Numero bolla") as HTMLInputElement).value)
      fireEvent.change(screen.getByLabelText("Numero bolla"), { target: { value: "B-77" } });
    fireEvent.click(screen.getByRole("button", { name: "Registra DDT" }));
    await waitFor(() => expect(m.carica).toHaveBeenCalledWith("d"));
    expect(m.create.mock.calls[0][0].righe[0]).toMatchObject({ descrizione: "Coppi", prezzo_unitario: 1.2 });
  });

  it("senza l'AI non parte nessuna lettura e togliendo la spunta non si carica", async () => {
    open(null);
    fireEvent.click(screen.getByRole("button", { name: "Carica foto finta" }));
    fireEvent.click(screen.getByRole("switch", { name: "Leggi con l'AI" }));
    compila();
    expect(m.invoke).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Numero bolla"), { target: { value: "B-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi riga" }));
    fireEvent.change(screen.getByLabelText("Descrizione riga 1"), { target: { value: "Tubo" } });
    fireEvent.change(screen.getByLabelText("Quantità riga 1"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Carica in magazzino" }));
    fireEvent.click(screen.getByRole("button", { name: "Registra DDT" }));
    await waitFor(() => expect(m.close).toHaveBeenCalledWith(false));
    expect(m.carica).not.toHaveBeenCalled();
  });

  it("ritirata da noi: la targa si sceglie fra i mezzi, ma si scrive anche a mano", async () => {
    open(null);
    compila();
    fireEvent.click(screen.getByRole("button", { name: "Siamo andati a ritirarla" }));
    const targa = screen.getByRole("combobox", { name: "Targa mezzo" });
    fireEvent.change(targa, { target: { value: "xx999yy" } });
    expect(targa).toHaveValue("XX999YY");
    expect(screen.queryByLabelText("Corriere")).not.toBeInTheDocument();
  });
});
