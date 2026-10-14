import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useOrderLaborEconomics } from "@/hooks/useOrderLaborEconomics";
import { refreshCommessaCampoQueries } from "@/lib/orders/refreshCommessaCampoQueries";

const mocks = vi.hoisted(() => ({ from: vi.fn(), companyId: "c", permission: { canViewCosts: true, canViewEmployees: true, isLoading: false } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: mocks.companyId } }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => mocks.permission }));
const reads: { table: string; select: string; filters: Record<string, unknown> }[] = [];
let error: Error | null = null;
const clients: QueryClient[] = [];
function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } }); clients.push(qc);
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  return { qc, ...renderHook(() => useOrderLaborEconomics("o"), { wrapper }) };
}
beforeEach(() => {
  vi.clearAllMocks(); reads.length = 0; error = null; mocks.companyId = "c";
  Object.assign(mocks.permission, { canViewCosts: true, canViewEmployees: true, isLoading: false });
  mocks.from.mockImplementation((table: string) => {
    const record = { table, select: "", filters: {} as Record<string, unknown> };
    const builder = {
      select: (fields: string) => { record.select = fields; return builder; },
      eq: (field: string, value: unknown) => { record.filters[field] = value; return builder; },
      then: (resolve: (value: unknown) => unknown) => {
        reads.push(record);
        return Promise.resolve({ data: error ? null : [{ id: `${table}-${record.filters["orders.company_id"]}` }], error }).then(resolve);
      },
    };
    return builder;
  });
});
afterEach(() => { cleanup(); clients.splice(0).forEach(c => c.clear()); });
describe("Letture manodopera: azienda, permessi, cache e recupero", () => {
  it("due richieste relazionali, con commessa e azienda filtrate sul server", async () => {
    const { result } = mount(); await waitFor(() => expect(result.current.teams.isSuccess).toBe(true));
    expect(reads).toHaveLength(2); expect(new Set(reads.map(r => r.table))).toEqual(new Set(["order_employees", "order_external_teams"]));
    for (const r of reads) {
      expect(r.filters).toEqual({ order_id: "o", "orders.company_id": "c", [r.table === "order_employees" ? "employee.company_id" : "team.company_id"]: "c" });
      expect(r.select).toContain("orders!inner(company_id)");
    }
  });
  it("non fa richieste economiche senza canViewCosts", () => {
    mocks.permission.canViewCosts = false; const { result } = mount();
    expect(result.current.allowed).toBe(false); expect(mocks.from).not.toHaveBeenCalled();
  });
  it("aspetta il caricamento dei permessi", () => {
    mocks.permission.isLoading = true; mount(); expect(mocks.from).not.toHaveBeenCalled();
  });
  it("non legge stipendio, INPS o tariffa corrente senza accesso dipendenti", async () => {
    mocks.permission.canViewEmployees = false; const { result } = mount(); await waitFor(() => expect(result.current.employees.isSuccess).toBe(true));
    expect(reads.find(r => r.table === "order_employees")?.select).not.toMatch(/gross_salary|inps_rate|monthly_hours|costo_orario/);
    expect(result.current.readRates).toBe(false);
  });
  it("non mescola la cache con selezioni oes-employees o operative", async () => {
    const { qc, result } = mount(); qc.setQueryData(["oes-employees", "o"], [{ total_cost: 999 }]);
    await waitFor(() => expect(result.current.employees.isSuccess).toBe(true));
    expect(result.current.employees.data).toEqual([{ id: "order_employees-c" }]);
    expect(qc.getQueryData(["oes-employees", "o"])).toEqual([{ total_cost: 999 }]);
  });
  it("perdita del permesso dipendenti seleziona una cache senza dati retributivi", async () => {
    const { result, rerender } = mount(); await waitFor(() => expect(result.current.employees.isSuccess).toBe(true));
    mocks.permission.canViewEmployees = false; rerender(); await waitFor(() => expect(reads).toHaveLength(3));
    expect(reads.at(-1)?.select).not.toContain("gross_salary"); expect(result.current.readRates).toBe(false);
  });
  it("cambio azienda non riusa lo stesso ordine in una cache di un'altra azienda", async () => {
    const { result, rerender } = mount(); await waitFor(() => expect(result.current.employees.isSuccess).toBe(true));
    mocks.companyId = "altra"; rerender(); await waitFor(() => expect(result.current.employees.data?.[0].id).toBe("order_employees-altra"));
    expect(reads.filter(r => r.filters["orders.company_id"] === "altra")).toHaveLength(2);
  });
  it("rapporto/evento della commessa aggiorna le due fonti senza toccare un'altra azienda", async () => {
    const { result, qc } = mount(); await waitFor(() => expect(result.current.teams.isSuccess).toBe(true));
    qc.setQueryData(["order-labor-economics", "o", "altra", true], [{ id: "preservato" }]);
    await act(() => refreshCommessaCampoQueries(qc, "o", "c"));
    expect(reads).toHaveLength(4);
    expect(qc.getQueryState(["order-labor-economics", "o", "altra", true])?.isInvalidated).toBe(false);
  });
  it("errori RLS/rete restano errori, non una lista vuota con costo zero", async () => {
    error = new Error("non disponibile"); const { result } = mount();
    await waitFor(() => expect(result.current.employees.isError).toBe(true));
    expect(result.current.employees.data).toBeUndefined();
    error = null; await act(() => result.current.employees.refetch());
    await waitFor(() => expect(result.current.employees.isSuccess).toBe(true));
  });
});
