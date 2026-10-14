import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useModelliPagamento } from "@/hooks/useModelliPagamento";
import type { ModelloPagamento } from "@/lib/orders/modelliPagamento";
type Query = { queryFn: (ctx: { signal: AbortSignal }) => Promise<unknown> };
const stato = vi.hoisted(() => ({
  queries: [] as Query[],
  rows: {} as Record<string, Array<Record<string, unknown>>>,
  filtri: [] as unknown[][],
  erroreDa: null as number | null,
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ effectiveCompany: { id: "azienda-1" } }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: (q: Query) => {
    stato.queries.push(q);
    return { data: undefined as undefined, isLoading: false, refetch: vi.fn() };
  },
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: () => ({ mutate: vi.fn() }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      let from = 0,
        to = 999;
      const reply = () => ({
        data: (stato.rows[table] ?? []).slice(from, to + 1),
        error:
          table === "payment_plan_template_rows" &&
          stato.erroreDa !== null &&
          from >= stato.erroreDa
            ? { message: "Rete interrotta" }
            : null,
      });
      const q = {
        select: () => q,
        order: () => q,
        abortSignal: () => q,
        eq: (key: string, value: unknown) => {
          stato.filtri.push([table, key, value]);
          return q;
        },
        range: (a: number, b: number) => {
          from = a;
          to = b;
          return q;
        },
        maybeSingle: async () => ({
          data: stato.rows[table]?.[0] ?? null,
          error: null as null,
        }),
        then: (ok: (r: unknown) => unknown) =>
          Promise.resolve(reply()).then(ok),
      };
      return q;
    },
  },
}));
beforeEach(() => {
  stato.queries = [];
  stato.filtri = [];
  stato.erroreDa = null;
  stato.rows = {};
});
afterEach(cleanup);
describe("Letture complete dei piani di pagamento", () => {
  function prepara() {
    stato.rows.payment_plan_templates = Array.from({ length: 140 }, (_, i) => ({
      id: `m${i}`,
      name: `Piano ${i}`,
      position: i,
    }));
    stato.rows.payment_plan_template_rows =
      stato.rows.payment_plan_templates.flatMap((m, i) =>
        Array.from({ length: 8 }, (_, n) => ({
          id: `r${i}-${n}`,
          template_id: m.id,
          position: n,
          label: `Rata ${n}`,
          type: n === 7 ? "balance" : "deposit",
          percent: n === 7 ? 30 : 10,
          trigger_evento: "data_fissa",
          trigger_numero: null as null,
          giorni_preavviso: 7,
        })),
      );
    renderHook(() => useModelliPagamento());
  }
  it("non perde le rate oltre la millesima e isola i dati per azienda", async () => {
    prepara();
    const result = (await stato.queries[0].queryFn({
      signal: new AbortController().signal,
    })) as { modelli: ModelloPagamento[]; disponibile: boolean };
    expect(result.disponibile).toBe(true);
    expect(result.modelli[139].righe).toHaveLength(8);
    expect(result.modelli[139].righe.reduce((s, r) => s + r.percent, 0)).toBe(
      100,
    );
    expect(stato.filtri).toContainEqual([
      "payment_plan_template_rows",
      "company_id",
      "azienda-1",
    ]);
  });
  it("una pagina non letta non diventa un piano aziendale incompleto", async () => {
    prepara();
    stato.erroreDa = 1000;
    const result = (await stato.queries[0].queryFn({
      signal: new AbortController().signal,
    })) as { modelli: ModelloPagamento[]; disponibile: boolean };
    expect(result.disponibile).toBe(false);
    expect(result.modelli).toEqual([]);
  });
});
