import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
const m = vi.hoisted(() => ({
  create: vi.fn(),
  upload: vi.fn(),
  magazzini: [] as Array<{ id: string }>,
  commessa: null as null | { id: string; order_code: string },
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: null as null }) }));
vi.mock("@/hooks/useWarehouses", () => ({
  useWarehouses: () => ({ warehouses: m.magazzini, isLoading: false, isFetched: true, error: null as null }),
}));
vi.mock("@/hooks/usePurchaseOrders", () => ({
  usePurchaseOrders: () => ({
    orders: [
      {
        id: "p",
        oda_number: "ODA-P",
        status: "inviato",
        order_id: m.commessa?.id ?? null,
        orders: m.commessa,
        suppliers: { name: "Fornitore demo" },
      },
    ],
  }),
}));
vi.mock("@/hooks/useDDTRicezione", () => ({
  useDDTRicezioneMutations: () => ({ createDDT: { mutateAsync: m.create } }),
  useDDTAttachments: () => ({ uploadMainDDT: { mutateAsync: m.upload }, uploadAttachments: { mutateAsync: m.upload } }),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: vi.fn(), functions: { invoke: vi.fn() } } }));
vi.mock("@/components/warehouse/WarehouseSelect", () => ({
  WarehouseSelect: ({ placeholder }: { placeholder?: string }) => <p>{placeholder}</p>,
}));
vi.mock("@/components/warehouse/OrderSelectCombobox", () => ({ OrderSelectCombobox: (): null => null }));
vi.mock("@/components/orders/SupplierSelect", () => ({ SupplierSelect: (): null => null }));
vi.mock("@/components/ddt/DDTAttachmentUploader", () => ({ DDTAttachmentUploader: (): null => null }));
import { NewDDTDialog } from "@/components/ddt/NewDDTDialog";
beforeEach(() => {
  m.create.mockReset().mockResolvedValue({ id: "d" });
  m.magazzini = [];
  m.commessa = null;
});
afterEach(cleanup);
const apriAllaVerifica = () => {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <NewDDTDialog open prefillPurchaseOrderId="p" restaQui onOpenChange={vi.fn()} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  fireEvent.change(screen.getByLabelText("Numero DDT"), { target: { value: "DDT-1" } });
  fireEvent.click(screen.getByRole("button", { name: "Avanti" }));
  fireEvent.click(screen.getByRole("button", { name: "Avanti" }));
  fireEvent.change(screen.getByLabelText("Quantità ricevuta"), { target: { value: "2" } });
};

it("senza magazzini e con la commessa dall'ODA la bolla parte per il cantiere (11/11/2026)", async () => {
  m.commessa = { id: "c", order_code: "C-1" };
  apriAllaVerifica();
  fireEvent.click(screen.getByRole("button", { name: "Registra DDT" }));
  await waitFor(() => expect(m.create).toHaveBeenCalledTimes(1));
  expect(m.create.mock.calls[0][0]).toMatchObject({ destinazione: "cantiere" });
});

it("senza magazzini niente segnaposto «Default»: c'è l'indicazione su cosa fare", () => {
  apriAllaVerifica();
  expect(screen.queryByText("Default (dal fornitore o dall'ODA)")).not.toBeInTheDocument();
  expect(screen.getByText(/Non hai magazzini/)).toBeInTheDocument();
});

it("con i magazzini resta tutto come prima", async () => {
  m.magazzini = [{ id: "w" }];
  m.commessa = { id: "c", order_code: "C-1" };
  apriAllaVerifica();
  expect(screen.getByText("Default (dal fornitore o dall'ODA)")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Registra DDT" }));
  await waitFor(() => expect(m.create).toHaveBeenCalledTimes(1));
  expect(m.create.mock.calls[0][0]).toMatchObject({ destinazione: "magazzino" });
});
