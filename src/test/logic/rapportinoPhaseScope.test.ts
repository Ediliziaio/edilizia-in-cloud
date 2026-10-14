import { beforeEach, expect, it, vi } from "vitest";
import { validateReportPhaseLinks } from "@/lib/campo/validateReportPhaseLinks";
const state = vi.hoisted(() => ({
  phases: [] as { id: string; order_id: string; company_id: string }[],
  subphases: [] as { id: string; phase_id: string }[], fail: "",
  calls: [] as { table: string; filters: [string, unknown][] }[],
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (table: string) => {
  const call = { table, filters: [] as [string, unknown][] }; state.calls.push(call);
  const q = { select: () => q, eq: (key: string, value: unknown) => { call.filters.push([key, value]); return q; },
    in: (key: string, value: string[]) => { call.filters.push([key, value]); return q; },
    then: (yes: (r: unknown) => unknown, no: (e: unknown) => unknown) => {
      let data: Record<string, unknown>[] = table === "order_work_phases" ? state.phases : state.subphases;
      for (const [key, value] of call.filters) data = data.filter(row => Array.isArray(value) ? value.includes(row[key]) : row[key] === value);
      return Promise.resolve({ data, error: state.fail === table ? new Error("Lettura fallita") : null }).then(yes, no);
    },
  }; return q;
} } }));
beforeEach(() => {
  state.phases = [{ id: "p", order_id: "o", company_id: "c" }, { id: "altro", order_id: "altra", company_id: "c" }];
  state.subphases = [{ id: "s", phase_id: "p" }, { id: "s-altro", phase_id: "altro" }];
  state.calls = []; state.fail = "";
});
const validate = (report: Parameters<typeof validateReportPhaseLinks>[2]) => validateReportPhaseLinks("c", "o", report);
it("accetta rapporti storici senza fasi e non aggiunge query", async () => {
  await validate({}); await validate({ fasi_lavorate: [], materiali_usati: [{ nome: "Colla" }] });
  expect(state.calls).toHaveLength(0);
});
it("controlla azienda/commessa, materiali e sottofasi prima di approvare", async () => {
  await validate({ fasi_lavorate: [{ phase_id: "p", percentuale: 50, sottofasi_fatte: ["s"] }], materiali_usati: [{ fase_id: "p" }] });
  expect(state.calls[0].filters).toContainEqual(["company_id", "c"]);
  expect(state.calls[0].filters).toContainEqual(["order_id", "o"]);
  expect(state.calls[1].filters).toContainEqual(["phase_id", ["p"]]);
});
it.each(["altro", "mancante"])("blocca il riferimento %s invece di ignorarlo", async phase_id => {
  await expect(validate({ fasi_lavorate: [{ phase_id, percentuale: 50 }] })).rejects.toThrow("non appartiene");
});
it("blocca una fase di un'altra azienda anche quando l'ordine sembra uguale", async () => {
  state.phases[0].company_id = "altra";
  await expect(validate({ fasi_lavorate: [{ phase_id: "p" }] })).rejects.toThrow("non appartiene");
});
it("controlla anche la fase collegata solo a un materiale", async () => {
  await expect(validate({ materiali_usati: [{ fase_id: "altro" }] })).rejects.toThrow("non appartiene");
});
it("non permette a una sottofase di cambiare lavorazione", async () => {
  await expect(validate({ fasi_lavorate: [{ phase_id: "p", sottofasi_fatte: ["s-altro"] }] })).rejects.toThrow("non appartiene");
});
it.each([101, -1, "", "NaN", Infinity, true])("blocca l'avanzamento non valido %s", async percentuale => {
  await expect(validate({ fasi_lavorate: [{ phase_id: "p", percentuale }] })).rejects.toThrow("non appartiene");
  expect(state.calls).toHaveLength(0);
});
it("non indovina collegamenti da nomi o fasi duplicate", async () => {
  await expect(validate({ fasi_lavorate: [{ nome: "Posa" }] })).rejects.toThrow("non appartiene");
  await expect(validate({ fasi_lavorate: [{ phase_id: "p" }, { phase_id: "p" }] })).rejects.toThrow("non appartiene");
});
it("un errore di rete non diventa un collegamento valido", async () => {
  state.fail = "order_work_phases";
  await expect(validate({ fasi_lavorate: [{ phase_id: "p" }] })).rejects.toThrow("Lettura fallita");
});
it("verifica tutte le fasi a lotti senza fermarsi alla prima pagina", async () => {
  state.phases = Array.from({ length: 405 }, (_, i) => ({ id: `p${i}`, order_id: "o", company_id: "c" }));
  await validate({ fasi_lavorate: state.phases.map(p => ({ phase_id: p.id })) });
  expect(state.calls).toHaveLength(3);
  expect((state.calls[0].filters.find(([key]) => key === "id")![1] as string[]).length).toBe(200);
});
