/**
 * Planimetrie — geometria piana (cm, y verso l'alto). Funzioni pure, senza dipendenze.
 *
 * La parte non ovvia è `ricostruisciLocali`: dai muri ai contorni dei locali.
 *   1. Gli assi dei muri (tranne quelli da demolire) diventano un grafo: ogni muro si
 *      spezza dove ne incontra un altro (angolo, T, croce). Un capo che finisce dentro
 *      lo spessore di un altro muro si porta sul suo asse.
 *   2. Si tolgono i rami morti (muretti che non chiudono niente).
 *   3. Si percorrono le facce del grafo girando sempre il più possibile a sinistra:
 *      ogni faccia con area positiva è un locale; quella esterna ha area negativa.
 *   4. Ogni lato si sposta verso l'interno di mezzo spessore del suo muro e i lati
 *      spostati si intersecano: ne esce il contorno al filo interno.
 * Limiti noti: un pilastro isolato dentro una stanza non si sottrae; due muri
 * consecutivi allineati con spessori diversi danno un piccolo gradino nel contorno.
 */
import type { Apertura, Locale, Muro, Punto, StatoPianta } from "./modello.ts";

/** Tolleranza di contatto fra pareti, in cm. */
export const TOLLERANZA_CM = 1;
/** Distanza massima fra il lato di un'apertura e il contorno di un locale, in cm. */
export const TOLLERANZA_LOCALE_CM = 2;

export const distanza = (a: Punto, b: Punto) => Math.hypot(b.x - a.x, b.y - a.y);

export const lunghezzaMuro = (m: Pick<Muro, "p1" | "p2">) => distanza(m.p1, m.p2);

/** Area con segno (positiva se il contorno gira in senso antiorario). */
export function areaConSegno(pts: Punto[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

/** Area in cm², in qualunque verso. */
export const areaPoligono = (pts: Punto[]) => Math.abs(areaConSegno(pts));

/** Perimetro del poligono chiuso, in cm. */
export function perimetroPoligono(pts: Punto[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) s += distanza(pts[i], pts[(i + 1) % pts.length]);
  return s;
}

export function distanzaPuntoSegmento(p: Punto, a: Punto, b: Punto): number {
  return distanza(p, proiezioneSulSegmento(p, a, b).punto);
}

/** Il punto del segmento più vicino a p e il suo parametro t ∈ [0,1]. */
export function proiezioneSulSegmento(p: Punto, a: Punto, b: Punto): { punto: Punto; t: number } {
  const dx = b.x - a.x, dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return { punto: { x: a.x + dx * t, y: a.y + dy * t }, t };
}

/** Distanza di un punto dal bordo del poligono. */
export function distanzaDalContorno(p: Punto, pts: Punto[]): number {
  let min = Infinity;
  for (let i = 0; i < pts.length; i++) min = Math.min(min, distanzaPuntoSegmento(p, pts[i], pts[(i + 1) % pts.length]));
  return min;
}

export function puntoNelPoligono(p: Punto, pts: Punto[]): boolean {
  let dentro = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) dentro = !dentro;
  }
  return dentro;
}

/** Un punto sicuramente interno (anche per poligoni a L o a U), o null se il poligono è piatto. */
export function puntoInterno(pts: Punto[]): Punto | null {
  const ys = [...new Set(pts.map(p => p.y))].sort((a, b) => a - b);
  if (ys.length < 2) return null;
  const y = (ys[0] + ys[1]) / 2;
  const xs: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    if ((a.y > y) !== (b.y > y)) xs.push(a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y));
  }
  xs.sort((a, b) => a - b);
  return xs.length >= 2 ? { x: (xs[0] + xs[1]) / 2, y } : null;
}

const orient = (a: Punto, b: Punto, c: Punto) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);

/** I due segmenti si attraversano (non basta toccarsi in un estremo). */
export function segmentiSiIncrociano(a: Punto, b: Punto, c: Punto, d: Punto): boolean {
  const o1 = orient(a, b, c), o2 = orient(a, b, d), o3 = orient(c, d, a), o4 = orient(c, d, b);
  return o1 * o2 < 0 && o3 * o4 < 0;
}

/** Il contorno attraversa sé stesso (lati non consecutivi che si incrociano). */
export function contornoIncrociato(pts: Punto[]): boolean {
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (segmentiSiIncrociano(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n])) return true;
    }
  }
  return false;
}

/** Direzione unitaria dell'asse e normale a sinistra (guardando da p1 verso p2). */
export function assiDelMuro(m: Pick<Muro, "p1" | "p2">): { dir: Punto; normale: Punto } {
  const l = lunghezzaMuro(m) || 1;
  const dir = { x: (m.p2.x - m.p1.x) / l, y: (m.p2.y - m.p1.y) / l };
  return { dir, normale: { x: -dir.y, y: dir.x } };
}

/**
 * I due punti al centro del vano, sulle due facce della parete: [sinistra, destra]
 * guardando da p1 verso p2.
 */
export function facceDellApertura(a: Pick<Apertura, "offset" | "larghezza">, m: Muro): [Punto, Punto] {
  const { dir, normale } = assiDelMuro(m);
  const s = a.offset + a.larghezza / 2, h = m.spessore / 2;
  const c = { x: m.p1.x + dir.x * s, y: m.p1.y + dir.y * s };
  return [{ x: c.x + normale.x * h, y: c.y + normale.y * h }, { x: c.x - normale.x * h, y: c.y - normale.y * h }];
}

/**
 * Le aperture che danno sul locale: quelle con una faccia sul suo contorno. Una porta fra
 * due stanze appartiene a tutte e due. Pareti e aperture da demolire non contano.
 */
export function apertureDelLocale(locale: Locale, stato: StatoPianta, tolleranza = TOLLERANZA_LOCALE_CM): Apertura[] {
  const muri = new Map(stato.muri.filter(m => m.stato !== "da_demolire").map(m => [m.id, m]));
  return stato.aperture.filter(a => {
    if (a.stato === "da_demolire") return false;
    const m = muri.get(a.muroId);
    if (!m) return false;
    return facceDellApertura(a, m).some(f => distanzaDalContorno(f, locale.contorno) <= tolleranza);
  });
}

// ─── Ricostruzione dei locali ───────────────────────────────────────────────

export interface ContornoRicostruito {
  /** Al filo interno delle pareti, in senso antiorario. */
  contorno: Punto[];
  /** Lo stesso giro sugli assi delle pareti. */
  contornoAsse: Punto[];
  /** Le pareti che lo chiudono. */
  muriIds: string[];
}

interface Lato { da: number; a: number; muro: Muro }

export function ricostruisciLocali(muri: Muro[], tolleranza = TOLLERANZA_CM): ContornoRicostruito[] {
  const validi = muri.filter(m => m.stato !== "da_demolire" && lunghezzaMuro(m) > tolleranza);

  // 1a. Capi dentro lo spessore di un altro muro: si portano sul suo asse.
  const assi = validi.map(m => ({ p1: { ...m.p1 }, p2: { ...m.p2 } }));
  for (let i = 0; i < validi.length; i++) {
    for (const capo of ["p1", "p2"] as const) {
      for (let j = 0; j < validi.length; j++) {
        if (i === j) continue;
        const { punto } = proiezioneSulSegmento(assi[i][capo], validi[j].p1, validi[j].p2);
        const d = distanza(assi[i][capo], punto);
        if (d > tolleranza && d <= validi[j].spessore / 2 + tolleranza) { assi[i][capo] = punto; break; }
      }
    }
  }

  // 1b. Punti in cui spezzare ogni muro (parametro t lungo l'asse).
  const tagli: number[][] = validi.map(() => [0, 1]);
  for (let i = 0; i < validi.length; i++) {
    for (let j = i + 1; j < validi.length; j++) {
      const a = assi[i], b = assi[j];
      const r = { x: a.p2.x - a.p1.x, y: a.p2.y - a.p1.y }, s = { x: b.p2.x - b.p1.x, y: b.p2.y - b.p1.y };
      const den = r.x * s.y - r.y * s.x;
      const la = Math.hypot(r.x, r.y), lb = Math.hypot(s.x, s.y);
      if (Math.abs(den) > 1e-9 * la * lb) {
        const qp = { x: b.p1.x - a.p1.x, y: b.p1.y - a.p1.y };
        const t = (qp.x * s.y - qp.y * s.x) / den, u = (qp.x * r.y - qp.y * r.x) / den;
        const ea = tolleranza / la, eb = tolleranza / lb;
        if (t >= -ea && t <= 1 + ea && u >= -eb && u <= 1 + eb) {
          tagli[i].push(Math.max(0, Math.min(1, t)));
          tagli[j].push(Math.max(0, Math.min(1, u)));
        }
      }
      // capi che toccano l'altro asse (anche se allineati)
      for (const [x, y] of [[i, j], [j, i]]) {
        for (const capo of [assi[y].p1, assi[y].p2]) {
          const pr = proiezioneSulSegmento(capo, assi[x].p1, assi[x].p2);
          if (distanza(capo, pr.punto) <= tolleranza) tagli[x].push(pr.t);
        }
      }
    }
  }

  // 1c. Nodi (fusi entro la tolleranza) e lati.
  const nodi: Punto[] = [];
  const nodo = (p: Punto) => {
    const k = nodi.findIndex(n => distanza(n, p) <= tolleranza);
    if (k >= 0) return k;
    nodi.push(p);
    return nodi.length - 1;
  };
  const lati: Lato[] = [];
  const chiaviLati = new Set<string>();
  validi.forEach((m, i) => {
    const a = assi[i];
    const ts = [...new Set(tagli[i])].sort((x, y) => x - y);
    let prec = nodo(a.p1);
    for (const t of ts.slice(1)) {
      const k = nodo({ x: a.p1.x + (a.p2.x - a.p1.x) * t, y: a.p1.y + (a.p2.y - a.p1.y) * t });
      const chiave = prec < k ? `${prec}-${k}` : `${k}-${prec}`;
      if (k !== prec && !chiaviLati.has(chiave)) { chiaviLati.add(chiave); lati.push({ da: prec, a: k, muro: m }); }
      prec = k;
    }
  });

  // 2. Rami morti.
  let vivi = lati;
  for (;;) {
    const grado = new Map<number, number>();
    for (const l of vivi) { grado.set(l.da, (grado.get(l.da) ?? 0) + 1); grado.set(l.a, (grado.get(l.a) ?? 0) + 1); }
    const rimasti = vivi.filter(l => grado.get(l.da)! > 1 && grado.get(l.a)! > 1);
    if (rimasti.length === vivi.length) break;
    vivi = rimasti;
  }

  // 3. Facce.
  const uscenti = new Map<number, { verso: number; angolo: number; muro: Muro }[]>();
  const aggiungi = (da: number, a: number, muro: Muro) => {
    const lista = uscenti.get(da) ?? [];
    lista.push({ verso: a, angolo: Math.atan2(nodi[a].y - nodi[da].y, nodi[a].x - nodi[da].x), muro });
    uscenti.set(da, lista);
  };
  for (const l of vivi) { aggiungi(l.da, l.a, l.muro); aggiungi(l.a, l.da, l.muro); }
  for (const lista of uscenti.values()) lista.sort((x, y) => x.angolo - y.angolo);

  const percorsi = new Set<string>();
  const risultato: ContornoRicostruito[] = [];
  for (const [inizio, lista] of uscenti) {
    for (const primo of lista) {
      if (percorsi.has(`${inizio}>${primo.verso}`)) continue;
      const giro: number[] = [];
      const muriGiro: Muro[] = [];
      let da = inizio, verso = primo.verso, muro = primo.muro;
      while (!percorsi.has(`${da}>${verso}`)) {
        percorsi.add(`${da}>${verso}`);
        giro.push(da);
        muriGiro.push(muro);
        // al nodo d'arrivo: il primo lato in senso orario rispetto al ritorno
        const qui = uscenti.get(verso)!;
        const ritorno = qui.findIndex(u => u.verso === da);
        const prossimo = qui[(ritorno - 1 + qui.length) % qui.length];
        da = verso; verso = prossimo.verso; muro = prossimo.muro;
      }
      const asse = giro.map(k => nodi[k]);
      if (areaConSegno(asse) <= tolleranza * tolleranza) continue;
      risultato.push({
        contorno: spostaVersoInterno(asse, muriGiro),
        contornoAsse: asse.map(p => ({ ...p })),
        muriIds: [...new Set(muriGiro.map(m => m.id))],
      });
    }
  }
  return risultato;
}

/** Sposta ogni lato a sinistra (verso l'interno, giro antiorario) di mezzo spessore e interseca. */
function spostaVersoInterno(asse: Punto[], muri: Muro[]): Punto[] {
  const n = asse.length;
  const rette = asse.map((a, i) => {
    const b = asse[(i + 1) % n];
    const l = distanza(a, b);
    const d = { x: (b.x - a.x) / l, y: (b.y - a.y) / l };
    const h = muri[i].spessore / 2;
    return { p: { x: a.x - d.y * h, y: a.y + d.x * h }, d, h };
  });
  const out: Punto[] = [];
  for (let i = 0; i < n; i++) {
    const r1 = rette[(i - 1 + n) % n], r2 = rette[i];
    const den = r1.d.x * r2.d.y - r1.d.y * r2.d.x;
    if (Math.abs(den) < 1e-9) {
      // lati allineati: stesso spessore → nessun vertice; spessori diversi → gradino
      if (Math.abs(r1.h - r2.h) < 1e-9) continue;
      const v = asse[i];
      out.push({ x: v.x - r1.d.y * r1.h, y: v.y + r1.d.x * r1.h }, { x: v.x - r2.d.y * r2.h, y: v.y + r2.d.x * r2.h });
      continue;
    }
    const w = { x: r2.p.x - r1.p.x, y: r2.p.y - r1.p.y };
    const t = (w.x * r2.d.y - w.y * r2.d.x) / den;
    out.push({ x: r1.p.x + r1.d.x * t, y: r1.p.y + r1.d.y * t });
  }
  return out.map(p => ({ x: arrotondaCm(p.x), y: arrotondaCm(p.y) }));
}

const arrotondaCm = (v: number) => Math.round(v * 1000) / 1000 + 0;
