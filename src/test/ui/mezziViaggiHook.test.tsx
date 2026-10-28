import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useSalvaViaggio } from "@/hooks/useMezziViaggi";
const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "u1" } }),
}));
afterEach(() => {
  cleanup();
  rpc.mockReset();
});
describe("Invii idempotenti dei viaggi", () => {
  it("un retry di rete riusa il token, un contenuto diverso ha un nuovo token", async () => {
    const qc = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const hook = renderHook(() => useSalvaViaggio("c1"), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={qc}>{children}</QueryClientProvider>
      ),
    });
    const input = {
      mezzoId: "m1",
      id: "v1",
      versione: 0,
      azione: "invia" as const,
      motivo: "",
      dati: {
        partenza: "2020-01-01T00:00:00Z",
        arrivo: "2020-01-01T01:00:00Z",
        contatore_inizio: null as null,
        contatore_fine: null as null,
        note: "",
        tratte: [] as never[],
      },
    };
    rpc.mockResolvedValue({ data: null, error: { message: "Rete assente" } });
    await act(async () => {
      await hook.result.current.mutateAsync(input).catch(() => {});
    });
    const first = rpc.mock.calls[0][1].p_token;
    await act(async () => {
      await hook.result.current.mutateAsync(input).catch(() => {});
    });
    expect(rpc.mock.calls[1][1].p_token).toBe(first);
    await act(async () => {
      await hook.result.current
        .mutateAsync({ ...input, motivo: "Diverso" })
        .catch(() => {});
    });
    expect(rpc.mock.calls[2][1].p_token).not.toBe(first);
    qc.clear();
  });
});
