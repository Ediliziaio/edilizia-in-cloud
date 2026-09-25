import { describe, expect, it, vi, beforeEach } from "vitest";
import { buildRapportinoMaterials, rapportinoArticleKind, rapportinoMaterialUnit, rapportinoUnitOptions } from "@/lib/campo/rapportinoMaterials";
import { loadRapportinoArticles } from "@/lib/campo/loadRapportinoArticles";

const api = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: api.from } }));
beforeEach(() => vi.clearAllMocks());

describe("Scelta materiali: dati espliciti, non deduzioni dal nome", () => {
  it.each(["Manodopera", "servizi", "Prestazioni", "subappalto", "trasporti", "noleggi"])("esclude %s", categoria => {
    expect(rapportinoArticleKind({ id: "x", name: "Piastrelle", categoria })).toBe("service");
  });
  it.each(["Materiali", " consumabili ", "MAGAZZINO", "Attrezzature"])("riconosce %s", categoria => {
    expect(rapportinoArticleKind({ id: "x", name: "Voce", categoria })).toBe("material");
  });
  it("il collegamento a magazzino non prevale su una prestazione esplicita", () => {
    expect(rapportinoArticleKind({ id: "x", name: "Voce", stock_item_id: "stock", categoria: "servizi" })).toBe("service");
  });
  it("non classifica dal nome o da una categoria commerciale sconosciuta", () => {
    expect(rapportinoArticleKind({ id: "x", name: "Manodopera posa e finiture" })).toBe("unknown");
    expect(rapportinoArticleKind({ id: "x", name: "Malta", categoria: "Edilizia" })).toBe("unknown");
  });
  it("usa la categoria del listino solo in assenza di snapshot", () => {
    const item = { id: "x", name: "Voce", template: { category: "servizi", unit_of_measure: "h" } };
    expect(rapportinoArticleKind(item)).toBe("service");
    expect(rapportinoArticleKind({ ...item, categoria: "Materiali" })).toBe("material");
  });
  it("usa un collegamento a magazzino anche senza categoria", () => {
    expect(rapportinoArticleKind({ id: "x", name: "Voce", stock_item_id: "stock" })).toBe("material");
  });
  it.each([["mq", "m²"], ["M2", "m²"], ["mc", "m³"], ["pezzi", "pz"], ["kg", "kg"], ["ml", "ml"], ["rotolo", "rotolo"], [null, ""]])("normalizza %s senza inventare unità", (raw, expected) => {
    expect(rapportinoMaterialUnit(raw)).toBe(expected);
  });
  it("conserva anche le unità di listino non comuni", () => {
    expect(rapportinoUnitOptions("rotolo")).toContain("rotolo");
    expect(rapportinoUnitOptions("pz").filter(unit => unit === "pz")).toHaveLength(1);
  });
  it.each([undefined, "", "   "])("richiede una scelta esplicita per unità assente (%s)", unita => {
    expect(() => buildRapportinoMaterials({ item: { nome: "Piastrelle", quantita: 2, unita } })).toThrow("unità di misura");
  });
});

describe("Query articoli Campo", () => {
  const setup = (pages: Array<{ data: unknown[] | null; error: Error | null }>) => {
    const query = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), range: vi.fn() };
    query.select.mockReturnValue(query); query.eq.mockReturnValue(query); query.order.mockReturnValue(query);
    pages.forEach(result => query.range.mockResolvedValueOnce(result));
    api.from.mockReturnValue(query);
    return query;
  };
  it("legge solo campi necessari, delimita commessa/azienda e non carica prezzi", async () => {
    const q = setup([{ data: [{ id: "x", name: "Malta", template: null }], error: null }]);
    expect(await loadRapportinoArticles("order", "company")).toHaveLength(1);
    expect(q.eq).toHaveBeenCalledWith("order_id", "order");
    expect(q.eq).toHaveBeenCalledWith("order.company_id", "company");
    const select = q.select.mock.calls[0][0];
    expect(select).toContain("unit_of_measure"); expect(select).not.toMatch(/price|cost|\*/);
  });
  it("non perde i materiali oltre le prime 50/500 voci", async () => {
    const firstPage = Array.from({ length: 500 }, (_, i) => ({ id: String(i), name: "Voce" }));
    const q = setup([{ data: firstPage, error: null }, { data: [{ id: "last", name: "Ultimo materiale" }], error: null }]);
    expect(await loadRapportinoArticles("o", "c")).toHaveLength(501);
    expect(q.range.mock.calls).toEqual([[0, 499], [500, 999]]);
    expect(q.order).toHaveBeenCalledWith("id", { ascending: true });
  });
  it("non nasconde gli errori come elenco vuoto o parziale", async () => {
    setup([{ data: null, error: new Error("Accesso/rete") }]);
    await expect(loadRapportinoArticles("o", "c")).rejects.toThrow("Accesso/rete");
  });
});
