import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
const state = vi.hoisted(() => ({ rpc: vi.fn(), version: 2, fail: false, cost: false, incomplete: false }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "c" }, user: { id: "u" } }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: state.rpc } }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } }));
import { useRegisterUscita } from "@/hooks/warehouse/useWarehouseUscita";
import { useBatchCarico } from "@/hooks/warehouse/useBatchCarico";
const setup = <T,>(hook: () => T) => {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
  return renderHook(hook, { wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider> });
};
beforeEach(() => {
  sessionStorage.clear(); state.version = 2; state.fail = false; state.cost = false; state.incomplete = false; state.rpc.mockReset();
  state.rpc.mockImplementation(async (name: string) => {
    if (name === "warehouse_capabilities_v2") return state.version === 2
      ? { data: { version: 2, idempotent_uscite: true, idempotent_carichi: true, atomic_company_cost: state.cost }, error: null as null }
      : { data: null, error: { code: "PGRST202", message: "Missing warehouse_capabilities_v2" } };
    if (state.fail) { state.fail = false; return { data: null, error: { message: "Failed to fetch" } }; }
    return { data: name.includes("carico") ? { created_movements: 1, updated_items: 1, created_units: 0, errors: [], ...(state.cost && !state.incomplete ? {company_cost_id:"90000000-0000-4000-a000-000000000001",company_cost_amount:7.5} : {}) } : { uscita_id: "exit", numero: "U-01", created_movements: 1, updated_units: 0, errors: [] }, error: null as null };
  });
});
const uscita = { warehouseId: "w", destinatario: { tipo: "cantiere" as const, order_id: "o" }, scans: [{ stock_item_id: "s", quantity: 1.25 }] };
describe("Invii protetti del magazzino", () => {
  it("dopo un timeout ripete la stessa uscita con la stessa chiave, poi rinnova per un’operazione nuova", async () => {
    const { result } = setup(useRegisterUscita);state.fail = true;
    await act(async () => { await expect(result.current.mutateAsync(uscita)).rejects.toMatchObject({ message: "Failed to fetch" }); });
    expect(result.current.canReplay).toBe(true);
    await act(async () => { await result.current.mutateAsync(uscita); });
    expect(result.current.canReplay).toBe(false);
    await act(async () => { await result.current.mutateAsync(uscita); });
    const calls = state.rpc.mock.calls.filter(([name]) => name === "warehouse_register_uscita_v2");
    expect(calls[0][1].p_request_id).toBe(calls[1][1].p_request_id);
    expect(calls[2][1].p_request_id).not.toBe(calls[1][1].p_request_id);
    expect(state.rpc.mock.calls.some(([name]) => name === "register_warehouse_uscita")).toBe(false);
  });
  it("dopo un errore del servizio aggiornato non passa alla funzione precedente", async () => {
    const { result } = setup(useRegisterUscita);state.fail = true;
    await act(async () => { await result.current.mutateAsync(uscita).catch((): void => undefined); });
    expect(state.rpc.mock.calls.some(([name]) => name === "register_warehouse_uscita")).toBe(false);
  });
  it("mantiene la compatibilità quando il nuovo servizio non è installato", async () => {
    state.version = 1;const { result } = setup(useRegisterUscita);
    await act(async () => { await result.current.mutateAsync(uscita); });
    expect(state.rpc).toHaveBeenCalledWith("register_warehouse_uscita", expect.not.objectContaining({ p_request_id: expect.anything() }));
  });
  it("protegge il carico completo oltre all’identità delle singole righe", async () => {
    const { result } = setup(useBatchCarico);
    const input = { warehouseId: "w", supplierId: null as null, entries: [{ stockItemId: "s", quantity: .75, serialNumbers: [] as never[], clientUuid: "entry", rawCode: "", itemName: "Cavo", trackingMode: "fungible" as const, scannedAt: 1 }] };
    state.fail = true;
    await act(async () => { await result.current.mutateAsync(input).catch((): void => undefined); });
    await act(async () => { await result.current.mutateAsync(input); });
    const calls = state.rpc.mock.calls.filter(([name]) => name === "warehouse_register_carico_v2");
    expect(calls).toHaveLength(2);expect(calls[0][1].p_request_id).toBe(calls[1][1].p_request_id);
    expect(calls[1][1].p_scans[0]).toMatchObject({ quantity: .75, offline_client_uuid: "entry" });
  });
});

const caricoCosto = {warehouseId:"w",supplierId: null as null,companyCost:{date:"2026-11-18",category:"Magazzino",vat_rate:22,is_paid:true},entries:[{stockItemId:"s",quantity:.75,purchasePrice:10,serialNumbers: [] as never[],clientUuid:"cost-entry",rawCode:"",itemName:"Cavo",trackingMode:"fungible" as const,scannedAt:1}]};
it("non registra un carico senza costo se il servizio non supporta il salvataggio congiunto",async()=>{
 const {result}=setup(useBatchCarico);
 await act(async()=>{await expect(result.current.mutateAsync(caricoCosto)).rejects.toThrow("non supporta ancora");});
 expect(state.rpc.mock.calls.filter(([name])=>name!=="warehouse_capabilities_v2")).toHaveLength(0);
});
it("il recupero del carico comprende costo e stessa identità della richiesta",async()=>{
 state.cost=true;state.fail=true;const {result}=setup(useBatchCarico);
 await act(async()=>{await result.current.mutateAsync(caricoCosto).catch((): void => undefined);});
 await act(async()=>{await result.current.mutateAsync(caricoCosto);});
 const calls=state.rpc.mock.calls.filter(([name])=>name==="warehouse_register_carico_v2");
 expect(calls[0][1]).toEqual(calls[1][1]);expect(calls[1][1].p_scans[0].company_cost).toEqual(caricoCosto.companyCost);
});
it("non libera la chiave quando manca la conferma del costo nella risposta",async()=>{
 state.cost=true;state.incomplete=true;const {result}=setup(useBatchCarico);
 await act(async()=>{await expect(result.current.mutateAsync(caricoCosto)).rejects.toThrow("Esito del costo non disponibile");});
 state.incomplete=false;await act(async()=>{await result.current.mutateAsync(caricoCosto);});
 const calls=state.rpc.mock.calls.filter(([name])=>name==="warehouse_register_carico_v2");expect(calls[0][1].p_request_id).toEqual(calls[1][1].p_request_id);
});
