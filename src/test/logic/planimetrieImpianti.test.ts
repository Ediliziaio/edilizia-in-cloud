import { describe, expect, it } from "vitest";
import { aPlanimetria, type Pianta } from "@/components/planimetrie/editor/adattatore";
import { climaStanza, dotazioneCei, impiantoElettrico } from "@/components/planimetrie/editor/arreda";
import * as C from "@/components/planimetrie/editor/comandi";
import { CATALOGO } from "@/components/planimetrie/editor/catalogo";
import { btuConsigliati, metriConSfrido, percorsiDaElementi } from "../../../shared/planimetrie/impianti.ts";
import { calcolaQuantita } from "../../../shared/planimetrie/quantita.ts";
import { validaPlanimetria } from "../../../shared/planimetrie/modello.ts";

const voce = (t: string) => CATALOGO.find((v) => v.tipo === t)!;
const el = (id: string, tipo: string, x: number, y: number) => ({ id, tipo, posizione: { x, y } });

function stanza(w: number, h: number, destinazione: "camera" | "bagno" | "soggiorno"): { p: Pianta; id: string } {
  const r = C.aggiungiStanza({ versione: 1, unita: "cm", muri: [], aperture: [], locali: [] }, C.rettangolo({ x: 0, y: 0 }, { x: w, y: h }));
  let p = C.modificaLocale(r.pianta, r.id, { destinazione });
  const muro = p.muri.find((m) => Math.abs(m.p1.y - h) < 1 && Math.abs(m.p2.y - h) < 1)!;
  p = C.aggiungiApertura(p, muro.id, "porta", 60).pianta;
  return { p, id: r.id };
}

describe("linee stimate degli impianti", () => {
  it("dal quadro alla presa: a squadra più le calate", () => {
    const r = percorsiDaElementi([el("q", "quadro_elettrico", 0, 0), el("p", "presa", 300, 400)]);
    expect(r.mancano).toEqual([]);
    // 300 + 400 orizzontali, 160 giù dal quadro, 30 su alla presa
    expect(r.percorsi).toEqual([expect.objectContaining({ linea: "elettrica", lunghezzaCm: 890 })]);
    expect(metriConSfrido(890)).toBe(9.8);
  });
  it("ogni utenza va alla partenza più vicina; senza partenza la linea non si stima e si dice", () => {
    const r = percorsiDaElementi([el("q1", "quadro_elettrico", 0, 0), el("q2", "quadro_elettrico", 1000, 0), el("p", "presa", 900, 0), el("w", "wc", 0, 0), el("s", "split", 0, 0)]);
    expect(r.percorsi.find((x) => x.aId === "p")!.daId).toBe("q2");
    expect(r.mancano.sort()).toEqual(["collettore", "colonna_scarico", "unita_esterna"]);
  });
  it("con le stanze: una dorsale per stanza, di punto in punto, più corta della stella", () => {
    const stanza = [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 400 }, { x: 0, y: 400 }];
    const el2 = [el("q", "quadro_elettrico", -100, 0), el("a", "presa", 100, 0), el("b", "presa", 300, 0), el("c", "presa", 500, 0)];
    const stella = percorsiDaElementi(el2).percorsi.reduce((t, p) => t + p.lunghezzaCm, 0);
    const dorsale = percorsiDaElementi(el2, [stanza]);
    expect(dorsale.percorsi.map((p) => [p.daId, p.aId])).toEqual([["q", "a"], ["a", "b"], ["b", "c"]]);
    expect(dorsale.percorsi.reduce((t, p) => t + p.lunghezzaCm, 0)).toBeLessThan(stella);
  });
  it("i simboli da togliere non contano", () => {
    expect(percorsiDaElementi([el("q", "quadro_elettrico", 0, 0), { ...el("p", "presa", 100, 0), stato: "da_demolire" as const }]).percorsi).toHaveLength(0);
  });
  it("nel computo: corrugato, cavo ×3, tubi acqua ×2, scarico, rame ×2 e condensa, stimati", () => {
    let p: Pianta = { versione: 1, unita: "cm", muri: [], aperture: [], locali: [] };
    for (const [t, x, y] of [["quadro_elettrico", 0, 0], ["presa", 300, 0], ["collettore", 0, 500], ["lavabo", 200, 500], ["colonna_scarico", 400, 500], ["split", 0, 900], ["unita_esterna", 500, 900]] as const) {
      p = C.aggiungiElemento(p, voce(t), { x, y }).pianta;
    }
    const q = calcolaQuantita(aPlanimetria(p));
    expect(q["fatto:impianti:elettrico.corrugato_ml"]).toMatchObject({ unita: "ml", origine: "stimata" });
    expect(q["fatto:impianti:elettrico.cavo_ml"].valore).toBeCloseTo(q["fatto:impianti:elettrico.corrugato_ml"].valore * 3, 4);
    expect(q["fatto:impianti:acqua.tubo_ml"].valore).toBeGreaterThan(0);
    expect(q["fatto:impianti:scarico.tubo_ml"].valore).toBeGreaterThan(0);
    expect(q["fatto:impianti:clima.rame_ml"].valore).toBeGreaterThan(0);
    expect(q["fatto:impianti:clima.condensa_ml"].valore).toBeGreaterThan(0);
    expect(q["fatto:elementi:esistente:unita_esterna.numero"].valore).toBe(1);
  });
});

describe("clima e impianto elettrico con un clic", () => {
  it("BTU: 14 mq a 2,70 m ≈ 4.760 → taglia 7.000; 80 mq → più split", () => {
    const quadrato = (lato: number) => [{ x: 0, y: 0 }, { x: lato, y: 0 }, { x: lato, y: lato }, { x: 0, y: lato }];
    expect(btuConsigliati({ contorno: quadrato(374.17), altezza: 270 })).toMatchObject({ taglia: 7000, split: 1 });
    expect(btuConsigliati({ contorno: quadrato(600), altezza: 270 })).toMatchObject({ taglia: 18000, split: 1 });
    expect(btuConsigliati({ contorno: quadrato(900), altezza: 270 }).split).toBeGreaterThan(1);
  });
  it("dotazione CEI livello 1: camera 15 mq = 4 prese e 2 punti luce", () => {
    expect(dotazioneCei("camera", 15)).toEqual({ prese: 4, luci: 2 });
    expect(dotazioneCei("cucina", 9)).toEqual({ prese: 5, luci: 2 });
  });
  it("mette prese, luci e interruttori che mancano, e una seconda volta non duplica", () => {
    const { p, id } = stanza(380, 400, "camera");
    const r = impiantoElettrico(p, id, "fatto", "camera");
    const tipi = r.pianta.elementi!.map((e) => e.tipo);
    expect(tipi.filter((t) => t === "presa")).toHaveLength(4);
    expect(tipi.filter((t) => t === "punto_luce")).toHaveLength(2);
    expect(tipi.filter((t) => t === "interruttore").length).toBeGreaterThanOrEqual(1);
    expect(validaPlanimetria(aPlanimetria(r.pianta)).ok).toBe(true);
    expect(impiantoElettrico(r.pianta, id, "fatto", "camera").aggiunti.length).toBeLessThanOrEqual(1);
  });
  it("lo split porta la taglia scritta sopra", () => {
    const { p, id } = stanza(400, 450, "soggiorno");
    const r = climaStanza(p, id, "fatto", "soggiorno", { taglia: 12000, split: 1 });
    const s = r.pianta.elementi!.find((e) => e.tipo === "split")!;
    expect(s.etichetta).toBe("12.000 BTU");
  });
});
