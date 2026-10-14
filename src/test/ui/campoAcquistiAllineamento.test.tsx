import type { ReactNode } from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAnnullaAcquisto, useRegistraAcquisto, type NuovoAcquisto } from "@/hooks/campo/useCampoAcquisti";

const state = vi.hoisted(() => ({ company: "c", rpc: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ profile: { company_id: state.company }, user: { id: "u" } }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: state.rpc } }));
const clients: QueryClient[] = [];
function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); clients.push(qc);
  const own = [["campo-acquisti-miei", "c", "u"], ["acquisti-campo-ufficio", "c"], ["order-economics-canonical", "o"], ["linked-purchase-orders", "o", "c"]];
  const other = [["campo-acquisti-miei", "altra", "u"], ["acquisti-campo-ufficio", "altra"], ["order-economics-canonical", "altro"]];
  [...own, ...other].forEach(key => qc.setQueryData(key, []));
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  return { qc, own, other, wrapper };
}
const purchase: NuovoAcquisto = { orderId: "o", modalita: "pagato_da_me", tipoDocumento: "scontrino", fornitore: "Negozio test", numero: "SIM-1",
  data: "2026-10-13", totale: 12, righe: [], fotoPath: null, lettura: null, note: "" };
beforeEach(() => { state.company = "c"; state.rpc.mockReset().mockResolvedValue({ data: "acquisto-1", error: null }); });
afterEach(() => { cleanup(); clients.splice(0).forEach(qc => qc.clear()); });
describe("Acquisto operaio e commessa: scope originale e ricevuta prima del refresh", () => {
  it("una ricevuta valida aggiorna commessa, ordine acquisto e code della propria azienda", async () => {
    const { qc, own, other, wrapper } = setup(); const hook = renderHook(() => useRegistraAcquisto(), { wrapper });
    await act(async () => { await hook.result.current.mutateAsync(purchase); });
    own.forEach(key => expect(qc.getQueryState(key)?.isInvalidated).toBe(true));
    other.forEach(key => expect(qc.getQueryState(key)?.isInvalidated).toBe(false));
    expect(state.rpc).toHaveBeenCalledOnce();
  });
  it.each([null, 123, ""])("senza ricevuta %j non dichiara commessa riallineata", async data => {
    state.rpc.mockResolvedValue({ data, error: null }); const { qc, own, wrapper } = setup();
    const hook = renderHook(() => useRegistraAcquisto(), { wrapper });
    await act(async () => { await expect(hook.result.current.mutateAsync(purchase)).rejects.toThrow("non ha confermato"); });
    own.forEach(key => expect(qc.getQueryState(key)?.isInvalidated).toBe(false));
  });
  it("un cambio di azienda durante l'invio non invalida l'azienda nuova", async () => {
    let reply!: (value: { data: string; error: null }) => void;
    state.rpc.mockImplementation(() => new Promise(done => { reply = done; }));
    const { qc, own, other, wrapper } = setup(); const hook = renderHook(() => useRegistraAcquisto(), { wrapper });
    let pending!: Promise<string>;
    await act(async () => { pending = hook.result.current.mutateAsync(purchase); });
    state.company = "altra"; hook.rerender();
    await act(async () => { reply({ data: "acquisto-1", error: null }); await pending; });
    own.forEach(key => expect(qc.getQueryState(key)?.isInvalidated).toBe(true));
    other.forEach(key => expect(qc.getQueryState(key)?.isInvalidated).toBe(false));
  });
  it("l'annullamento mantiene il collegamento alla commessa catturato prima della risposta", async () => {
    const { qc, wrapper } = setup(); qc.setQueryData(["campo-acquisti-miei", "c", "u"], [{ id: "a", order_id: "o" }]);
    const hook = renderHook(() => useAnnullaAcquisto(), { wrapper });
    await act(async () => { await hook.result.current.mutateAsync("a"); });
    expect(qc.getQueryState(["order-economics-canonical", "o"])?.isInvalidated).toBe(true);
    expect(qc.getQueryState(["campo-acquisti-miei", "c", "u"])?.isInvalidated).toBe(true);
  });
});
