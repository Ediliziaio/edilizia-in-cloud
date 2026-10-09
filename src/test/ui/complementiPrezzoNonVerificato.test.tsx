import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { useComplementiFinestre } from "@/components/serramenti/useComplementiFinestre";
import type { SrSerramentoRow, SrAccessorioRow } from "@/types/serramenti";
import type { FamilyWithAxes } from "@/types/articleFamily";

vi.mock("@/lib/serramenti/queries", () => ({ opzioniGriglia: () => ({ queryKey: ["grid"], queryFn: async () => { throw new Error("network"); }, retry: false }) }));
const warning = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: { warning, error: vi.fn(), success: vi.fn() } }));

describe("complement price after unreadable grid", () => {
  it("clears unverifiable amounts while following dimensions and notifying the user", async () => {
    const window = { id: "window", larghezza_mm: 900, altezza_mm: 1200, quantita: 1 } as SrSerramentoRow;
    const complement = { id: "complement", serramento_id: "window", family_id: "family", tipo: "avvolgibile", larghezza_mm: 900, altezza_mm: 1200, quantita: 1, prezzo_unitario: 100, prezzo_totale: 100 } as SrAccessorioRow;
    const update = vi.fn();
    const qc = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => useComplementiFinestre({
      serramenti: [window], accessori: [complement], famiglie: [{ id: "family", modalita_prezzo_base: "griglia", axes: [] } as unknown as FamilyWithAxes],
      macrocategorie: [], categorie: [], tariffePrezzi: new Map(), supplierLineMap: new Map(),
      salvataggi: { aggiungi: async () => {}, aggiorna: update, elimina: vi.fn(), inCorso: false },
    }), { wrapper });
    await act(async () => { await result.current.seguiLaFinestra(window, { ...window, larghezza_mm: 1000 }); });
    expect(update).toHaveBeenCalledWith("complement", { larghezza_mm: 1000, prezzo_unitario: null, prezzo_totale: null });
    expect(warning).toHaveBeenCalled();
  });
});
