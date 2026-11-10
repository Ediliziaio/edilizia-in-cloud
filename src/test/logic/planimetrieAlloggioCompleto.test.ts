import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import trilocale from "../../../shared/planimetrie/esempi/trilocale.json";
import { validaPlanimetria, type Planimetria } from "../../../shared/planimetrie/modello.ts";
import { controlloPrimaDellUso, esigiVerificaDocumento } from "../../../shared/planimetrie/verificaDocumento.ts";
import { applicaMaterialiProgetto, cambiaFormatoPavimento, materialiDelProgetto, pavimentoDaCampione } from "../../../shared/planimetrie/materialiProgetto.ts";
import { vincoliDellaStanza } from "../../../shared/render-planimetria/vincoli.ts";
import { calcolaQuantita } from "../../../shared/planimetrie/quantita.ts";
import { pianteDaPlanimetria } from "@/lib/planimetrie/tred";
import { contenutoFascicolo } from "@/lib/planimetrie/fascicoloModello";
import { configPerStanza } from "@/lib/planimetrie/render/renderInSerie";
import { IDEE_PRONTE } from "@/modules/render-stanza/lib/ideePronte";

// Nel collaudo si rilegge la versione realmente salvata; in CI resta un esempio riproducibile.
function alloggio(): Planimetria {
  const d = process.env.EIC_QA_PLAN_FILE ? JSON.parse(readFileSync(process.env.EIC_QA_PLAN_FILE, "utf8")) as Planimetria : structuredClone(trilocale) as Planimetria;
  d.ambitoDocumento ??= "alloggio";
  d.materialiProgetto ??= { fatto: { pavimento: cambiaFormatoPavimento(pavimentoDaCampione("rovere"), "20x120"), infissi: { profilo: "pvc", colore: "bianco" } } };
  return d;
}

it("l'alloggio completo conserva tutte le aperture tra documento, 3D e vincoli dei render", () => {
  const d = alloggio(), s = d.livelli[0].fatto;
  expect(validaPlanimetria(d).ok).toBe(true);
  expect(d.ambitoDocumento).toBe("alloggio");
  expect(s.locali).toHaveLength(6);
  expect(s.aperture.filter((a) => a.tipo === "porta")).toHaveLength(process.env.EIC_QA_PLAN_FILE ? 7 : 6);
  expect(s.aperture.filter((a) => a.tipo === "finestra")).toHaveLength(4);
  expect(s.aperture.filter((a) => a.tipo === "portafinestra")).toHaveLength(1);
  const senzaMateriali = pianteDaPlanimetria({ ...d, materialiProgetto: undefined }).fatto;
  const conMateriali = pianteDaPlanimetria(d).fatto;
  expect(conMateriali.aperture).toEqual(senzaMateriali.aperture);
  expect(conMateriali.muri).toEqual(senzaMateriali.muri);
  const apertureNeiRender = new Set<string>();
  for (const locale of s.locali) {
    const vincoli = vincoliDellaStanza(d, { livello_id: d.livelli[0].id, locale_id: locale.id, ambito: "fatto" })!;
    for (const a of vincoli.aperture) {
      const originale = s.aperture.find((x) => x.id === a.id)!;
      expect(originale).toBeDefined();
      expect([a.tipo, a.larghezza_cm, a.altezza_cm, a.davanzale_cm]).toEqual([originale.tipo, originale.larghezza, originale.altezza, originale.davanzale]);
      apertureNeiRender.add(a.id);
    }
  }
  expect([...apertureNeiRender].sort()).toEqual(s.aperture.map((a) => a.id).sort());
});

it("ogni stanza e stile mantiene pavimento e infissi comuni, compreso il formato dei listoni", () => {
  const d = alloggio(), m = materialiDelProgetto(d, "fatto");
  expect(m.pavimento?.formato_piastrella).toBe("20x120");
  expect(m.pavimento?.larghezza_listello_mm).toBe(200);
  expect(m.pavimento?.lunghezza_listello_mm).toBe(1200);
  for (const l of d.livelli[0].fatto.locali) for (const idea of IDEE_PRONTE) {
    const cfg = applicaMaterialiProgetto(configPerStanza(l.destinazione, idea), m);
    expect(cfg.pavimento).toEqual(m.pavimento);
    expect(cfg.infissi_progetto).toEqual(m.infissi);
  }
  expect(new Set(pianteDaPlanimetria(d).fatto.locali.map((l) => l.finiture?.pavimento)).size).toBe(1);
  expect(contenutoFascicolo(d, 8, "fatto", []).flatMap((p) => p.stanze)).toHaveLength(6);
  expect(Object.keys(calcolaQuantita(d)).length).toBeGreaterThan(6);
});

it("una quota discordante nell'alloggio blocca tutti gli utilizzi e non viene scelta automaticamente", () => {
  const d = alloggio();
  d.letturaDocumento = { protocolloVerifica: 1, avvisiIniziali: ["Due profondità discordanti"], superficiScritteMq: {}, verifiche: [{ id: "profondita-dubbia", tipo: "quota", descrizione: "Profondità stanza: 421,5 oppure 423 cm", riferimento: { livelloId: d.livelli[0].id, tipo: "locale", oggettoId: d.livelli[0].fatto.locali[0].id, campo: "profondita" }, valoriLettiCm: [421.5, 423] }] };
  const prima = JSON.stringify(d);
  for (const uso of ["3d", "render", "computo", "pdf"] as const) {
    expect(controlloPrimaDellUso(d, uso).ok).toBe(false);
    expect(() => esigiVerificaDocumento(d, uso)).toThrow(/421,5 oppure 423/);
  }
  expect(JSON.stringify(d)).toBe(prima);
});
