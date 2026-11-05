import { describe, expect, it } from "vitest";
import bilocale from "../../../shared/planimetrie/esempi/bilocale.json";
import { validaPlanimetria, type Planimetria } from "../../../shared/planimetrie/modello.ts";
import { applicaMaterialiProgetto, cambiaFormatoPavimento, materialiDelProgetto, pavimentoDaCampione, vincoloInfissiProgetto } from "../../../shared/planimetrie/materialiProgetto.ts";
import { pianteDaPlanimetria, costruisciScena } from "@/lib/planimetrie/tred";
import { pianiDaPlanimetria } from "@/lib/planimetrie/tred/edificio";
import { aPlanimetria, daPlanimetria } from "@/components/planimetrie/editor/adattatore";
import { selectedRoomVisuals, roomVisualSignature } from "../../../shared/render-references/roomVisualCatalog.ts";
import { configPerStanza } from "@/lib/planimetrie/render/renderInSerie";
import { IDEE_PRONTE } from "@/modules/render-stanza/lib/ideePronte";
import { vincoloSostituzionePavimento } from "../../../shared/render-room/roomRenderConfig.ts";
import { caricaPiantaDelRender } from "../../../supabase/functions/generate-room-render/pianta.ts";

const documento = () => structuredClone(bilocale) as unknown as Planimetria;
const comuni = () => ({ pavimento: pavimentoDaCampione("rovere"), infissi: { profilo: "pvc", colore: "bianco" } as const });

describe("materiali comuni a tutto il progetto", () => {
  it("una villa usa gli stessi materiali anche sul piano senza opere della proposta", () => {
    const doc = documento(); const primo = doc.livelli[0];
    primo.proposte = [{ ...structuredClone(primo.fatto), id: "rinnovo", nome: "Rinnovo" }];
    doc.livelli.push({ ...structuredClone(primo), id: "piano-1", nome: "Piano primo", quota: 300, proposte: [] });
    doc.materialiProgetto = { "progetto:rinnovo": comuni() };
    const piani = pianiDaPlanimetria(doc, "rinnovo");
    expect(piani).toHaveLength(2);
    for (const piano of piani) {
      expect(piano.piante.progetto.infissiProgetto).toEqual(comuni().infissi);
      expect(piano.piante.progetto.locali.every((l) => l.finiture?.pavimento?.includes("rovere naturale"))).toBe(true);
    }
  });
  it("il server rilegge la scelta comune anche se la geometria di quel piano resta nello stato di fatto", async () => {
    const doc = documento(); const primo = doc.livelli[0];
    primo.proposte = [{ ...structuredClone(primo.fatto), id: "rinnovo", nome: "Rinnovo" }];
    doc.materialiProgetto = { "progetto:rinnovo": comuni() };
    const company = "22222222-2222-4222-8222-222222222222";
    const db = { from: (table: string) => {
      const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ error: null as null, data: table === "planimetrie" ? { company_id: company, deleted_at: null as string | null } : { documento: doc } }) };
      return q;
    } };
    const ref = { planimetria_id: "11111111-1111-4111-8111-111111111111", versione: 1, livello_id: primo.id, locale_id: primo.fatto.locali[0].id, ambito: "fatto", materiali_ambito: "progetto:rinnovo" };
    const result = await caricaPiantaDelRender(db as never, company, ref, () => undefined);
    expect(result?.materiali).toEqual(comuni());
    await expect(caricaPiantaDelRender(db as never, company, { ...ref, materiali_ambito: "progetto:inesistente" }, () => undefined)).rejects.toThrow(/Materiali del progetto non trovati/);
  });
  it("tutte le stanze e tutti gli stili ereditano lo stesso pavimento completo", () => {
    const m = comuni();
    m.pavimento.pattern = "spina_pesce";
    for (const destinazione of ["bagno", "cucina", "camera", "soggiorno"]) for (const idea of IDEE_PRONTE) {
      const cfg = applicaMaterialiProgetto(configPerStanza(destinazione, idea), m);
      expect(cfg.pavimento).toEqual(m.pavimento);
      expect(cfg.infissi_progetto).toEqual(m.infissi);
    }
  });
  it("cambiare il formato comune aggiorna davvero larghezza e lunghezza dei listoni", () => {
    const p = cambiaFormatoPavimento(pavimentoDaCampione("rovere"), "15×90");
    expect(p.larghezza_listello_mm).toBe(150); expect(p.lunghezza_listello_mm).toBe(900);
    expect(applicaMaterialiProgetto({ pavimento: pavimentoDaCampione("marmo") }, { pavimento: p }).pavimento).toEqual(p);
  });
  it("solo una scelta esplicita permette un pavimento diverso per un render", () => {
    const cfg = { pavimento: pavimentoDaCampione("marmo"), eccezioni_materiali_progetto: { pavimento: true } };
    expect(applicaMaterialiProgetto(cfg, comuni()).pavimento).toEqual(cfg.pavimento);
    expect(applicaMaterialiProgetto({ ...cfg, eccezioni_materiali_progetto: {} }, comuni()).pavimento).toEqual(comuni().pavimento);
  });
  it("un progetto non eredita i materiali di un altro e le proposte restano distinte", () => {
    const a = documento(), b = documento();
    a.materialiProgetto = { fatto: comuni(), "progetto:nuovo": { pavimento: pavimentoDaCampione("marmo") } };
    expect(materialiDelProgetto(b, "fatto")).toEqual({});
    expect(materialiDelProgetto(a, "progetto:nuovo").pavimento?.tipo).toBe("marmo");
    expect(materialiDelProgetto(a, "progetto:assente")).toEqual({});
  });
  it("salvataggio, serializzazione e riapertura dell'editor conservano le scelte", () => {
    const doc = documento(); doc.materialiProgetto = { fatto: comuni() };
    const reopened = JSON.parse(JSON.stringify(aPlanimetria(daPlanimetria(doc), doc)));
    expect(validaPlanimetria(reopened).ok).toBe(true);
    expect(reopened.materialiProgetto).toEqual(doc.materialiProgetto);
    expect(validaPlanimetria({ ...doc, materialiProgetto: { fatto: { infissi: { profilo: "inventato", colore: "bianco" } } } }).ok).toBe(false);
  });
  it("il 3D applica il pavimento comune a ogni stanza senza cambiare aperture o geometria", () => {
    const doc = documento();
    doc.livelli[0].fatto.aperture.forEach((a) => { if (a.tipo === "finestra") a.ante = 2; });
    const original = pianteDaPlanimetria(doc).fatto;
    doc.materialiProgetto = { fatto: comuni() };
    const p = pianteDaPlanimetria(doc).fatto;
    expect(p.aperture).toEqual(original.aperture);
    expect(p.muri).toEqual(original.muri);
    expect(new Set(p.locali.map((l) => l.finiture?.pavimento)).size).toBe(1);
    const scena = costruisciScena(p, { vista: "fatto" });
    expect(scena.materiali.telaio.colore).toBe("#F1F1EE");
    expect(scena.materiali.telaio.finituraProgetto).toBe(true);
  });
  it("le tavole portano lo stesso profilo e cambiano firma quando cambia la finitura", () => {
    const cfg = applicaMaterialiProgetto({ pavimento: pavimentoDaCampione("marmo") }, comuni());
    expect(selectedRoomVisuals(cfg).find((s) => s.group === "window_profile")?.photo?.filename).toContain("Profilo-PVC");
    expect(roomVisualSignature({ ...cfg, infissi_progetto: { profilo: "pvc", colore: "antracite" } })).not.toBe(roomVisualSignature(cfg));
    expect(vincoloInfissiProgetto(cfg.infissi_progetto)).toContain("Preserve EACH opening");
  });
  it("il vincolo sostituisce davvero il pavimento, senza estendersi alle pareti del bagno", () => {
    const text = vincoloSostituzionePavimento({ pavimento: pavimentoDaCampione("marmo") });
    expect(text).toContain("ENTIRE visible"); expect(text).toContain("Existing wall tiles");
    expect(vincoloSostituzionePavimento({ pavimento: { attivo: false } })).toBe("");
  });
});
