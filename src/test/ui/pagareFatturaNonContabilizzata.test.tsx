import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import sorgentePagina from "@/pages/azienda/fatturazione/FattureRicevutePage.tsx?raw";

// 23/11/2026: pagare una fattura ricevuta non ancora contabilizzata passa dallo stesso
// pannello delle altre — dal riepilogo, dall'elenco e dal riquadro del telefono.
const finto = vi.hoisted(() => ({ rpc: vi.fn(), errori: [] as string[] }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => finto.rpc(...a) } }));
vi.mock("sonner", () => ({ toast: { error: (m: string) => finto.errori.push(m), success: vi.fn() } }));
import { useContabilizzaPerPagare } from "@/hooks/useContabilizzaPerPagare";

const avvolgi = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>{children}</QueryClientProvider>
);

beforeEach(() => { finto.rpc.mockReset(); finto.errori = []; });

describe("pagare una fattura non ancora contabilizzata", () => {
  it("la contabilizza e restituisce il costo su cui si apre il pannello", async () => {
    finto.rpc.mockResolvedValue({ data: { esito: "costo_creato", company_cost_id: "c9" }, error: null });
    const { result } = renderHook(() => useContabilizzaPerPagare(), { wrapper: avvolgi });
    let costo = "";
    await act(async () => { costo = await result.current.mutateAsync("f1"); });
    expect(costo).toBe("c9");
    expect(finto.rpc).toHaveBeenCalledWith("contabilizza_fattura_ricevuta", { p_fattura_id: "f1" });
  });

  it("già contabilizzata: usa il costo che c'è, senza crearne un altro", async () => {
    finto.rpc.mockResolvedValue({ data: { esito: "gia_contabilizzata", company_cost_id: "c1" }, error: null });
    const { result } = renderHook(() => useContabilizzaPerPagare(), { wrapper: avvolgi });
    await act(async () => { expect(await result.current.mutateAsync("f1")).toBe("c1"); });
  });

  it("senza costo non apre niente e lo dice", async () => {
    finto.rpc.mockResolvedValue({ data: { esito: "gia_contabilizzata", company_cost_id: null }, error: null });
    const { result } = renderHook(() => useContabilizzaPerPagare(), { wrapper: avvolgi });
    act(() => result.current.mutate("f1"));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(finto.errori).toEqual(["Non riesco a preparare il pagamento"]);
  });

  it("da telefono il riquadro della fattura apre lo stesso pannello, non il vecchio «Segna pagata»", () => {
    const riquadro = sorgentePagina.slice(sorgentePagina.indexOf("<Sheet open={!!dettaglioMobile}"));
    expect(riquadro).toContain("pagaRiga(f, Number(saldi?.get(f.id)?.residuo ?? 0))");
    // Il vecchio pulsante resta solo per chi non vede i costi (e quindi non ha il pannello).
    expect(riquadro).toMatch(/!permessiCosti\.canViewCosts && \(pagataIl\(dettaglioMobile\.id\) \|\| daPagare\(dettaglioMobile\)\) &&\s*<PagamentoRicevutaCella/);
  });
});
