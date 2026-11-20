import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { useDettaglioSubappaltoCommessa } from "@/hooks/useDettaglioSubappaltoCommessa";

const m = vi.hoisted(() => ({ error: false, calls: [] as { tabella: string; filtri: [string, unknown][]; from: number }[] }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (tabella: string) => {
  const q = { tabella, filtri: [] as [string, unknown][], from: 0 };
  const catena = {
    select: () => catena, order: () => catena, limit: () => catena,
    eq: (k: string, v: unknown) => { q.filtri.push([k, v]); return catena; },
    range: (from: number) => { q.from = from; return catena; },
    then: (ok: (r: unknown) => unknown) => {
      m.calls.push(q);
      const righe = tabella === "subappalto_quadri_lavori" ? [{ id: "q", revisione: 1, voci: [], importo_lavori: 1 }]
        : Array.from({ length: q.from === 0 ? 1000 : 1 }, (_, i) => ({ id: String(q.from + i) }));
      return Promise.resolve({ data: righe, error: m.error && tabella === "sal_subappaltatori" ? { message: "Lettura SAL fallita" } : null }).then(ok);
    },
  };
  return catena;
} } }));

let qc: QueryClient;
function wrapper({ children }: { children: ReactNode }) { return <QueryClientProvider client={qc}>{children}</QueryClientProvider>; }
function prepara(abilitato = true) {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderHook(() => useDettaglioSubappaltoCommessa("azienda", "commessa", "contratto", abilitato), { wrapper });
}
afterEach(() => { cleanup(); qc?.clear(); m.calls = []; m.error = false; });

it("legge oltre mille SAL e varianti senza troncare il riepilogo, con filtri espliciti di azienda e contratto", async () => {
  const { result } = prepara();
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data?.sal).toHaveLength(1001);
  expect(result.current.data?.varianti).toHaveLength(1001);
  for (const q of m.calls) {
    expect(q.filtri).toContainEqual(["company_id", "azienda"]);
    expect(q.filtri).toContainEqual(["contratto_id", "contratto"]);
    if (q.tabella === "sal_subappaltatori") expect(q.filtri).toContainEqual(["order_id", "commessa"]);
  }
});
it("un errore dei SAL impedisce di usare un riepilogo finanziario parziale", async () => {
  m.error = true;
  const { result } = prepara();
  await waitFor(() => expect(result.current.isError).toBe(true));
  expect(result.current.data).toBeUndefined();
});
it("non interroga il database finché il dettaglio non è autorizzato e aperto", () => {
  prepara(false); expect(m.calls).toEqual([]);
});
