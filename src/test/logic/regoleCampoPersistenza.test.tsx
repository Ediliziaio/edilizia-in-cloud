import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRegoleAzienda, useRegoleCampoOrdine, useSalvaRegoleAzienda } from "@/hooks/useRegoleCampo";
import type { RegoleCampo } from "@/lib/campo/regoleCampo";

const state = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: state.rpc } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "utente" }, profile: { company_id: "azienda" } }) }));
const salvate = { chi_compila: "ore_proprie", ore_dalle: "timbrature", avviso_scostamento_minuti: 45, scelte_fatte: true };
const regole: RegoleCampo = { chiCompila: "ore_proprie", oreDalle: "timbrature", avvisoScostamentoMinuti: 45 };
function contesto() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  return { qc, wrapper };
}
beforeEach(() => { vi.clearAllMocks(); state.rpc.mockResolvedValue({ data: salvate, error: null }); });
afterEach(cleanup);

describe("Persistenza delle regole aziendali", () => {
  it("legge l’azienda richiesta e conserva anche la soglia salvata", async () => {
    const { wrapper } = contesto();
    const { result } = renderHook(() => useRegoleAzienda("azienda"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(state.rpc).toHaveBeenCalledWith("campo_regole_azienda_leggi", { p_company_id: "azienda" });
    expect(result.current.data).toEqual({ regole, sceltaFatta: true });
  });
  it("un’azienda che non ha ancora scelto legge i valori attuali senza errore", async () => {
    state.rpc.mockResolvedValue({ data: { chi_compila: "ognuno", ore_dalle: "capo", avviso_scostamento_minuti: null, scelte_fatte: false }, error: null });
    const { wrapper } = contesto();
    const { result } = renderHook(() => useRegoleAzienda("azienda"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ regole: { chiCompila: "ognuno", oreDalle: "capo", avvisoScostamentoMinuti: null }, sceltaFatta: false });
  });
  it("una lettura Campo fallita resta un errore, senza cambiare il flusso in ognuno", async () => {
    state.rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "Lettura negata" } });
    const { qc, wrapper } = contesto();
    const { result } = renderHook(() => useRegoleCampoOrdine("commessa"), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
    expect(qc.getQueryState(["campo-regole-ordine", "commessa", "azienda", "utente"])?.status).toBe("error");
  });
  it("il salvataggio usa la risposta persistita e aspetta il rinnovo delle letture prima del successo", async () => {
    const { qc, wrapper } = contesto();
    let completa = () => {};
    const aggiornamento = new Promise<void>((resolve) => { completa = resolve; });
    const invalida = vi.spyOn(qc, "invalidateQueries").mockReturnValue(aggiornamento);
    const { result } = renderHook(() => useSalvaRegoleAzienda("azienda"), { wrapper });
    const invio = result.current.mutateAsync(regole);
    await waitFor(() => expect(qc.getQueryData(["campo-regole-azienda", "azienda"])).toEqual({ regole, sceltaFatta: true }));
    expect(state.rpc).toHaveBeenCalledWith("campo_regole_azienda_salva", {
      p_company_id: "azienda", p_chi_compila: "ore_proprie", p_ore_dalle: "timbrature", p_avviso_minuti: 45,
    });
    expect(result.current.isPending).toBe(true);
    expect(invalida).toHaveBeenCalledWith({ queryKey: ["campo-regole-ordine"] });
    expect(invalida).toHaveBeenCalledWith({ queryKey: ["campo-regole-azienda", "azienda"] });
    completa();
    await invio;
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
  it("un rifiuto del database non aggiorna la cache né segnala successo", async () => {
    state.rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "Non puoi modificare" } });
    const { qc, wrapper } = contesto();
    const invalida = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useSalvaRegoleAzienda("azienda"), { wrapper });
    await expect(result.current.mutateAsync(regole)).rejects.toMatchObject({ code: "42501" });
    expect(qc.getQueryData(["campo-regole-azienda", "azienda"])).toBeUndefined();
    expect(invalida).not.toHaveBeenCalled();
  });
  it("senza azienda non chiama la RPC di scrittura", async () => {
    const { wrapper } = contesto();
    const { result } = renderHook(() => useSalvaRegoleAzienda(undefined), { wrapper });
    await expect(result.current.mutateAsync(regole)).rejects.toThrow("Seleziona un’azienda");
    expect(state.rpc).not.toHaveBeenCalled();
  });
  it("senza risposta di conferma non cancella la bozza come se fosse salvata", async () => {
    state.rpc.mockResolvedValue({ data: null, error: null });
    const { wrapper } = contesto();
    const { result } = renderHook(() => useSalvaRegoleAzienda("azienda"), { wrapper });
    await expect(result.current.mutateAsync(regole)).rejects.toThrow("La conferma del salvataggio");
  });
  it("una risposta incompleta non viene trattata come conferma di scrittura", async () => {
    state.rpc.mockResolvedValue({ data: {}, error: null });
    const { qc, wrapper } = contesto();
    const { result } = renderHook(() => useSalvaRegoleAzienda("azienda"), { wrapper });
    await expect(result.current.mutateAsync(regole)).rejects.toThrow("La conferma del salvataggio");
    expect(qc.getQueryData(["campo-regole-azienda", "azienda"])).toBeUndefined();
  });
});
