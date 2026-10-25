import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
const io = vi.hoisted(() => ({ from: vi.fn(), select: vi.fn(), eq: vi.fn(), in: vi.fn(), order: vi.fn(), limit: vi.fn(), abortSignal: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: io.from } }));
import { usePrezzarioFonti, usePrezzarioVociPerCodici } from "@/lib/prezzario/queries";
let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  Object.values(io).forEach(mock => mock.mockReset());
  [io.from, io.select, io.eq, io.in, io.order, io.limit].forEach(mock => mock.mockReturnValue(io));
  io.abortSignal.mockResolvedValue({ data: [{ id: "existing-row" }], error: null });
});
afterEach(() => { cleanup(); client.clear(); });
describe("Letture prezzario esatto: limitate, annullabili, riusate", () => {
  it("non legge le fonti prima che la chat ne abbia bisogno", () => {
    const { result } = renderHook(() => usePrezzarioFonti(false), { wrapper });
    expect(result.current.fetchStatus).toBe("idle"); expect(io.from).not.toHaveBeenCalled();
  });
  it("deduplica codici, vincola fonte/pubblicazione e limita risultati senza count/scansioni", async () => {
    const { result, rerender } = renderHook(({ codes }) => usePrezzarioVociPerCodici("source", codes), { initialProps: { codes: ["B", "A", "B"] }, wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(io.from).toHaveBeenCalledWith("prezzario_voce");
    expect(io.eq).toHaveBeenCalledWith("fonte_id", "source"); expect(io.eq).toHaveBeenCalledWith("fonte.stato", "pubblicato");
    expect(io.in).toHaveBeenCalledWith("codice", ["A", "B"]); expect(io.limit).toHaveBeenCalledWith(4);
    expect(io.abortSignal.mock.calls[0][0]).toBeInstanceOf(AbortSignal);
    rerender({ codes: ["A", "B"] });
    expect(io.from).toHaveBeenCalledTimes(1);
  });
  it.each([{ codes: [] as string[] }, { codes: Array.from({ length: 31 }, (_, i) => String(i)) }])("non avvia letture vuote o oltre il budget", ({ codes }) => {
    const { result } = renderHook(() => usePrezzarioVociPerCodici("source", codes), { wrapper });
    expect(result.current.fetchStatus).toBe("idle"); expect(io.from).not.toHaveBeenCalled();
  });
  it("non effettua letture senza una fonte", () => {
    renderHook(() => usePrezzarioVociPerCodici(null, ["A"]), { wrapper }); expect(io.from).not.toHaveBeenCalled();
  });
  it("un errore non causa tentativi o fallback di scansione aggiuntivi", async () => {
    io.abortSignal.mockResolvedValue({ data: null, error: { message: "Accesso negato" } });
    const { result } = renderHook(() => usePrezzarioVociPerCodici("source", ["A"]), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe("Accesso negato"); expect(io.from).toHaveBeenCalledTimes(1);
  });
  it("smontare la pagina annulla la lettura in corso", async () => {
    io.abortSignal.mockImplementation((signal: AbortSignal) => new Promise((_, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true })));
    const { unmount } = renderHook(() => usePrezzarioVociPerCodici("source", ["A"]), { wrapper });
    await waitFor(() => expect(io.abortSignal).toHaveBeenCalledTimes(1));
    const signal = io.abortSignal.mock.calls[0][0] as AbortSignal;
    unmount(); expect(signal.aborted).toBe(true);
  });
});
