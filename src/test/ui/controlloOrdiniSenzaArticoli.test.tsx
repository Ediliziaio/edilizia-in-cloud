// 11/11/2026 — Nell'anteprima della bolla comparivano insieme il chip
// «ODA-2026-0052» e «Nessun ordine collegato». Il chip viene dagli ordini
// (ddt_ordini_collegati, testata compresa), il testo guardava le righe degli
// ordini: un ordine senza articoli li faceva comparire tutti e due.
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { avvisoSenzaConfronto } from "@/lib/ddt/controlloOrdini";

const m = vi.hoisted(() => ({
  ordini: [] as Array<{ id: string; oda_number: string }>,
  righe: [] as Array<Record<string, unknown>>,
}));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ solaLettura: false, canManagePurchasing: true }),
}));
vi.mock("@/hooks/useDDTRicezione", () => ({
  useDDTRighe: () => ({ data: [] as unknown[], refetch: vi.fn() }),
}));
vi.mock("@/hooks/useConsegneDDT", () => ({
  useConsegneDDT: () => ({ data: [] as unknown[], refetch: vi.fn() }),
}));
vi.mock("@/hooks/useControlloOrdiniDDT", () => ({
  useControlloOrdiniDDT: () => ({
    data: { ordini: m.ordini, righe: m.righe, bolle: [] as unknown[], manuali: [] as string[] },
    refetch: vi.fn(),
  }),
}));
vi.mock("@/hooks/useConfrontoFattura", () => ({ useOriginaliConfronto: () => ({ data: [] as unknown[] }) }));
vi.mock("@/components/fatturazione/OriginaliConfronto", () => ({ OriginaliConfronto: (): null => null }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/ddt/documentiPersistenti", () => ({ documentiDb: { rpc: vi.fn() } }));
import { ControlloOrdiniDDTCard } from "@/components/ddt/ControlloOrdiniDDTCard";

afterEach(() => {
  cleanup();
  m.ordini = [];
  m.righe = [];
});

const mostra = () =>
  render(
    <MemoryRouter>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ControlloOrdiniDDTCard ddt={{ id: "ddt", company_id: "az", supplier_id: "s", numero_ddt: "1187" } as never} />
      </QueryClientProvider>
    </MemoryRouter>,
  );

describe("avvisoSenzaConfronto", () => {
  it("distingue nessun ordine da un ordine senza articoli", () => {
    expect(avvisoSenzaConfronto(0, 0)).toBe("nessun_ordine");
    expect(avvisoSenzaConfronto(1, 0)).toBe("ordine_senza_articoli");
    expect(avvisoSenzaConfronto(1, 3)).toBeNull();
  });
});

it("con un ordine collegato senza articoli non dice «Nessun ordine collegato»", () => {
  m.ordini = [{ id: "po", oda_number: "ODA-2026-0052" }];
  mostra();
  expect(screen.getByRole("link", { name: "ODA-2026-0052" })).toBeInTheDocument();
  expect(screen.queryByText(/Nessun ordine collegato/)).not.toBeInTheDocument();
  expect(screen.getByText(/L’ordine collegato non ha articoli da confrontare/)).toBeInTheDocument();
});

it("senza ordini dice che non ce n'è nessuno, e non mostra chip", () => {
  mostra();
  expect(screen.getByText(/Nessun ordine collegato/)).toBeInTheDocument();
  expect(screen.queryByLabelText("Ordini collegati al DDT")).not.toBeInTheDocument();
});

it("con gli articoli dell'ordine mostra il confronto e nessun avviso", () => {
  m.ordini = [{ id: "po", oda_number: "ODA-2026-0052" }];
  m.righe = [
    { id: "i1", description: "Tondino", quantity: 10, quantity_received: 0, unit_of_measure: "kg", purchase_order_id: "po", oda_number: "ODA-2026-0052" },
  ];
  mostra();
  expect(screen.queryByText(/Nessun ordine collegato/)).not.toBeInTheDocument();
  expect(screen.queryByText(/non ha articoli da confrontare/)).not.toBeInTheDocument();
  expect(screen.getAllByText("Tondino").length).toBeGreaterThan(0);
});
