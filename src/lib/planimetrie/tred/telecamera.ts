/**
 * Telecamere e metadati delle viste: dall'alto, giro intorno, dentro un locale.
 * Funzioni pure (niente three.js): la proiezione segue quella della PerspectiveCamera
 * di three.js, con il campo visivo verticale.
 *
 * `metadatiFotogramma` dice cosa si vede in un fotogramma: misure della stanza e
 * aperture inquadrate, con la loro posizione nell'immagine. È ciò che accompagna
 * il PNG verso il render AI (fase 5b), così l'AI sa quanto è grande la stanza e
 * dove stanno porte e finestre senza doverlo indovinare.
 */
import {
  type V2,
  areaConSegno,
  meno,
  per,
  perimetro,
  piu,
  pulisciPoligono,
  puntoInterno,
  puntoNelPoligono,
  rettangoloMinimo,
  scalare,
  v2,
} from "./geometria2d";
import { comeApertura, muriCalcolati, nomeApertura } from "./scena";
import type { AperturaPer3D, Limiti3D, LocalePer3D, PiantaPer3D, Telecamera3D, TipoApertura, V3, Vista3D } from "./tipi";

const CM = 0.01;
export const ALTEZZA_OCCHI = 1.6;

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]);
  return l > 0 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0];
};

const centro = (l: Limiti3D): V3 => [(l.min[0] + l.max[0]) / 2, (l.min[1] + l.max[1]) / 2, (l.min[2] + l.max[2]) / 2];

/** Dall'alto, con il nord (l'alto della pianta) in cima allo schermo, tutta la pianta inquadrata. */
export function vistaDallAlto(limiti: Limiti3D, aspetto = 1, fov = 40): Telecamera3D {
  const c = centro(limiti);
  const larghezza = limiti.max[0] - limiti.min[0];
  const profondita = limiti.max[2] - limiti.min[2];
  const t = Math.tan((fov * Math.PI) / 360);
  const distanza = (Math.max(profondita, larghezza / Math.max(aspetto, 1e-3)) / 2 / t) * 1.12;
  return { posizione: [c[0], limiti.max[1] + distanza, c[2]], guarda: [c[0], 0, c[2]], alto: [0, 0, -1], fov };
}

/** Vista di tre quarti da sud-est, per girare intorno. */
export function vistaGiroIntorno(limiti: Limiti3D, aspetto = 1, fov = 45): Telecamera3D {
  const c = centro(limiti);
  const r = Math.hypot(limiti.max[0] - limiti.min[0], limiti.max[2] - limiti.min[2]) / 2;
  const d = (r / Math.tan((fov * Math.PI) / 360)) * (aspetto < 1 ? 1.5 : 1.05);
  const dir = unit([0.55, 0.75, 0.75]);
  return { posizione: [c[0] + dir[0] * d, dir[1] * d, c[2] + dir[2] * d], guarda: [c[0], 0.4, c[2]], fov };
}

function contornoM(l: LocalePer3D): V2[] {
  return pulisciPoligono(l.contorno.map((p) => v2(p.x * CM, p.y * CM)));
}

/**
 * «Entra nella stanza»: telecamera ad altezza d'occhi, vicino a un lato corto del
 * locale, che guarda verso il lato opposto lungo la dimensione più lunga.
 */
export function vistaDentroLocale(locale: LocalePer3D, fov = 70): Telecamera3D {
  const contorno = contornoM(locale);
  const c = puntoInterno(contorno);
  const { larghezza, direzione } = rettangoloMinimo(contorno);
  // Parte dal lato dove la stanza si estende di più, così l'inquadratura prende quasi tutto.
  let dir = direzione;
  const estensione = (d: V2) => Math.max(...contorno.map((p) => scalare(meno(p, c), d)));
  if (estensione(per(dir, -1)) > estensione(dir)) dir = per(dir, -1);
  const indietro = Math.max(0, Math.min(estensione(dir) - 0.35, larghezza * 0.45));
  let pos = piu(c, per(dir, indietro));
  if (!puntoNelPoligono(pos, contorno)) pos = c;
  const occhi = Math.min(ALTEZZA_OCCHI, (locale.altezza * CM) * 0.6);
  const avanti = per(dir, -1);
  return { posizione: [pos.x, occhi, pos.y], guarda: [pos.x + avanti.x, occhi * 0.92, pos.y + avanti.y], fov };
}

/** Proietta un punto come la PerspectiveCamera di three.js: x e y in [-1, 1] se è inquadrato. */
export function proietta(t: Telecamera3D, aspetto: number, p: V3): { x: number; y: number; profondita: number } {
  const f = unit(sub(t.guarda, t.posizione));
  const su = t.alto ?? [0, 1, 0];
  const r = unit(cross(f, su));
  const u = cross(r, f);
  const v = sub(p, t.posizione);
  const z = dot(v, f);
  const tv = Math.tan((t.fov * Math.PI) / 360);
  return { x: dot(v, r) / (z * tv * aspetto), y: dot(v, u) / (z * tv), profondita: z };
}

export interface AperturaLocale {
  id: string;
  tipo: TipoApertura;
  nome: string;
  muroId: string;
  larghezza_cm: number;
  altezza_cm: number;
  davanzale_cm: number;
  stato: AperturaPer3D["stato"];
  /** Angoli del vano sulla faccia del muro verso il locale, in metri. */
  angoli: [V3, V3, V3, V3];
}

/** Aperture sui muri che delimitano il locale, nella vista scelta. */
export function apertureDelLocale(pianta: PiantaPer3D, localeId: string, vista: Vista3D = "progetto"): AperturaLocale[] {
  const locale = pianta.locali.find((l) => l.id === localeId);
  if (!locale) return [];
  const contorno = contornoM(locale);
  const muri = new Map(muriCalcolati(pianta, vista).map((m) => [m.id, m]));
  const out: AperturaLocale[] = [];
  for (const a of pianta.aperture) {
    const m = muri.get(a.muroId);
    if (!m || comeApertura(a.stato, vista) !== "aperta") continue;
    const s = a.posizione * CM;
    const asse = piu(m.a, per(m.d, s));
    const prova = m.spessore / 2 + 0.05;
    const lato = puntoNelPoligono(piu(asse, per(m.n, prova)), contorno) ? 1 : puntoNelPoligono(piu(asse, per(m.n, -prova)), contorno) ? -1 : 0;
    if (lato === 0) continue;
    const faccia = (ds: number, y: number): V3 => {
      const p = piu(piu(m.a, per(m.n, (lato * m.spessore) / 2)), per(m.d, s + ds));
      return [p.x, y, p.y];
    };
    const h = a.larghezza * CM / 2;
    const z0 = a.davanzale * CM;
    const z1 = Math.min(m.altezza, (a.davanzale + a.altezza) * CM);
    out.push({
      id: a.id,
      tipo: a.tipo,
      nome: nomeApertura(a),
      muroId: a.muroId,
      larghezza_cm: a.larghezza,
      altezza_cm: a.altezza,
      davanzale_cm: a.davanzale,
      stato: a.stato,
      angoli: [faccia(-h, z0), faccia(h, z0), faccia(h, z1), faccia(-h, z1)],
    });
  }
  return out;
}

export interface MetadatiFotogramma {
  locale: {
    id: string;
    nome: string;
    destinazione: string;
    superficie_mq: number;
    perimetro_m: number;
    altezza_m: number;
    /** Lati del rettangolo che contiene il locale (per un locale rettangolare, le sue misure). */
    larghezza_m: number;
    profondita_m: number;
  };
  telecamera: Telecamera3D & { larghezza_px: number; altezza_px: number };
  vista: Vista3D;
  /** Aperture del locale che cadono nell'inquadratura. */
  aperture_visibili: {
    id: string;
    tipo: TipoApertura;
    nome: string;
    larghezza_cm: number;
    altezza_cm: number;
    davanzale_cm: number;
    /** Riquadro nell'immagine, in frazioni (0,0 in alto a sinistra; 1,1 in basso a destra). */
    riquadro: { x0: number; y0: number; x1: number; y1: number };
    posizione: "sinistra" | "centro" | "destra";
    distanza_m: number;
  }[];
  /** Tutte le aperture del locale, anche quelle alle spalle della telecamera. */
  aperture_del_locale: number;
}

const arrotonda = (x: number, cifre = 2) => Math.round(x * 10 ** cifre) / 10 ** cifre;

export function metadatiFotogramma(
  pianta: PiantaPer3D,
  localeId: string,
  telecamera: Telecamera3D,
  dimensioni: { larghezza: number; altezza: number },
  vista: Vista3D = "progetto",
): MetadatiFotogramma | null {
  const locale = pianta.locali.find((l) => l.id === localeId);
  if (!locale) return null;
  const contorno = contornoM(locale);
  const rett = rettangoloMinimo(contorno);
  const aspetto = dimensioni.larghezza / dimensioni.altezza;
  const aperture = apertureDelLocale(pianta, localeId, vista);
  const visibili: MetadatiFotogramma["aperture_visibili"] = [];
  for (const a of aperture) {
    const pr = a.angoli.map((p) => proietta(telecamera, aspetto, p));
    if (pr.some((p) => p.profondita <= 0.05)) continue;
    const xs = pr.map((p) => p.x);
    const ys = pr.map((p) => p.y);
    const x0 = Math.max(-1, Math.min(...xs));
    const x1 = Math.min(1, Math.max(...xs));
    const y0 = Math.max(-1, Math.min(...ys));
    const y1 = Math.min(1, Math.max(...ys));
    if (x1 <= x0 || y1 <= y0) continue;
    const cx = (x0 + x1) / 2;
    const centroApertura: V3 = [
      (a.angoli[0][0] + a.angoli[2][0]) / 2,
      (a.angoli[0][1] + a.angoli[2][1]) / 2,
      (a.angoli[0][2] + a.angoli[2][2]) / 2,
    ];
    visibili.push({
      id: a.id,
      tipo: a.tipo,
      nome: a.nome,
      larghezza_cm: a.larghezza_cm,
      altezza_cm: a.altezza_cm,
      davanzale_cm: a.davanzale_cm,
      riquadro: { x0: arrotonda((x0 + 1) / 2, 3), y0: arrotonda((1 - y1) / 2, 3), x1: arrotonda((x1 + 1) / 2, 3), y1: arrotonda((1 - y0) / 2, 3) },
      posizione: cx < -0.33 ? "sinistra" : cx > 0.33 ? "destra" : "centro",
      distanza_m: arrotonda(Math.hypot(...sub(centroApertura, telecamera.posizione))),
    });
  }
  return {
    locale: {
      id: locale.id,
      nome: locale.nome,
      destinazione: locale.destinazione,
      superficie_mq: arrotonda(Math.abs(areaConSegno(contorno))),
      perimetro_m: arrotonda(perimetro(contorno)),
      altezza_m: arrotonda(locale.altezza * CM),
      larghezza_m: arrotonda(rett.larghezza),
      profondita_m: arrotonda(rett.profondita),
    },
    telecamera: { ...telecamera, larghezza_px: dimensioni.larghezza, altezza_px: dimensioni.altezza },
    vista,
    aperture_visibili: visibili,
    aperture_del_locale: aperture.length,
  };
}
