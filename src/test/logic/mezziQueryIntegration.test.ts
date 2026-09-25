import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  companyId: "company-a" as string | null,
  calls: [] as Array<{ table: string; select: string; filters: Array<[string, unknown]> }>,
  row: { id: "tool", nome: "Demolitore", persona: null, commessa: null, sopra: { nome: "Furgone" } } as Record<string, unknown>,
  error: null as Error | null,
}));
vi.mock("@tanstack/react-query", () => ({ useQuery: (options: unknown) => options, useMutation: vi.fn(), useQueryClient: vi.fn() }));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => state.companyId }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "worker" } }) }));
vi.mock("@/lib/campo/foto-compressor", () => ({ compressImage: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (table: string) => {
  const call = { table, select: "", filters: [] as Array<[string, unknown]> };
  state.calls.push(call);
  const result = () => ({ data: [state.row], error: state.error });
  const q = {
    select: (value: string) => { call.select = value; return q; },
    eq: (key: string, value: unknown) => { call.filters.push([key, value]); return q; },
    is: (key: string, value: unknown) => { call.filters.push([key, value]); return q; },
    order: () => q,
    maybeSingle: async () => ({ data: state.row, error: state.error }),
    then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(result()).then(resolve, reject),
  };
  return q;
} } }));

import { useMezzi, useMezzo } from "@/hooks/useMezzi";

type Query = { enabled: boolean; queryFn: () => Promise<unknown> };
const options = (query: unknown) => query as Query;
beforeEach(() => { state.companyId = "company-a"; state.calls = []; state.error = null; state.row = { id: "tool", nome: "Demolitore", persona: null, commessa: null, sopra: { nome: "Furgone" } }; });

describe("Query mezzi: relazione ricorsiva osservata tramite API", () => {
  it.each(["elenco", "scheda"])("%s usa la colonna della relazione ricorsiva e mantiene il filtro azienda", async kind => {
    const query = kind === "elenco" ? useMezzi() : useMezzo("tool");
    await options(query).queryFn();
    expect(state.calls[0].select).toContain("sopra:su_mezzo_id(nome)");
    expect(state.calls[0].select).not.toContain("sopra:mezzi!mezzi_su_mezzo_id_fkey");
    expect(state.calls[0].filters).toContainEqual(["company_id", "company-a"]);
    expect(state.calls[0].filters).toContainEqual(["deleted_at", null]);
    if (kind === "scheda") expect(state.calls[0].filters).toContainEqual(["id", "tool"]);
  });

  it("conserva il nome del mezzo portante senza inventare assegnazioni", async () => {
    await expect(options(useMezzo("tool")).queryFn()).resolves.toMatchObject({ su_mezzo_nome: "Furgone", assegnato_persona: null, assegnato_commessa: null });
    state.row.sopra = null;
    await expect(options(useMezzo("tool")).queryFn()).resolves.toMatchObject({ su_mezzo_nome: null });
  });

  it("non trasforma un errore di lettura in elenco vuoto", async () => {
    state.error = new Error("PGRST200");
    await expect(options(useMezzi()).queryFn()).rejects.toThrow("PGRST200");
  });

  it("senza azienda non avvia le letture", () => {
    state.companyId = null;
    expect(options(useMezzi()).enabled).toBe(false);
    expect(options(useMezzo("tool")).enabled).toBe(false);
  });
});
