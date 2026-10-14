import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  options: [] as {
    enabled: boolean;
    queryKey: unknown[];
    queryFn: (c: { signal: AbortSignal }) => Promise<unknown>;
  }[],
  calls: [] as { method: string; args: unknown[] }[],
  cached: [{ id: "cached" }],
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: (o: (typeof state.options)[number]) => {
    state.options.push(o);
    return { ...o, data: state.cached };
  },
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      const b: Record<string, unknown> = {};
      for (const method of [
        "select",
        "eq",
        "lte",
        "gte",
        "order",
        "range",
        "abortSignal",
        "overrideTypes",
      ])
        b[method] = (...args: unknown[]) => {
          state.calls.push({ method, args });
          return b;
        };
      b.then = (ok: (v: unknown) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(ok);
      return b;
    },
  },
}));
import { useCalendarLeaves } from "@/hooks/useCalendarLeaves";
const args = {
  company: "company",
  user: "me",
  from: "2026-10-01",
  to: "2026-10-31",
  team: false,
  enabled: true,
};
beforeEach(() => {
  state.options = [];
  state.calls = [];
});
describe("Assenze personali e cache", () => {
  it("filtra davvero i genitori tramite inner join e comprende le richieste Campo personali", async () => {
    useCalendarLeaves(args);
    await state.options[0].queryFn({ signal: new AbortController().signal });
    expect(state.calls).toContainEqual({
      method: "eq",
      args: ["profilo.user_id", "me"],
    });
    expect(state.calls).toContainEqual({
      method: "eq",
      args: ["user_id", "me"],
    });
    expect(
      state.calls.some(
        (c) => c.method === "select" && String(c.args[0]).includes("!inner"),
      ),
    ).toBe(true);
  });
  it("senza un utente non legge e non presenta la cache", async () => {
    const r = useCalendarLeaves({ ...args, user: undefined });
    expect(r.data).toBeUndefined();
    expect(state.options[0].enabled).toBe(false);
    await expect(
      state.options[0].queryFn({ signal: new AbortController().signal }),
    ).rejects.toThrow();
    expect(state.calls).toEqual([]);
  });
  it("lo scope team cambia la cache e resta separato da quello personale", async () => {
    useCalendarLeaves(args);
    const key = state.options[0].queryKey;
    useCalendarLeaves({ ...args, team: true });
    expect(state.options[1].queryKey).not.toEqual(key);
    await state.options[1].queryFn({ signal: new AbortController().signal });
    expect(
      state.calls.some((c) => c.method === "eq" && c.args[0] === "user_id"),
    ).toBe(false);
  });
});
