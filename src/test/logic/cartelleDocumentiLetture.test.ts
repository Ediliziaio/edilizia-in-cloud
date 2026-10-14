import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CartellaDocumenti } from "@/lib/commesse/documentiCommessa";

type Query = { queryKey: unknown[]; queryFn: () => Promise<unknown> };
type Mutation = { mutationFn: (payload: unknown) => Promise<unknown>; onSettled?: () => Promise<unknown> };
const state = vi.hoisted(() => ({
  queries: [] as Query[], mutations: [] as Mutation[], folders: [] as CartellaDocumenti[],
  cached: [] as CartellaDocumenti[], data: [] as CartellaDocumenti[],
  requests: [] as { table: string; filters: [string, unknown][]; from?: number; order: string[]; select: string; patch?: unknown }[],
  errorePagina: false, conteggioNullo: false, updateNegato: false,
  invalidate: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => "azienda-1" }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: Query) => { state.queries.push(options); return { data: state.data, isLoading: false, isError: false }; },
  useMutation: (options: Mutation) => { state.mutations.push(options); return {}; },
  useQueryClient: () => ({ getQueryData: () => state.cached, invalidateQueries: state.invalidate }),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (table: string) => {
  const filters: [string, unknown][] = [];
  const order: string[] = [];
  let select = "";
  let patch: unknown;
  const log = (from?: number) => state.requests.push({ table, filters: [...filters], order: [...order], select, patch, from });
  const b = {
    select: (columns: string) => { select = columns; return b; },
    eq: (name: string, value: unknown) => { filters.push([name, value]); return b; },
    order: (name: string) => { order.push(name); return b; },
    update: (value: unknown) => { patch = value; return b; },
    insert: (value: unknown) => { patch = value; return b; },
    single: async () => { log(); return { data: state.updateNegato ? null : { id: "salvata" }, error: state.updateNegato ? { code: "PGRST116", message: "No rows" } : null }; },
    range: async (from: number, to: number) => {
      log(from);
      if (state.errorePagina && from >= 250) return { data: null as null, error: { message: "Pagina non disponibile" } };
      return { data: state.folders.filter(c => filters.every(([key, value]) => c[key as keyof CartellaDocumenti] === value)).slice(from, to + 1), error: null as null };
    },
    then: (resolve: (result: unknown) => unknown) => {
      log();
      return Promise.resolve({ count: state.conteggioNullo ? null : 3, error: null as null }).then(resolve);
    },
  };
  return b;
} } }));
import { useCartelleDocumenti, useDocumentiPerCartella, useRiordinaCartelle, useSalvaCartella } from "@/hooks/useCartelleDocumenti";
const folder = (id: string, extra: Partial<CartellaDocumenti> = {}): CartellaDocumenti => ({
  id, company_id: "azienda-1", nome: `Cartella ${id}`, posizione: 1, visibile_cliente: false, obbligatoria: false, archiviata_at: null, ...extra,
});
beforeEach(() => {
  state.queries = []; state.mutations = []; state.folders = []; state.cached = []; state.data = []; state.requests = [];
  state.errorePagina = false; state.conteggioNullo = false; state.updateNegato = false; state.invalidate.mockClear();
});

describe("Un solo elenco completo per impostazioni e commesse", () => {
  it("legge anche oltre 1000 cartelle senza ometterne e separa le aziende", async () => {
    state.folders = Array.from({ length: 1101 }, (_, i) => folder(String(i), { posizione: i }));
    state.folders.push(folder("altra", { company_id: "azienda-2" }));
    useCartelleDocumenti({ tutte: true });
    expect(await state.queries[0].queryFn()).toHaveLength(1101);
    expect(state.requests.map(r => r.from)).toEqual([0, 250, 500, 750, 1000]);
    for (const request of state.requests) {
      expect(request.filters).toEqual([["company_id", "azienda-1"]]);
      expect(request.order).toEqual(["posizione", "nome", "id"]);
    }
  });
  it("non restituisce un elenco parziale quando una pagina fallisce", async () => {
    state.folders = Array.from({ length: 300 }, (_, i) => folder(String(i)));
    state.errorePagina = true; useCartelleDocumenti();
    await expect(state.queries[0].queryFn()).rejects.toThrow("Pagina non disponibile");
  });
  it("l’upload e la consultazione usano la stessa cache; l’upload esclude solo le archiviate", () => {
    state.data = [folder("a"), folder("archivio", { archiviata_at: "2026-10-13" }), folder("b")];
    expect(useCartelleDocumenti().cartelle.map(c => c.id)).toEqual(["a", "b"]);
    expect(useCartelleDocumenti({ tutte: true }).cartelle.map(c => c.id)).toEqual(["a", "archivio", "b"]);
    expect(state.queries[0].queryKey).toEqual(state.queries[1].queryKey);
  });
  it("i conteggi sono esatti e filtrati sia per azienda della commessa sia per cartella", async () => {
    useDocumentiPerCartella(["b", "a"]);
    expect(await state.queries[0].queryFn()).toEqual({ a: 3, b: 3 });
    for (const request of state.requests) {
      expect(request.select).toContain("orders!inner(company_id)");
      expect(request.filters).toContainEqual(["orders.company_id", "azienda-1"]);
      expect(request.filters.some(([key]) => key === "folder_id")).toBe(true);
    }
  });
  it("un conteggio non ricevuto resta sconosciuto e non diventa zero", async () => {
    state.conteggioNullo = true; useDocumentiPerCartella(["a"]);
    await expect(state.queries[0].queryFn()).rejects.toThrow("Conteggio non disponibile");
  });
});
describe("Modifiche alla cartella condivisa", () => {
  it("un aggiornamento che non trova la riga non viene trattato come salvato", async () => {
    state.updateNegato = true; useSalvaCartella();
    await expect(state.mutations[0].mutationFn({ id: "a", nome: "Nuovo nome" })).rejects.toThrow();
    expect(state.requests[0].filters).toEqual([["id", "a"], ["company_id", "azienda-1"]]);
  });
  it("normalizza il nome e usa solo i campi richiesti, senza cambiare l’identità della cartella", async () => {
    useSalvaCartella();
    await state.mutations[0].mutationFn({ id: "a", nome: "  Progetti   esecutivi  " });
    expect(state.requests[0].patch).toEqual({ nome: "Progetti esecutivi" });
    await state.mutations[0].onSettled?.();
    expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ["cartelle-documenti", "azienda-1"] });
    expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ["cartelle-documenti-uso", "azienda-1"] });
  });
  it("rifiuta un nome troppo lungo prima di scrivere", async () => {
    useSalvaCartella();
    await expect(state.mutations[0].mutationFn({ nome: "x".repeat(81) })).rejects.toThrow("80 caratteri");
    expect(state.requests).toHaveLength(0);
  });
  it("crea la cartella in coda all’elenco aziendale e non crea un secondo elenco", async () => {
    state.cached = [folder("a", { posizione: 4 }), folder("old", { posizione: 9, archiviata_at: "2026-10-13" })];
    useSalvaCartella(); await state.mutations[0].mutationFn({ nome: "Documentazione impianto" });
    expect(state.requests[0].patch).toEqual({ company_id: "azienda-1", nome: "Documentazione impianto", posizione: 10, visibile_cliente: false, obbligatoria: false });
  });
  it("non salva un riordino che duplica la stessa cartella", async () => {
    useRiordinaCartelle();
    await expect(state.mutations[0].mutationFn(["a", "a"])).rejects.toThrow("una sola volta");
    expect(state.requests).toHaveLength(0);
  });
});
