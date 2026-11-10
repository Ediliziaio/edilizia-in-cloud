import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadRenderPlanOrigins, renderPlanOrigin } from "@/lib/render/renderPlanOrigin";

const db = vi.hoisted(() => ({ from: vi.fn(), select: vi.fn(), eq: vi.fn(), is: vi.fn(), in: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: db.from } }));
const config = {
  tipo_stanza: "bagno",
  planimetria: { planimetria_id: "p1", locale_id: "bagno-1", locale_nome: "Bagno ospiti", versione: 3, livello_id: "pt", ambito: "progetto:A" },
};

beforeEach(() => {
  vi.clearAllMocks();
  const query = { select: db.select, eq: db.eq, is: db.is, in: db.in };
  db.from.mockReturnValue(query); db.select.mockReturnValue(query); db.eq.mockReturnValue(query); db.is.mockReturnValue(query);
});

describe("Origine dei render, senza confondere foto e pianta", () => {
  it("mantiene il nome salvato, piano, proposta e versione di quel render", () => {
    expect(renderPlanOrigin(config)).toEqual({ planId: "p1", roomName: "Bagno ospiti", roomId: "bagno-1", level: "pt", scope: "progetto:A", version: 3, projectPath: "/azienda/planimetrie/p1?livello=pt&ambito=progetto%3AA" });
    expect(renderPlanOrigin({ ...config, planimetria: { ...config.planimetria, locale_nome: "" } })?.roomName).toBe("bagno");
    // Il piano può mantenere la geometria attuale e usare i materiali di una proposta.
    expect(renderPlanOrigin({ ...config, planimetria: { ...config.planimetria, ambito: "fatto", materiali_ambito: "progetto:B" } })?.projectPath)
      .toBe("/azienda/planimetrie/p1?livello=pt&ambito=progetto%3AB");
  });

  it("non inventa l'origine quando il riferimento manca o è danneggiato", () => {
    const invalid: unknown[] = [null, [], { tipo_stanza: "bagno" }, { planimetria: {} }, { planimetria: { ...config.planimetria, versione: 0 } }, { planimetria: { ...config.planimetria, planimetria_id: "../altro" } }];
    for (const value of invalid) {
      expect(renderPlanOrigin(value)).toBeNull();
    }
  });

  it("legge le sessioni visibili e i progetti dell'azienda corrente, associandoli per id", async () => {
    db.in.mockResolvedValueOnce({ data: [{ id: "r2", config }, { id: "foto", config: { tipo_stanza: "bagno" } }], error: null })
      .mockResolvedValueOnce({ data: [{ id: "p1", titolo: "Villa Rossi" }], error: null });
    const origins = await loadRenderPlanOrigins([{ id: "r2", render_type: "stanza" }, { id: "foto", render_type: "stanza" }], "azienda-A");
    expect(origins.r2).toMatchObject({ roomName: "Bagno ospiti", projectTitle: "Villa Rossi" });
    expect(origins.foto).toBeUndefined();
    expect(db.in.mock.calls).toEqual([["id", ["r2", "foto"]], ["id", ["p1"]]]);
    expect(db.eq.mock.calls).toEqual([["company_id", "azienda-A"], ["company_id", "azienda-A"]]);
    expect(db.is).toHaveBeenCalledWith("deleted_at", null);
  });

  it("non legge nulla per moduli sconosciuti o senza azienda", async () => {
    expect(await loadRenderPlanOrigins([{ id: "f1", render_type: "sconosciuto" }], "azienda-A")).toEqual({});
    expect(await loadRenderPlanOrigins([{ id: "r1", render_type: "stanza" }], "")).toEqual({});
    expect(db.from).not.toHaveBeenCalled();
  });

  it("conserva il riferimento anche se la pianta è stata archiviata", async () => {
    db.in.mockResolvedValueOnce({ data: [{ id: "r1", config }], error: null }).mockResolvedValueOnce({ data: [], error: null });
    expect((await loadRenderPlanOrigins([{ id: "r1", render_type: "stanza" }], "azienda-A")).r1).toMatchObject({ roomName: "Bagno ospiti", version: 3, projectAvailable: false });
  });
  it.each(["infissi", "bagno", "stanza", "facciata", "pavimento", "persiane", "tetto", "pergole", "piscine", "ristrutturazioni", "pavimenti-esterni", "giardini", "porte-blindate", "porte-interne"])("risolve il progetto anche per il modulo %s", async (module) => {
    db.in.mockResolvedValueOnce({ data: [{ id: "r1", [module === "bagno" ? "configurazione" : "config"]: config }], error: null }).mockResolvedValueOnce({ data: [{ id: "p1", titolo: "Villa" }], error: null });
    expect((await loadRenderPlanOrigins([{ id: "r1", render_type: module }], "azienda-A")).r1).toMatchObject({ projectAvailable: true, projectTitle: "Villa" });
    expect(db.eq).toHaveBeenCalledWith("company_id", "azienda-A");
  });

});
