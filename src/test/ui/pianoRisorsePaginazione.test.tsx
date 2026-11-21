import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  rows: [] as { id: string; origine_id: string; phase_id: string; subphase_id: string }[],
  result: vi.fn(),
  fail: false,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: () => query,
        order: () => query,
        single: async (): Promise<{ data: { raw_extracted_json: object; updated_at: null }; error: null }> => ({ data: { raw_extracted_json: {}, updated_at: null }, error: null }),
        range: async (from: number, to: number) => ({
          data: table === "order_work_phase_voci" ? fixture.rows.slice(from, to + 1) : [],
          error: fixture.fail && table === "order_work_phase_voci" && from === 500 ? new Error("Pagina non disponibile") : null,
        }),
        then: (resolve: (v: unknown) => unknown) => Promise.resolve({
          data: table === "order_work_phase_voci" ? fixture.rows.slice(0, 1000) : [],
          error: null,
        }).then(resolve),
      };
      return query;
    },
  },
}));
vi.mock("@/lib/distinta/proposteRisorseComputo", async (load) => ({
  ...await load<typeof import("@/lib/distinta/proposteRisorseComputo")>(),
  proponiRisorseComputo: (...args: unknown[]): never[] => {
    fixture.result(...args);
    return [];
  },
}));
import { usePianoRisorseComputo } from "@/hooks/usePianoRisorseComputo";

beforeEach(() => {
  fixture.fail = false;
  fixture.result.mockClear();
  fixture.rows = Array.from({ length: 1205 }, (_, pos) => ({
    id: String(pos), origine_id: `v-${pos}`, phase_id: "fase", subphase_id: `sf-${pos}`,
  }));
});

function monta() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return renderHook(() => usePianoRisorseComputo("azienda", "ordine", "computo", []), { wrapper });
}

it("usa tutti i 1205 collegamenti anche se il servizio restituisce al massimo mille righe per risposta", async () => {
  const { result } = monta();
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  const ricevute = fixture.result.mock.calls[0][1].sottofasi;
  expect(ricevute).toHaveLength(1205);
  expect(new Set(ricevute.map((r: { id: string }) => r.id)).size).toBe(1205);
  expect(ricevute[1204]).toEqual({ id: "sf-1204", computo_voce_id: "v-1204" });
});

it("non calcola proposte se la lettura della seconda pagina fallisce", async () => {
  fixture.fail = true;
  const { result } = monta();
  await waitFor(() => expect(result.current.error?.message).toBe("Pagina non disponibile"));
  expect(fixture.result).not.toHaveBeenCalled();
});
