import { beforeEach, describe, it, expect, vi } from "vitest";
import { applicaFlusso, type PassoFlusso } from "@/lib/flussoLavoro";
const state = vi.hoisted(() => ({
  existing: [] as Record<string, unknown>[],
  templates: [] as Record<string, unknown>[],
  fail: false,
  insert: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: async (_name: string, args: { p_rows: Record<string, unknown>[] }) => {
      state.insert(args.p_rows);
      return { data: args.p_rows.length, error: null as null };
    },
    auth: { getUser: async () => ({ data: { user: { id: "user" } } }) },
    from: (table: string) => {
      let payload: Record<string, unknown>[] | null = null;
      const q: Record<string, unknown> = {};
      for (const key of ["select", "eq", "is", "in", "order"]) q[key] = () => q;
      q.insert = (rows: Record<string, unknown>[]) => {
        payload = rows;
        state.insert(rows);
        return q;
      };
      q.then = (yes: (r: unknown) => unknown) =>
        Promise.resolve({
          data: payload
            ? payload.map((r, i) => ({ ...r, id: `new-${i}` }))
            : table === "order_task_template"
              ? state.templates
              : table === "tasks"
                ? state.existing
                : [],
          error: state.fail ? new Error("Source unavailable") : null,
        }).then(yes);
      return q;
    },
  },
}));
const params = {
  companyId: "company",
  ambito: "commessa" as const,
  entitaId: "order",
  baseDate: new Date("2026-10-27T12:00:00"),
  passiPredefiniti: [] as PassoFlusso[],
  categoriaTask: "ordini",
};
const step = (id: string, title: string, prior?: string) => ({
  id,
  titolo: title,
  giorni_offset: 2,
  priorita: "normale",
  giorni_dopo_sblocco: 3,
  activity_scope: "ufficio",
  office_stage: "acquisti",
  dipende_da_id: prior ?? null,
});
beforeEach(() => {
  vi.clearAllMocks();
  state.existing = [];
  state.templates = [];
  state.fail = false;
});
describe("office workflow application", () => {
  it("creates independent steps in parallel and carries the selected group", async () => {
    state.templates = [step("a", "A"), step("b", "B")];
    expect(await applicaFlusso(params)).toEqual({ created: 2 });
    expect(state.insert).toHaveBeenCalledOnce();
    expect(state.insert.mock.calls[0][0]).toEqual([
      expect.objectContaining({ office_stage: "acquisti", title: "A" }),
      expect.objectContaining({ title: "B" }),
    ]);
  });
  it("does not wait forever for an already completed predecessor", async () => {
    state.existing = [{ id: "done", title: "A", status: "completata" }];
    state.templates = [step("a", "A"), step("b", "B", "a")];
    await applicaFlusso(params);
    expect(state.insert.mock.calls[0][0]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: "B", predecessor_title: "A" }),
      ]),
    );
  });
  it("does not duplicate a title already present", async () => {
    state.existing = [{ id: "a", title: " A ", status: "da_fare" }];
    state.templates = [step("a", "A")];
    expect(await applicaFlusso(params)).toEqual({ created: 0 });
    expect(state.insert).not.toHaveBeenCalled();
  });
  it("rejects cycles before any insert", async () => {
    state.templates = [step("a", "A", "b"), step("b", "B", "a")];
    await expect(applicaFlusso(params)).rejects.toThrow(/circolare/);
    expect(state.insert).not.toHaveBeenCalled();
  });
  it("never treats a source error as an empty model", async () => {
    state.fail = true;
    await expect(applicaFlusso(params)).rejects.toThrow(/Source unavailable/);
    expect(state.insert).not.toHaveBeenCalled();
  });
});
