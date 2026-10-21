import { beforeEach, describe, expect, it, vi } from "vitest";
import { avanzamentoMedioFasi } from "@/lib/controlloGestione/avanzamentoFasi";

const state = vi.hoisted(() => ({
  company: "demo" as string | null,
  rpc: null as unknown,
  tables: {} as Record<string, Record<string, unknown>[]>,
  peso: "uguale",
  ranges: [] as { table: string; from: number }[],
}));
vi.mock("@tanstack/react-query", () => ({ useQuery: (o: unknown) => o }));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => state.company }));
vi.mock("@/hooks/controlloGestione/cgRpc", () => ({ cgRpc: async () => ({ data: state.rpc, error: null }) }));
vi.mock("@/integrations/supabase/client", () => {
  const builder = (table: string) => {
    let ids: string[] = [];
    let col = "";
    const b = {
      select: () => b, order: () => b, eq: () => b,
      in: (c: string, v: string[]) => { col = c; ids = v; return b; },
      maybeSingle: async () => ({ data: { peso_media: state.peso }, error: null }),
      range: async (from: number, to: number) => {
        state.ranges.push({ table, from });
        const rows = (state.tables[table] ?? []).filter((r) => ids.includes(r[col] as string));
        return { data: rows.slice(from, to + 1), error: null };
      },
    };
    return b;
  };
  return { supabase: { from: builder } };
});
import { useMarginalitaCommesse } from "@/hooks/controlloGestione/useMarginalitaCommesse";

type Opts = { queryFn: () => Promise<{ righe: { id: string; pct_avanzamento: number; costo_manodopera: number; ore_manodopera: number; margine_atteso: number | null }[]; kpi: { n_in_perdita: number } }> };
const riga = (over: Record<string, unknown> = {}) => ({
  id: "job", order_code: "C1", description: "Bagno", cliente: null, status: null, work_state: "open", creation_year: 2026,
  pct_avanzamento: 40, work_start: null, work_end: null, preventivo: 1000, consuntivo: 450, costo_acquisti: 0, costo_errori: 0,
  variazioni: 0, costo_manodopera: 0, ore_manodopera: 0, margine: 550, margine_perc: 55, costo_atteso: null, margine_atteso: null,
  margine_atteso_perc: null, semaforo: "grigio", dati_economici_completi: true, ...over,
});

beforeEach(() => {
  state.company = "demo";
  state.peso = "uguale";
  state.ranges = [];
  state.rpc = { meta: { company_id: "demo", anno: 2026, status_filter: null, generato_il: "" }, kpi: { n_commesse: 1 }, righe: [riga()] };
  state.tables = {
    v_ordine_marginalita: [{ id: "job", costo_manodopera: 300 }],
    order_employees: Array.from({ length: 1200 }, (_, i) => ({ id: `e${i}`, order_id: "job", hours_worked: 1 })),
    order_work_phases: [
      { id: "f1", order_id: "job", status: "completata", percentuale: 0 },
      { id: "f2", order_id: "job", status: "in_corso", percentuale: 50 },
    ],
  };
});

describe("marginalità commesse del Controllo di gestione", () => {
  it("usa l'avanzamento delle fasi come la scheda commessa (alla pari)", async () => {
    const r = await (useMarginalitaCommesse(2026) as unknown as Opts).queryFn();
    // fasi 100% e 50% → 75%; costi 450 ÷ 0,75 = 600 → margine a fine lavori 400
    expect(r.righe[0].pct_avanzamento).toBe(0.75);
    expect(r.righe[0].margine_atteso).toBe(400);
  });

  it("con un peso diverso da «alla pari» tiene il numero del database", async () => {
    state.peso = "durata";
    const r = await (useMarginalitaCommesse(2026) as unknown as Opts).queryFn();
    expect(r.righe[0].pct_avanzamento).toBe(0.4);
  });

  it("prende la manodopera dalla vista e conta le ore oltre le mille righe", async () => {
    const r = await (useMarginalitaCommesse(2026) as unknown as Opts).queryFn();
    expect(r.righe[0].costo_manodopera).toBe(300);
    expect(r.righe[0].ore_manodopera).toBe(1200);
    expect(state.ranges.filter((x) => x.table === "order_employees").map((x) => x.from)).toEqual([0, 500, 1000]);
  });

  it("rifiuta i dati arrivati per un'altra azienda invece di salvarli sotto quella scelta", async () => {
    state.rpc = { ...(state.rpc as object), meta: { company_id: "altra" } };
    await expect((useMarginalitaCommesse(2026) as unknown as Opts).queryFn()).rejects.toThrow(/altra azienda/);
  });
});

describe("avanzamentoMedioFasi", () => {
  it("una fase completata vale 100 anche senza percentuale; valori fuori scala tagliati", () => {
    const m = avanzamentoMedioFasi([
      { order_id: "a", status: "completata", percentuale: null },
      { order_id: "a", status: "in_corso", percentuale: "-20" },
      { order_id: "b", status: "da_iniziare", percentuale: 150 },
    ]);
    expect(m.get("a")).toBe(50);
    expect(m.get("b")).toBe(100);
  });
});
