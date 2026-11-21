import { describe, expect, it } from "vitest";
import { misureFaldeMappa } from "../../components/fotovoltaico/tetto/misureFaldeMappa";
import { edificioDaMappaFv, pianoDaMappaFv } from "../../components/fotovoltaico/tetto/mappaGeometria";
import { triangoliFaccia } from "../../components/fotovoltaico/tetto/tettoReale";
import type { MappaFv } from "../../../supabase/functions/_shared/fvMappa";
const mappa: MappaFv = { versione: 1, origine: { lat: 45, lng: 9 }, ricerca: { indirizzo: "Collaudo", posizione: { lat: 45, lng: 9 } }, distanzaOstacoli: .3,
  falde: [{ id: "f1", nome: "Falda 1", punti: [{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 8 }, { x: 0, y: 8 }], inclinazione: 30, azimut: 180, inclinazioneStimata: true }] };
describe("Misure e volume dalle stesse falde sulla mappa", () => {
  it("distingue i 96 m² in pianta dai 110,85 m² inclinati, con i lati fisici", () => {
    const piano = pianoDaMappaFv(mappa, { corto: 1.134, lungo: 2.278, stimato: false });
    const [f] = misureFaldeMappa(piano);
    expect(f.pianta).toBeCloseTo(96, 6);
    expect(f.superficie).toBeCloseTo(96 / Math.cos(Math.PI / 6), 6);
    expect(Math.max(...f.lati)).toBeCloseTo(12, 6);
    expect(Math.min(...f.lati)).toBeCloseTo(8 / Math.cos(Math.PI / 6), 6);
    expect(f.inclinazione).toBe(30);
    expect(f.azimut).toBe(180);
  });
  it("l’altezza della vista 3D cambia il volume senza deformare contorni e misure", () => {
    const tetto = (altezza: number) => edificioDaMappaFv(mappa, altezza).facce.filter(f => f.tipo === "RoofSurface").flatMap(triangoliFaccia);
    const a = tetto(8), b = tetto(18);
    expect(b.length).toBe(a.length);
    b.forEach((p, i) => { expect(p.x).toBeCloseTo(a[i].x, 6); expect(p.y).toBeCloseTo(a[i].y, 6); expect(p.z - a[i].z).toBeCloseTo(10, 6); });
    expect(() => edificioDaMappaFv(mappa, NaN)).toThrow("Altezza");
  });
});
