import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCatalogItems } from "@/hooks/useCatalogItems";
import { useCatalogCategories } from "@/hooks/useCatalogCategories";
import { useCatalogAree } from "@/hooks/useCatalogAree";
type Query = {
  queryKey: unknown[];
  queryFn: (ctx: { signal: AbortSignal }) => Promise<unknown>;
};
const stato = vi.hoisted(() => ({
  queries: [] as Query[],
  righe: {} as Record<string, Record<string, unknown>[]>,
  errori: {} as Record<string, { message: string }>,
  filtri: [] as Array<[string, string, unknown]>,
  pagine: [] as Array<[string, number, number]>,
}));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({
  useEffectiveCompanyId: () => "company-demo",
}));
vi.mock("@/hooks/useFamilies", () => ({
  useFamilies: () => ({
    families: (stato.righe.article_families ?? []) as Array<{ id: string }>,
    isLoading: false,
    error: null as null,
    refetch: vi.fn(),
  }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: Query) => {
    stato.queries.push(opts);
    return {
      data: opts.queryKey.includes("article-templates") ? stato.righe.article_templates : undefined,
      isLoading: false,
      error: null as null,
      refetch: vi.fn(),
    };
  },
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (tabella: string) => {
      let da = 0,
        a = 999;
      const q = {
        select: () => q,
        order: () => q,
        abortSignal: () => q,
        eq: (col: string, value: unknown) => {
          stato.filtri.push([tabella, col, value]);
          return q;
        },
        is: (col: string, value: unknown) => {
          stato.filtri.push([tabella, col, value]);
          return q;
        },
        range: (from: number, to: number) => {
          da = from;
          a = to;
          stato.pagine.push([tabella, da, a]);
          return q;
        },
        then: (ok: (r: unknown) => unknown) =>
          Promise.resolve({
            data: (stato.righe[tabella] ?? []).slice(da, a + 1),
            error: stato.errori[tabella] ?? null,
          }).then(ok),
      };
      return q;
    },
  },
}));
beforeEach(() => {
  stato.queries = [];
  stato.righe = {};
  stato.errori = {};
  stato.filtri = [];
  stato.pagine = [];
});
afterEach(cleanup);
const ctx = () => ({ signal: new AbortController().signal });
describe("Letture del catalogo del preventivo", () => {
  it("usa la famiglia come voce unica e non riattiva le famiglie escluse tramite il template", () => {
    stato.righe.article_families = [{ id: "attiva", nome: "Collante", attivo: true }];
    stato.righe.article_templates = [
      { id: "duplicato", family_id: "attiva", name: "Collante" },
      { id: "non-pubblicabile", family_id: "inattiva", name: "Monoblocco" },
      { id: "legacy", family_id: null, name: "Articolo senza famiglia" },
    ];
    const { result } = renderHook(() => useCatalogItems());
    expect(result.current.items.map(item => item.id).sort()).toEqual(["attiva", "legacy"]);
  });
  it("legge tutte le etichette di area con isolamento aziendale", async () => {
    stato.righe.listino_macrocategorie = Array.from(
      { length: 1050 },
      (_, i) => ({
        id: `m${i}`,
        nome: `Macro ${i}`,
        verticali_abilitati: ["bagno"],
      }),
    );
    renderHook(() => useCatalogAree());
    const result = await stato.queries[0].queryFn(ctx());
    expect(result).toHaveLength(1050);
    expect(stato.filtri).toContainEqual([
      "listino_macrocategorie",
      "company_id",
      "company-demo",
    ]);
    expect(stato.pagine).toContainEqual(["listino_macrocategorie", 1000, 1249]);
  });
  it("non perde gli articoli oltre il limite REST", async () => {
    stato.righe.article_templates = Array.from({ length: 1050 }, (_, i) => ({
      id: `a${i}`,
      name: `Prodotto ${i}`,
      attivo: true,
    }));
    renderHook(() => useCatalogItems());
    const q = stato.queries.find((q) =>
      q.queryKey.includes("article-templates"),
    )!;
    const righe = (await q.queryFn(ctx())) as Array<{ id: string }>;
    expect(righe).toHaveLength(1050);
    expect(righe[1049].id).toBe("a1049");
    expect(stato.pagine).toContainEqual(["article_templates", 1000, 1249]);
    expect(stato.filtri).toContainEqual([
      "article_templates",
      "company_id",
      "company-demo",
    ]);
    expect(stato.filtri).toContainEqual(["article_templates", "attivo", true]);
  });
  it("trova le categorie popolate solo da prodotti dopo la millesima riga", async () => {
    stato.righe.listino_categorie = [
      { id: "base", nome: "Base" },
      { id: "ultima", nome: "Ultima linea" },
    ];
    stato.righe.article_families = Array.from({ length: 1050 }, (_, i) => ({
      id: `f${i}`,
      categoria_id: i < 1000 ? "base" : "ultima",
    }));
    renderHook(() => useCatalogCategories({ macrocategoriaId: "macro" }));
    const result = (await stato.queries[0].queryFn(ctx())) as Array<{
      id: string;
      total: number;
    }>;
    expect(result.find((c) => c.id === "ultima")?.total).toBe(50);
    expect(stato.filtri).toContainEqual([
      "article_families",
      "deleted_at",
      null,
    ]);
    expect(stato.filtri).toContainEqual([
      "listino_categorie",
      "macrocategoria_id",
      "macro",
    ]);
  });
  it("un errore di rete non restituisce un catalogo vuoto come risultato valido", async () => {
    stato.errori.article_templates = { message: "Connessione interrotta" };
    renderHook(() => useCatalogItems());
    await expect(stato.queries[0].queryFn(ctx())).rejects.toThrow(
      "Connessione interrotta",
    );
  });
});
