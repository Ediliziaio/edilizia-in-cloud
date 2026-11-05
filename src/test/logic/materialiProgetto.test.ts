import { describe, expect, it } from "vitest";
import bilocale from "../../../shared/planimetrie/esempi/bilocale.json";
import { validaPlanimetria, type Planimetria } from "../../../shared/planimetrie/modello.ts";
import { applicaMaterialiProgetto, materialiDelProgetto, pavimentoDaCampione, vincoloInfissiProgetto } from "../../../shared/planimetrie/materialiProgetto.ts";
import { pianteDaPlanimetria, costruisciScena } from "@/lib/planimetrie/tred";
import { aPlanimetria, daPlanimetria } from "@/components/planimetrie/editor/adattatore";
import { selectedRoomVisuals, roomVisualSignature } from "../../../shared/render-references/roomVisualCatalog.ts";
import { configPerStanza } from "@/lib/planimetrie/render/renderInSerie";
import { IDEE_PRONTE } from "@/modules/render-stanza/lib/ideePronte";
import { vincoloSostituzionePavimento } from "../../../shared/render-room/roomRenderConfig.ts";

const documento = () => structuredClone(bilocale) as unknown as Planimetria;
const comuni = () => ({ pavimento: pavimentoDaCampione("rovere"), infissi: { profilo: "pvc", colore: "bianco" } as const });

describe("materiali comuni a tutto il progetto", () => {
  it("tutte le stanze e tutti gli stili ereditano lo stesso pavimento completo", () => {
    const m = comuni();
    m.pavimento.pattern = "spina_pesce";
    for (const destinazione of ["bagno", "cucina", "camera", "soggiorno"]) for (const idea of IDEE_PRONTE) {
      const cfg = applicaMaterialiProgetto(configPerStanza(destinazione, idea), m);
      expect(cfg.pavimento).toEqual(m.pavimento);
      expect(cfg.infissi_progetto).toEqual(m.infissi);
    }
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
