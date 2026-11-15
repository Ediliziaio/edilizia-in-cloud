import { describe, expect, it } from "vitest";
import { normalizeMarginalitaCommesse, type MarginalitaCommesseResult } from "../../../supabase/functions/_shared/marginalitaCommesse";

const riga = (over: Record<string, unknown>) => ({
  id: "c", order_code: "C", description: "", cliente: null as unknown, status: null as unknown, work_state: "open", creation_year: 2026,
  pct_avanzamento: 50, work_start: null as unknown, work_end: null as unknown, preventivo: 1000, consuntivo: 400, costo_acquisti: 0, costo_errori: 0,
  variazioni: 0, costo_manodopera: 0, ore_manodopera: 0, margine: 600, margine_perc: 60, costo_atteso: null as unknown, margine_atteso: null as unknown,
  margine_atteso_perc: null as unknown, semaforo: "grigio", dati_economici_completi: true, ...over,
});
const risultato = (righe: Record<string, unknown>[]) => ({
  meta: { company_id: "x", anno: 2026, status_filter: null, generato_il: "" }, kpi: {}, righe,
}) as unknown as MarginalitaCommesseResult;

describe("KPI delle commesse", () => {
  it("le commesse annullate restano in elenco ma non entrano nei totali", () => {
    const r = normalizeMarginalitaCommesse(risultato([riga({ id: "a" }), riga({ id: "b", work_state: "cancelled", preventivo: 9000 })]));
    expect(r.righe).toHaveLength(2);
    expect(r.kpi).toMatchObject({ n_commesse: 1, preventivo_totale: 1000 });
  });

  it("il margine atteso si rapporta solo al preventivo delle commesse che lo hanno", () => {
    // «b» è al 10%: troppo presto per proiettare, ha i costi ma nessun margine atteso.
    const r = normalizeMarginalitaCommesse(risultato([riga({ id: "a" }), riga({ id: "b", pct_avanzamento: 10, preventivo: 4000 })]));
    expect(r.kpi.margine_atteso_totale).toBe(200); // 1000 − 400/0,5
    expect(r.kpi.preventivo_valutabile).toBe(5000);
    expect(r.kpi.preventivo_con_margine_atteso).toBe(1000);
  });
});
