import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/* Canale Supabase finto: tiene i gestori registrati con .on() e il callback di
 * .subscribe(), così il test può far "arrivare" gli eventi del tempo reale. */
const canale = vi.hoisted(() => ({
  gestori: [] as { evento: string; filtro?: string; cb: (p: any) => void }[],
  stato: null as null | ((s: string) => void),
  rimossi: 0,
}));

vi.mock("@/integrations/supabase/client", () => {
  const ch: any = {
    on: (_tipo: string, opzioni: any, cb: (p: any) => void) => {
      canale.gestori.push({ evento: opzioni.event, filtro: opzioni.filter, cb });
      return ch;
    },
    subscribe: (cb: (s: string) => void) => { canale.stato = cb; return ch; },
  };
  return {
    supabase: {
      channel: () => ch,
      removeChannel: () => { canale.rimossi++; return Promise.resolve("ok"); },
      from: () => ({}),
      rpc: () => Promise.resolve({ data: null, error: null }),
    },
  };
});

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ effectiveCompany: { id: "az1" }, user: { id: "u1" }, profile: { id: "u1" } }),
}));

import { useOpportunitiesLive } from "@/hooks/useOpportunitiesData";
import { queryKeys } from "@/lib/queryKeys";

const arriva = (evento: string, payload: any) =>
  canale.gestori.filter((g) => g.evento === evento).forEach((g) => g.cb(payload));

function monta(queryClient: QueryClient, pipelineId = "p1") {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHook(() => useOpportunitiesLive(pipelineId), { wrapper });
}

function nascondi(nascosta: boolean) {
  Object.defineProperty(document, "hidden", { configurable: true, get: () => nascosta });
}

describe("opportunità in tempo reale", () => {
  let queryClient: QueryClient;
  let invalida: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    canale.gestori = []; canale.stato = null; canale.rimossi = 0;
    nascondi(false);
    queryClient = new QueryClient();
    invalida = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue(undefined);
  });
  afterEach(() => { vi.useRealTimers(); });

  it("ascolta l'azienda per inserimenti e modifiche, le cancellazioni senza filtro", () => {
    monta(queryClient);
    expect(canale.gestori.map((g) => [g.evento, g.filtro])).toEqual([
      ["INSERT", "company_id=eq.az1"],
      ["UPDATE", "company_id=eq.az1"],
      ["DELETE", undefined],
    ]);
  });

  it("una raffica di eventi della pipeline aperta diventa UNA ricarica dopo un secondo", () => {
    monta(queryClient);
    arriva("INSERT", { new: { id: "o1", pipeline_id: "p1" } });
    arriva("UPDATE", { new: { id: "o1", pipeline_id: "p1" } });
    arriva("UPDATE", { new: { id: "o1", pipeline_id: "p1" } });
    vi.advanceTimersByTime(999);
    expect(invalida).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(invalida).toHaveBeenCalledTimes(1);

    // Ricarica solo riepilogo, colonne e lista di QUESTA pipeline.
    const { predicate } = invalida.mock.calls[0][0] as any;
    const q = (key: readonly unknown[]) => ({ queryKey: key }) as any;
    expect(predicate(q(queryKeys.opportunities.riepilogo("az1", "p1", {})))).toBe(true);
    expect(predicate(q(queryKeys.opportunities.fase("az1", "p1", "s1", {}, "created_at:desc")))).toBe(true);
    expect(predicate(q(queryKeys.opportunities.lista("az1", "p1", null, {}, "created_at:desc")))).toBe(true);
    expect(predicate(q(queryKeys.opportunities.riepilogo("az1", "p2", {})))).toBe(false);
    expect(predicate(q(queryKeys.opportunities.etichette("az1", "p1")))).toBe(false);
    expect(predicate(q(queryKeys.opportunities.detail("o1")))).toBe(false);
  });

  it("le modifiche di un'altra pipeline non ricaricano niente", () => {
    monta(queryClient);
    arriva("INSERT", { new: { id: "o9", pipeline_id: "p2" } });
    arriva("UPDATE", { new: { id: "o9", pipeline_id: "p2" } });
    vi.advanceTimersByTime(10_000);
    expect(invalida).not.toHaveBeenCalled();
  });

  it("una scheda a schermo che passa in un'altra pipeline ricarica, e così la sua cancellazione", async () => {
    queryClient.setQueryData(queryKeys.opportunities.fase("az1", "p1", "s1", {}, "created_at:desc"),
      { pages: [[{ id: "a-schermo" }]], pageParams: [0] });
    monta(queryClient);

    arriva("DELETE", { old: { id: "di-un-altra-azienda" } });
    vi.advanceTimersByTime(5_000);
    expect(invalida).not.toHaveBeenCalled();

    arriva("UPDATE", { new: { id: "a-schermo", pipeline_id: "p2" } });
    vi.advanceTimersByTime(1_000);
    expect(invalida).toHaveBeenCalledTimes(1);

    arriva("DELETE", { old: { id: "a-schermo" } });
    await vi.advanceTimersByTimeAsync(15_000);
    expect(invalida).toHaveBeenCalledTimes(2);
  });

  it("mai più di una ricarica ogni 15 secondi", async () => {
    monta(queryClient);
    arriva("INSERT", { new: { id: "o1", pipeline_id: "p1" } });
    await vi.advanceTimersByTimeAsync(1_000);          // t = 1 s: prima ricarica
    expect(invalida).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(500);            // t = 1,5 s: nuovo evento
    arriva("UPDATE", { new: { id: "o1", pipeline_id: "p1" } });
    await vi.advanceTimersByTimeAsync(14_499);         // t = 15,999 s
    expect(invalida).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);              // t = 16 s: seconda
    expect(invalida).toHaveBeenCalledTimes(2);
  });

  it("finché la ricarica precedente non è finita non ne parte un'altra, e dopo una lenta si aspetta di più", async () => {
    // 15/09/2026: col database lento le ricariche si accavallavano, e quelle
    // annullate nel browser continuavano sul database.
    let finisci!: () => void;
    invalida.mockImplementationOnce(() => new Promise<void>((fine) => { finisci = () => fine(); }));
    monta(queryClient);
    arriva("INSERT", { new: { id: "o1", pipeline_id: "p1" } });
    await vi.advanceTimersByTimeAsync(1_000);          // t = 1 s: parte la prima e resta appesa
    expect(invalida).toHaveBeenCalledTimes(1);
    expect(invalida.mock.calls[0][1]).toEqual({ cancelRefetch: false });
    arriva("UPDATE", { new: { id: "o1", pipeline_id: "p1" } });
    await vi.advanceTimersByTimeAsync(60_000);         // t = 61 s: la prima non è ancora finita
    expect(invalida).toHaveBeenCalledTimes(1);
    finisci();                                         // è durata 60 s: la prossima tra 2 minuti
    await vi.advanceTimersByTimeAsync(119_000);        // t = 180 s
    expect(invalida).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2_000);          // t = 182 s
    expect(invalida).toHaveBeenCalledTimes(2);
  });

  it("con la scheda del browser nascosta non ricarica; al ritorno sì", () => {
    monta(queryClient);
    nascondi(true);
    arriva("INSERT", { new: { id: "o1", pipeline_id: "p1" } });
    vi.advanceTimersByTime(10_000);
    expect(invalida).not.toHaveBeenCalled();
    nascondi(false);
    document.dispatchEvent(new Event("visibilitychange"));
    vi.advanceTimersByTime(3_000);
    expect(invalida).toHaveBeenCalledTimes(1);
  });

  it("aspetta che uno spostamento in corso finisca di salvare", () => {
    const inCorso = vi.spyOn(queryClient, "isMutating").mockReturnValue(1);
    monta(queryClient);
    arriva("UPDATE", { new: { id: "o1", pipeline_id: "p1" } });
    vi.advanceTimersByTime(10_000);
    expect(invalida).not.toHaveBeenCalled();
    inCorso.mockReturnValue(0);
    vi.advanceTimersByTime(3_000);
    expect(invalida).toHaveBeenCalledTimes(1);
  });

  it("dopo una riconnessione ricarica (il primo aggancio no), e smontando chiude il canale", () => {
    const { unmount } = monta(queryClient);
    canale.stato?.("SUBSCRIBED");
    vi.advanceTimersByTime(5_000);
    expect(invalida).not.toHaveBeenCalled();
    canale.stato?.("SUBSCRIBED");
    vi.advanceTimersByTime(3_000);
    expect(invalida).toHaveBeenCalledTimes(1);
    unmount();
    expect(canale.rimossi).toBe(1);
  });
});
