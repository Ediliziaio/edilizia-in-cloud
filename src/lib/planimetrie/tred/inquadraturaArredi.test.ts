import { expect, it } from "vitest";
import { arrediInquadrati, posizioniArrediInquadrati, inquadraDettaglio, vistaDettaglioInterno, vistaInternaArredata } from "./inquadraturaArredi";
import { apertureDelLocale, proietta, proiezioneApertura, vistaDentroLocale } from "./telecamera";
import type { ElementoPer3D, PiantaPer3D, Punto2, Telecamera3D } from "./tipi";
import { puntoNelPoligono } from "./geometria2d";

function stanza(l: number, p: number, destinazione: string, elementi: ElementoPer3D[]): PiantaPer3D {
  const c: Punto2[] = [{ x: 0, y: 0 }, { x: l, y: 0 }, { x: l, y: p }, { x: 0, y: p }];
  return { locali: [{ id: "l1", nome: destinazione, destinazione, contorno: c, altezza: 270 }],
    muri: c.map((a, i) => ({ id: `m${i}`, a, b: c[(i + 1) % 4], spessore: 10, altezza: 270, stato: "esistente" })), aperture: [], elementi };
}
const bagno = () => stanza(160, 300, "bagno", [
  { id: "wc", tipo: "wc", centro: { x: 130, y: 260 }, larghezza: 38, profondita: 55, altezza: 40, rotazione: 270 },
  { id: "bidet", tipo: "bidet", centro: { x: 30, y: 155 }, larghezza: 38, profondita: 55, altezza: 40, rotazione: 90 },
  { id: "lavabo", tipo: "lavabo", centro: { x: 25, y: 240 }, larghezza: 60, profondita: 45, altezza: 85, rotazione: 90 },
  { id: "doccia", tipo: "doccia", centro: { x: 120, y: 165 }, larghezza: 80, profondita: 80, altezza: 200, rotazione: 270 },
  { id: "lavatrice", tipo: "lavatrice", centro: { x: 30, y: 105 }, larghezza: 60, profondita: 60, altezza: 85, rotazione: 90 },
]);
const studio = () => stanza(460, 140, "studio", [
  { id: "scrivania", tipo: "scrivania", centro: { x: 360, y: 30 }, larghezza: 120, profondita: 60, altezza: 75, rotazione: 180 },
  { id: "libreria", tipo: "libreria", centro: { x: 385, y: 130 }, larghezza: 160, profondita: 35, altezza: 200, rotazione: 0 },
  { id: "armadio", tipo: "armadio", centro: { x: 75, y: 30 }, larghezza: 120, profondita: 60, altezza: 240, rotazione: 180 },
]);

it("il bagno inquadra i quattro sanitari senza modificare oggetti o pianta", () => {
  const p = bagno(), originale = structuredClone(p), locale = p.locali[0];
  const prima = arrediInquadrati(p, locale, vistaDentroLocale(locale));
  const t = vistaInternaArredata(p, locale.id), dopo = arrediInquadrati(p, locale, t);
  expect(dopo.filter((e) => ["wc", "lavabo", "bidet", "doccia"].includes(e.tipo)).every((e) => e.quotaVisibile >= .5), JSON.stringify({ t, dopo })).toBe(true);
  expect(dopo.reduce((n, e) => n + e.quotaVisibile * e.peso, 0)).toBeGreaterThan(prima.reduce((n, e) => n + e.quotaVisibile * e.peso, 0));
  expect(puntoNelPoligono({ x: t.posizione[0] * 100, y: t.posizione[2] * 100 }, locale.contorno)).toBe(true);
  expect(p).toEqual(originale);
  const posizioni = posizioniArrediInquadrati(p, locale.id, t, 1.5);
  expect(posizioni.map(e => e.id)).toEqual(["wc", "bidet", "lavabo", "doccia", "lavatrice"]);
  expect(posizioni.every(e => e.x > 0 && e.x < 1 && e.y > 0 && e.y < 1)).toBe(true);
  expect(posizioni.find(e => e.id === "wc")?.x).not.toBe(posizioni.find(e => e.id === "lavatrice")?.x);
});
it("lo studio mostra scrivania e libreria evitando l'armadio in primo piano", () => {
  const p = studio(), l = p.locali[0], t = vistaInternaArredata(p, l.id);
  expect(arrediInquadrati(p, l, t).find((e) => e.tipo === "scrivania")!.quotaVisibile).toBeGreaterThanOrEqual(.5);
  expect(arrediInquadrati(p, l, t).find((e) => e.tipo === "libreria")!.quotaVisibile).toBeGreaterThanOrEqual(.5);
  expect(t.posizione[0] < .15 || t.posizione[0] > 1.35 || t.posizione[2] > .6).toBe(true);
  const q = proietta(t, 1.5, [3.6, .5, .3]);
  expect(q.profondita).toBeGreaterThan(.2); expect(Math.abs(q.x)).toBeLessThan(1); expect(Math.abs(q.y)).toBeLessThan(1);
});
it("locali vuoti o senza arredi riconosciuti mantengono la vista ordinaria", () => {
  const p = studio(); p.locali[0].destinazione = "camera"; p.elementi = [{ id: "p1", tipo: "pilastro", centro: { x: 200, y: 40 }, rotazione: 0 }];
  expect(vistaInternaArredata(p, "l1")).toEqual(vistaDentroLocale(p.locali[0]));
  p.locali[0].destinazione = "studio"; p.elementi = [];
  expect(vistaInternaArredata(p, "l1")).toEqual(vistaDentroLocale(p.locali[0]));
});

it("una portafinestra fuori campo può essere mostrata per intero dalla stessa stanza", () => {
  const p = stanza(480, 370, "soggiorno", []);
  p.aperture = [{
    id: "balcone", muroId: "m0", tipo: "portafinestra", stato: "esistente",
    posizione: 240, larghezza: 320, altezza: 240, davanzale: 0,
  }];
  const originale = structuredClone(p);
  const [vano] = apertureDelLocale(p, "l1");
  const lontanoDalBalcone: Telecamera3D = { posizione: [2.4, 1.6, 1.8], guarda: [2.4, 1.6, 3.7], fov: 60 };
  const versoIlBordo: Telecamera3D = { ...lontanoDalBalcone, guarda: [1.4, 1.6, 0] };
  expect(proiezioneApertura(lontanoDalBalcone, 1.5, vano)).toBeNull();
  expect(proiezioneApertura(versoIlBordo, 1.5, vano)?.intera).toBe(false);
  const dettaglio = vistaDettaglioInterno(p, "l1", { tipo: "apertura", id: "balcone" }, "progetto", 1.5);
  expect(dettaglio).not.toBeNull();
  expect(proiezioneApertura(dettaglio!, 1.5, vano)?.intera).toBe(true);
  expect(puntoNelPoligono({ x: dettaglio!.posizione[0] * 100, y: dettaglio!.posizione[2] * 100 }, p.locali[0].contorno)).toBe(true);
  expect(p).toEqual(originale);
});

it("non crea un'inquadratura del mobile se manca spazio per la camera", () => {
  const p = stanza(80, 80, "ripostiglio", [{ id: "armadio", tipo: "armadio", centro: { x: 40, y: 42 }, larghezza: 72, profondita: 65, altezza: 230, rotazione: 0 }]);
  expect(vistaDettaglioInterno(p, "l1", { tipo: "arredo", id: "armadio" }, "progetto", 1.5)).toBeNull();
});

it("inquadra la porta di un andito stretto dal locale adiacente", () => {
  const p = stanza(150, 65, "disimpegno", []);
  p.locali.push({
    id: "camera", nome: "Camera", destinazione: "camera", altezza: 270,
    contorno: [{ x: 0, y: -310 }, { x: 330, y: -310 }, { x: 330, y: 0 }, { x: 0, y: 0 }],
  });
  p.aperture = [{
    id: "interna", muroId: "m0", tipo: "porta", stato: "esistente",
    posizione: 75, larghezza: 80, altezza: 210, davanzale: 0,
  }];
  const soggetto = { tipo: "apertura", id: "interna" } as const;
  expect(vistaDettaglioInterno(p, "l1", soggetto, "progetto", 1.5)).toBeNull();
  const vista = inquadraDettaglio(p, "l1", soggetto, "progetto", 1.5);
  expect(vista?.localeId).toBe("camera");
  const [vano] = apertureDelLocale(p, "camera");
  expect(proiezioneApertura(vista!.telecamera, 1.5, vano)?.intera).toBe(true);
});
