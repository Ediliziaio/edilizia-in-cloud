import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const state = vi.hoisted(() => ({
  company: "demo" as string | undefined,
  rows: [] as Record<string, unknown>[],
  calls: [] as { table: string; steps: unknown[][] }[],
  failAt: -1,
  failExisting: false,
  assigned: 0,
}));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({
  useEffectiveCompanyId: () => state.company,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from(table: string) {
      const steps: unknown[][] = [];
      const query = new Proxy(
        {},
        {
          get(_, key) {
            if (key === "then")
              return (done: (value: unknown) => void) => {
                state.calls.push({ table, steps });
                const range = steps.find((s) => s[0] === "range");
                const isWrite = steps.some((s) =>
                  ["insert", "update", "delete"].includes(String(s[0])),
                );
                const failed =
                  (range && range[1] === state.failAt) ||
                  (state.failExisting && table === "hr_profili" && !range);
                return Promise.resolve(
                  failed
                    ? { data: null, error: new Error("Offline") }
                    : {
                        data: isWrite
                          ? null
                          : range
                            ? state.rows.slice(
                                Number(range[1]),
                                Number(range[2]) + 1,
                              )
                            : [],
                        count: state.assigned,
                        error: null,
                      },
                ).then(done);
              };
            if (
              ![
                "select",
                "eq",
                "order",
                "range",
                "abortSignal",
                "insert",
                "update",
                "delete",
              ].includes(String(key))
            )
              throw new Error(`Unexpected query operation ${String(key)}`);
            return (...args: unknown[]) => {
              steps.push([key, ...args]);
              return query;
            };
          },
        },
      );
      return query;
    },
  },
}));
import {
  useHrSedePeople,
  useCreateHrSede,
  useUpdateHrSede,
  useDeleteHrSede,
} from "@/hooks/useHrSedi";
import { useOrganigramma, useSyncFromEmployees } from "@/hooks/useOrganigramma";
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
  state.company = "demo";
  state.calls = [];
  state.rows = [];
  state.failAt = -1;
  state.failExisting = false;
  state.assigned = 0;
});
afterEach(cleanup);

describe("organizzazione: letture isolate, complete e cancellabili", () => {
  it.each(["people", "tree"])(
    "reads >1000 %s without losing the last page",
    async (kind) => {
      state.rows = Array.from({ length: 1001 }, (_, i) => ({
        id: String(i),
        nome: "Anna",
        cognome: "Rossi",
        attivo: true,
        responsabile_id: null as string | null,
      }));
      const { result } = renderHook(
        () => (kind === "people" ? useHrSedePeople() : useOrganigramma()),
        { wrapper },
      );
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(state.calls).toHaveLength(3);
      for (const c of state.calls) {
        expect(c.steps).toContainEqual(["eq", "company_id", "demo"]);
        expect(c.steps).toContainEqual(["order", "id"]);
        expect(c.steps.find((s) => s[0] === "abortSignal")?.[1]).toBeInstanceOf(
          AbortSignal,
        );
        if (kind === "people")
          expect(c.steps).toContainEqual([
            "select",
            "id, nome, cognome, mansione, sede_id, attivo",
          ]);
        else expect(c.steps).toContainEqual(["eq", "attivo", true]);
      }
      const data = result.current.data;
      expect(Array.isArray(data) ? data.length : data?.profili.length).toBe(
        1001,
      );
    },
  );
  it("does not expose partial people results when a later page fails", async () => {
    state.rows = Array.from({ length: 501 }, (_, i) => ({ id: String(i) }));
    state.failAt = 500;
    const { result } = renderHook(() => useHrSedePeople(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });
  it("never requests all companies when company is unavailable", () => {
    state.company = undefined;
    renderHook(() => useHrSedePeople(), { wrapper });
    expect(state.calls).toEqual([]);
  });
});

describe("organizzazione: scritture simulate e guardie", () => {
  it("rejects incomplete GPS before calling the database", async () => {
    const { result } = renderHook(() => useCreateHrSede(), { wrapper });
    await act(async () => {
      await expect(
        result.current.mutateAsync({ nome: "Test", lat: 45, lng: null }),
      ).rejects.toThrow(/sia latitudine/);
    });
    expect(state.calls).toEqual([]);
  });
  it("keeps zero coordinates and fixes company from the current session", async () => {
    const { result } = renderHook(() => useCreateHrSede(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({
        nome: "Test",
        company_id: "other",
        lat: 0,
        lng: 0,
      });
    });
    expect(state.calls[0].steps).toContainEqual([
      "insert",
      expect.objectContaining({ company_id: "demo", lat: 0, lng: 0 }),
    ]);
  });
  it("scopes partial status updates without requiring GPS", async () => {
    const { result } = renderHook(() => useUpdateHrSede(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ id: "site", attiva: false });
    });
    expect(state.calls[0].steps).toContainEqual(["eq", "company_id", "demo"]);
    expect(state.calls[0].steps).toContainEqual(["eq", "id", "site"]);
  });
  it("blocks deletion if active OR inactive profiles are assigned", async () => {
    state.assigned = 1;
    const { result } = renderHook(() => useDeleteHrSede(), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync("site")).rejects.toThrow(
        /assegnata/,
      );
    });
    expect(
      state.calls.some((c) => c.steps.some((s) => s[0] === "delete")),
    ).toBe(false);
    expect(state.calls[0].steps).toContainEqual(["eq", "sede_id", "site"]);
  });
  it("does not insert potentially duplicate HR profiles when checking existing profiles fails", async () => {
    state.failExisting = true;
    const { result } = renderHook(() => useSyncFromEmployees(), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync()).rejects.toThrow("Offline");
    });
    expect(
      state.calls.some((c) => c.steps.some((s) => s[0] === "insert")),
    ).toBe(false);
  });
});
