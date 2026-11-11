// Le fasi per il verbale SAL lette col client tipato (11/11/2026): valgono per ogni azienda.
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { leggiFasiPerSal } from "@/lib/orders/leggiFasiPerSal";

function client(tabelle: Record<string, { data: unknown[] | null; error?: unknown }>) {
  return {
    from: (t: string) => {
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in", "order"]) q[m] = () => q;
      const esito = () => Promise.resolve({ data: tabelle[t]?.data ?? [], error: tabelle[t]?.error ?? null });
      q.range = esito;
      q.then = (ok: (v: unknown) => unknown) => esito().then(ok);
      return q;
    },
  } as unknown as SupabaseClient<Database>;
}

const fasi = [
  { id: "f1", name: "Con venduto", status: "in_corso", percentuale: 50, importo_venduto: 1000 },
  { id: "f2", name: "Senza venduto, con voci", status: "in_corso", percentuale: 20, importo_venduto: null },
  { id: "f3", name: "Senza niente", status: "da_iniziare", percentuale: 0, importo_venduto: null },
];

describe("Fasi per il verbale SAL", () => {
  it("una fase senza venduto prende la somma delle sue voci; senza voci resta da scrivere", async () => {
    const r = await leggiFasiPerSal(client({
      order_work_phases: { data: fasi },
      order_work_subphases: { data: [{ id: "s1", phase_id: "f2", name: "Getto", position: 1, peso: 1, fatta: false, percentuale: 20, quantita_fatta: null }] },
      order_work_phase_voci: { data: [
        { phase_id: "f2", subphase_id: "s1", quantita: 10, unita: "m³", importo: 600.5 },
        { phase_id: "f2", subphase_id: null, quantita: 1, unita: "a corpo", importo: 399.5 },
      ] },
    }), "o", "c");
    expect(r.map((f) => f.importo_venduto)).toEqual([1000, 1000, null]);
    expect(r[1].sottofasi?.[0].voci).toEqual([{ quantita: 10, unita: "m³", importo: 600.5 }]);
  });

  it("senza permesso sulle voci il verbale resta per fase, con le percentuali", async () => {
    const r = await leggiFasiPerSal(client({
      order_work_phases: { data: fasi },
      order_work_subphases: { data: [] },
      order_work_phase_voci: { data: null, error: { message: "permission denied" } },
    }), "o", "c");
    expect(r.map((f) => [f.name, f.importo_venduto])).toEqual([["Con venduto", 1000], ["Senza venduto, con voci", null], ["Senza niente", null]]);
  });

  it("se le sottofasi non si leggono restano le fasi", async () => {
    const r = await leggiFasiPerSal(client({ order_work_phases: { data: fasi }, order_work_subphases: { data: null, error: { message: "rete" } } }), "o", "c");
    expect(r).toHaveLength(3);
    expect(r[0].sottofasi).toBeUndefined();
  });
});
