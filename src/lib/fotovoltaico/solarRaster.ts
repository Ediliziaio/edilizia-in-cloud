import proj4 from "proj4";
import { affineGeoTiff } from "@/components/fotovoltaico/tetto/importaOrtofoto";
import {
  coordinateDaMetri,
  type MappaFv,
  metriDaCoordinate,
  type PosizioneMappaFv,
} from "../../../supabase/functions/_shared/fvMappa";
import {
  type PuntoFv,
  puntoNelPoligono,
} from "../../../supabase/functions/_shared/fvDisegnoCommerciale";
export type RasterSolarFv = {
  w: number;
  h: number;
  valori: ArrayLike<number>;
  nodata: number | null;
  gps: (x: number, y: number) => PosizioneMappaFv;
  pixel: (p: PosizioneMappaFv) => PuntoFv;
  passo: number;
};
function bytesBase64(s: string) {
  if (s.length > 17 * 1024 * 1024) throw Error("Raster Google troppo grande");
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0)).buffer;
}
export async function rasterSolarFv(base64: string, rgb = false) {
  const { fromArrayBuffer } = await import("geotiff"),
    t = await fromArrayBuffer(bytesBase64(base64)),
    im = await t.getImage(),
    w = im.getWidth(),
    h = im.getHeight();
  if (w < 2 || h < 2 || w * h > 4000000) {
    throw Error("Dimensioni del raster Google non supportate");
  }
  const keys = im.getGeoKeys(),
    epsg = Number(keys?.ProjectedCSTypeGeoKey),
    zona = epsg % 100;
  if (!(epsg >= 32601 && epsg <= 32660 || epsg >= 32701 && epsg <= 32760)) {
    throw Error("Sistema di coordinate Google non supportato");
  }
  const trasforma = proj4(
    `+proj=utm +zone=${zona} ${
      epsg >= 32701 ? "+south " : ""
    }+datum=WGS84 +units=m +no_defs`,
    "EPSG:4326",
  );
  const dir = im.getFileDirectory(),
    mt = await dir.loadValue("ModelTransformation"),
    s = await dir.loadValue("ModelPixelScale"),
    p = await dir.loadValue("ModelTiepoint");
  const a = affineGeoTiff({
      matrice: mt ? Array.from(mt).map(Number) : undefined,
      scala: s ? Array.from(s).map(Number) : undefined,
      legame: p ? Array.from(p).map(Number) : undefined,
      pixelPunto: keys?.GTRasterTypeGeoKey === 2,
    }),
    det = a[0] * a[4] - a[1] * a[3];
  const gps = (x: number, y: number) => {
    const q = trasforma.forward([
      a[0] * x + a[1] * y + a[2],
      a[3] * x + a[4] * y + a[5],
    ]);
    return { lat: q[1], lng: q[0] };
  };
  const pixel = (c: PosizioneMappaFv) => {
    const q = trasforma.inverse([c.lng, c.lat]),
      x = q[0] - a[2],
      y = q[1] - a[5];
    return { x: (a[4] * x - a[1] * y) / det, y: (-a[3] * x + a[0] * y) / det };
  };
  const valori = rgb
    ? await im.readRGB({ interleave: true })
    : await im.readRasters({ samples: [0], interleave: true });
  const raster: RasterSolarFv = {
    w,
    h,
    valori: valori as ArrayLike<number>,
    nodata: im.getGDALNoData(),
    gps,
    pixel,
    passo: Math.hypot(a[0], a[3]),
  };
  return raster;
}
export function jpegSolarFv(r: RasterSolarFv) {
  const canvas = document.createElement("canvas");
  canvas.width = r.w;
  canvas.height = r.h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw Error("Impossibile preparare la foto Google");
  const channels = r.valori.length / (r.w * r.h);
  if (channels !== 3 && channels !== 4) throw Error("Foto Google non RGB");
  const out = ctx.createImageData(r.w, r.h);
  for (let i = 0; i < r.w * r.h; i++) {
    out.data[4 * i] = r.valori[channels * i];
    out.data[4 * i + 1] = r.valori[channels * i + 1];
    out.data[4 * i + 2] = r.valori[channels * i + 2];
    out.data[4 * i + 3] = 255;
  }
  ctx.putImageData(out, 0, 0);
  return canvas.toDataURL("image/jpeg", .94);
}
const quantile = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((s.length - 1) * p))];
};
export type PianoMisuratoSolarFv = {
  a: number;
  b: number;
  c: number;
  scarto: number;
  campioni: number;
};
/** Piano robusto: gli oggetti sopra la copertura non determinano la pendenza della falda. */
export function misuraPianoSolarFv(
  input: Array<{ x: number; y: number; z: number }>,
): PianoMisuratoSolarFv {
  if (input.length < 20) {
    throw Error("Non ci sono abbastanza quote Google sulla falda");
  }
  let ps = input, fit: PianoMisuratoSolarFv | undefined;
  for (let giro = 0; giro < 4; giro++) {
    const mx = ps.reduce((s, p) => s + p.x, 0) / ps.length,
      my = ps.reduce((s, p) => s + p.y, 0) / ps.length,
      mz = ps.reduce((s, p) => s + p.z, 0) / ps.length;
    let xx = 0, xy = 0, yy = 0, xz = 0, yz = 0;
    for (const p of ps) {
      const x = p.x - mx, y = p.y - my, z = p.z - mz;
      xx += x * x;
      xy += x * y;
      yy += y * y;
      xz += x * z;
      yz += y * z;
    }
    const det = xx * yy - xy * xy;
    if (det < 1e-6 || xx / ps.length < .03 || yy / ps.length < .03) {
      throw Error("Falda troppo stretta per una misura attendibile");
    }
    const a = (xz * yy - yz * xy) / det,
      b = (yz * xx - xz * xy) / det,
      c = mz - a * mx - b * my;
    const residui = ps.map((p) => p.z - (a * p.x + b * p.y + c)),
      med = quantile(residui, .5),
      mad = quantile(residui.map((r) => Math.abs(r - med)), .5),
      limite = Math.max(.12, 3 * 1.4826 * mad);
    const validi = ps.filter((_, i) => Math.abs(residui[i] - med) <= limite);
    fit = {
      a,
      b,
      c,
      scarto: Math.sqrt(residui.reduce((s, r) => s + r * r, 0) / ps.length),
      campioni: ps.length,
    };
    if (validi.length < 20 || validi.length === ps.length) break;
    ps = validi;
  }
  if (
    !fit || Math.atan(Math.hypot(fit.a, fit.b)) * 180 / Math.PI > 75 ||
    fit.scarto > .5 || fit.campioni < input.length * .55
  ) {
    throw Error(
      "Le quote non descrivono una sola falda: verifica contorno, ombre e ostacoli",
    );
  }
  return fit;
}
export type MisureTettoSolarFv = {
  altezza: number | null;
  falde: MappaFv["falde"];
  scarto: number;
  terreno: number | null;
  avvisoAltezza?: string;
};
export function misureTettoSolarFv(
  m: MappaFv,
  dsm: RasterSolarFv,
  mask: RasterSolarFv,
  dataFoto?: string,
): MisureTettoSolarFv {
  if (!m.falde.length) throw Error("Traccia prima le falde sulla foto Google");
  const terra: number[] = [];
  const contorno = m.falde.flatMap((f) => f.punti),
    xmin = Math.min(...contorno.map((p) => p.x)) - 8,
    xmax = Math.max(...contorno.map((p) => p.x)) + 8,
    ymin = Math.min(...contorno.map((p) => p.y)) - 8,
    ymax = Math.max(...contorno.map((p) => p.y)) + 8;
  const passo = Math.max(1, Math.ceil(Math.sqrt(dsm.w * dsm.h / 16000)));
  const valore = (r: RasterSolarFv, g: PosizioneMappaFv) => {
    const q = r.pixel(g), x = Math.floor(q.x), y = Math.floor(q.y);
    return x >= 0 && y >= 0 && x < r.w && y < r.h ? r.valori[y * r.w + x] : NaN;
  };
  for (let y = 0; y < dsm.h; y += passo) {
    for (let x = 0; x < dsm.w; x += passo) {
      const z = dsm.valori[y * dsm.w + x];
      if (
        !Number.isFinite(z) || z === dsm.nodata || z < -500 || z > 9000
      ) {
        continue;
      }
      const g = dsm.gps(x + .5, y + .5), p = metriDaCoordinate(g, m.origine);
      if (
        p.x >= xmin && p.x <= xmax && p.y >= ymin && p.y <= ymax &&
        valore(mask, g) === 0
      ) terra.push(z);
    }
  }
  let avvisoAltezza = terra.length < 30
    ? "Google non ha restituito abbastanza terreno per riferire le altezze"
    : quantile(terra, .8) - quantile(terra, .2) > 1.5
    ? "Il terreno vicino al tetto è irregolare: conferma manualmente le altezze"
    : undefined;
  const terreno = avvisoAltezza ? null : quantile(terra, .2);
  const fits = m.falde.map((f) => {
    const pts = f.punti.map((p) => dsm.pixel(coordinateDaMetri(p, m.origine))),
      minX = Math.max(0, Math.floor(Math.min(...pts.map((p) => p.x)))),
      maxX = Math.min(dsm.w - 1, Math.ceil(Math.max(...pts.map((p) => p.x)))),
      minY = Math.max(0, Math.floor(Math.min(...pts.map((p) => p.y)))),
      maxY = Math.min(dsm.h - 1, Math.ceil(Math.max(...pts.map((p) => p.y))));
    const step = Math.max(
        1,
        Math.ceil(Math.sqrt((maxX - minX) * (maxY - minY) / 12000)),
      ),
      samples: Array<{ x: number; y: number; z: number }> = [];
    for (let y = minY; y <= maxY; y += step) {
      for (let x = minX; x <= maxX; x += step) {
        const z = dsm.valori[y * dsm.w + x];
        if (!Number.isFinite(z) || z === dsm.nodata || z < -500 || z > 9000) {
          continue;
        }
        const g = dsm.gps(x + .5, y + .5), p = metriDaCoordinate(g, m.origine);
        if (valore(mask, g) !== 1 || !puntoNelPoligono(p, f.punti)) {
          continue;
        }
        samples.push({ ...p, z });
      }
    }
    const fit = misuraPianoSolarFv(samples),
      gronda = Math.min(...f.punti.map((p) =>
        fit.a * p.x + fit.b * p.y + fit.c
      ));
    return { fit, gronda, f };
  });
  const quotaMinima = Math.min(...fits.map((f) => f.gronda));
  const altezzaStimata = terreno == null ? null : quotaMinima - terreno;
  const altezza = altezzaStimata != null && altezzaStimata >= 2 && altezzaStimata <= 150 ? altezzaStimata : null;
  if (altezza == null && !avvisoAltezza) avvisoAltezza = "Altezza dal terreno non attendibile: conferma le quote manualmente";
  const falde = fits.map(({ f, fit, gronda }) => ({
    ...f,
    inclinazione: Number(
      (Math.atan(Math.hypot(fit.a, fit.b)) * 180 / Math.PI).toFixed(3),
    ),
    azimut: Number(
      ((Math.atan2(-fit.a, -fit.b) * 180 / Math.PI + 360) % 360).toFixed(4),
    ) % 360,
    inclinazioneStimata: true,
    dislivelloGronda: Number((gronda - quotaMinima).toFixed(3)),
    ...(dataFoto ? { misuraSolar: { data: dataFoto, scarto: fit.scarto, campioni: fit.campioni } } : {}),
  }));
  return {
    altezza: altezza == null ? null : Number(altezza.toFixed(3)),
    falde,
    scarto: Math.max(...fits.map((f) => f.fit.scarto)),
    terreno,
    ...(avvisoAltezza ? { avvisoAltezza } : {}),
  };
}
