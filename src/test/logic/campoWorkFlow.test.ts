import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { refreshWorkQueries } from "@/lib/orders/refreshWorkQueries";
import { buildRapportinoMaterials } from "@/lib/campo/rapportinoMaterials";
import { campoAssignmentError, campoRoles } from "@/lib/orders/campoAssignmentForm";
import { hasRapportinoAssignment } from "@/lib/campo/rapportinoAssignment";

const mocks = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from } }));
beforeEach(() => vi.clearAllMocks());

describe("Materiali rapportino: identità, quantità e unità", () => {
  it("conserva due articoli omonimi senza unirli", () => {
    expect(buildRapportinoMaterials({ a: { nome: "Malta", quantita: 2.5, unita: "kg" }, b: { nome: "Malta", quantita: 3, unita: "kg" } }))
      .toEqual([{ nome: "Malta", quantita: 2.5, unita: "kg", order_item_id: "a", da_furgone: false }, { nome: "Malta", quantita: 3, unita: "kg", order_item_id: "b", da_furgone: false }]);
  });
  it("non inventa un articolo per un materiale libero", () => {
    expect(buildRapportinoMaterials({ libero_123: { nome: "Colla", quantita: 1, unita: "pz" } })[0]).toEqual({ nome: "Colla", quantita: 1, unita: "pz", da_furgone: false });
  });
  it("accetta la selezione vuota", () => expect(buildRapportinoMaterials({})).toEqual([]));
  it.each([0, -1, NaN, Infinity])("blocca quantità non valide (%s)", quantita => {
    expect(() => buildRapportinoMaterials({ a: { nome: "Malta", quantita } })).toThrow("quantità maggiore di zero");
  });
});

describe("Assegnazione account Campo", () => {
  const valid = { userId: "user", role: "employee" as const, roles: ["worker"], start: "", end: "", isCapo: false, existing: false, otherCapo: false };
  it("normalizza worker senza assegnargli il ruolo subappaltatore", () => expect(campoRoles(["worker"])).toEqual(["employee"]));
  it("mantiene la scelta per account con entrambi i ruoli", () => expect(campoRoles(["employee", "subcontractor"])).toEqual(["employee", "subcontractor"]));
  it("accetta un'assegnazione semplice senza date o costi", () => expect(campoAssignmentError(valid)).toBeNull());
  it("blocca un ruolo non appartenente all'account", () => expect(campoAssignmentError({ ...valid, role: "subcontractor" })).toMatch(/ruolo/));
  it("blocca date invertite", () => expect(campoAssignmentError({ ...valid, start: "2026-10-12", end: "2026-10-10" })).toMatch(/fine prevista/));
  it("blocca doppie assegnazioni", () => expect(campoAssignmentError({ ...valid, existing: true })).toMatch(/già/));
  it("permette la nomina di una persona già assegnata", () => expect(campoAssignmentError({ ...valid, existing: true, isCapo: true })).toBeNull());
  it("blocca un secondo capocantiere", () => expect(campoAssignmentError({ ...valid, isCapo: true, otherCapo: true })).toMatch(/capocantiere/));
});

describe("Aggiornamento viste ufficio e Campo", () => {
  it("invalida le viste della commessa e i riepiloghi globali, non le altre commesse", () => {
    const qc = new QueryClient();
    const keys = [["order_work_phases", "order"], ["order-schedule-health", "order"], ["oes-employees", "order"],
      ["campo-ruolo", "order", "user"], ["campo-squadra", "order"], ["campo-lavori-assegnati", "user", "emp"],
      ["order-employees-costs", ["order", "another"]], ["order-campo-rapportini", "order"], ["order_work_phases", "another"]];
    keys.forEach(k => qc.setQueryData(k, []));
    refreshWorkQueries(qc, "order");
    keys.slice(0, -1).forEach(k => expect(qc.getQueryState(k)?.isInvalidated).toBe(true));
    expect(qc.getQueryState(keys.at(-1)!)?.isInvalidated).toBe(false); qc.clear();
  });
  it("non invalida tutto in assenza di commessa", () => {
    const qc = new QueryClient(); const spy = vi.spyOn(qc, "invalidateQueries");
    refreshWorkQueries(qc, null); expect(spy).not.toHaveBeenCalled(); qc.clear();
  });
});

describe("Preflight rapportino con API simulate e filtri aziendali", () => {
  const arrange = (results: Record<string, { data: unknown; error?: unknown }>) => {
    const calls: Record<string, ReturnType<typeof builder>> = {};
    function builder(result: { data: unknown; error?: unknown }) {
      const query = { select: vi.fn(), eq: vi.fn(), in: vi.fn(), limit: vi.fn(), maybeSingle: vi.fn().mockResolvedValue(result), then: Promise.resolve(result).then.bind(Promise.resolve(result)) };
      query.select.mockReturnValue(query); query.eq.mockReturnValue(query); query.in.mockReturnValue(query); query.limit.mockReturnValue(query);
      return query;
    }
    mocks.from.mockImplementation((table: string) => {
      const result = results[table] ?? { data: [] };
      const rows = result.data == null ? [] : Array.isArray(result.data) ? result.data : [result.data];
      const data = ["order_campo_assignments", "order_employees", "contratti_subappalto"].includes(table)
        ? rows.map(row => ({ ...row, order_id: "o", order: { id: "o", company_id: "c", status: "in_corso" } }))
        : rows;
      return calls[table] = builder({ ...result, data });
    });
    return calls;
  };
  it("riconosce l'assegnazione esplicita insieme alle altre fonti", async () => {
    const q = arrange({ order_campo_assignments: { data: { id: "direct" } } });
    expect(await hasRapportinoAssignment("o", "u", "c")).toBe(true);
    expect(mocks.from).toHaveBeenCalledTimes(3);
    expect(q.order_campo_assignments.eq).toHaveBeenCalledWith("company_id", "c");
  });
  it("mantiene l'accesso del dipendente assegnato al lavoro", async () => {
    arrange({ employees: { data: { id: "e" } }, order_employees: { data: { id: "a" } } });
    expect(await hasRapportinoAssignment("o", "u", "c")).toBe(true);
    expect(mocks.from).not.toHaveBeenCalledWith("contratti_subappalto");
  });
  it("riconosce il subappaltatore con contratto attivo sulla stessa commessa", async () => {
    const q = arrange({ subappaltatori: { data: [{ id: "s" }, { id: "s2" }] }, contratti_subappalto: { data: { id: "contract" } } });
    expect(await hasRapportinoAssignment("o", "u", "c")).toBe(true);
    expect(q.contratti_subappalto.eq).toHaveBeenCalledWith("order_id", "o");
    expect(q.contratti_subappalto.eq).toHaveBeenCalledWith("company_id", "c");
    expect(q.contratti_subappalto.eq).toHaveBeenCalledWith("stato", "attivo");
    expect(q.contratti_subappalto.in).toHaveBeenCalledWith("subappaltatore_id", ["s", "s2"]);
    expect(q.subappaltatori.eq).toHaveBeenCalledWith("user_id", "u");
  });
  it("non basta la sola anagrafica del subappaltatore", async () => {
    arrange({ subappaltatori: { data: [{ id: "s" }] } });
    expect(await hasRapportinoAssignment("o", "u", "c")).toBe(false);
  });
  it("nega in assenza di qualsiasi assegnazione", async () => {
    arrange({ subappaltatori: { data: [] } });
    expect(await hasRapportinoAssignment("o", "u", "c")).toBe(false);
  });
  it.each(["order_campo_assignments", "employees", "subappaltatori", "contratti_subappalto"])("non ignora errori su %s", async table => {
    arrange({ subappaltatori: { data: [{ id: "s" }] }, [table]: { data: null, error: new Error("policy/network") } });
    await expect(hasRapportinoAssignment("o", "u", "c")).rejects.toThrow("policy/network");
  });
});
