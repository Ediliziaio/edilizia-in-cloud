import { describe, expect, it, vi } from "vitest";
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ effectiveCompany: { id: "company" } }),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import {
  FORECAST_PAGE_SIZE,
  loadForecastDataset,
  readForecastPages,
} from "@/hooks/useForecastLedger";

type PageQuery = ReturnType<Parameters<typeof readForecastPages>[0]>;
type Client = NonNullable<Parameters<typeof loadForecastDataset>[2]>;
function fakeClient(
  tables: Record<string, unknown[]>,
  failures: string[] = [],
  pn: unknown = { saldo: 1234.56, entry_count: 3 },
) {
  const filters: { table: string; column: string; value: unknown }[] = [];
  const client = {
    from(table: string) {
      const chain = {
        select: () => chain,
        order: () => chain,
        neq: () => chain,
        is: () => chain,
        not: () => chain,
        gte: () => chain,
        lte: () => chain,
        eq(column: string, value: unknown) {
          filters.push({ table, column, value });
          return chain;
        },
        range(from: number, to: number) {
          return Promise.resolve({
            data: failures.includes(table)
              ? null
              : (tables[table] ?? []).slice(from, to + 1),
            error: failures.includes(table) ? { message: "Read failed" } : null,
          });
        },
      };
      return chain;
    },
    rpc: vi.fn(async () => ({
      data: pn,
      error: failures.includes("rpc") ? { message: "Aggregate failed" } : null,
    })),
  };
  return { client: client as unknown as Client, filters };
}
describe("forecast sources", () => {
  it("paginates beyond the default API limit without dropping any rows", async () => {
    const rows = Array.from({ length: 1253 }, (_, id) => ({ id }));
    const offsets: number[] = [];
    const result = await readForecastPages<{ id: number }>(
      () =>
        ({
          range(from: number, to: number) {
            offsets.push(from);
            return Promise.resolve({
              data: rows.slice(from, to + 1),
              error: null,
            });
          },
        }) as unknown as PageQuery,
    );
    expect(offsets).toEqual([0, FORECAST_PAGE_SIZE, FORECAST_PAGE_SIZE * 2]);
    expect(result).toHaveLength(1253);
    expect(result.at(-1)?.id).toBe(1252);
  });
  it("fails the source if a later page fails instead of publishing a partial list", async () => {
    let page = 0;
    await expect(
      readForecastPages(
        () =>
          ({
            range() {
              page++;
              return Promise.resolve({
                data: page === 1 ? Array(500).fill({ id: 1 }) : null,
                error: page === 1 ? null : { message: "Next page unavailable" },
              });
            },
          }) as unknown as PageQuery,
      ),
    ).rejects.toThrow("Next page unavailable");
  });
  it("uses the full Prima Nota aggregate when no accounts exist", async () => {
    const { client } = fakeClient({
      prima_nota_entries: [
        {
          id: "recent",
          direction: "entrata",
          amount: 10,
          entry_date: "2026-10-14",
        },
      ],
    });
    const data = await loadForecastDataset("company", "2026-10-14", client);
    expect(data.opening).toMatchObject({ source: "prima-nota", cents: 123456 });
    expect(client.rpc).toHaveBeenCalledWith("get_prima_nota_saldo", {
      p_company_id: "company",
      p_to_date: "2026-10-14",
    });
    expect(data.issues).toEqual([]);
  });
  it("keeps the zero bank balance ahead of a positive Prima Nota", async () => {
    const { client } = fakeClient({
      bank_accounts: [
        {
          id: "b",
          current_balance: 0,
          available_balance: null,
          balance_updated_at: null,
        },
      ],
    });
    expect(
      (await loadForecastDataset("company", "2026-10-14", client)).opening,
    ).toMatchObject({ source: "banca", cents: 0 });
  });
  it("surfaces failed bank and cost reads, without pretending the bank returned zero", async () => {
    const { client } = fakeClient({}, [
      "bank_accounts",
      "company_costs",
      "rpc",
    ]);
    const data = await loadForecastDataset("company", "2026-10-14", client);
    expect(data.issues).toEqual(["Conti bancari", "Saldo Prima Nota", "Spese"]);
    expect(data.opening.cents).toBeNull();
  });
  it("scopes every direct or joined read to the selected company", async () => {
    const { client, filters } = fakeClient({});
    await loadForecastDataset("company-A", "2026-10-14", client);
    expect(
      new Set(
        filters
          .filter((f) => f.column.endsWith("company_id"))
          .map((f) => f.value),
      ),
    ).toEqual(new Set(["company-A"]));
    const tables = new Set(filters.map((f) => f.table));
    expect(tables.size).toBe(18);
    for (const table of tables)
      expect(
        filters.some(
          (f) => f.table === table && f.column.endsWith("company_id"),
        ),
      ).toBe(true);
  });
  it("does not start unscoped reads without an effective company", async () => {
    const { client, filters } = fakeClient({});
    await expect(loadForecastDataset("", "2026-10-14", client)).rejects.toThrow(
      "Seleziona",
    );
    expect(filters).toHaveLength(0);
  });
});
