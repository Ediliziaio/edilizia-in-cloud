import { describe, expect, it } from "vitest";
import {
  type FotoSolarFv,
  leggiFotoSolar,
  leggiRispostaSolar,
  urlTiffSolar,
} from "../../../supabase/functions/_shared/fvGoogleSolar";
import {
  misuraPianoSolarFv,
  misureTettoSolarFv,
  type RasterSolarFv,
} from "@/lib/fotovoltaico/solarRaster";
import {
  coordinateDaMetri,
  leggiMappaFv,
  type MappaFv,
  metriDaCoordinate,
} from "../../../supabase/functions/_shared/fvMappa";
import { disponiModuliAutomaticamente } from "../../../supabase/functions/_shared/fvDisegnoCommerciale";
import { pianoDaMappaFv } from "@/components/fotovoltaico/tetto/mappaGeometria";
import {
  inquadraturaSatellitePdf,
  svgSatelliteDocumento,
} from "../../../supabase/functions/_shared/fvSatelliteDocumento";
const origine = { lat: 45.631109, lng: 11.437419 };
const mappa = (): MappaFv => ({
  versione: 1,
  origine,
  ricerca: { indirizzo: "Demo", posizione: origine },
  distanzaOstacoli: .3,
  falde: [{
    id: "f1",
    nome: "Falda 1",
    punti: [{ x: -4, y: -3 }, { x: 4, y: -3 }, { x: 4, y: 3 }, { x: -4, y: 3 }],
    inclinazione: 20,
    azimut: 180,
    inclinazioneStimata: true,
  }],
});
const foto = (): FotoSolarFv => ({
  path:
    "d2000000-0000-4000-a000-000000000002/bf2e40da-e1eb-4380-be27-750fbcdd2ac1/solar/11111111-1111-4111-8111-111111111111.jpg",
  larghezza: 1000,
  altezza: 1000,
  angoli: [
    coordinateDaMetri({ x: -50, y: 50 }, origine),
    coordinateDaMetri({ x: 50, y: 51 }, origine),
    coordinateDaMetri({ x: -49, y: -50 }, origine),
  ],
  data: "2025-06-15",
  qualita: "HIGH",
  risoluzione: .1,
});
const raw = () => ({
  center: { latitude: origine.lat, longitude: origine.lng },
  imageryQuality: "HIGH",
  imageryDate: { year: 2025, month: 6, day: 15 },
  solarPotential: {
    panelCapacityWatts: 400,
    maxArrayPanelsCount: 20,
    maxArrayAreaMeters2: 38,
    maxSunshineHoursPerYear: 1500,
    wholeRoofStats: { areaMeters2: 120 },
    roofSegmentStats: [{
      center: { latitude: origine.lat, longitude: origine.lng },
      boundingBox: {
        sw: { latitude: 45.63, longitude: 11.437 },
        ne: { latitude: 45.632, longitude: 11.438 },
      },
      pitchDegrees: 25,
      azimuthDegrees: 170,
      planeHeightAtCenterMeters: 180,
      stats: { areaMeters2: 60, groundAreaMeters2: 54 },
    }],
  },
});
function rasters() {
  const gps = (x: number, y: number) =>
    coordinateDaMetri({ x: (x - 50) * .25, y: (50 - y) * .25 }, origine);
  const pixel = (p: typeof origine) => {
    const q = metriDaCoordinate(p, origine);
    return { x: q.x / .25 + 50, y: 50 - q.y / .25 };
  };
  const dsm = new Float32Array(10000), mask = new Uint8Array(10000);
  for (let y = 0; y < 100; y++) {
    for (let x = 0; x < 100; x++) {
      const p = { x: (x + .5 - 50) * .25, y: (50 - y - .5) * .25 },
        i = y * 100 + x;
      mask[i] = Math.abs(p.x) <= 4 && Math.abs(p.y) <= 3 ? 1 : 0;
      dsm[i] = mask[i] ? 106 + p.y * .5 : 100;
    }
  }
  const r = { w: 100, h: 100, nodata: -9999, gps, pixel, passo: .25 };
  return {
    dsm: { ...r, valori: dsm } as RasterSolarFv,
    mask: { ...r, valori: mask } as RasterSolarFv,
  };
}
describe("Google Solar autentico e misura delle falde", () => {
  it("usa area tetto e capacità del pannello del provider, senza inventare 540 W", () => {
    const r = leggiRispostaSolar(raw())!;
    expect(r.potenza_max_kwp).toBe(8);
    expect(r.superficie_tetto_disponibile_mq).toBe(120);
    expect(r.segmenti[0].quotaCentro).toBe(180);
    const v = raw();
    delete (v.solarPotential as Partial<typeof v.solarPotential>)
      .panelCapacityWatts;
    expect(leggiRispostaSolar(v)?.potenza_max_kwp).toBeNull();
  });
  it("rifiuta mock, qualità ignota, coordinate e date non reali", () => {
    expect(leggiRispostaSolar({ ...raw(), _mock: true })).toBeNull();
    expect(leggiRispostaSolar({ ...raw(), imageryQuality: "UNKNOWN" }))
      .toBeNull();
    expect(
      leggiRispostaSolar({ ...raw(), center: { latitude: NaN, longitude: 9 } }),
    ).toBeNull();
    expect(
      leggiRispostaSolar({
        ...raw(),
        imageryDate: { year: 2025, month: 2, day: 30 },
      })?.imagery_date,
    ).toBeNull();
    expect(
      leggiRispostaSolar({ ...raw(), imageryQuality: "LOW" })?.qualitaGoogle,
    ).toBe("BASE");
  });
  it("scarica solo GeoTIFF dal servizio Google, senza URL arbitrarie o chiavi nella URL", () => {
    expect(urlTiffSolar("https://solar.googleapis.com/v1/geoTiff:get?id=123"))
      .not.toBeNull();
    for (
      const url of [
        "https://evil.invalid/v1/geoTiff:get?id=123",
        "http://solar.googleapis.com/v1/geoTiff:get?id=123",
        "https://solar.googleapis.com/v1/geoTiff:get?id=123&key=secret",
        "https://user@solar.googleapis.com/v1/geoTiff:get?id=123",
      ]
    ) expect(urlTiffSolar(url)).toBeNull();
  });
  it("conserva la foto georeferenziata e le quote nel salvataggio JSON", () => {
    const m = { ...mappa(), fotoSolar: foto() };
    m.falde[0].dislivelloGronda = 1.5;
    expect(leggiMappaFv(JSON.parse(JSON.stringify(m)))).toEqual(m);
    expect(leggiFotoSolar({ ...foto(), data: "2025-02-30" })).toBeNull();
    expect(leggiFotoSolar({ ...foto(), data: "2025-99-99" })).toBeNull();
    expect(leggiFotoSolar({ ...foto(), path: "https://evil.invalid/foto.jpg" }))
      .toBeNull();
  });
  it("il cambio della foto non sposta i pannelli nella vista satellitare PDF", () => {
    const p = disponiModuliAutomaticamente(
      pianoDaMappaFv(mappa(), { corto: 1.134, lungo: 2.278, stimato: false }),
      5,
    );
    expect(p.pannelli).toHaveLength(5);
    const vista = inquadraturaSatellitePdf(p)!;
    const normale = svgSatelliteDocumento(p, { ...vista, provider: "google" }),
      solar = svgSatelliteDocumento(p, {
        ...vista,
        provider: "google",
        img: "data:image/jpeg;base64,QUJD",
        solar: foto(),
      });
    expect(solar.match(/data-fv-satellite-panel[^>]+/g)).toEqual(
      normale.match(/data-fv-satellite-panel[^>]+/g),
    );
    expect(solar).toContain('transform="matrix(');
    expect(solar).toContain("Source: Includes solar data from Google");
  });
  it("stima un piano robusto senza usare il comignolo come pendenza del tetto", () => {
    const ps = [];
    for (let y = -5; y <= 5; y++) {
      for (let x = -5; x <= 5; x++) {
        ps.push({
          x,
          y,
          z: 100 + x * .2 + y * .5 + (x === 0 && y === 0 ? 3 : 0),
        });
      }
    }
    const f = misuraPianoSolarFv(ps);
    expect(f.a).toBeCloseTo(.2, 4);
    expect(f.b).toBeCloseTo(.5, 4);
    expect(f.c).toBeCloseTo(100, 4);
    expect(() => misuraPianoSolarFv(ps.slice(0, 10))).toThrow();
  });
  it("ricava altezza relativa al terreno e pendenza senza cambiare i vertici", () => {
    const m = mappa(),
      r = rasters(),
      fit = misureTettoSolarFv(m, r.dsm, r.mask);
    expect(fit.altezza).toBeCloseTo(4.5, 3);
    expect(fit.falde[0].inclinazione).toBeCloseTo(26.565, 2);
    expect(fit.falde[0].azimut).toBeCloseTo(180, 2);
    expect(fit.falde[0].punti).toEqual(m.falde[0].punti);
    expect(m.falde[0].inclinazione).toBe(20);
  });
  it("rifiuta terreno irregolare e quote mancanti, senza produrre un'altezza fittizia", () => {
    const r = rasters();
    for (let i = 0; i < 10000; i++) {
      if (r.mask.valori[i] === 0) {
        (r.dsm.valori as Float32Array)[i] = i % 100 < 50 ? 97 : 103;
      }
    }
    expect(() => misureTettoSolarFv(mappa(), r.dsm, r.mask)).toThrow(
      /terreno.*irregolare/i,
    );
    const q = rasters();
    (q.dsm.valori as Float32Array).fill(-9999);
    expect(() => misureTettoSolarFv(mappa(), q.dsm, q.mask)).toThrow();
  });
});
