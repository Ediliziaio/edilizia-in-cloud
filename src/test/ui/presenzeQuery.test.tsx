import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const memory = vi.hoisted(() => ({
  companyId: "demo",
  rows: [] as Array<Record<string, unknown>>,
  calls: [] as Array<{ table: string; steps: unknown[][] }>,
  failFrom: -1,
}));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({
  useEffectiveCompanyId: () => memory.companyId,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from(table: string) {
      const steps: unknown[][] = [];
      const q = new Proxy(
        {},
        {
          get(_, key) {
            if (key === "then")
              return (ok: (value: unknown) => void) => {
                memory.calls.push({ table, steps });
                const range = steps.find((s) => s[0] === "range")!;
                const from = Number(range[1]);
                const to = Number(range[2]);
                return Promise.resolve(
                  from === memory.failFrom
                    ? { data: null, error: new Error("Pagina non disponibile") }
                    : { data: memory.rows.slice(from, to + 1), error: null },
                ).then(ok);
              };
            if (
              ![
                "select",
                "eq",
                "gte",
                "lte",
                "order",
                "range",
                "abortSignal",
              ].includes(String(key))
            )
              throw Error("Operazione non consentita nel test");
            return (...args: unknown[]) => {
              steps.push([key, ...args]);
              return q;
            };
          },
        },
      );
      return q;
    },
  },
}));
import { useGiornate } from "@/hooks/useGiornate";
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider
    client={
      new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 } },
      })
    }
  >
    {children}
  </QueryClientProvider>
);
beforeEach(() => {
  memory.companyId = "demo";
  memory.rows = [];
  memory.calls = [];
  memory.failFrom = -1;
});
afterEach(cleanup);
describe("lettura completa delle presenze senza scritture", () => {
  it("reads beyond 1000 rows, keeping company/date filters and a stable order on every page", async () => {
    memory.rows = Array.from({ length: 1001 }, (_, i) => ({
      id: String(i),
      data: "2026-10-01",
      hr_profili: { nome: "Anna", cognome: "Rossi", reparto: "Ufficio" },
    }));
    const { result } = renderHook(
      () => useGiornate("2026-10-01", "2026-10-31"),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1001);
    expect(
      memory.calls.map((c) => c.steps.find((s) => s[0] === "range")),
    ).toEqual([
      ["range", 0, 499],
      ["range", 500, 999],
      ["range", 1000, 1499],
    ]);
    for (const c of memory.calls) {
      expect(c.table).toBe("hr_giornate");
      expect(c.steps).toContainEqual(["eq", "company_id", "demo"]);
      expect(c.steps).toContainEqual(["gte", "data", "2026-10-01"]);
      expect(c.steps).toContainEqual(["lte", "data", "2026-10-31"]);
      expect(c.steps).toContainEqual(["order", "id", { ascending: true }]);
      expect(
        c.steps.some(
          (s) => s[0] === "abortSignal" && s[1] instanceof AbortSignal,
        ),
      ).toBe(true);
    }
    expect(result.current.data?.[1000].profilo_nome).toBe("Anna");
  });
  it("does not report partial data as successful when a later page fails", async () => {
    memory.rows = Array.from({ length: 501 }, (_, i) => ({
      id: String(i),
        hr_profili: null as null,
    }));
    memory.failFrom = 500;
    const { result } = renderHook(
      () => useGiornate("2026-10-01", "2026-10-31"),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
    expect(result.current.error?.message).toBe("Pagina non disponibile");
  });
  it("never reads all companies while no company is selected", async () => {
    memory.companyId = "";
    const { result } = renderHook(
      () => useGiornate("2026-10-01", "2026-10-31"),
      { wrapper },
    );
    expect(result.current.fetchStatus).toBe("idle");
    expect(memory.calls).toHaveLength(0);
  });
});
