/** Riferimenti della mappa, senza immagini o chiavi del provider. Metri est/nord dall'origine. */
export type PosizioneMappaFv = { lat: number; lng: number };
export type MappaFv = {
  versione: 1;
  origine: PosizioneMappaFv;
  ricerca: { indirizzo: string; posizione: PosizioneMappaFv };
  falde: Array<
    {
      id: string;
      nome: string;
      punti: Array<{ x: number; y: number }>;
      inclinazione: number;
      azimut: number;
      inclinazioneStimata: boolean;
    }
  >;
  distanzaOstacoli: number;
  solare?: Array<{ faldaId: string; ore: number; pesiMensili: number[] }>;
};
const record = (x: unknown): x is Record<string, unknown> =>
  !!x && typeof x === "object" && !Array.isArray(x);
const n = (x: unknown): x is number =>
  typeof x === "number" && Number.isFinite(x);
export const posizioneMappaValida = (x: unknown): x is PosizioneMappaFv =>
  record(x) && n(x.lat) && n(x.lng) && Math.abs(x.lat) <= 80 &&
  Math.abs(x.lng) <= 180;
export function leggiMappaFv(raw: unknown): MappaFv | null {
  if (
    !record(raw) || raw.versione !== 1 || !posizioneMappaValida(raw.origine) ||
    !record(raw.ricerca) || !posizioneMappaValida(raw.ricerca.posizione) ||
    typeof raw.ricerca.indirizzo !== "string" ||
    raw.ricerca.indirizzo.length > 500 || !Array.isArray(raw.falde) ||
    raw.falde.length > 12 || !n(raw.distanzaOstacoli) ||
    raw.distanzaOstacoli < 0 || raw.distanzaOstacoli > 5
  ) return null;
  const falde: MappaFv["falde"] = [];
  for (const f of raw.falde) {
    if (
      !record(f) || typeof f.id !== "string" || !f.id || f.id.length > 80 ||
      falde.some((q) => q.id === f.id) || typeof f.nome !== "string" ||
      f.nome.length > 80 || !Array.isArray(f.punti) || f.punti.length < 3 ||
      f.punti.length > 64 || !f.punti.every((p) =>
        record(p) && n(p.x) && n(p.y) && Math.abs(p.x) <= 400 &&
        Math.abs(p.y) <= 400
      ) || !n(f.inclinazione) || f.inclinazione < 0 || f.inclinazione > 75 ||
      !n(f.azimut) || f.azimut < 0 || f.azimut >= 360
    ) {
      return null;
    }
    falde.push({
      id: f.id,
      nome: f.nome,
      punti: f.punti.map((p) => ({ x: p.x, y: p.y })),
      inclinazione: f.inclinazione,
      azimut: f.azimut,
      inclinazioneStimata: f.inclinazioneStimata !== false,
    });
  }
  let solare: MappaFv["solare"];
  if (raw.solare !== undefined) {
    if (!Array.isArray(raw.solare) || raw.solare.length !== falde.length) {
      return null;
    }
    solare = [];
    for (const s of raw.solare) {
      if (
        !record(s) || typeof s.faldaId !== "string" || !falde.some((f) =>
          f.id === s.faldaId
        ) || solare.some((f) => f.faldaId === s.faldaId) || !n(s.ore) ||
        s.ore <= 0 || s.ore > 4000 || !Array.isArray(s.pesiMensili) ||
        s.pesiMensili.length !== 12 || !s.pesiMensili.every((x) =>
          n(x) && x >= 0 && x <= 1
        ) || Math.abs(
            s.pesiMensili.reduce((a: number, b: number) => a + b, 0) - 1,
          ) > .00001
      ) return null;
      solare.push({
        faldaId: s.faldaId,
        ore: s.ore,
        pesiMensili: s.pesiMensili as number[],
      });
    }
  }
  return {
    versione: 1,
    origine: { lat: raw.origine.lat, lng: raw.origine.lng },
    ricerca: {
      indirizzo: raw.ricerca.indirizzo,
      posizione: {
        lat: raw.ricerca.posizione.lat,
        lng: raw.ricerca.posizione.lng,
      },
    },
    falde,
    distanzaOstacoli: raw.distanzaOstacoli,
    ...(solare ? { solare } : {}),
  };
}
export function resaMappaFv(raw: unknown) {
  if (!record(raw) || !Array.isArray(raw.pannelli)) return null;
  const m = leggiMappaFv(raw.mappa);
  if (!m?.solare?.length) return null;
  let peso = 0, ore = 0;
  const mesi = Array(12).fill(0) as number[];
  for (const s of m.solare) {
    const f = m.falde.find((f) => f.id === s.faldaId)!,
      conta = raw.pannelli.filter((p) =>
        record(p) && p.faldaId === f.id
      ).length;
    const area = Math.abs(f.punti.reduce((v, p, i) => {
      const q = f.punti[(i + 1) % f.punti.length];
      return v + p.x * q.y - q.x * p.y;
    }, 0)) / 2 / Math.cos(f.inclinazione * Math.PI / 180);
    const w = raw.pannelli.length ? conta : area;
    peso += w;
    ore += s.ore * w;
    for (let i = 0; i < 12; i++) mesi[i] += s.pesiMensili[i] * s.ore * w;
  }
  if (!(peso > 0 && ore > 0)) return null;
  return { ore: ore / peso, pesiMensili: mesi.map((x) => x / ore) };
}
const R = 6378137, rad = Math.PI / 180;
export function metriDaCoordinate(
  p: PosizioneMappaFv,
  origine: PosizioneMappaFv,
) {
  return {
    x: (p.lng - origine.lng) * rad * R * Math.cos(origine.lat * rad),
    y: (p.lat - origine.lat) * rad * R,
  };
}
export function coordinateDaMetri(
  p: { x: number; y: number },
  origine: PosizioneMappaFv,
): PosizioneMappaFv {
  return {
    lat: origine.lat + p.y / R / rad,
    lng: origine.lng + p.x / (R * Math.cos(origine.lat * rad)) / rad,
  };
}
const mondo = (p: PosizioneMappaFv) => ({
  x: (p.lng + 180) / 360,
  y: (1 -
    Math.log(Math.tan(p.lat * rad) + 1 / Math.cos(p.lat * rad)) / Math.PI) / 2,
});
export function coordinateDaPixel(
  p: { x: number; y: number },
  centro: PosizioneMappaFv,
  zoom: number,
  w = 640,
  h = 440,
): PosizioneMappaFv {
  const c = mondo(centro),
    scala = 256 * 2 ** zoom,
    x = c.x + (p.x - w / 2) / scala,
    y = c.y + (p.y - h / 2) / scala;
  return {
    lat: Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) / rad,
    lng: x * 360 - 180,
  };
}
export function pixelDaCoordinate(
  p: PosizioneMappaFv,
  centro: PosizioneMappaFv,
  zoom: number,
  w = 640,
  h = 440,
) {
  const a = mondo(p), b = mondo(centro), s = 256 * 2 ** zoom;
  return { x: w / 2 + (a.x - b.x) * s, y: h / 2 + (a.y - b.y) * s };
}
export function rettangoloRuotatoFv(
  centro: { x: number; y: number },
  w: number,
  h: number,
  rotazione: number,
) {
  const a = rotazione * rad;
  return [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]]
    .map(([x, y]) => ({
      x: centro.x + x * Math.cos(a) - y * Math.sin(a),
      y: centro.y + x * Math.sin(a) + y * Math.cos(a),
    }));
}
