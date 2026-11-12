import { renderHook, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDocumentiFiscali } from "@/hooks/useDocumentiFiscali";

const s = vi.hoisted(() => ({ ops: [] as unknown[][], errore: false, rpc: vi.fn() }));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => "azienda-a" }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: s.rpc,
  from: (tabella: string) => {
    s.ops.push(["from", tabella]);
    const q: Record<string, unknown> = {};
    for (const method of ["select", "eq", "in", "not", "is", "order", "range", "or", "gt", "lt", "gte", "lte", "ilike", "abortSignal"]) q[method] = (...args: unknown[]) => { s.ops.push([method, ...args]); return q; };
    q.then = (resolve: (v: unknown) => void) => resolve(s.errore
      ? { data: null, count: null, error: new Error("Ricerca non disponibile") }
      : { data: [{ id: "f", company_id: "azienda-a", totale_da_pagare: 900, importo_pagato: 200, stornato: 100, note_interne: "Riservata" }], count: 225, error: null });
    return q;
  },
} }));
beforeEach(() => { s.ops = []; s.errore = false; s.rpc.mockClear(); });
afterEach(cleanup);
function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>;
}

describe("Query elenco fatture: archivio, azienda e filtri combinati", () => {
  it("filtra sul server prima della pagina, conserva count e non carica file incorporati", async () => {
    const { result } = renderHook(() => useDocumentiFiscali({ conImportate: true, search: "3.235,00", cliente: "Rossi_100%", commessa: "C-1", sdi: "da_inviare", incasso: "parziale", conNote: true, conAllegati: true, page: 8, perPage: 25, ordinamento: "progressivo" }), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(s.ops).toContainEqual(["from", "documenti_fiscali_elenco_operativo"]);
    expect(s.ops).toContainEqual(["eq", "company_id", "azienda-a"]);
    expect(s.ops).toContainEqual(["is", "deleted_at", null]);
    expect(s.ops).toContainEqual(["range", 200, 224]);
    expect(s.ops).toContainEqual(["ilike", "elenco_cliente", "%Rossi\\_100\\%%"]);
    expect(s.ops).toContainEqual(["ilike", "elenco_commesse", "%C-1%"]);
    expect(s.ops).toContainEqual(["eq", "elenco_fase_sdi", "da_inviare"]);
    expect(s.ops).toContainEqual(["eq", "elenco_incasso", "parziale"]);
    const ors = s.ops.filter(o => o[0] === "or");
    expect(ors).toHaveLength(1);
    expect(ors[0][1]).toContain("totale_documento.eq.3235");
    expect(ors[0][1]).toContain("note_interne.imatch.");
    expect(String(s.ops.find(o => o[0] === "select")![1]).split(",")).not.toContain("allegati");
    expect(result.current.data).toMatchObject({ total: 225, page: 8, documenti: [{ stornato: 100, note_interne: "Riservata" }] });
    expect(s.rpc).not.toHaveBeenCalled();
  });
  it("un errore della ricerca è un errore, non un archivio vuoto", async () => {
    s.errore = true;
    const { result } = renderHook(() => useDocumentiFiscali({ conImportate: true, search: "nota" }), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });
  it("conserva il percorso nativo usato dalle altre pagine", async () => {
    const { result } = renderHook(() => useDocumentiFiscali({ tipo: "ddt", search: "12/11/2026" }), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(s.ops).toContainEqual(["from", "documenti_fiscali_elenco"]);
    expect(s.ops.find(o => o[0] === "or")?.[1]).toContain("data_emissione.eq.2026-11-12");
  });
});
