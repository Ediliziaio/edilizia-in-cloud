import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  rpc: vi.fn(),
  reads: [] as {
    table: string;
    filters: [string, unknown][];
    ids: string[];
    offset: number;
  }[],
  fail: "",
  paginated: false,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: state.rpc,
    from: (table: string) => {
      const record = {
        table,
        filters: [] as [string, unknown][],
        ids: [] as string[],
        offset: 0,
      };
      const q: Record<string, unknown> = {};
      for (const method of ["select", "order", "neq", "is"])
        q[method] = () => q;
      q.eq = (field: string, value: unknown) => {
        record.filters.push([field, value]);
        return q;
      };
      q.in = (_field: string, ids: string[]) => {
        record.ids = ids;
        return q;
      };
      q.range = (offset: number) => {
        record.offset = offset;
        return q;
      };
      q.then = (yes: (r: unknown) => unknown) => {
        state.reads.push(record);
        return Promise.resolve({
          data:
            state.paginated && table === "tasks"
              ? Array.from(
                  { length: record.offset === 0 ? 500 : 1 },
                  (_, i) => ({
                    id: `${record.offset + i}`,
                    order_id: record.ids[0],
                  }),
                )
              : [],
          error: state.fail === table ? new Error("Lettura negata") : null,
        }).then(yes);
      };
      return q;
    },
  },
}));
import { loadOggiOverview, useCantieriOggi } from "@/hooks/useCantieriOggi";
beforeEach(() => {
  vi.clearAllMocks();
  state.reads = [];
  state.fail = "";
  state.paginated = false;
  state.rpc.mockResolvedValue({ data: [], error: null });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
describe("daily workspace read contract", () => {
  it("batches sites rather than issuing queries for every row", async () => {
    await loadOggiOverview(
      "company",
      Array.from({ length: 205 }, (_, i) => `order-${i}`),
    );
    expect(state.reads).toHaveLength(9); // 3 sources × 3 bounded batches
    expect(
      state.reads.every(
        (r) =>
          r.ids.length <= 100 &&
          r.filters.some(
            ([key, value]) => key === "company_id" && value === "company",
          ),
      ),
    ).toBe(true);
  });
  it("reads every page instead of silently stopping at the API row limit", async () => {
    state.paginated = true;
    const result = await loadOggiOverview("company", ["order"]);
    expect(result.tasks).toHaveLength(501);
    expect(
      state.reads.filter((r) => r.table === "tasks").map((r) => r.offset),
    ).toEqual([0, 500]);
  });
  it("propagates a failed source instead of treating it as an empty success", async () => {
    state.fail = "tasks";
    await expect(loadOggiOverview("company", ["order"])).rejects.toThrow(
      "Lettura negata",
    );
  });
  it("does not fetch detail sources for an empty feed", async () => {
    expect(await loadOggiOverview("company", [])).toEqual({
      orders: [],
      phases: [],
      tasks: [],
    });
    expect(state.reads).toHaveLength(0);
  });
  it("keys the RPC and the cache by the Italian workday", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-27T23:30:00Z"));
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useCantieriOggi("company"), {
      wrapper,
    });
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(state.rpc).toHaveBeenCalledWith("ufficio_cantieri_oggi", {
      p_giorno: "2026-10-28",
    });
    expect(
      client.getQueryData(["ufficio-cantieri-oggi", "company", "2026-10-28"]),
    ).toEqual([]);
    expect(state.reads).toHaveLength(0);
  });
});
