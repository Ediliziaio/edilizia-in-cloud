import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useHrLaborReconciliation } from "@/hooks/useHrLaborReconciliation";
const mocks = vi.hoisted(() => ({ from: vi.fn(), company: "c", p: { canViewPersone: true, canViewCosts: true, canViewOrders: true, canViewGiornaleLavori: true, isLoading: false } }));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => mocks.company }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => mocks.p }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from } }));
const calls: { table: string; selected: string; filters: Record<string, unknown> }[] = [];
let profile: { id: string; employee_id: string | null; user_id: string | null } | null;
let reportError: Error | null = null;
let bigResult = false;
const clients: QueryClient[] = [];
const mount = (open = true) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } }); clients.push(qc);
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  return renderHook(() => useHrLaborReconciliation("h", "2026-10", open), { wrapper });
};
beforeEach(() => {
  vi.clearAllMocks(); calls.length = 0; reportError = null; bigResult = false; mocks.company = "c"; profile = { id: "h", employee_id: "e", user_id: "u" };
  Object.assign(mocks.p, { canViewPersone: true, canViewCosts: true, canViewOrders: true, canViewGiornaleLavori: true, isLoading: false });
  mocks.from.mockImplementation((table: string) => {
    const record = { table, selected: "", filters: {} as Record<string, unknown> };
    const value = () => ({ data: table === "hr_profili" ? profile : table === "campo_rapportini" && bigResult ? Array.from({ length: 1000 }) : [], error: table === "campo_rapportini" ? reportError : null });
    const q = { select: (s: string) => { record.selected = s; return q; }, eq: (k: string, v: unknown) => { record.filters[k] = v; return q; },
      gte: (k: string, v: string) => { record.filters[`gte:${k}`] = v; return q; }, lte: (k: string, v: string) => { record.filters[`lte:${k}`] = v; return q; },
      in: (k: string, v: unknown) => { record.filters[`in:${k}`] = v; return q; }, or: (s: string) => { record.filters.or = s; return q; },
      maybeSingle: () => { calls.push(record); return Promise.resolve(value()); },
      then: (resolve: (v: unknown) => unknown) => { calls.push(record); return Promise.resolve(value()).then(resolve); },
    }; return q;
  });
});
afterEach(() => { cleanup(); clients.splice(0).forEach(q => q.clear()); });
describe("Riconciliazione HR: poche query, identità, mese e permessi", () => {
  it("nessun carico quando il pannello è chiuso", () => { mount(false); expect(mocks.from).not.toHaveBeenCalled(); });
  it.each(["canViewPersone", "canViewCosts"] as const)("non carica dati senza %s", key => { mocks.p[key] = false; mount(); expect(mocks.from).not.toHaveBeenCalled(); });
  it("tre letture per una persona e un mese, senza dati sanitari o fiscali", async () => {
    const { result } = mount(); await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls).toHaveLength(3); for (const c of calls) expect(c.filters.company_id).toBe("c");
    expect(calls.find(c => c.table === "hr_giornate")?.filters).toMatchObject({ profilo_id: "h", "gte:data": "2026-10-01", "lte:data": "2026-10-31" });
    expect(calls.map(c => c.selected).join(" ")).not.toMatch(/iban|ritenute|netto|diagnos|anomalia_motivo|pdf_url/);
    expect(calls.find(c => c.table === "campo_rapportini")?.filters.or).toContain('presenze_registrate.cs.[{"employee_id":"e"}]');
    expect(calls.find(c => c.table === "campo_rapportini")?.filters.or).toContain('presenze.cs.[{"employee_id":"e"}]');
  });
  it("senza accesso commesse non interroga i rapportini e non inventa un consuntivo", async () => {
    mocks.p.canViewOrders = false; const { result } = mount(); await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.map(c => c.table)).not.toContain("campo_rapportini"); expect(result.current.data?.summary?.reportsAvailable).toBe(false);
  });
  it("profilo senza scheda costo non usa nome o autore per associare le ore", async () => {
    profile!.employee_id = null; const { result } = mount(); await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls).toHaveLength(1); expect(result.current.data?.linked).toBe(false);
  });
  it("profilo di un'altra azienda non disponibile: niente letture successive", async () => {
    profile = null; const { result } = mount(); await waitFor(() => expect(result.current.isError).toBe(true)); expect(calls).toHaveLength(1);
  });
  it("errore su rapportini non mostra la parte HR come riconciliazione completa", async () => {
    reportError = new Error("offline"); const { result } = mount(); await waitFor(() => expect(result.current.isError).toBe(true)); expect(result.current.data).toBeUndefined();
  });
  it("una pagina piena non viene presentata come totalità dei dati", async () => {
    bigResult = true; const { result } = mount(); await waitFor(() => expect(result.current.isError).toBe(true)); expect(result.current.error?.message).toContain("Troppi risultati");
  });
});
