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
        or(value: string, options?: { referencedTable?: string }) {
          filters.push({ table, column: `or:${options?.referencedTable ?? ""}`, value });
          return chain;
        },
        in: () => chain,
        like: () => chain,
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
    // Il saldo della Prima Nota è un aggregato; le altre RPC restituiscono righe a pagine.
    rpc: vi.fn((name: string, args: Record<string, string>) => {
      if (name !== "get_prima_nota_saldo")
        filters.push({
          table: name,
          column: "p_company_id",
          value: args.p_company_id,
        });
      return name === "get_prima_nota_saldo"
        ? Promise.resolve({
            data: pn,
            error: failures.includes("rpc")
              ? { message: "Aggregate failed" }
              : null,
          })
        : client.from(name);
    }),
  };
  return { client: client as unknown as Client, filters };
}
describe("forecast sources", () => {
  it("legge la garanzia anche di una fattura contabilizzata da anni, senza ripeterla nel residuo", async () => {
    const { client, filters } = fakeClient({
      company_costs: [
        {
          id: "sal",
          name: "SAL Aurora",
          amount: 40000,
          vat_rate: 0,
          due_date: "2026-12-10",
          is_paid: false,
        },
      ],
      prima_nota_entries: [
        {
          id: "acconto",
          cost_id: "sal",
          amount: 20000,
          direction: "uscita",
          entry_date: "2025-01-10",
        },
      ],
      fatture_ricevute: [
        {
          id: "f",
          company_cost_id: "sal",
          trattenuta_garanzia: 2000,
          tipo_documento: "TD01",
          stato: "contabilizzata",
          data_fattura: "2023-01-10",
        },
      ],
      ritenute_garanzia: [
        {
          id: "g",
          direzione: "passiva",
          importo: 2000,
          stato: "trattenuta",
          data_svincolo_prevista: "2028-06-30",
        },
      ],
    });
    const result = await loadForecastDataset("company", "2026-11-11", client);
    expect(result.movements.find((m) => m.id === "costo:sal")?.cents).toBe(
      1800000,
    );
    expect(result.movements.find((m) => m.id === "garanzia:g")?.cents).toBe(
      200000,
    );
    expect(filters).toContainEqual({
      table: "fatture_ricevute",
      column: "or:cost",
      value: "is_paid.eq.false,is_paid.is.null",
    });
    expect(filters).toContainEqual({
      table: "fatture_ricevute",
      column: "company_id",
      value: "company",
    });
  });
  it("porta nel previsionale il residuo delle spese anche con acconti registrati oltre un anno fa", async () => {
    const { client } = fakeClient({
      company_costs: [
        {
          id: "costo-aperto",
          name: "Fornitura Aurora",
          amount: 100000,
          vat_rate: 10,
          due_date: "2026-11-30",
          is_paid: false,
        },
      ],
      prima_nota_entries: [
        {
          id: "acconto-storico",
          cost_id: "costo-aperto",
          amount: 55000,
          direction: "uscita",
          entry_date: "2025-01-10",
          reversal_of: null,
        },
      ],
    });
    const result = await loadForecastDataset("company", "2026-11-11", client);
    expect(
      result.movements.find((m) => m.id === "costo:costo-aperto")?.cents,
    ).toBe(5500000);
  });
  it("suspends the VAT estimate if purchases or fiscal sources fail, even when external sales are available", async () => {
    const { client } = fakeClient(
      {
        invoices: [
          {
            id: "i",
            total: 12200,
            paid_amount: 0,
            due_date: "2026-11-01",
            status: "sent",
            issue_date: "2026-09-01",
            tax_amount: 2200,
          },
        ],
      },
      ["fatture_ricevute"],
    );
    const result = await loadForecastDataset("company", "2026-10-14", client);
    expect(result.movements.some((m) => m.source === "Stima IVA")).toBe(false);
    expect(result.warnings.join(" ")).toMatch(/Stima IVA non disponibile/);
    expect(result.movements.some((m) => m.source === "Fattura")).toBe(true);
  });
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
      bank_accounts_operativi: [
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
      "bank_accounts_operativi",
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
    // 22: dal 29/10/2026 anche `rate_fornitori` (le RiBa escono rata per rata)
    // 24: dal 01/11/2026 anche `ritenute_garanzia` (svincoli) e `cg_loans` (rate dei mutui)
    expect(tables.size).toBe(24);
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
