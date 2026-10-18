import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCostoPersona, useSalvaCostoPersona } from "@/hooks/useOperai";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), company: "c", p: { canViewPersone: true, solaLettura: false, isLoading: false } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc, from: mocks.from } }));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => mocks.company }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => mocks.p }));
const stored = { ha_scheda_costo: true, costo_orario: 25.74, costo_orario_scritto: 25.74, stipendio_lordo: 2000, ore_mese: 160, contributi_percento: 0 };
const clients: QueryClient[] = [];
const mount = (read = false) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } }); clients.push(qc);
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  return { qc, ...renderHook(() => read ? useCostoPersona("h") : useSalvaCostoPersona("h"), { wrapper }) };
};
const saveMount = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } }); clients.push(qc);
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  return { qc, ...renderHook(() => useSalvaCostoPersona("h"), { wrapper }) };
};
beforeEach(() => {
  vi.clearAllMocks(); mocks.company = "c"; Object.assign(mocks.p, { canViewPersone: true, solaLettura: false, isLoading: false });
  mocks.from.mockImplementation(() => {
    const q = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn().mockResolvedValue({ data: { id: "h" }, error: null }) };
    q.select.mockReturnValue(q); q.eq.mockReturnValue(q); return q;
  });
  mocks.rpc.mockImplementation((name: string) => Promise.resolve({ data: name === "personale_costo" ? stored : null, error: null }));
});
afterEach(() => { cleanup(); clients.splice(0).forEach(q => q.clear()); });
describe("Tariffa HR: permessi, conferma e cache delle commesse", () => {
  it("salvataggio parziale seguito da verifica: non tocca lordo/ore", async () => {
    const { result, qc } = saveMount();
    await act(() => result.current.mutateAsync({ costo_orario: "25,74" }));
    expect(mocks.rpc).toHaveBeenNthCalledWith(1, "personale_salva_costo", { p_profilo_id: "h", p_dati: { costo_orario: "25,74" } });
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, "personale_costo", { p_profilo_id: "h" });
    expect(qc.getQueryData(["personale", "costo", "h", "c"])).toEqual(stored);
  });
  it("INPS vuoto: si salva vuoto e vale quello del tipo, senza errore di conferma", async () => {
    const vuoto = { ...stored, contributi_percento: null as number | null, tipo: "apprendista", inps_del_tipo: 11.61 };
    mocks.rpc.mockImplementation((name: string) => Promise.resolve({ data: name === "personale_costo" ? vuoto : null, error: null }));
    const { result } = saveMount();
    await act(() => result.current.mutateAsync({ contributi_percento: "" }));
    expect(mocks.rpc).toHaveBeenNthCalledWith(1, "personale_salva_costo", { p_profilo_id: "h", p_dati: { contributi_percento: "" } });
  });
  it("invalidazione delle tariffe e revisione rapportini solo dell'azienda interessata", async () => {
    const { result, qc } = saveMount();
    const own = [["employees_active", "c"], ["order-labor-economics", "o", "c", true], ["campo-labor-review", "c", "o", "r", true]];
    const other = [["employees_active", "other"], ["order-labor-economics", "o", "other", true]];
    [...own, ...other].forEach(k => qc.setQueryData(k, []));
    await act(() => result.current.mutateAsync({ costo_orario: "25,74" }));
    own.forEach(k => expect(qc.getQueryState(k)?.isInvalidated).toBe(true)); other.forEach(k => expect(qc.getQueryState(k)?.isInvalidated).toBe(false));
  });
  it("cambio azienda durante la risposta mantiene la destinazione originaria", async () => {
    let release!: (v: unknown) => void;
    mocks.rpc.mockImplementation((name: string) => name === "personale_salva_costo" ? new Promise(r => { release = r; }) : Promise.resolve({ data: stored, error: null }));
    const { result, qc, rerender } = saveMount(); let pending!: Promise<unknown>;
    act(() => { pending = result.current.mutateAsync({ costo_orario: "25,74" }); });
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledOnce()); mocks.company = "other"; rerender();
    await act(async () => { release({ data: null, error: null }); await pending; });
    expect(qc.getQueryData(["personale", "costo", "h", "c"])).toEqual(stored);
    expect(qc.getQueryData(["personale", "costo", "h", "other"])).toBeUndefined();
  });
  it.each(["solaLettura", "isLoading"] as const)("non salva con %s", async key => {
    mocks.p[key] = true; const { result } = saveMount();
    await act(async () => { await expect(result.current.mutateAsync({ costo_orario: "25,74" })).rejects.toThrow(); }); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("input invalidi non arrivano al database", async () => {
    const { result } = saveMount(); await act(async () => { await expect(result.current.mutateAsync({ ore_mese: "7,5" })).rejects.toThrow(); }); expect(mocks.from).not.toHaveBeenCalled();
  });
  it.each([null, { ...stored, ha_scheda_costo: false }, { ...stored, costo_orario_scritto: 50 }])("conferma non valida %j non aggiorna cache come successo", async response => {
    mocks.rpc.mockImplementation((name: string) => Promise.resolve({ data: name === "personale_costo" ? response : null, error: null }));
    const { result, qc } = saveMount(); await act(async () => { await expect(result.current.mutateAsync({ costo_orario: "25,74" })).rejects.toThrow(); });
    expect(qc.getQueryData(["personale", "costo", "h", "c"])).toBeUndefined();
  });
  it("non legge costo HR senza permesso neppure con un ID conosciuto", () => {
    mocks.p.canViewPersone = false; mount(true); expect(mocks.from).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
