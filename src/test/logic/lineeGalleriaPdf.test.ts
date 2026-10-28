import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SrProgettoDetail } from "@/types/serramenti";
import { caricaLineeDedicate } from "@/hooks/useSerramentoPDF";

const state = vi.hoisted(() => ({ tables: {} as Record<string, Record<string, unknown>[]>, reads: [] as string[], image: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (table: string) => {
  state.reads.push(table);
  const filters: Array<(row: Record<string, unknown>) => boolean> = [];
  const q = {
    select: () => q,
    eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return q; },
    in: (key: string, values: unknown[]) => { filters.push(row => values.includes(row[key])); return q; },
    then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: (state.tables[table] ?? []).filter(row => filters.every(f => f(row))), error: null }).then(resolve),
  };
  return q;
} } }));
vi.mock("@/lib/serramenti/pdfImageUtils", () => ({ toDataUrl: (url: string) => state.image(url) }));
const img = (id: string, ruolo = "principale") => ({ id, ruolo, url: `https://example.test/${id}.jpg`, didascalia: id });
const detail = (supplier: string | null, count = 1) => ({ serramenti: Array.from({ length: count }, (_, i) => ({
  id: `s${i}`, family_id: "f", valori_assi: { linea: "v" }, supplier_product_line_id: supplier, tipologia: "Finestra", 
})), accessori: [] }) as unknown as SrProgettoDetail;

beforeEach(() => {
  vi.clearAllMocks(); state.reads = [];
  state.image.mockImplementation(async (url: string) => `embedded:${url}`);
  state.tables = {
    article_families: [{ id: "f", nome: "Finestra", categoria_id: "c", macrocategoria_id: "m" }],
    article_family_axes: [{ family_id: "f", codice: "linea", nome: "Linea", values: [{ id: "v", valore: "Serie generica", label: "Serie generica" }] }],
    listino_categorie: [{ id: "c", nome: "Categoria da non usare", macrocategoria_id: "m" }],
    listino_macrocategorie: [{ id: "m", nome: "Finestre" }],
    listino_schede_linea: [{ id: "l", company_id: "azienda", macrocategoria_id: "m", chiave: "serie_generica", nome: "Serie generica",
      immagine_url: "https://example.test/legacy.jpg", immagini: [img("principale"), img("sezione", "sezione"), img("interna", "esclusa")] }],
    supplier_product_lines: [{ id: "p", company_id: "azienda", nome: "Serie fornitore", materiale: "pvc", immagini: [img("fornitore")], note: "NOTA INTERNA NON PUBBLICARE" }],
  };
});

describe("Immagini della linea realmente scelta nel PDF", () => {
  it("recupera la galleria una volta sola per piu prodotti della stessa linea", async () => {
    const result = await caricaLineeDedicate("azienda", detail(null, 3));
    expect(result).toHaveLength(1);
    expect(result[0].immagini?.map(i => i.didascalia)).toEqual(["principale", "sezione"]);
    expect(result[0].immagine_url).toContain("principale.jpg");
    expect(state.image).not.toHaveBeenCalledWith("https://example.test/interna.jpg");
  });
  it("la linea fornitore selezionata ha la precedenza sulla categoria o sull'asse", async () => {
    const result = await caricaLineeDedicate("azienda", detail("p", 2));
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("fornitore:p");
    expect(result[0].immagine_url).toContain("fornitore.jpg");
    expect(JSON.stringify(result)).not.toContain("NOTA INTERNA");
    expect(state.reads).not.toContain("listino_schede_linea");
  });
  it("per le vecchie linee usa soltanto la scheda che corrisponde al nome del fornitore", async () => {
    state.tables.supplier_product_lines[0].immagini = [];
    state.tables.listino_schede_linea.push({ ...state.tables.listino_schede_linea[0], id: "giusta", chiave: "serie_fornitore", nome: "Serie fornitore", immagini: [img("vecchia-linea-corretta")] });
    const result = await caricaLineeDedicate("azienda", detail("p"));
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("giusta");
    expect(result[0].immagine_url).toContain("vecchia-linea-corretta");
  });
  it("l'esclusione di tutte le foto non fa riapparire fotografie generiche", async () => {
    state.tables.supplier_product_lines[0].immagini = [img("riservata", "esclusa")];
    expect(await caricaLineeDedicate("azienda", detail("p"))).toEqual([]);
    expect(state.image).not.toHaveBeenCalled();
  });
  it("non prende immagini appartenenti a un'altra azienda", async () => {
    state.tables.supplier_product_lines[0].company_id = "altra";
    expect(await caricaLineeDedicate("azienda", detail("p"))).toEqual([]);
    expect(state.image).not.toHaveBeenCalled();
  });
});
