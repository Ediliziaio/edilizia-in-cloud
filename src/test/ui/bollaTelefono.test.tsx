import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
const m = vi.hoisted(() => ({
  create: vi.fn(), upload: vi.fn(), rpc: vi.fn(), carica: vi.fn(), leggi: vi.fn(),
  permessi: { solaLettura: false, isAdmin: false, canEditOrders: false, canManagePurchasing: true, canEditWarehouse: true },
  magazzino: { id: "w" } as { id: string } | null,
}));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => m.permessi }));
vi.mock("@/hooks/useWarehouses", () => ({ useWarehouses: () => ({ defaultWarehouse: m.magazzino, warehouses: m.magazzino ? [m.magazzino] : [], isFetched: true }) }));
vi.mock("@/hooks/useDDTRicezione", () => ({
  useDDTRicezioneMutations: () => ({ createDDT: { mutateAsync: m.create } }),
  useDDTAttachments: () => ({ uploadMainDDT: { mutateAsync: m.upload }, uploadAttachments: { mutateAsync: m.upload } }),
}));
vi.mock("@/integrations/supabase/client", () => {
  const q: Record<string, unknown> = {};
  Object.assign(q, { select: () => q, eq: () => q, limit: () => Promise.resolve({ data: [{ id: "f1", name: "Edil Srl", vat_number: "01234567890", fiscal_code: null }], error: null }) });
  return { supabase: { from: () => q, storage: { from: () => ({ download: async () => ({ data: new Blob(["x"], { type: "image/jpeg" }), error: null as null }) }) } } };
});
vi.mock("@/lib/ddt/documentiPersistenti", () => ({
  documentiDb: { rpc: m.rpc },
  leggiPersistente: m.leggi,
  destinazioneDocumento: (j: { destinazione?: string | null; order_id: string | null }) => j.destinazione ?? (j.order_id ? "cantiere" : "magazzino"),
}));
vi.mock("@/lib/ddt/caricoAlSalvataggio", async (orig) => ({
  ...(await orig<typeof import("@/lib/ddt/caricoAlSalvataggio")>()),
  caricaAlSalvataggio: m.carica,
  avvisaEsitoCarico: vi.fn(),
}));
vi.mock("@/components/orders/SupplierSelect", () => ({ SupplierSelect: ({ value }: { value?: string }) => <p>fornitore {value ?? "nessuno"}</p> }));
vi.mock("@/components/warehouse/OrderSelectCombobox", () => ({ OrderSelectCombobox: (): null => null }));
vi.mock("@/lib/ddt/dividiPdf", () => ({ paginePdfComeImmagini: vi.fn() }));
import { CompilaBollaTelefono, RevisioneBollaTelefono } from "@/components/ddt/BollaTelefono";

const conClient = (n: ReactNode) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{n}</QueryClientProvider>);
beforeEach(() => {
  m.create.mockReset().mockResolvedValue({ id: "d" });
  m.upload.mockReset().mockResolvedValue(undefined);
  m.rpc.mockReset().mockResolvedValue({ data: "ddt-nuovo", error: null });
  m.carica.mockReset().mockResolvedValue({ stato: "caricato", righe: 1, escluse: [] });
  m.magazzino = { id: "w" };
  URL.createObjectURL = vi.fn(() => "blob:foto");
  URL.revokeObjectURL = vi.fn();
});
afterEach(cleanup);

it("senza AI, dal telefono: si scrive guardando la foto, nasce la bolla con tutte le pagine e la merce entra in magazzino", async () => {
  const fatto = vi.fn();
  const pagine = [new File(["a"], "p1.jpg", { type: "image/jpeg" }), new File(["b"], "p2.jpg", { type: "image/jpeg" })];
  conClient(<CompilaBollaTelefono files={pagine} companyId="c" orderId={null} etichettaCantiere="In magazzino (senza commessa)" onFatto={fatto} onChiudi={vi.fn()} />);
  expect(screen.getByText("In magazzino (senza commessa)")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Numero bolla"), { target: { value: "B-9" } });
  fireEvent.click(screen.getByRole("button", { name: "Aggiungi riga" }));
  fireEvent.change(screen.getByLabelText("Descrizione riga 1"), { target: { value: "Cemento" } });
  fireEvent.change(screen.getByLabelText("Quantità riga 1"), { target: { value: "10" } });
  fireEvent.change(screen.getByLabelText("UM riga 1"), { target: { value: "sacchi" } });
  fireEvent.click(screen.getByRole("button", { name: "Registra la bolla" }));
  await waitFor(() => expect(fatto).toHaveBeenCalled());
  expect(m.create.mock.calls[0][0]).toMatchObject({ destinazione: "magazzino", order_id: null, numero_ddt: "B-9", quantita_ricevuta: 10, magazzinoFacoltativo: true });
  expect(m.upload).toHaveBeenCalledWith({ ddtId: "d", file: pagine[0], silenzioso: true });
  expect(m.upload).toHaveBeenCalledWith({ ddtId: "d", files: [{ file: pagine[1], kind: "bolla" }] });
  expect(m.carica).toHaveBeenCalledWith("d");
});

it("con l'AI: si vede cosa ha letto (fornitore riconosciuto, numero, righe) e si conferma con ddt_documento_registra", async () => {
  m.leggi.mockResolvedValue({
    files: [{ path: "c/u/j/1-originale.jpg", name: "bolla.jpg", mime: "image/jpeg", size: 1 }],
    result: { intestazione: { numero_ddt: "77", data_ddt: "2026-11-10" }, mittente: { ragione_sociale: "Edil Srl", partita_iva: "01234567890" }, righe_merce: [{ descrizione: "Coppi", quantita: 40, unita_misura: "pz" }] },
  });
  const chiudi = vi.fn();
  conClient(
    <RevisioneBollaTelefono
      documento={{ id: "j", company_id: "c", order_id: "o1", status: "review", files: [], created_by: "u", source: "campo", result: null, last_error: null, ddt_id: null, created_at: "", updated_at: "x" }}
      etichettaCantiere="SIM-1 · Via Roma"
      onChiudi={chiudi}
    />,
  );
  expect(await screen.findByDisplayValue("Coppi")).toBeInTheDocument();
  expect(screen.getByLabelText("Numero bolla")).toHaveValue("77");
  expect(screen.getByText("fornitore f1")).toBeInTheDocument();
  expect(screen.getByText("SIM-1 · Via Roma")).toBeInTheDocument();
  // In cantiere non si carica il magazzino: niente spunta.
  expect(screen.queryByRole("checkbox", { name: "Carica in magazzino" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Conferma la bolla" }));
  await waitFor(() => expect(chiudi).toHaveBeenCalled());
  expect(m.rpc).toHaveBeenCalledWith("ddt_documento_registra", expect.objectContaining({
    p_id: "j",
    p_dati: expect.objectContaining({ order_id: "o1", numero_ddt: "77", destinazione: "cantiere", warehouse_id: null, righe: [expect.objectContaining({ descrizione: "Coppi" })] }),
  }));
  expect(m.carica).not.toHaveBeenCalled();
});

it("con l'AI, per il magazzino senza magazzini la bolla si conferma lo stesso: magazzino nullo, carico in sospeso (12/11)", async () => {
  m.magazzino = null;
  m.leggi.mockResolvedValue({ files: [{ path: "p", name: "b.jpg", mime: "image/jpeg", size: 1 }], result: { intestazione: { numero_ddt: "1", data_ddt: "2026-11-10" }, righe_merce: [] } });
  conClient(
    <RevisioneBollaTelefono
      documento={{ id: "j2", company_id: "c", order_id: null, status: "review", files: [], created_by: "u", source: "campo", result: null, last_error: null, ddt_id: null, created_at: "", updated_at: "x" }}
      etichettaCantiere="In magazzino (senza commessa)"
      onChiudi={vi.fn()}
    />,
  );
  const conferma = await screen.findByRole("button", { name: "Conferma la bolla" });
  expect(conferma).toBeEnabled();
  expect(screen.getByText(/non ha ancora un magazzino/)).toBeInTheDocument();
  expect(screen.queryByRole("checkbox", { name: "Carica in magazzino" })).not.toBeInTheDocument();
  fireEvent.click(conferma);
  await waitFor(() => expect(m.rpc).toHaveBeenCalledWith("ddt_documento_registra", expect.objectContaining({
    p_dati: expect.objectContaining({ destinazione: "magazzino", warehouse_id: null }),
  })));
});

it("l'operaio ha mandato in magazzino senza commessa: la destinazione del documento vale, con il magazzino proposto", async () => {
  m.magazzino = { id: "w-predefinito" };
  m.leggi.mockResolvedValue({ files: [{ path: "p", name: "b.jpg", mime: "image/jpeg", size: 1 }], result: { intestazione: { numero_ddt: "5", data_ddt: "2026-11-10" }, righe_merce: [] } });
  conClient(
    <RevisioneBollaTelefono
      documento={{ id: "j3", company_id: "c", order_id: null, destinazione: "magazzino", status: "review", files: [], created_by: "u", source: "campo", result: null, last_error: null, ddt_id: null, created_at: "", updated_at: "x" }}
      etichettaCantiere="In magazzino (senza commessa)"
      onChiudi={vi.fn()}
    />,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Conferma la bolla" }));
  await waitFor(() => expect(m.rpc).toHaveBeenCalledWith("ddt_documento_registra", expect.objectContaining({
    p_dati: expect.objectContaining({ destinazione: "magazzino", warehouse_id: "w-predefinito" }),
  })));
});
