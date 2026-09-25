import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadCampoAssignments } from "@/lib/campo/assignments";
import { hasRapportinoAssignment } from "@/lib/campo/rapportinoAssignment";
import { loadCampoDayPunches } from "@/lib/campo/loadTimePunches";
import { campoDayWindow } from "@/lib/campo/timeSummary";

const mocks = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from } }));
beforeEach(() => vi.clearAllMocks());
const row = (id: string, status = "in_corso", company = "c") => ({ id: `assignment-${id}`, order_id: id,
  order: { id, company_id: company, status, order_code: id, description: id, indirizzo_lavori: null as null, percentuale_avanzamento: 0, work_start_date: null as null, work_end_date: null as null } });
function arrange(results: Record<string, { data?: unknown; error?: unknown }>) {
  const calls: Record<string, ReturnType<typeof builder>> = {};
  function builder(result: { data?: unknown; error?: unknown }) {
    const q = { select: vi.fn(), eq: vi.fn(), in: vi.fn(), gte: vi.fn(), lt: vi.fn(), order: vi.fn(),
      then: Promise.resolve(result).then.bind(Promise.resolve(result)) };
    for (const key of ["select", "eq", "in", "gte", "lt", "order"] as const) q[key].mockReturnValue(q);
    return q;
  }
  mocks.from.mockImplementation((table: string) => calls[table] = builder(results[table] ?? { data: [] }));
  return calls;
}

describe("Unione incarichi Campo: non un fallback esclusivo", () => {
  it("sub: A diretto, B da contratto, C da squadra, tutti disponibili", async () => {
    arrange({ order_campo_assignments: { data: [row("A")] }, subappaltatori: { data: [{ id: "s" }] },
      contratti_subappalto: { data: [row("B")] }, external_teams: { data: [{ id: "t" }] }, order_external_teams: { data: [row("C")] } });
    const resolved = await loadCampoAssignments("u", "c");
    expect(resolved.map(a => a.order_id)).toEqual(["A", "B", "C"]);
    expect(resolved.map(a => a.sources[0].kind)).toEqual(["direct", "contract", "subcontractor_team"]);
  });
  it("deduplica il cantiere conservando origini e nomina del capo", async () => {
    arrange({ order_campo_assignments: { data: [{ ...row("A"), is_capocantiere: true }] }, employees: { data: [{ id: "e" }] },
      order_employees: { data: [row("A"), row("A"), { ...row("A"), id: "second-phase" }] } });
    const resolved = await loadCampoAssignments("u", "c");
    expect(resolved).toHaveLength(1); expect(resolved[0].is_capocantiere).toBe(true);
    expect(resolved[0].sources).toHaveLength(3);
  });
  it("non trasforma una squadra o un contratto in nomina del capo", async () => {
    arrange({ subappaltatori: { data: [{ id: "s" }] }, contratti_subappalto: { data: [{ ...row("A"), is_capocantiere: true }] } });
    expect((await loadCampoAssignments("u", "c"))[0].is_capocantiere).toBe(false);
  });
  it("scarta record senza ordine leggibile, disallineati o di altra azienda", async () => {
    arrange({ order_campo_assignments: { data: [row("A"), row("X", "in_corso", "other"), { ...row("B"), order: null as null }, { ...row("C"), order_id: "mismatch" }] } });
    expect((await loadCampoAssignments("u", "c")).map(a => a.id)).toEqual(["A"]);
  });
  it("chiusi/annullati esclusi dalla lista, ma storico esplicitamente richiedibile", async () => {
    arrange({ order_campo_assignments: { data: [row("A"), row("B", "chiuso"), row("C", "ANNULLATO")] } });
    expect((await loadCampoAssignments("u", "c")).map(a => a.id)).toEqual(["A"]);
    expect(await loadCampoAssignments("u", "c", { includeClosed: true })).toHaveLength(3);
  });
  it("limita i preflight alla commessa richiesta anche con risultati inattesi", async () => {
    const calls = arrange({ order_campo_assignments: { data: [row("A"), row("B")] } });
    expect(await hasRapportinoAssignment("C", "u", "c")).toBe(false);
    expect(calls.order_campo_assignments.eq).toHaveBeenCalledWith("order_id", "C");
  });
  it("il rapportino riconosce la stessa assegnazione da squadra del calendario", async () => {
    arrange({ subappaltatori: { data: [{ id: "s" }] }, external_teams: { data: [{ id: "t" }] }, order_external_teams: { data: [row("C")] } });
    expect(await hasRapportinoAssignment("C", "u", "c")).toBe(true);
  });
  it("applica filtri identità/azienda e non carica costi", async () => {
    const calls = arrange({ employees: { data: [{ id: "e" }] }, subappaltatori: { data: [{ id: "s" }, { id: "s2" }] }, external_teams: { data: [{ id: "t" }] } });
    await loadCampoAssignments("u", "c", { orderId: "A" });
    for (const table of ["order_campo_assignments", "employees", "subappaltatori"]) {
      expect(calls[table].eq).toHaveBeenCalledWith("user_id", "u");
      expect(calls[table].eq).toHaveBeenCalledWith("company_id", "c");
    }
    for (const table of ["order_campo_assignments", "order_employees", "contratti_subappalto", "order_external_teams"]) {
      expect(calls[table].eq).toHaveBeenCalledWith("order.company_id", "c");
      expect(calls[table].eq).toHaveBeenCalledWith("order_id", "A");
      expect(calls[table].select.mock.calls[0][0]).not.toMatch(/\*|total_cost|hourly_rate|importo/);
    }
    expect(calls.contratti_subappalto.eq).toHaveBeenCalledWith("stato", "attivo");
    expect(calls.contratti_subappalto.in).toHaveBeenCalledWith("subappaltatore_id", ["s", "s2"]);
  });
  it.each(["order_campo_assignments", "employees", "subappaltatori", "order_employees", "contratti_subappalto", "external_teams", "order_external_teams"])("un errore su %s non viene presentato come elenco vuoto", async table => {
    arrange({ employees: { data: [{ id: "e" }] }, subappaltatori: { data: [{ id: "s" }] }, external_teams: { data: [{ id: "t" }] }, [table]: { error: new Error("network/policy") } });
    await expect(loadCampoAssignments("u", "c")).rejects.toThrow("network/policy");
  });
  it("senza azienda o utente non esegue una ricerca generica", async () => {
    expect(await loadCampoAssignments("u", "")).toEqual([]);
    expect(await loadCampoAssignments("", "c")).toEqual([]);
    expect(mocks.from).not.toHaveBeenCalled();
  });
});

describe("Caricamento giornaliero timbrature", () => {
  it("legge tutte le sedi e il contesto notturno, con limite esclusivo e filtri tenant", async () => {
    const calls = arrange({}); const { lookback, end } = campoDayWindow("2026-09-24");
    await loadCampoDayPunches("u", "c", "2026-09-24");
    expect(calls.campo_timbrature.eq.mock.calls).toEqual([["user_id", "u"], ["company_id", "c"]]);
    expect(calls.campo_timbrature.gte).toHaveBeenCalledWith("timestamp_evento", lookback.toISOString());
    expect(calls.campo_timbrature.lt).toHaveBeenCalledWith("timestamp_evento", end.toISOString());
  });
  it("propaga errori invece di restituire zero ore", async () => {
    arrange({ campo_timbrature: { error: new Error("offline") } });
    await expect(loadCampoDayPunches("u", "c", "2026-09-24")).rejects.toThrow("offline");
  });
});
