import { describe, expect, it } from "vitest";
import { aPlanimetria, daPlanimetria, duplicaProposta, type Pianta } from "@/components/planimetrie/editor/adattatore";
import * as C from "@/components/planimetrie/editor/comandi";
import { costruisciScena, pianteDaPlanimetria } from "@/lib/planimetrie/tred";
import { costruisciScena as scenaDisegno, vistaDaPlanimetria } from "@/lib/planimetrie/esporta";
import { vociDallaPianta } from "@/lib/planimetrie/listinoImpianti";
import { nuovaPlanimetria, validaPlanimetria } from "../../../shared/planimetrie/modello.ts";
import { calcolaQuantita } from "../../../shared/planimetrie/quantita.ts";

const rett = (x0: number, y0: number, x1: number, y1: number) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];

function villetta() {
  let p: Pianta = { versione: 1, unita: "cm", muri: [], aperture: [], locali: [] };
  p = C.aggiungiStanza(p, C.rettangolo({ x: 0, y: 0 }, { x: 1000, y: 800 })).pianta;
  p = C.aggiungiArea(p, "lotto", rett(-1000, -1500, 2000, 1500)).pianta; // 30 × 30 m
  p = C.aggiungiArea(p, "prato", rett(-900, -1400, 1900, -100)).pianta; // 28 × 13 m
  p = C.aggiungiArea(p, "vialetto", rett(400, 800, 550, 1400)).pianta; // 1,5 × 6 m
  return p;
}

describe("lotto e aree esterne", () => {
  it("si salvano nel documento, valido, e tornano uguali", () => {
    const doc = aPlanimetria(villetta(), nuovaPlanimetria("Villetta"));
    expect(validaPlanimetria(doc).ok).toBe(true);
    expect(doc.livelli[0].fatto.aree?.map((a) => a.tipo)).toEqual(["lotto", "prato", "vialetto"]);
    const di = daPlanimetria(doc);
    expect(di.aree?.map((a) => a.contorno)).toEqual(villetta().aree?.map((a) => a.contorno));
  });
  it("nel computo: mq per tipo e metri di recinzione; il listino li propone", () => {
    const q = calcolaQuantita(aPlanimetria(villetta(), nuovaPlanimetria("V")));
    expect(q["fatto:esterni:lotto.superficie_mq"].valore).toBe(900);
    expect(q["fatto:esterni:lotto.recinzione_ml"].valore).toBe(120);
    expect(q["fatto:esterni:prato.superficie_mq"].valore).toBe(364);
    expect(q["fatto:esterni:vialetto.superficie_mq"].valore).toBe(9);
    const ids = vociDallaPianta(q, "fatto").map((v) => v.voce.id);
    expect(ids).toEqual(expect.arrayContaining(["esterni:prato.superficie_mq", "esterni:vialetto.superficie_mq", "esterni:lotto.recinzione_ml"]));
  });
  it("nel progetto: un'area nuova è lavoro da fare, una tolta non si conta più", () => {
    let doc = aPlanimetria(villetta(), nuovaPlanimetria("V"));
    const pr = duplicaProposta(doc, doc.livelli[0].id);
    doc = pr.documento;
    let p = daPlanimetria(doc, doc.livelli[0].id, pr.id);
    p = C.aggiungiArea(p, "pavimentato", rett(1000, 0, 1400, 800), "progetto").pianta;
    const prato = p.aree!.find((a) => a.tipo === "prato")!;
    p = C.eliminaArea(p, prato.id, "progetto");
    expect(p.aree!.find((a) => a.id === prato.id)!.stato).toBe("da_demolire");
    doc = aPlanimetria(p, doc, doc.livelli[0].id, pr.id);
    expect(validaPlanimetria(doc).ok).toBe(true);
    const q = calcolaQuantita(doc);
    expect(q[`progetto:${pr.id}:esterni:pavimentato.superficie_mq`].valore).toBe(32);
    expect(q[`progetto:${pr.id}:esterni:prato.superficie_mq`]).toBeUndefined();
    expect(q["fatto:esterni:prato.superficie_mq"].valore).toBe(364);
  });
  it("nel 3D: prato e vialetto a terra, recinzione lungo il confine", () => {
    const doc = aPlanimetria(villetta(), nuovaPlanimetria("V"));
    const s = costruisciScena(pianteDaPlanimetria(doc).fatto, { vista: "fatto" });
    const mat = new Set(s.mesh.filter((m) => m.id.startsWith("area:")).map((m) => m.materiale));
    expect([...mat].sort()).toEqual(["pietra", "prato", "recinzione"]);
    expect(s.limiti.max[0] - s.limiti.min[0]).toBeGreaterThan(29);
  });
  it("nei disegni: layer ESTERNI con il confine tratteggiato e il nome con i mq", () => {
    const doc = aPlanimetria(villetta(), nuovaPlanimetria("V"));
    const scena = scenaDisegno(vistaDaPlanimetria(doc, { modo: "fatto" }), { stile: "presentazione" });
    const esterni = scena.primitive.filter((p) => p.layer === "ESTERNI");
    expect(esterni.some((p) => p.tipo === "poligono" && p.tratto?.tratteggioMm)).toBe(true);
    expect(esterni.some((p) => p.tipo === "testo" && /Prato 364/.test(p.testo))).toBe(true);
    expect(scena.riquadro.maxX - scena.riquadro.minX).toBeGreaterThanOrEqual(3000);
  });
});

describe("proposte fatte prima delle aree esterne", () => {
  it("senza il campo aree la proposta vale come oggi: niente «da togliere», contate e nel 3D", () => {
    let doc = aPlanimetria(villetta(), nuovaPlanimetria("V"));
    const pr = duplicaProposta(doc, doc.livelli[0].id);
    doc = pr.documento;
    const liv = doc.livelli[0];
    doc = { ...doc, livelli: [{ ...liv, proposte: liv.proposte.map(({ aree: _tolte, ...p }) => p) }] };
    const p = daPlanimetria(doc, liv.id, pr.id);
    expect(p.aree!.every((a) => a.stato === "esistente")).toBe(true);
    expect(calcolaQuantita(doc)[`progetto:${pr.id}:esterni:prato.superficie_mq`].valore).toBe(364);
    expect(pianteDaPlanimetria(doc, { propostaId: pr.id }).progetto.aree).toHaveLength(3);
  });
});
