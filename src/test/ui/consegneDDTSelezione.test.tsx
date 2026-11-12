import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
const m = vi.hoisted(() => ({
  rpc: vi.fn(),
  toastError: vi.fn(),
  magazzini: [] as Array<{ id: string }>,
  consegne: [] as Array<Record<string, unknown>>,
  quantita: 10,
}));
vi.mock("sonner", () => ({ toast: { error: m.toastError, success: vi.fn() } }));
vi.mock("@/hooks/useWarehouses", () => ({
  useWarehouses: () => ({ warehouses: m.magazzini, isLoading: false, isFetched: true, error: null as null }),
}));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ solaLettura: false, canEditOrders: true, canManagePurchasing: true, canEditWarehouse: true }),
}));
vi.mock("@/hooks/useConsegneDDT", () => ({
  useConsegneDDT: () => ({ data: m.consegne, isLoading: false, isError: false, refetch: vi.fn() }),
}));
vi.mock("@/hooks/useDDTRicezione", () => ({
  useDDTRighe: () => ({
    data: [
      {
        id: "r1",
        descrizione: "Cemento",
        quantita: m.quantita,
        unita_misura: "sacchi",
        prezzo_unitario: null as null,
        purchase_order_item_id: null as null,
        order_item_id: null as null,
        movimento_id: null as null,
        arrivo_registrato_il: null as null,
      },
    ],
    isLoading: false,
    isError: false,
  }),
}));
vi.mock("@/lib/ddt/documentiPersistenti", () => ({
  documentiDb: {
    rpc: m.rpc,
    from: () => ({ select: () => ({ eq: () => ({ in: async () => ({ data: [] as unknown[], error: null as null }) }) }) }),
  },
}));
vi.mock("@/lib/listino/loadCatalogPages", () => ({ loadCatalogPages: async () => [] as unknown[] }));
vi.mock("@/components/warehouse/WarehouseSelect", () => ({ WarehouseSelect: () => <p>selettore magazzino</p> }));
vi.mock("@/components/warehouse/OrderSelectCombobox", () => ({
  OrderSelectCombobox: ({ value }: { value?: string }) => <p>commessa: {value ?? "da scegliere"}</p>,
}));
import { ConsegneDDTCard } from "@/components/ddt/ConsegneDDTCard";

const ddt = (extra: Record<string, unknown> = {}) =>
  ({
    id: "d",
    company_id: "az",
    supplier_id: null,
    destinazione: "magazzino",
    order_id: null,
    warehouse_id: null,
    ...extra,
  }) as never;
const apri = (d = ddt()) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <ConsegneDDTCard ddt={d} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
const selezionaRiga = () => fireEvent.click(screen.getAllByRole("checkbox")[0]);

beforeEach(() => {
  m.rpc.mockReset();
  m.toastError.mockReset();
  m.magazzini = [];
  m.consegne = [];
  m.quantita = 10;
});
afterEach(cleanup);

// 11/11/2026 — Spunta, «Conferma N consegne» e «Crea nuovi articoli» erano
// sempre in pagina, anche a zero righe scelte («Conferma 0 consegne»).
it("le azioni della consegna compaiono solo con almeno una riga selezionata", () => {
  apri(ddt({ destinazione: "cantiere", order_id: "c1" }));
  expect(screen.queryByRole("button", { name: /Conferma \d+ consegn/ })).not.toBeInTheDocument();
  expect(screen.queryByText(/Ho controllato quantità/)).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Crea nuovi articoli per le selezionate" })).not.toBeInTheDocument();
  // «Seleziona tutte» resta: è il modo di cominciare.
  expect(screen.getByRole("button", { name: "Seleziona tutte" })).toBeInTheDocument();

  selezionaRiga();
  expect(screen.getByRole("button", { name: /Conferma 1 consegna/ })).toBeDisabled();
  expect(screen.getByText(/Ho controllato quantità/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Crea nuovi articoli per le selezionate" })).toBeInTheDocument();

  selezionaRiga();
  expect(screen.queryByRole("button", { name: /Conferma \d+ consegn/ })).not.toBeInTheDocument();
});

it("le spiegazioni stanno nel suggerimento, non in paragrafi", () => {
  apri(ddt({ destinazione: "cantiere", order_id: "c1" }));
  expect(screen.queryByText(/Ricevuto e consumato restano distinti\.$/)).not.toBeInTheDocument();
  expect(screen.getByRole("img", { name: /Ricevuto e consumato restano distinti/ })).toBeInTheDocument();
});

it("le consegne già confermate restano visibili, una riga ciascuna", () => {
  m.consegne = [
    { id: "k1", riga_id: "r1", quantita: 4, unita_misura: "sacchi", tipo: "ingresso", destinazione: "cantiere", order_id: "c1" },
  ];
  apri(ddt({ destinazione: "cantiere", order_id: "c1" }));
  const elenco = screen.getByRole("list", { name: "Consegne confermate" });
  expect(elenco).toHaveTextContent("4 sacchi");
  expect(elenco).toHaveTextContent("Cemento");
  expect(elenco).toHaveTextContent("Consegnato in cantiere");
});

it.each(["0", "-1", "non numerico", "11"])("blocca %s prima del salvataggio e spiega la quantità da correggere", (q) => {
  apri(ddt({ destinazione: "cantiere", order_id: "c1" }));
  selezionaRiga();
  fireEvent.click(screen.getByRole("button", { name: "Crea nuovi articoli per le selezionate" }));
  const campo = screen.getByRole("textbox", { name: "Quantità consegnata Cemento" });
  fireEvent.change(campo, { target: { value: q } });
  fireEvent.click(screen.getByRole("checkbox", { name: /Ho controllato quantità/ }));
  expect(screen.getByRole("button", { name: "Conferma 1 consegna" })).toBeDisabled();
  expect(campo).toHaveAttribute("aria-invalid", "true");
  expect(screen.getByRole("alert")).toHaveTextContent(q === "11" ? /massimo 10/ : /maggiore di zero/);
  expect(m.rpc).not.toHaveBeenCalled();
});

it("salva una quantità decimale con virgola senza trasformarla in un intero", async () => {
  m.rpc.mockResolvedValue({ data: { righe: 1 }, error: null });
  apri(ddt({ destinazione: "cantiere", order_id: "c1" }));
  selezionaRiga();
  fireEvent.click(screen.getByRole("button", { name: "Crea nuovi articoli per le selezionate" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Quantità consegnata Cemento" }), { target: { value: "2,5" } });
  fireEvent.click(screen.getByRole("checkbox", { name: /Ho controllato quantità/ }));
  fireEvent.click(screen.getByRole("button", { name: "Conferma 1 consegna" }));
  await waitFor(() => expect(m.rpc).toHaveBeenCalledWith("ddt_conferma_consegna", expect.objectContaining({ p_righe: [expect.objectContaining({ quantita: 2.5, destinazione: "cantiere", crea_articolo: true })] })));
});

it("non ripropone una consegna già completata dalla somma di decimali", () => {
  m.quantita = 0.8;
  m.consegne = [0.1, 0.7].map((q, i) => ({ id: `k${i}`, riga_id: "r1", quantita: q, tipo: "ingresso", destinazione: "cantiere", unita_misura: "sacchi" }));
  apri(ddt({ destinazione: "cantiere", order_id: "c1" }));
  expect(screen.queryByRole("button", { name: "Seleziona tutte" })).not.toBeInTheDocument();
  expect(screen.queryByRole("checkbox", { name: /Cemento Da confermare/ })).not.toBeInTheDocument();
});

it("propone il residuo decimale della bolla senza cifre spurie", () => {
  m.quantita = 0.3;
  m.consegne = [{ id: "k", riga_id: "r1", quantita: 0.1, tipo: "ingresso", destinazione: "cantiere", unita_misura: "sacchi" }];
  apri(ddt({ destinazione: "cantiere", order_id: "c1" }));
  selezionaRiga();
  expect(screen.getByRole("textbox", { name: "Quantità consegnata Cemento" })).toHaveValue("0.2");
});
