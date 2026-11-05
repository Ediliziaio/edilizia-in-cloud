import { beforeEach, describe, expect, it, vi } from "vitest";
import bilocale from "../../../shared/planimetrie/esempi/bilocale.json";
import type { Planimetria } from "../../../shared/planimetrie/modello";
import { ambitoGeometriaDelPiano, pavimentoDaCampione } from "../../../shared/planimetrie/materialiProgetto";
import { percorsiPlanimetrie } from "@/lib/planimetrie/render/percorsi";
const db = vi.hoisted(() => ({ select: vi.fn(), eq: vi.fn(), or: vi.fn(), limit: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => db } }));
import { caricaAnteprimePlanimetrie, creaAnteprimaPianta, filtroVersioniAnteprime, PIANTE_PER_PAGINA } from "@/lib/planimetrie/anteprime";

const id = "11111111-1111-4111-8111-111111111111";
beforeEach(() => { vi.clearAllMocks(); db.select.mockReturnValue(db); db.eq.mockReturnValue(db); db.or.mockReturnValue(db); });
describe("anteprime delle versioni salvate", () => {
  it("usa il materiale comune anche nel disegno 2D senza modificare l'originale", () => {
    const doc = structuredClone(bilocale) as unknown as Planimetria;
    const prima = creaAnteprimaPianta(doc).src;
    const originale = JSON.stringify(doc.livelli);
    doc.materialiProgetto = { fatto: { pavimento: pavimentoDaCampione("rovere") } };
    expect(creaAnteprimaPianta(doc).src).not.toBe(prima);
    expect(JSON.stringify(doc.livelli)).toBe(originale);
  });
  it("un piano senza proposta mantiene il contesto dei materiali nel link al render", () => {
    const doc = structuredClone(bilocale) as unknown as Planimetria;
    doc.livelli[0].proposte = [];
    const geometria = ambitoGeometriaDelPiano(doc, doc.livelli[0].id, "progetto:rinnovo");
    expect(geometria).toBe("fatto");
    const url = new URL(percorsiPlanimetrie.renderStanza(id, "camera", { livelloId: doc.livelli[0].id, ambito: geometria, materialiAmbito: "progetto:rinnovo" }), "https://example.com");
    expect(url.searchParams.get("ambito")).toBe("fatto");
    expect(url.searchParams.get("materiali_ambito")).toBe("progetto:rinnovo");
  });
  it("disegna stanze e aperture del documento reale", () => {
    const a = creaAnteprimaPianta(bilocale as unknown as Planimetria);
    expect(a.stanze).toBe(3);
    expect(a.superficie).toBeGreaterThan(20);
    expect(decodeURIComponent(a.src)).toContain("<svg");
    const cambiata = structuredClone(bilocale) as unknown as Planimetria;
    cambiata.livelli[0].fatto.aperture = [];
    expect(creaAnteprimaPianta(cambiata).src).not.toBe(a.src);
  });
  it("legge in un solo lotto, per azienda e versione esatta, senza mostrare uno storico vecchio", async () => {
    db.limit.mockResolvedValue({ data: [{ planimetria_id: id, numero: 7, documento: bilocale }, { planimetria_id: "altro", numero: 1, documento: bilocale }], error: null as Error | null });
    const result = await caricaAnteprimePlanimetrie("azienda", [{ id, versione_corrente: 7 }]);
    expect(db.eq).toHaveBeenCalledWith("company_id", "azienda");
    expect(db.or).toHaveBeenCalledWith(`and(planimetria_id.eq.${id},numero.eq.7)`);
    expect(db.limit).toHaveBeenCalledWith(PIANTE_PER_PAGINA);
    expect(Object.keys(result)).toEqual([id]);
    expect(db.select).toHaveBeenCalledOnce();
  });
  it("limita i documenti e rifiuta filtri non validi", () => {
    const molte = Array.from({ length: 20 }, (_, i) => ({ id, versione_corrente: i + 1 }));
    expect(filtroVersioniAnteprime(molte).split("and(").length - 1).toBe(12);
    expect(filtroVersioniAnteprime([{ id: "x),company_id.neq.y", versione_corrente: 1 }, { id, versione_corrente: 1.5 }])).toBe("");
  });
});
