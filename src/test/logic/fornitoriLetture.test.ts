import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  queries: [] as Array<{
    queryKey: unknown[];
    queryFn: () => Promise<unknown>;
  }>,
  tables: {} as Record<string, Record<string, unknown>[]>,
  requests: [] as Array<{
    table: string;
    from: number;
    filtri: [string, unknown][];
  }>,
  errorePagina: false,
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ effectiveCompany: { id: "demo" } }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: (typeof state.queries)[number]) => {
    state.queries.push(options);
    return { data: undefined as undefined, isLoading: false, isError: false };
  },
  useMutation: () => ({}),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const filtri: [string, unknown][] = [];
      const b = {
        select: () => b,
        order: () => b,
        eq: (key: string, value: unknown) => {
          filtri.push([key, value]);
          return b;
        },
        neq: () => b,
        in: () => b,
        range: async (from: number, to: number) => {
          state.requests.push({ table, from, filtri });
          if (state.errorePagina && table === "suppliers" && from >= 250)
            return {
              data: null as null,
              error: { message: "Lettura interrotta" },
            };
          const rows = (state.tables[table] ?? []).filter((row) =>
            filtri.every(([key, value]) => row[key] === value),
          );
          return { data: rows.slice(from, to + 1), error: null as null };
        },
      };
      return b;
    },
  },
}));
import {
  useOperationalSuppliers,
  useSupplierDetail,
} from "@/hooks/useOperationalSuppliers";
beforeEach(() => {
  state.queries = [];
  state.requests = [];
  state.errorePagina = false;
  state.tables = {};
});
describe("Letture complete e separate per azienda", () => {
  it("legge tutti i fornitori e aggrega gli acquisti oltre la prima pagina", async () => {
    state.tables.suppliers = Array.from({ length: 1101 }, (_, i) => ({
      id: `f${i}`,
      company_id: "demo",
      name: `Fornitore ${i}`,
    }));
    state.tables.suppliers.push({
      id: "fuori",
      company_id: "altra",
      name: "Altra azienda",
    });
    state.tables.purchase_orders = Array.from({ length: 1251 }, (_, i) => ({
      id: `p${i}`,
      company_id: "demo",
      supplier_id: "f0",
      total: 10,
    }));
    useOperationalSuppliers();
    const query = state.queries.find(
      (q) => q.queryKey[0] === "operational-suppliers",
    )!;
    const result = (await query.queryFn()) as Array<{
      id: string;
      oda_count: number;
      oda_total: number;
    }>;
    expect(result).toHaveLength(1101);
    expect(result.find((r) => r.id === "f0")).toMatchObject({
      oda_count: 1251,
      oda_total: 12510,
    });
    for (const request of state.requests)
      expect(request.filtri).toContainEqual(["company_id", "demo"]);
  });
  it("la prima nota del dettaglio non si ferma a 50 o 1000 movimenti", async () => {
    state.tables.prima_nota_entries = Array.from({ length: 1201 }, (_, i) => ({
      id: `n${i}`,
      company_id: "demo",
      supplier_id: "f1",
      amount: 5,
    }));
    state.tables.prima_nota_entries.push({
      id: "altro-fornitore",
      company_id: "demo",
      supplier_id: "f2",
      amount: 999,
    });
    useSupplierDetail("f1");
    const query = state.queries.find(
      (q) => q.queryKey[0] === "supplier-prima-nota",
    )!;
    expect(await query.queryFn()).toHaveLength(1201);
    for (const request of state.requests)
      expect(request.filtri).toEqual(
        expect.arrayContaining([
          ["company_id", "demo"],
          ["supplier_id", "f1"],
        ]),
      );
  });
  it("una lettura fallita a metà non produce un elenco o totali parziali", async () => {
    state.tables.suppliers = Array.from({ length: 300 }, (_, i) => ({
      id: `f${i}`,
      company_id: "demo",
    }));
    state.errorePagina = true;
    useOperationalSuppliers();
    await expect(state.queries[0].queryFn()).rejects.toThrow(
      "Lettura interrotta",
    );
  });
});
