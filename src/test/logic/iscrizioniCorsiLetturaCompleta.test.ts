import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ pages: [] as Array<{ data: unknown[] | null; error: unknown }>, calls: [] as Array<unknown[]>, from: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: state.from, auth: {} } }));
import { listAllPortalCourseEnrollments } from "@/lib/portalLearningApi";
beforeEach(() => {
  state.pages = []; state.calls = [];
  state.from.mockReset().mockImplementation((table) => {
    state.calls.push(["from", table]);
    const q = {
      select: (columns: string) => { state.calls.push(["select", columns]); return q; },
      eq: (key: string, value: string) => { state.calls.push(["eq", key, value]); return q; },
      order: (key: string) => { state.calls.push(["order", key]); return q; },
      range: (from: number, to: number) => { state.calls.push(["range", from, to]); return Promise.resolve(state.pages.shift()); },
    };
    return q;
  });
});
const row = (i: number) => ({ course_id: "corso", user_id: `utente-${i}`, status: "in_corso", progress_percent: 50, due_at: null as null, completed_at: null as null });
describe("lettura completa delle iscrizioni", () => {
  it("legge oltre la prima pagina con ordinamento stabile e filtro azienda su ogni richiesta", async () => {
    state.pages = [{ data: Array.from({ length: 500 }, (_, i) => row(i)), error: null }, { data: [row(500)], error: null }];
    const result = await listAllPortalCourseEnrollments("azienda-demo");
    expect(result).toHaveLength(501);
    expect(result[500]).toMatchObject({ courseId: "corso", userId: "utente-500", progressPercent: 50 });
    expect(state.calls.filter(c => c[0] === "range")).toEqual([["range", 0, 499], ["range", 500, 999]]);
    expect(state.calls.filter(c => c[0] === "eq")).toEqual([["eq", "company_id", "azienda-demo"], ["eq", "company_id", "azienda-demo"]]);
    expect(state.calls.filter(c => c[0] === "order")).toEqual([["order", "course_id"], ["order", "user_id"], ["order", "course_id"], ["order", "user_id"]]);
  });
  it("non restituisce un totale parziale se fallisce una pagina successiva", async () => {
    const error = new Error("rete assente");
    state.pages = [{ data: Array.from({ length: 500 }, (_, i) => row(i)), error: null }, { data: null, error }];
    await expect(listAllPortalCourseEnrollments("azienda-demo")).rejects.toBe(error);
  });
});
