import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
const m = vi.hoisted(() => ({
  rpc: vi.fn(),
  toastError: vi.fn(),
  magazzini: [] as Array<{ id: string }>,
}));
vi.mock("sonner", () => ({ toast: { error: m.toastError, success: vi.fn() } }));
vi.mock("@/hooks/useWarehouses", () => ({
  useWarehouses: () => ({ warehouses: m.magazzini, isLoading: false, isFetched: true, error: null as null }),
}));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ solaLettura: false, canEditOrders: true, canManagePurchasing: true, canEditWarehouse: true }),
}));
vi.mock("@/hooks/useConsegneDDT", () => ({
  useConsegneDDT: () => ({ data: [] as unknown[], isLoading: false, isError: false, refetch: vi.fn() }),
}));
vi.mock("@/hooks/useDDTRicezione", () => ({
  useDDTRighe: () => ({
    data: [
      {
        id: "r1",
        descrizione: "Cemento",
        quantita: 10,
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
});
afterEach(cleanup);

it("senza magazzini la riga parte per il cantiere, con la commessa della bolla (11/11/2026)", () => {
  apri(ddt({ order_id: "c1" }));
  selezionaRiga();
  const dest = screen.getByDisplayValue("Cantiere");
  expect(dest).toBeInTheDocument();
  expect(screen.queryByRole("option", { name: "Magazzino" })).not.toBeInTheDocument();
  expect(screen.getByText("commessa: c1")).toBeInTheDocument();
  expect(screen.queryByText("selettore magazzino")).not.toBeInTheDocument();
});

it("senza commessa sulla bolla il cantiere si sceglie: senza commessa non si manda niente", async () => {
  apri();
  selezionaRiga();
  expect(screen.getByText("commessa: da scegliere")).toBeInTheDocument();
  fireEvent.click(screen.getByText(/Ho controllato quantità/));
  fireEvent.click(screen.getByRole("button", { name: /Conferma 1 consegna/ }));
  await waitFor(() => expect(m.toastError).toHaveBeenCalled());
  expect(m.rpc).not.toHaveBeenCalled();
  expect(m.toastError.mock.calls[0][1].description).toMatch(/Scegli la commessa/);
});

it("l'errore del database sul magazzino diventa l'indicazione su cosa fare", async () => {
  m.rpc.mockResolvedValue({ error: { message: "Magazzino non disponibile o permesso mancante" } });
  apri(ddt({ order_id: "c1" }));
  selezionaRiga();
  fireEvent.click(screen.getByText(/Ho controllato quantità/));
  fireEvent.click(screen.getByRole("button", { name: /Conferma 1 consegna/ }));
  await waitFor(() => expect(m.toastError).toHaveBeenCalled());
  expect(m.toastError.mock.calls[0][1].description).toBe(
    "Non hai magazzini: scegli il cantiere di destinazione o crea un magazzino in Impostazioni",
  );
});

it("con i magazzini la riga segue la destinazione della bolla", () => {
  m.magazzini = [{ id: "w" }];
  apri();
  selezionaRiga();
  expect(screen.getByDisplayValue("Magazzino")).toBeInTheDocument();
  expect(screen.getByText("selettore magazzino")).toBeInTheDocument();
});
