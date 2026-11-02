import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { aPlanimetria, daPlanimetria, type Pianta } from "@/components/planimetrie/editor/adattatore";
import { arredaStanza } from "@/components/planimetrie/editor/arreda";
import * as C from "@/components/planimetrie/editor/comandi";
import { validaPlanimetria, type Planimetria } from "../../../shared/planimetrie/modello.ts";

const carica = (nome: string): Planimetria => JSON.parse(readFileSync(join(process.cwd(), "shared/planimetrie/esempi", nome), "utf8"));

function box(e: { centro: { x: number; y: number }; larghezza: number; profondita: number; rotazione: number }) {
  const r = (e.rotazione % 180) === 0;
  const w = r ? e.larghezza : e.profondita, d = r ? e.profondita : e.larghezza;
  return { x0: e.centro.x - w / 2, x1: e.centro.x + w / 2, y0: e.centro.y - d / 2, y1: e.centro.y + d / 2 };
}
const sopra = (a: ReturnType<typeof box>, b: ReturnType<typeof box>) => a.x0 < b.x1 - 0.5 && b.x0 < a.x1 - 0.5 && a.y0 < b.y1 - 0.5 && b.y0 < a.y1 - 0.5;

/** Una stanza rettangolare di prova, con una porta su un lato. */
function stanza(w: number, h: number, destinazione: "bagno" | "camera" | "cucina" | "soggiorno"): { p: Pianta; id: string } {
  const r = C.aggiungiStanza({ versione: 1, unita: "cm", muri: [], aperture: [], locali: [] }, C.rettangolo({ x: 0, y: 0 }, { x: w, y: h }));
  let p = C.modificaLocale(r.pianta, r.id, { destinazione });
  const muroBasso = p.muri.find((m) => Math.abs(m.p1.y - h) < 1 && Math.abs(m.p2.y - h) < 1)!;
  p = C.aggiungiApertura(p, muroBasso.id, "porta", 60).pianta;
  return { p, id: r.id };
}

describe("arreda con un clic", () => {
  it.each([
    ["bagno", 220, 250],
    ["camera", 380, 400],
    ["cucina", 350, 300],
    ["soggiorno", 500, 420],
  ] as const)("%s %i×%i: mobili dentro la stanza, senza sovrapporsi e lontano dalla porta", (dest, w, h) => {
    const { p, id } = stanza(w, h, dest);
    const r = arredaStanza(p, id, "fatto");
    expect(r.aggiunti.length).toBeGreaterThan(0);
    const nuovi = r.pianta.elementi!.filter((e) => r.aggiunti.includes(e.id));
    for (const e of nuovi) {
      const b = box(e);
      expect(b.x0, e.tipo).toBeGreaterThanOrEqual(0);
      expect(b.y0, e.tipo).toBeGreaterThanOrEqual(0);
      expect(b.x1, e.tipo).toBeLessThanOrEqual(w);
      expect(b.y1, e.tipo).toBeLessThanOrEqual(h);
      // la porta è sul lato basso, centrata a 60 cm dall'inizio del muro: davanti resta libero
      const porta = r.pianta.aperture[0];
      const muro = r.pianta.muri.find((m) => m.id === porta.muroId)!;
      const cx = muro.p1.x + Math.sign(muro.p2.x - muro.p1.x) * porta.posizione;
      expect(sopra(b, { x0: cx - porta.larghezza / 2, x1: cx + porta.larghezza / 2, y0: h - 90, y1: h }), `${e.tipo} davanti alla porta`).toBe(false);
    }
    for (const a of nuovi) for (const b of nuovi) if (a !== b) expect(sopra(box(a), box(b)), `${a.tipo} su ${b.tipo}`).toBe(false);
    expect(validaPlanimetria(aPlanimetria(r.pianta)).ok).toBe(true);
  });

  it("la camera ha il letto con lo schienale al muro e almeno un comodino accanto", () => {
    const { p, id } = stanza(380, 400, "camera");
    const r = arredaStanza(p, id, "fatto");
    const tipi = r.pianta.elementi!.map((e) => e.tipo);
    expect(tipi).toContain("letto_matrimoniale");
    // il secondo comodino può cadere davanti alla porta: allora si salta
    expect(tipi.filter((t) => t === "comodino").length).toBeGreaterThanOrEqual(1);
    const letto = r.pianta.elementi!.find((e) => e.tipo === "letto_matrimoniale")!;
    // la testata (lato «in alto» del simbolo ruotato) tocca un muro
    const a = (letto.rotazione * Math.PI) / 180;
    const testata = { x: letto.centro.x + Math.sin(a) * (letto.profondita / 2), y: letto.centro.y - Math.cos(a) * (letto.profondita / 2) };
    const alMuro = Math.min(testata.x, testata.y, 380 - testata.x, 400 - testata.y);
    expect(alMuro).toBeLessThan(15);
  });

  it("nel progetto i mobili sono nuovi; quelli che ci sono già non si duplicano", () => {
    const { p, id } = stanza(220, 250, "bagno");
    const una = arredaStanza(p, id, "progetto");
    expect(una.pianta.elementi!.every((e) => e.stato === "nuovo")).toBe(true);
    const due = arredaStanza(una.pianta, id, "progetto");
    expect(due.aggiunti).toHaveLength(0);
    expect(due.giaPresenti.length).toBeGreaterThan(0);
  });

  it("sul trilocale d'esempio arreda le stanze che sa arredare senza rompere il documento", () => {
    const doc = carica("trilocale.json");
    let p = daPlanimetria(doc);
    let messi = 0;
    for (const l of p.locali) {
      const r = arredaStanza(p, l.id, "fatto");
      p = r.pianta;
      messi += r.aggiunti.length;
    }
    expect(messi).toBeGreaterThan(3);
    expect(validaPlanimetria(aPlanimetria(p, doc)).ok).toBe(true);
  });
});
