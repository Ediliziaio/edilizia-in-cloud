import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const stato = vi.hoisted(() => ({
  rimaste: [] as { quantity_received: number }[],
  updateError: null as unknown,
  aggiornamenti: [] as unknown[],
  errore: vi.fn(), successo: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "company" }, user: { id: "u1" } }) }));
vi.mock("sonner", () => ({ toast: { success: stato.successo, error: stato.errore } }));
vi.mock("@/lib/orders/refreshMaterialQueries", () => ({ refreshMaterialQueries: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: (tabella: string) => {
    let azione = "select";
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq"]) q[m] = () => q;
    q.delete = () => { azione = "delete"; return q; };
    q.update = (valori: unknown) => { azione = "update"; stato.aggiornamenti.push(valori); return q; };
    q.maybeSingle = async () => ({ data: { order_item_id: "item-1" }, error: null as unknown });
    q.then = (si: (r: unknown) => unknown, no: (e: unknown) => unknown) => {
      const r = tabella === "order_items" && azione === "update" ? { data: null as unknown, error: stato.updateError }
        : azione === "delete" ? { data: null as unknown, error: null as unknown }
        : { data: stato.rimaste, error: null as unknown };
      return Promise.resolve(r).then(si, no);
    };
    return q;
  },
} }));

import { MESSAGGIO_STATO_NON_AGGIORNATO, statoDopoRicezioniRimaste, useDDTRicezioneMutations } from "@/hooks/useDDTRicezione";

const avvolgi = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>{children}</QueryClientProvider>
);

beforeEach(() => {
  vi.clearAllMocks();
  stato.rimaste = []; stato.updateError = null; stato.aggiornamenti = [];
});

describe("cancellare una ricezione merce", () => {
  it("tolta l'ultima ricezione, l'articolo torna a «not_started», il valore che il vincolo ammette", () => {
    expect(statoDopoRicezioniRimaste([])).toEqual({ quantity_received: 0, fulfillment_status: "not_started", receipt_id: null });
    expect(statoDopoRicezioniRimaste([{ quantity_received: 3 }, { quantity_received: 2 }]))
      .toMatchObject({ quantity_received: 5, fulfillment_status: "received" });
  });

  it("scrive lo stato sull'articolo e conferma", async () => {
    const { result } = renderHook(() => useDDTRicezioneMutations(), { wrapper: avvolgi });
    await act(async () => { await result.current.deleteGoodsReceipt.mutateAsync("gr-1"); });
    expect(stato.aggiornamenti).toEqual([{ quantity_received: 0, fulfillment_status: "not_started", receipt_id: null }]);
    expect(stato.successo).toHaveBeenCalledWith("Ricezione rimossa");
  });

  it("se l'aggiornamento dell'articolo non riesce lo dice, invece di confermare", async () => {
    stato.updateError = { code: "23514", message: "violates check constraint" };
    const { result } = renderHook(() => useDDTRicezioneMutations(), { wrapper: avvolgi });
    await act(async () => {
      await expect(result.current.deleteGoodsReceipt.mutateAsync("gr-1")).rejects.toThrow(MESSAGGIO_STATO_NON_AGGIORNATO);
    });
    await waitFor(() => expect(stato.errore).toHaveBeenCalledWith(MESSAGGIO_STATO_NON_AGGIORNATO));
    expect(stato.successo).not.toHaveBeenCalled();
  });
});
