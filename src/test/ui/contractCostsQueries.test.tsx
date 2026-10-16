import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useContractCosts } from "@/hooks/useContractCosts";
const m = vi.hoisted(() => ({ rpc: vi.fn(), company: "c", permission: { canViewCosts: true, isLoading: false } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: m.rpc } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: m.company } }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => m.permission }));
const clients: QueryClient[] = [];
function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } }); clients.push(qc);
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  return { qc, ...renderHook(() => useContractCosts("root"), { wrapper }) };
}
beforeEach(() => {
  m.rpc.mockReset(); m.company = "c"; m.permission.canViewCosts = true;
  m.rpc.mockImplementation(async (_: string, args: { p_company_id: string }) => ({ error: null, data: {
    company_id: args.p_company_id, contract_id: "root", lines: [
      { id: "root", is_contract: true, economics: { consuntivo: 15 } },
    ],
  } }));
});
afterEach(() => { cleanup(); clients.forEach(qc => qc.clear()); clients.length = 0; });
describe("lettura automatica del consolidamento", () => {
  it("una lettura atomica è separata per azienda e non modifica registrazioni", async () => {
    const { result, rerender } = mount(); await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(m.rpc).toHaveBeenCalledWith("contract_cost_snapshot", { p_company_id: "c", p_contract_id: "root" });
    m.company = "other"; rerender();
    await waitFor(() => expect(m.rpc).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.data?.costs).toBe(15));
  });
  it("il permesso sui costi è necessario anche con una cache precedente", async () => {
    const { result, rerender } = mount(); await waitFor(() => expect(result.current.isSuccess).toBe(true));
    m.permission.canViewCosts = false; rerender();
    expect(result.current.allowed).toBe(false); expect(m.rpc).toHaveBeenCalledTimes(1);
  });
  it("una mutazione completata aggiorna il totale senza ricopiare costi", async () => {
    const { result, qc } = mount(); await waitFor(() => expect(result.current.isSuccess).toBe(true));
    await act(async () => { await qc.getMutationCache().build(qc, { mutationFn: async () => "saved" }).execute(undefined); });
    await waitFor(() => expect(m.rpc).toHaveBeenCalledTimes(2));
  });
  it("un errore di rete dopo una lettura valida resta errore anziché mostrare un vecchio totale come aggiornato", async () => {
    const { result } = mount(); await waitFor(() => expect(result.current.isSuccess).toBe(true));
    m.rpc.mockResolvedValue({ data: null, error: new Error("Rete interrotta") });
    await act(async () => { await result.current.refetch(); });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
  it("un costo ricevuto con identità aziendale errata non entra nella cache", async () => {
    m.rpc.mockResolvedValue({ error: null, data: { company_id: "other", contract_id: "root", lines: [] } });
    const { result } = mount(); await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });
});
