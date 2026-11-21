import { describe, expect, it } from "vitest";
import { geometriaTettoDocumento, svgTettoDocumento, tabellaFaldeDocumento } from "../../../supabase/functions/_shared/fvTettoDocumento";
import { disponiModuliAutomaticamente, type DisegnoCommercialeFv } from "../../../supabase/functions/_shared/fvDisegnoCommerciale";
import type { MappaFv } from "../../../supabase/functions/_shared/fvMappa";
import { edificioDaMappaFv, pianoDaMappaFv } from "../../components/fotovoltaico/tetto/mappaGeometria";
import { pannelliDalDisegnoReale } from "../../components/fotovoltaico/tetto/tettoReale";

function mappa(inclinazione = 30, azimut = 180): MappaFv {
  return { versione: 1, origine: { lat: 45, lng: 9 }, ricerca: { indirizzo: "Collaudo", posizione: { lat: 45, lng: 9 } }, distanzaOstacoli: .3,
    falde: [{ id: "f1", nome: "Falda 1", punti: [{ x: -6, y: -4 }, { x: 6, y: -4 }, { x: 6, y: 4 }, { x: -6, y: 4 }], inclinazione, azimut, inclinazioneStimata: true }] };
}
const modulo = { corto: 1.134, lungo: 2.165, stimato: false };

describe("Disegno del tetto incorporato nel documento", () => {
  it.each([[0, 0], [.5, 33], [30, 180], [35, 89], [45, 270], [75, 0]])("conserva le coordinate della posa 3D dell’editor con pendenza %s e azimut %s", (pendenza, azimut) => {
    const m = mappa(pendenza, azimut);
    const piano = { ...disponiModuliAutomaticamente(pianoDaMappaFv(m, modulo), 18), schema3d: { altezza: 15, pendenza: 20 } };
    const g = geometriaTettoDocumento(piano)!;
    const reali = pannelliDalDisegnoReale(edificioDaMappaFv(m, 15), piano);
    expect(g.pannelli.length).toBeGreaterThan(0);
    g.pannelli.forEach((p, i) => p.punti.forEach((v, j) => {
      expect(v.x).toBeCloseTo(reali[i].vertici[j].x, 6);
      expect(v.y).toBeCloseTo(reali[i].vertici[j].y, 6);
      expect(v.z).toBeCloseTo(reali[i].vertici[j].z, 6);
    }));
    expect(g.falde[0].pianta).toBe(96);
    expect(g.falde[0].superficie).toBeCloseTo(96 / Math.cos(pendenza * Math.PI / 180), 6);
  });

  it("mantiene le due falde nella posizione geografica, senza il reticolo separato della tavola metrica", () => {
    const m = mappa();
    m.falde.push({ ...m.falde[0], id: "f2", nome: "Falda nord", azimut: 0, punti: m.falde[0].punti.map(p => ({ ...p, y: p.y + 8 })) });
    const piano = disponiModuliAutomaticamente(pianoDaMappaFv(m, modulo), 24);
    const g = geometriaTettoDocumento(piano)!;
    expect(g.falde[0].punti[2].y).toBe(g.falde[1].punti[1].y);
    const reali = pannelliDalDisegnoReale(edificioDaMappaFv(m), piano);
    g.pannelli.forEach((p, i) => p.punti.forEach((v, j) => expect(v).toEqual(expect.objectContaining({ x: expect.closeTo(reali[i].vertici[j].x, 6), y: expect.closeTo(reali[i].vertici[j].y, 6) }))));
  });

  it.each(["y-", "x-", "x+"] as const)("riporta i supporti inclinati nel verso %s come nell’editor", verso => {
    const m = mappa(0, 0);
    const piano = disponiModuliAutomaticamente(pianoDaMappaFv(m, modulo), 1);
    piano.pannelli[0].supporto = { inclinazione: 15, verso, gruppo: 0 };
    const g = geometriaTettoDocumento(piano)!;
    const reale = pannelliDalDisegnoReale(edificioDaMappaFv(m), piano)[0];
    g.pannelli[0].punti.forEach((p, i) => expect(p.z).toBeCloseTo(reale.vertici[i].z, 6));
  });

  it("incorpora tutti i moduli in SVG nitidi, con misure, nord e dati della falda", () => {
    const piano = disponiModuliAutomaticamente(pianoDaMappaFv(mappa(), modulo), 18);
    const g = geometriaTettoDocumento(piano)!;
    for (const vista of ["pianta", "3d"] as const) {
      const svg = svgTettoDocumento(g, vista);
      expect(svg.match(/data-fv-panel=/g)).toHaveLength(18);
      expect(svg).not.toMatch(/NaN|Infinity|<script|<image/);
    }
    const svg = svgTettoDocumento(g, "pianta");
    expect(svg).toContain("12 m"); expect(svg).toContain("8 m");
    expect(svg).toContain(">N</text>");
    const table = tabellaFaldeDocumento(g);
    expect(table).toContain("96 m²"); expect(table).toContain("110,85 m²");
    expect(table).toContain("30°*"); expect(table).toContain("180°");
  });

  it("un perimetro di posa ridotto non sposta i moduli rispetto al tetto sulla mappa", () => {
    const m = mappa();
    const piano = disponiModuliAutomaticamente(pianoDaMappaFv(m, modulo), 1);
    piano.falde[0].punti = piano.falde[0].punti.map(p => ({ x: p.x + 1, y: p.y + 1 }));
    const g = geometriaTettoDocumento(piano)!;
    const reale = pannelliDalDisegnoReale(edificioDaMappaFv(m), piano)[0];
    g.pannelli[0].punti.forEach((v, i) => {
      expect(v.x).toBeCloseTo(reale.vertici[i].x, 6);
      expect(v.y).toBeCloseTo(reale.vertici[i].y, 6);
    });
  });

  it("non inventa una ricostruzione per un disegno non georeferenziato o una mappa degenere", () => {
    const piano = pianoDaMappaFv(mappa(), modulo);
    expect(geometriaTettoDocumento({ ...piano, mappa: undefined })).toBeNull();
    const rotto: DisegnoCommercialeFv = { ...piano, mappa: { ...piano.mappa!, falde: [{ ...piano.mappa!.falde[0], punti: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }] }] } };
    expect(geometriaTettoDocumento(rotto)).toBeNull();
  });

  it("conserva un contorno concavo e invertito senza deformare i pannelli e protegge i nomi nell’HTML", () => {
    const m = mappa(22, 123);
    m.falde[0].punti = [{x:0,y:0},{x:12,y:0},{x:12,y:4},{x:6,y:4},{x:6,y:8},{x:0,y:8}].reverse();
    m.falde[0].nome = '<img src=x onerror="alert(1)">';
    const piano = disponiModuliAutomaticamente(pianoDaMappaFv(m, modulo), 15);
    const g = geometriaTettoDocumento(piano)!;
    const reali = pannelliDalDisegnoReale(edificioDaMappaFv(m), piano);
    expect(g.falde[0].punti).toHaveLength(6);
    g.pannelli.forEach((p, i) => p.punti.forEach((v, j) => expect(v.z).toBeCloseTo(reali[i].vertici[j].z, 6)));
    expect(tabellaFaldeDocumento(g)).not.toContain('<img');
    expect(tabellaFaldeDocumento(g)).toContain('&lt;img');
  });
});
