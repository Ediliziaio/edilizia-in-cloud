import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
const state = vi.hoisted(() => ({
  data: {} as Record<string, unknown>,
  error: null as { message: string } | null,
  calls: 0,
}));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({
  useEffectiveCompanyId: () => "company-a",
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: async () => {
      state.calls++;
      return { data: state.data, error: state.error };
    },
  },
}));
import { useLiquidazioneIVA } from "@/hooks/useLiquidazioneIVA";
function wrapper({ children }: { children: ReactNode }) {
  return (
    <MemoryRouter initialEntries={["/?anno=2026&mese=10"]}>
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        {children}
      </QueryClientProvider>
    </MemoryRouter>
  );
}
beforeEach(() => {
  state.calls = 0;
  state.error = null;
  state.data = {
    calcolabile: true,
    iva_vendite: 1116.85,
    iva_acquisti: 32120.3,
    saldo: -31003.45,
  };
});
afterEach(cleanup);
it("does not calculate on navigation and preserves the negative arithmetic sign", async () => {
  const { result } = renderHook(useLiquidazioneIVA, { wrapper });
  expect(state.calls).toBe(0);
  expect(result.current.risultato).toBeNull();
  await act(async () => {
    await result.current.calcola();
  });
  await waitFor(() => expect(result.current.risultato?.saldo).toBe(-31003.45));
  expect(result.current.risultato?.credito).toBe(true);
});
it("never turns missing amounts into a valid zero balance", async () => {
  state.data = {
    calcolabile: true,
    iva_vendite: 100,
    iva_acquisti: null,
    saldo: null,
  };
  const { result } = renderHook(useLiquidazioneIVA, { wrapper });
  await act(async () => {
    await result.current.calcola();
  });
  await waitFor(() => expect(result.current.error).toBeTruthy());
  expect(result.current.risultato).toBeNull();
});
it("distinguishes an empty period from a transport failure", async () => {
  state.data = {
    calcolabile: false,
    motivo: "Nessun documento fiscale nel periodo",
  };
  const { result } = renderHook(useLiquidazioneIVA, { wrapper });
  await act(async () => {
    await result.current.calcola();
  });
  await waitFor(() =>
    expect(result.current.risultato?.calcolabile).toBe(false),
  );
  expect(result.current.risultato?.saldo).toBeNull();
  expect(result.current.risultato?.motivo).toContain("Nessun documento");
  expect(result.current.error).toBeNull();
});
it("hides a previous result when a refresh fails", async () => {
  const { result } = renderHook(useLiquidazioneIVA, { wrapper });
  await act(async () => {
    await result.current.calcola();
  });
  await waitFor(() => expect(result.current.risultato).not.toBeNull());
  state.error = { message: "network failed" };
  await act(async () => {
    await result.current.calcola();
  });
  await waitFor(() => expect(result.current.error).toBeTruthy());
  expect(result.current.risultato).toBeNull();
});
