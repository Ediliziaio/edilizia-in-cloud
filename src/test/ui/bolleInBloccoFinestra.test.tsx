import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const m = vi.hoisted(() => ({ rpc: vi.fn(), carica: vi.fn(), create: vi.fn(), upload: vi.fn(), senzaOriginale: [] as unknown[] }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "c" }, role: "company_admin", user: { id: "u" } }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ solaLettura: false, canEditWarehouse: true }) }));
vi.mock("@/hooks/useDDTRicezione", () => ({
  useDDTRicezioneMutations: () => ({ createDDT: { mutateAsync: m.create } }),
  useDDTAttachments: () => ({ uploadMainDDT: { mutateAsync: m.upload } }),
}));
vi.mock("@/integrations/supabase/client", () => {
  const q: Record<string, unknown> = {};
  Object.assign(q, { select: () => q, eq: () => q, is: () => q, order: () => q, range: () => Promise.resolve({ data: [], error: null }),
    limit: () => Promise.resolve({ data: m.senzaOriginale, error: null }) });
  return { supabase: { from: () => q, functions: { invoke: vi.fn() } } };
});
vi.mock("@/lib/ddt/documentiPersistenti", () => ({ documentiDb: { rpc: m.rpc, from: vi.fn() }, inviaDocumentoPersistente: vi.fn(), attendiLetturaPersistente: vi.fn() }));
vi.mock("@/lib/ddt/caricoAlSalvataggio", async (orig) => ({
  ...(await orig<typeof import("@/lib/ddt/caricoAlSalvataggio")>()),
  caricaAlSalvataggio: m.carica,
  avvisaEsitoCarico: vi.fn(),
}));
vi.mock("@/lib/ddt/dividiPdf", () => ({ paginePdfComeImmagini: vi.fn(), contaPagine: vi.fn(), leggiPerDividere: vi.fn(), scansioneComeFoto: vi.fn(), MAX_BYTE_DA_DIVIDERE: 1, MAX_PAGINE_DIVISIONE: 1 }));
vi.mock("@/components/ddt/CollegamentiBolla", () => ({ CollegamentiBolla: (): null => null }));
vi.mock("@/components/ddt/AzioniBolle", () => ({ AzioniBolle: (): null => null }));
vi.mock("@/components/ddt/RigheLetteBolla", () => ({ RigheLetteBolla: (): null => null }));
vi.mock("@/components/warehouse/WarehouseSelect", () => ({ WarehouseSelect: (): null => null }));
vi.mock("@/components/warehouse/OrderSelectCombobox", () => ({ OrderSelectCombobox: (): null => null }));
vi.mock("@/components/orders/SupplierSelect", () => ({ SupplierSelect: (): null => null }));
import { BolleInBloccoDialog } from "@/components/ddt/BolleInBloccoDialog";
import { bollaDaFile, type BollaLetta } from "@/lib/ddt/importBolle";

beforeEach(() => {
  m.rpc.mockReset().mockResolvedValue({ data: "ddt-1", error: null });
  m.carica.mockReset().mockResolvedValue({ stato: "caricato", righe: 1, escluse: [] });
  m.senzaOriginale = [];
  URL.createObjectURL = vi.fn(() => "blob:foto");
  URL.revokeObjectURL = vi.fn();
});
afterEach(cleanup);
const apri = (iniziali: BollaLetta[]) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <BolleInBloccoDialog open onOpenChange={vi.fn()} iniziali={iniziali} />
    </QueryClientProvider>,
  );
const file = new File(["x"], "bolla.jpg", { type: "image/jpeg" });

it("bolla non letta: «Compila a mano» apre la finestra con la foto, e si registra caricando il magazzino", async () => {
  apri([{ ...bollaDaFile(file, "b1", { destinazione: "magazzino" }), stato: "non_letta", errore: "lettura scaduta", documentoJobId: "job", warehouseId: "w" }]);
  expect(screen.queryByRole("heading", { name: "Controlla la bolla" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Compila a mano" }));
  expect(await screen.findByRole("heading", { name: "Controlla la bolla" })).toBeInTheDocument();
  const finestra = screen.getByRole("dialog", { name: "Controlla la bolla" });
  expect(within(finestra).getAllByAltText("Originale bolla.jpg").length).toBeGreaterThan(0);
  fireEvent.change(within(finestra).getByLabelText("Numero bolla"), { target: { value: "B-1" } });
  fireEvent.change(within(finestra).getByLabelText("Data bolla"), { target: { value: "2026-11-12" } });
  fireEvent.click(within(finestra).getByRole("button", { name: "Aggiungi riga" }));
  fireEvent.change(within(finestra).getByLabelText("Descrizione riga 1"), { target: { value: "Coppi" } });
  fireEvent.change(within(finestra).getByLabelText("Quantità riga 1"), { target: { value: "40" } });
  expect(within(finestra).getByRole("checkbox", { name: "Carica in magazzino" })).toBeChecked();
  fireEvent.click(within(finestra).getByRole("button", { name: "Registra la bolla" }));
  await waitFor(() => expect(m.rpc).toHaveBeenCalledWith("ddt_documento_registra", expect.objectContaining({
    p_id: "job",
    p_dati: expect.objectContaining({ numero_ddt: "B-1", righe: [expect.objectContaining({ descrizione: "Coppi", quantita: 40 })] }),
  })));
  await waitFor(() => expect(m.carica).toHaveBeenCalledWith("ddt-1"));
});

it("una bolla letta senza righe apre da sola la finestra; chiusa, non si riapre", async () => {
  apri([{ ...bollaDaFile(file, "b2", { destinazione: "cantiere", orderId: "o" }), stato: "letta", numero: "7", data: "2026-11-10" }]);
  expect(await screen.findByRole("heading", { name: "Controlla la bolla" })).toBeInTheDocument();
  fireEvent.click(screen.getAllByRole("button", { name: "Chiudi" }).at(-1)!);
  await waitFor(() => expect(screen.queryByRole("heading", { name: "Controlla la bolla" })).not.toBeInTheDocument());
  expect(screen.getByRole("button", { name: "Compila le righe guardando la foto" })).toBeInTheDocument();
});

it("l'originale di una bolla registrata dalla fattura si allega a quella, senza crearne un'altra (23/11/2026)", async () => {
  m.senzaOriginale = [{ id: "f1", numero_ddt: "2026-DT05-0004727", data_ricezione: "2026-09-15", supplier_id: "s", order_id: "o", destinazione: "cantiere", note: "Registrata dalla fattura n. F-1: l'originale della bolla è da allegare." }];
  apri([{ ...bollaDaFile(file, "b9", { destinazione: "magazzino" }), stato: "letta", numero: "4727/05", data: "2026-09-15", supplierId: "s", documentoJobId: "job9",
    righe: [{ posizione: 1, codice_articolo: null, descrizione: "Cls", unita_misura: "mc", quantita: 4, prezzo_unitario: null, importo: null, iva_percentuale: null, order_item_id: null, origine: "ai", ai_originale: null, testo_grezzo: null, note: null }] }]);
  expect(await screen.findByText(/È l’originale della bolla 2026-DT05-0004727 del 15\/09\/2026, registrata dalla fattura/)).toBeInTheDocument();
  fireEvent.click(await screen.findByRole("button", { name: /Registra 1 bolla/ }));
  await waitFor(() => expect(m.rpc).toHaveBeenCalledWith("ddt_documento_allega", expect.objectContaining({ p_id: "job9", p_ddt: "f1" })));
  expect(m.rpc).not.toHaveBeenCalledWith("ddt_documento_registra", expect.anything());
});
