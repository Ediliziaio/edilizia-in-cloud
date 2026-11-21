import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  getUser: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: mock.rpc, from: mock.from, auth: { getUser: mock.getUser } },
}));

import { savePortalCourse, type PortalLearningCourse } from "@/lib/portalLearningApi";

const course: PortalLearningCourse = {
  id: "corso-1", title: "Nuovo titolo", description: "", area: "tecnica", audience: "tutti",
  status: "bozza", owner: "Team", updatedAt: "", enrolled: 0, completion: 0,
  modules: [{ id: "mod-1", title: "Nuovo modulo", description: "", duration: "10 min", lessons: 1, completedRate: 0 }],
  assets: [{ id: "mat-1", title: "Nuovo materiale", type: "testo", duration: "", moduleId: "mod-1" }],
};

describe("salvataggio del corso e dei suoi contenuti", () => {
  beforeEach(() => vi.resetAllMocks());

  it("conserva testata, moduli e materiali quando la RPC non è disponibile", async () => {
    const remoto = { titolo: "Titolo precedente", moduli: ["Modulo precedente"], materiali: ["Materiale precedente"] };
    mock.getUser.mockResolvedValue({ data: { user: { id: "autore" } } });
    mock.from.mockImplementation((tabella: string) => {
      const query = {
        upsert: async (row: { title: string }): Promise<{ error: null }> => { remoto.titolo = row.title; return { error: null }; },
        delete: () => {
          if (tabella === "portal_course_modules") remoto.moduli = [];
          if (tabella === "portal_course_assets") remoto.materiali = [];
          return query;
        },
        eq: () => query,
        insert: async () => ({ error: { message: "Inserimento interrotto" } }),
      };
      return query;
    });
    const indisponibile = { code: "PGRST202", message: "upsert_portal_course missing from the schema cache" };
    mock.rpc.mockResolvedValue({ error: indisponibile });
    await expect(savePortalCourse("azienda-1", course)).rejects.toBeDefined();
    expect(remoto).toEqual({ titolo: "Titolo precedente", moduli: ["Modulo precedente"], materiali: ["Materiale precedente"] });
    expect(mock.from).not.toHaveBeenCalled();
  });

  it("invia l’intero corso al database e propaga eventuali errori senza altre scritture", async () => {
    const errore = { code: "23514", message: "Tipo di materiale non valido" };
    mock.rpc.mockResolvedValueOnce({ error: errore }).mockResolvedValueOnce({ error: null });
    await expect(savePortalCourse("azienda-1", course)).rejects.toBe(errore);
    await expect(savePortalCourse("azienda-1", course)).resolves.toBeUndefined();
    expect(mock.from).not.toHaveBeenCalled();
    expect(mock.rpc).toHaveBeenCalledWith("upsert_portal_course", { p_company_id: "azienda-1", p_course: course });
  });
});
