import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCostiPersonale } from "@/hooks/useCostiPersonale";
const state = vi.hoisted(() => ({ employees: [] as unknown[], reports: [] as unknown[] }));
vi.mock("@tanstack/react-query", () => ({ useQuery: ({ queryKey }: { queryKey: unknown[] }) => ({ data: queryKey[0] === "costi-personale-employees" ? state.employees : state.reports }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: vi.fn() } }));
const employee = { id: "e", user_id: "u", first_name: "Mario", last_name: "Rossi", gross_salary: 2000, inps_rate: 0, monthly_hours: 160, costo_orario: 25 };
const report = { id: "r", user_id: "capo", order_id: "o", data_lavoro: "2026-10-13", ore_lavorate: 20, ore_straordinario: 0, stato: "inviato", presenze: [{ employee_id: "e", ore: 4 }], order: { id: "o", order_code: "C1" }, autore: { first_name: "Capo", last_name: "Cantiere" } };
beforeEach(() => { state.employees = [employee]; state.reports = [report]; });
afterEach(cleanup);
describe("Statistiche personale: il capo non acquisisce le ore degli operai", () => {
  it("la presenza viene attribuita tramite employee_id anche se l'autore è il capo", () => {
    const { result } = renderHook(() => useCostiPersonale("c", new Date(2026, 9, 1)));
    expect(result.current.dipendenti[0].oreLavorate).toBe(4); expect(result.current.altriOperatori).toHaveLength(0);
    // INPS 0 della persona: restano INAIL 8, Cassa Edile 22 e TFR 7,41 dell'operaio edile.
    expect(result.current.dipendenti[0].oneriMensili).toBe(748.2);
  });
  it("un dipendente senza account ha comunque le ore rendicontate dal capo", () => {
    state.employees = [{ ...employee, user_id: null }];
    const { result } = renderHook(() => useCostiPersonale("c", new Date(2026, 9, 1)));
    expect(result.current.dipendenti[0].oreLavorate).toBe(4); expect(result.current.dipendenti[0].senzaUtente).toBe(false);
  });
  it("presenza esterna non entra nello stipendio o nelle ore personali del capo", () => {
    state.employees = [{ ...employee, user_id: "capo" }]; state.reports = [{ ...report, presenze: [{ subappaltatore_id: "sub", nome: "Ditta A", ore: 3 }] }];
    const { result } = renderHook(() => useCostiPersonale("c", new Date(2026, 9, 1)));
    expect(result.current.dipendenti[0].oreLavorate).toBe(0); expect(result.current.altriOperatori[0].oreLavorate).toBe(3);
  });
  it("il personale singolo mantiene ore ordinarie e extra senza sommare il capo", () => {
    state.reports = [{ ...report, user_id: "u", ore_lavorate: 6, ore_straordinario: 2, presenze: [] }];
    const { result } = renderHook(() => useCostiPersonale("c", new Date(2026, 9, 1)));
    expect(result.current.dipendenti[0].oreLavorate).toBe(6); expect(result.current.dipendenti[0].oreStraordinario).toBe(2);
  });
});
