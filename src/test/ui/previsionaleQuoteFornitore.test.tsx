import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

const fixture = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[], covered: [] as Record<string, unknown>[], coverageError: false }));
const queryCalls = vi.hoisted(() => [] as Array<{ table: string; method: string; args: unknown[] }>);
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "azienda" } }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: (table: string) => {
    const q: Record<string, unknown> = {};
    for (const method of ["select", "eq", "lte", "gte", "order", "limit", "is", "in", "not"])
      q[method] = (...args: unknown[]) => { queryCalls.push({ table, method, args }); return q; };
    q.then = (ok: (x: unknown) => unknown, fail?: (e: unknown) => unknown) => Promise.resolve({
      data: table === "order_items" ? fixture.rows : table === "v_articoli_gia_a_costo" ? fixture.covered : [],
      error: table === "v_articoli_gia_a_costo" && fixture.coverageError ? new Error("copertura non disponibile") : null,
    }).then(ok, fail);
    return q;
  },
  rpc: () => Promise.resolve({ data: null, error: null }),
} }));

import { useCashFlowData } from "@/hooks/useCashFlowData";

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderHook(() => useCashFlowData(), {
    wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  });
}
beforeEach(() => {
  fixture.coverageError = false; fixture.covered = []; queryCalls.length = 0;
  fixture.rows = [{ id: "item", name: "Serramenti", purchase_price: 1000, quantity: 2,
    payment_method: "50_50", deposit_paid: false, balance_paid: false,
    deposit_expected_date: "2026-10-10", balance_expected_date: "2026-11-20",
    order: { id: "commessa", order_code: "C-1" }, supplier: { name: "Fornitore" } }];
});

describe("Hook tesoreria: quote dalla fonte esistente", () => {
  it("alimenta le viste con entrambe le uscite prima del pagamento dell'acconto", async () => {
    const { result } = mount();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.expectedSupplierPayments).toMatchObject([
      { type: "Acconto Fornitore", amount: 1000 }, { type: "Saldo Fornitore", amount: 1000 },
    ]);
  });
  it("usa la copertura esistente per sopprimere la seconda rappresentazione", async () => {
    fixture.covered = [{ order_item_id: "item" }];
    const { result } = mount();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.expectedSupplierPayments).toEqual([]);
  });
  it("espone l'errore di copertura invece di presentare il forecast come valido", async () => {
    fixture.coverageError = true;
    const { result } = mount();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isError).toBe(true);
  });
  it("richiede copertura e articoli nel perimetro azienda", async () => {
    const { result } = mount();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(queryCalls).toContainEqual({ table: "v_articoli_gia_a_costo", method: "eq", args: ["company_id", "azienda"] });
    expect(queryCalls).toContainEqual({ table: "order_items", method: "eq", args: ["order.company_id", "azienda"] });
    expect(queryCalls.every(c => !["insert", "update", "delete"].includes(c.method))).toBe(true);
  });
});
