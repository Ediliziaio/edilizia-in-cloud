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
  const alto = limiti.max[1] - limiti.min[1];
  // un piano solo: si guarda poco sopra il pavimento; un edificio (più piani, o un attico in
  // alto) si guarda a metà altezza, e la distanza tiene conto anche dell'altezza
  const edificio = alto > 4 || limiti.min[1] > 1;
  const r = edificio ? Math.hypot(limiti.max[0] - limiti.min[0], limiti.max[2] - limiti.min[2], alto) / 2 : Math.hypot(limiti.max[0] - limiti.min[0], limiti.max[2] - limiti.min[2]) / 2;
  const d = (r / Math.tan((fov * Math.PI) / 360)) * (aspetto < 1 ? 1.5 : 1.05);
  const dir = unit([0.55, 0.75, 0.75]);
  const y = edificio ? c[1] : 0.4;
  return { posizione: [c[0] + dir[0] * d, y - 0.4 + dir[1] * d, c[2] + dir[2] * d], guarda: [c[0], y, c[2]], fov };
}

export type LatoEsterno = "sud" | "est" | "nord" | "ovest";

/**
 * Dal giardino, come una foto fatta da terra: un poco più alta degli occhi (2,2 m), a qualche
 * metro dalla casa sul lato scelto (sud = in basso sulla pianta), che guarda il centro.
 * È la foto di partenza per i render di piscine, pergole, giardini e facciate.
 */
export function vistaDalGiardino(limiti: Limiti3D, lato: LatoEsterno = "sud", fov = 60, casa: Limiti3D = limiti): Telecamera3D {
  const c = centro(casa);
  const t = Math.tan((fov * Math.PI) / 360);
  const verso: Record<LatoEsterno, [number, number]> = { sud: [0, 1], nord: [0, -1], est: [1, 0], ovest: [-1, 0] };
  const [dx, dz] = verso[lato];
  const largo = dx === 0 ? (casa.max[0] - casa.min[0]) / 2 : (casa.max[2] - casa.min[2]) / 2;
  // dal bordo della casa a quello di tutto (giardino, piscina, siepe di confine) su quel lato
  const bordoCasa = dx > 0 ? casa.max[0] : dx < 0 ? -casa.min[0] : dz > 0 ? casa.max[2] : -casa.min[2];
  const bordoTutto = dx > 0 ? limiti.max[0] : dx < 0 ? -limiti.min[0] : dz > 0 ? limiti.max[2] : -limiti.min[2];
  const giardino = Math.max(0, bordoTutto - bordoCasa);
  // abbastanza lontano da vedere tutta la casa (aspetto 4:3), ma dentro il giardino: la siepe
  // o la recinzione di confine resta alle spalle, non davanti all'obiettivo
  // tutta la facciata in altezza (con più piani conta più della larghezza)
  const altoCasa = casa.max[1] - Math.max(0, casa.min[1]);
  const serve = Math.max(6, (largo / (t * 4 / 3)) * 1.05, (altoCasa / 2 / t) * 1.15);
  const d = giardino > 6 ? Math.min(serve, giardino * 0.8) : serve;
  const dc = dx === 0 ? (casa.max[2] - casa.min[2]) / 2 : (casa.max[0] - casa.min[0]) / 2;
  const guardaY = altoCasa > 4 ? Math.max(1.2, altoCasa * 0.42) : 1.2;
  return { posizione: [c[0] + dx * (dc + d), 2.2, c[2] + dz * (dc + d)], guarda: [c[0], guardaY, c[2]], fov };
}

function contornoM(l: LocalePer3D): V2[] {
  return pulisciPoligono(l.contorno.map((p) => v2(p.x * CM, p.y * CM)));
}

/**
 * Si può fare questo passo? Camminando nel 3D i muri bloccano e si passa solo da porte, varchi e portefinestre
 * (le finestre no). Prima la telecamera attraversava i muri e dopo 30 passi era fuori dalla casa, nel vuoto.
 * `da` e `a` sono posizioni della telecamera ([x, altezza, y] in metri): conta il piano.
 */
export function passoLibero(pianta: PiantaPer3D, vista: Vista3D, da: V3, a: V3): boolean {
  const p0 = { x: da[0] * 100, y: da[2] * 100 };
  const p1 = { x: a[0] * 100, y: a[2] * 100 };
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  // dalla soglia di una porta d'ingresso non si esce dalla casa: i muri si vedono solo da dentro, fuori resterebbe il vuoto
  if (pianta.muri.length) {
    const xs = pianta.muri.flatMap((m) => [m.a.x, m.b.x]);
    const ys = pianta.muri.flatMap((m) => [m.a.y, m.b.y]);
    const margine = 0;
    if (p1.x < Math.min(...xs) - margine || p1.x > Math.max(...xs) + margine || p1.y < Math.min(...ys) - margine || p1.y > Math.max(...ys) + margine) return false;
  }
  for (const m of pianta.muri) {
    // nello stato di fatto contano i muri da demolire, nel progetto quelli nuovi; nel confronto entrambi
    if (vista === "fatto" && m.stato === "nuovo") continue;
    if (vista === "progetto" && m.stato === "demolire") continue;
    const ex = m.b.x - m.a.x;
    const ey = m.b.y - m.a.y;
    const lung = Math.hypot(ex, ey);
    if (lung < 1) continue;
    const den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-9) continue; // parallelo
    const t = ((m.a.x - p0.x) * ey - (m.a.y - p0.y) * ex) / den; // lungo il passo
    const u = ((m.a.x - p0.x) * dy - (m.a.y - p0.y) * dx) / den; // lungo il muro
    if (t < 0 || t > 1 || u < 0 || u > 1) continue;
    const alMuro = u * lung;
    const varco = pianta.aperture.some((ap) =>
      ap.muroId === m.id && ap.tipo !== "finestra" && ap.stato !== "demolire" && Math.abs(ap.posizione - alMuro) <= ap.larghezza / 2);
    if (!varco) return false;
  }
  // Ci si ferma a 20 cm dalla faccia del muro, non sull'asse: dentro lo spessore del muro si vede solo il vuoto.
  // Ci si può sempre allontanare, anche se si parte vicino (la telecamera «entra» vicino a un lato corto).
  for (const m of pianta.muri) {
    if (vista === "fatto" && m.stato === "nuovo") continue;
    if (vista === "progetto" && m.stato === "demolire") continue;
    const ex = m.b.x - m.a.x;
    const ey = m.b.y - m.a.y;
    const lung2 = ex * ex + ey * ey;
    if (lung2 < 1) continue;
    const dist = (q: { x: number; y: number }) => {
      const t = Math.max(0, Math.min(1, ((q.x - m.a.x) * ex + (q.y - m.a.y) * ey) / lung2));
      return { d: Math.hypot(q.x - (m.a.x + t * ex), q.y - (m.a.y + t * ey)), alMuro: t * Math.sqrt(lung2) };
    };
    const nuova = dist(p1);
    const margine = m.spessore / 2 + 20;
    if (nuova.d >= margine || nuova.d >= dist(p0).d) continue;
    const inVarco = pianta.aperture.some((ap) =>
      ap.muroId === m.id && ap.tipo !== "finestra" && ap.stato !== "demolire" && Math.abs(ap.posizione - nuova.alMuro) <= ap.larghezza / 2);
    if (!inVarco) return false;
  }
  return true;
}

/**
 * In quale stanza si trova la telecamera: serve a «camminare» per la casa nel 3D e fare il render
 * da dove si è, senza dover dire a mano di quale stanza si tratta. `null` se si è fuori da ogni stanza
 * (corridoio non disegnato, esterno, muro).
 */
export function localeAllaPosizione(pianta: PiantaPer3D, posizione: V3): string | null {
  const x = posizione[0];
  const y = posizione[2];
  for (const l of pianta.locali) {
    const c = contornoM(l);
    let dentro = false;
    for (let i = 0, j = c.length - 1; i < c.length; j = i++) {
      const a = c[i];
      const b = c[j];
      if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) dentro = !dentro;
    }
    if (dentro) return l.id;
  }
  return null;
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
  /** La cattura può nascondere gli arredi: in quel caso non si inviano istruzioni che li aggiungano. */
  arredi_inclusi?: boolean;
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
    // Un vano laterale può attraversare il piano della telecamera: si ritaglia
    // la parte davanti agli occhi, senza scartare tutta la finestra visibile.
    const davanti: V3[] = [];
    for (let i = 0; i < a.angoli.length; i++) {
      const p = a.angoli[i], q = a.angoli[(i + 1) % a.angoli.length];
      const dp = proietta(telecamera, aspetto, p).profondita, dq = proietta(telecamera, aspetto, q).profondita;
      if (dp >= .05) davanti.push(p);
      if ((dp >= .05) !== (dq >= .05)) {
        const t = (.05 - dp) / (dq - dp);
        davanti.push(p.map((v, k) => v + (q[k] - v) * t) as V3);
      }
    }
    if (davanti.length < 3) continue;
    const pr = davanti.map((p) => proietta(telecamera, aspetto, p));
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
