import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

const m = vi.hoisted(() => ({
  update: vi.fn(),
  consegne: [] as Array<Record<string, unknown>>,
  righe: [] as Array<Record<string, unknown>>,
}));

/** Una catena PostgREST finta: ogni metodo restituisce sé stessa, e alla fine risponde. */
function catena(tabella: string, risposta: unknown) {
  const c: Record<string, unknown> = {};
  for (const k of ["select", "eq", "neq", "in", "is", "order", "limit", "maybeSingle"]) c[k] = () => c;
  c.update = (patch: unknown) => {
    m.update(tabella, patch);
    return c;
  };
  c.then = (ok: (v: unknown) => unknown) => Promise.resolve(risposta).then(ok);
  return c;
}

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ solaLettura: false, canEditOrders: true, canManagePurchasing: true, canEditWarehouse: true }),
}));
vi.mock("@/hooks/useConsegneDDT", () => ({
  useConsegneDDT: () => ({ data: m.consegne, isLoading: false, isError: false }),
}));
vi.mock("@/hooks/useDDTRicezione", () => ({
  useDDTRighe: () => ({ data: m.righe, isLoading: false, isError: false }),
}));
vi.mock("@/hooks/useControlloOrdiniDDT", () => ({
  useControlloOrdiniDDT: () => ({ data: { ordini: [{ id: "po1", oda_number: "ODA-2026-0007", status: "confermato", order_id: "c1" }] } }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (t: string) =>
      catena(t, t === "orders" ? { data: [{ id: "c2", order_code: "C-0002" }], error: null } : { data: [], error: null }),
  },
}));
vi.mock("@/lib/ddt/documentiPersistenti", () => ({
  documentiDb: {
    from: (t: string) => catena(t, { data: [{ id: "f1", numero_ddt: "12", fatture_ricevute: { id: "fr", numero_fattura: "FT-88", data_fattura: "2026-11-02" } }], error: null }),
    rpc: async () => ({ data: [] as unknown[], error: null as null }),
  },
}));
vi.mock("@/components/orders/SupplierSelect", () => ({ SupplierSelect: () => <p>scelta fornitore</p> }));
vi.mock("@/components/warehouse/WarehouseSelect", () => ({ WarehouseSelect: () => <p>scelta magazzino</p> }));
vi.mock("@/components/warehouse/OrderSelectCombobox", () => ({
  OrderSelectCombobox: ({ value }: { value?: string }) => <p>commessa scelta: {value ?? "nessuna"}</p>,
}));
import { CollegamentiDDTCard } from "@/components/ddt/CollegamentiDDTCard";

afterEach(() => {
  cleanup();
  m.update.mockReset();
  m.consegne = [];
  m.righe = [];
});

const ddt = (extra: Record<string, unknown> = {}) =>
  ({
    id: "d",
    company_id: "az",
    numero_ddt: "12",
    data_ricezione: "2026-11-01",
    stato: "ricevuto",
    supplier_id: "s1",
    purchase_order_id: "po1",
    order_id: "c1",
    destinazione: "cantiere",
    warehouse_id: null,
    caricata_a_magazzino_at: null,
    suppliers: { id: "s1", name: "Edilferro" },
    orders: { id: "c1", order_code: "C-0001" },
    purchase_orders: { id: "po1", oda_number: "ODA-2026-0007", status: "confermato", order_id: "c1", supplier_id: "s1" },
    ...extra,
  }) as never;

const apri = (d = ddt(), onApriConsegne?: () => void) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <CollegamentiDDTCard ddt={d} ricezioni={0} onApriConsegne={onApriConsegne} />
      </MemoryRouter>
    </QueryClientProvider>,
  );

it("mostra tutte le commesse della bolla, anche quelle delle consegne, e la fattura", async () => {
  m.consegne = [{ id: "k1", riga_id: "r1", quantita: 2, order_id: "c2", tipo: "ingresso", destinazione: "cantiere" }];
  apri();
  expect(screen.getByText("Collegamenti")).toBeInTheDocument();
  expect(screen.getByText("Commesse (2)")).toBeInTheDocument();
  expect(screen.getByText("C-0001")).toBeInTheDocument();
  expect(await screen.findByText("C-0002")).toBeInTheDocument();
  expect(screen.getByText("1 riga consegnata")).toBeInTheDocument();
  expect(await screen.findByText("n. FT-88")).toBeInTheDocument();
});

it("con righe consegnate si cambia solo la commessa, e «Nessuna» la toglie", async () => {
  m.consegne = [{ id: "k1", riga_id: "r1", quantita: 2, order_id: "c1", tipo: "ingresso", destinazione: "cantiere" }];
  apri();
  fireEvent.click(screen.getByRole("button", { name: /Modifica/ }));
  expect(screen.getByText("La merce è già registrata con questo fornitore.")).toBeInTheDocument();
  expect(screen.getByText("L'arrivo è già registrato su quest'ordine.")).toBeInTheDocument();
  expect(screen.queryByText("scelta fornitore")).not.toBeInTheDocument();
  expect(screen.getByText("commessa scelta: c1")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Nessuna" }));
  fireEvent.click(screen.getByRole("button", { name: /Salva/ }));
  await waitFor(() => expect(m.update).toHaveBeenCalledWith("ddt_ricezione", { order_id: null }));
});

it("una bolla senza merce registrata cambia anche ordine e destinazione", async () => {
  apri(ddt({ purchase_order_id: null, purchase_orders: null, order_id: null, orders: null }));
  fireEvent.click(screen.getByRole("button", { name: /Modifica/ }));
  expect(screen.getByText("scelta fornitore")).toBeInTheDocument();
  expect(screen.getByLabelText("Ordine al fornitore")).toHaveValue("__nessuno__");
  fireEvent.change(screen.getByLabelText("Dove va la merce"), { target: { value: "magazzino" } });
  expect(screen.getByText("scelta magazzino")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Salva/ }));
  await waitFor(() => expect(m.update).toHaveBeenCalledWith("ddt_ricezione", { destinazione: "magazzino" }));
});

it("una bolla verificata non si modifica", () => {
  apri(ddt({ stato: "verificato" }));
  expect(screen.queryByRole("button", { name: /Modifica/ })).not.toBeInTheDocument();
});

it("con righe ancora da consegnare propone di dividerle su più commesse", () => {
  m.righe = [{ id: "r1", quantita: 5, movimento_id: null, arrivo_registrato_il: null }];
  const vai = vi.fn();
  apri(ddt(), vai);
  fireEvent.click(screen.getByRole("button", { name: "Dividi le righe su più commesse" }));
  expect(vai).toHaveBeenCalled();
});

// 11/11/2026 — «Prezzi e fattura del fornitore» era una scheda a sé che
// ripeteva la fattura: il confronto ora si apre dai Collegamenti, vicino alla
// fattura, ed è lo stesso (stessi campi, stessa conferma, stessa chiamata).
it("«Confronta una fattura» sta nei Collegamenti, accanto a «Collega una fattura»", async () => {
  m.righe = [{ id: "r1", descrizione: "Rete", quantita: 2, unita_misura: "mq", movimento_id: null, arrivo_registrato_il: null }];
  apri();
  expect(await screen.findByText("n. FT-88")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Collega una fattura" })).toBeInTheDocument();
  expect(screen.queryByText("Prezzi e fattura del fornitore")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Confronta una fattura" }));
  expect(screen.getByLabelText("Cerca per numero o data")).toBeInTheDocument();
  expect(screen.getByLabelText("Fattura dello stesso fornitore")).toBeInTheDocument();
  expect(screen.getByText(/Ho confrontato le righe con la fattura originale/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Salva il confronto prezzi" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Chiudi confronto" }));
  expect(screen.queryByLabelText("Cerca per numero o data")).not.toBeInTheDocument();
});

// 12/11/2026 — la conferma delle consegne non scriveva caricata_a_magazzino_at:
// a merce in giacenza la scheda diceva «Carico non ancora confermato».
const magazzino = { destinazione: "magazzino", warehouse_id: "w1", warehouses: { name: "Sede" } };

it("una bolla confermata dalle consegne risulta caricata anche senza la data in testata", () => {
  m.righe = [{ id: "r1", quantita: 5, movimento_id: null, arrivo_registrato_il: "2026-11-05T10:00:00Z" }];
  m.consegne = [{ id: "k1", riga_id: "r1", quantita: 5, order_id: null, tipo: "ingresso", destinazione: "magazzino", created_at: "2026-11-05T10:00:00Z" }];
  apri(ddt(magazzino));
  expect(screen.getByText("Caricata in magazzino il 05/11/2026")).toBeInTheDocument();
  expect(screen.queryByText(/Carico non ancora confermato/)).not.toBeInTheDocument();
});

it("con la data in testata dice quando è stata caricata", () => {
  apri(ddt({ ...magazzino, caricata_a_magazzino_at: "2026-11-03T09:00:00Z" }));
  expect(screen.getByText("Caricata in magazzino il 03/11/2026")).toBeInTheDocument();
});

it("con righe ancora da confermare dice quante sono e porta alle consegne", () => {
  m.righe = [
    { id: "r1", quantita: 5, movimento_id: null, arrivo_registrato_il: null },
    { id: "r2", quantita: 2, movimento_id: null, arrivo_registrato_il: "2026-11-05T10:00:00Z" },
    { id: "r3", quantita: 1, movimento_id: null, arrivo_registrato_il: null },
  ];
  m.consegne = [{ id: "k1", riga_id: "r2", quantita: 2, order_id: null, tipo: "ingresso", destinazione: "magazzino", created_at: "2026-11-05T10:00:00Z" }];
  const vai = vi.fn();
  apri(ddt(magazzino), vai);
  expect(screen.getByText(/2 righe da caricare:/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "confermale qui sotto" }));
  expect(vai).toHaveBeenCalled();
});

it("una bolla per il cantiere senza merce in magazzino non entra in giacenza", () => {
  m.righe = [{ id: "r1", quantita: 5, movimento_id: null, arrivo_registrato_il: null }];
  apri();
  expect(screen.getByText("Non entra in giacenza.")).toBeInTheDocument();
});
