// src/test/ui/modelliPagamentoMessaggi.test.tsx
// L'esito dopo una scelta dice il vero: la regola del SAL vale per TUTTE le commesse (SalTab la legge per ogni rata, anche
// delle commesse già aperte), la stella solo per le commesse nuove. Con l'hook vero e il database finto.
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ rpc: vi.fn(), successo: vi.fn(), errore: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: state.successo, error: state.errore } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "azienda-1" } }) }));
vi.mock("@/integrations/supabase/client", () => {
  const costruisci = (dati: unknown[]) => {
    const b: Record<string, unknown> = {};
    for (const m of ["select", "eq", "order"]) b[m] = () => b;
    b.maybeSingle = async () => ({ data: { modelli_inizializzati: true, modello_predefinito: null as unknown, sal_matura_quando: "emesso" }, error: null as unknown });
    b.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: dati, error: null as unknown }).then(ok);
    return b;
  };
  return { supabase: { from: () => costruisci([]), rpc: (...argomenti: unknown[]) => state.rpc(...argomenti) } };
});

import { useModelliPagamento } from "@/hooks/useModelliPagamento";

const contenitore = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

beforeEach(() => {
  vi.clearAllMocks();
  state.rpc.mockResolvedValue({ data: null as unknown, error: null as unknown });
});
afterEach(cleanup);

describe("dopo una scelta, l'esito dice a quali commesse vale", () => {
  it("la regola del SAL: vale subito per tutte le commesse, non solo per le nuove", async () => {
    const { result } = renderHook(() => useModelliPagamento(), { wrapper: contenitore });
    await waitFor(() => expect(result.current.disponibile).toBe(true));
    act(() => result.current.impostazioni.mutate({ salMatura: "approvato" }));
    await waitFor(() => expect(state.successo).toHaveBeenCalledWith("Fatto: vale subito per tutte le commesse."));
    expect(state.rpc).toHaveBeenCalledWith("pagamenti_impostazioni_salva", { p_company_id: "azienda-1", p_valori: { sal_matura_quando: "approvato" } });
    expect(state.successo.mock.calls.flat().join(" ")).not.toMatch(/commesse nuove/);
  });

  it("la stella (il modello di partenza): vale per le commesse nuove", async () => {
    const { result } = renderHook(() => useModelliPagamento(), { wrapper: contenitore });
    await waitFor(() => expect(result.current.disponibile).toBe(true));
    act(() => result.current.impostazioni.mutate({ modelloPredefinito: "m1" }));
    await waitFor(() => expect(state.successo).toHaveBeenCalledWith("Fatto: vale da subito per le commesse nuove."));
  });
});
