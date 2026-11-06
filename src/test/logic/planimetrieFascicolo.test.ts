import { describe, expect, it, vi } from "vitest";
import bilocale from "../../../shared/planimetrie/esempi/bilocale.json";
import type { Planimetria } from "../../../shared/planimetrie/modello.ts";
import { pavimentoDaCampione } from "../../../shared/planimetrie/materialiProgetto.ts";
import { contenutoFascicolo } from "@/lib/planimetrie/fascicoloModello";
import { pianteDaPlanimetria, pianiDaPlanimetria } from "@/lib/planimetrie/tred";
import type { RenderDellaPianta } from "@/lib/planimetrie/render/renderDallaPianta";

const query = vi.hoisted(() => ({ tabelle: [] as string[], aziende: [] as string[], range: [] as number[], errore: false }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (tabella: string) => {
  query.tabelle.push(tabella);
  const q = { select: () => q, eq: (k: string, v: string) => { if (k === "company_id") query.aziende.push(v); return q; }, order: () => q,
    range: async (da: number) => { query.range.push(da); return { data: Array.from({ length: da ? 25 : 100 }, (_, i) => ({ id: `r${da + i}` })), error: query.errore ? new Error("interrotto") : null }; } };
  return q;
} } }));

describe("fascicolo completo della casa", () => {
  it("mantiene tutte le stanze anche senza render e non mescola versioni o progetti", () => {
    const doc = structuredClone(bilocale) as unknown as Planimetria;
    const l = doc.livelli[0], stanza = l.fatto.locali[0];
    const render = (id: string, extra = {}): RenderDellaPianta => ({ id, status: "completed", created_at: "2026-11-06T00:00:00Z", saved_to_gallery: true, result_urls: ["foto"], planimetria: { planimetria_id: "casa", versione: 3, livello_id: l.id, ambito: "fatto", locale_id: stanza.id, partenza: "vista_3d", ...extra } });
    const contenuto = contenutoFascicolo(doc, 3, "fatto", [render("attuale"), render("vecchio", { versione: 2 }), render("altro-progetto", { materiali_ambito: "progetto:altra" }), { ...render("fallito"), status: "error" }]);
    expect(contenuto.flatMap((p) => p.stanze)).toHaveLength(l.fatto.locali.length);
    expect(contenuto[0].stanze.flatMap((s) => s.renders.map((r) => r.id))).toEqual(["attuale"]);
    expect(contenuto[0].stanze.filter((s) => !s.renders.length).length).toBe(l.fatto.locali.length - 1);
  });
  it("un piano senza la proposta selezionata usa il fatto, senza prendere la geometria di un'altra proposta", () => {
    const doc = structuredClone(bilocale) as unknown as Planimetria;
    const l = doc.livelli[0];
    l.proposte = [{ ...structuredClone(l.fatto), id: "altra", nome: "Altra variante", aperture: [] }];
    doc.materialiProgetto = { "progetto:scelta": { pavimento: pavimentoDaCampione("rovere"), infissi: { profilo: "pvc", colore: "bianco" } } };
    expect(pianteDaPlanimetria(doc, { propostaId: "scelta", materialiAmbito: "progetto:scelta" }).progetto.aperture.length).toBe(l.fatto.aperture.length);
    expect(pianiDaPlanimetria(doc, "scelta")[0].piante.progetto.aperture.length).toBe(l.fatto.aperture.length);
    const contenuto = contenutoFascicolo(doc, 3, "progetto:scelta", []);
    expect(contenuto[0].geometria).toBe("fatto");
    expect(contenuto[0].materiali.infissi?.profilo).toBe("pvc");
  });
  it("legge anche i render oltre il primo centinaio, filtrati per azienda", async () => {
    query.range = []; query.aziende = []; query.errore = false;
    const { renderPerFascicolo } = await import("@/lib/planimetrie/fascicoloDati");
    expect(await renderPerFascicolo("azienda", "casa")).toHaveLength(125);
    expect(query.range).toEqual([0, 100]);
    expect(query.aziende).toEqual(["azienda", "azienda"]);
  });
  it("una lettura interrotta non produce un fascicolo con immagini mancanti in silenzio", async () => {
    query.errore = true;
    const { renderPerFascicolo } = await import("@/lib/planimetrie/fascicoloDati");
    await expect(renderPerFascicolo("azienda", "casa")).rejects.toThrow(/tutti i render/);
    query.errore = false;
  });
});
