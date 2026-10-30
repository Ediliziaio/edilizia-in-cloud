/**
 * Muri in 3D: incroci tra muri e muro estruso con i vani di porte e finestre.
 *
 * Tutto in metri, sul piano orizzontale (x, z) chiamato qui (x, y) per i vettori 2D.
 *
 * Ogni muro ha un asse a→b, una direzione d e un lato «più» n = d ruotato di +90°.
 * Le due facce lunghe stanno a ±spessore/2 da quell'asse; per ognuna si calcola dove
 * comincia e dove finisce (s, misurato lungo l'asse da a), così negli angoli le facce
 * si incontrano a 45° (o all'angolo giusto) senza buchi né sovrapposizioni, e un muro
 * che si appoggia di testa su un altro si ferma sulla sua faccia.
 */
import { CostruttoreMesh } from "./costruttore";
import {
  type V2,
  distanza,
  meno,
  normalizza,
  per,
  perpendicolare,
  piu,
  scalare,
  tagliaTraDue,
  vettoriale,
} from "./geometria2d";
import type { StatoOggetto, V3 } from "./tipi";

export interface MuroCalc {
  id: string;
  a: V2;
  b: V2;
  lunghezza: number;
  d: V2;
  n: V2;
  spessore: number;
  altezza: number;
  stato: StatoOggetto;
}

export interface EstremiMuro {
  /** Inizio e fine della faccia sul lato più e sul lato meno, misurati lungo l'asse. */
  piu0: number;
  piu1: number;
  meno0: number;
  meno1: number;
  /** Testata visibile (estremo libero). Negli incroci la testata resta nascosta e non si disegna. */
  tappoA: boolean;
  tappoB: boolean;
}

export interface NodoMuri {
  /** Poligono al centro di un incrocio di tre o più muri, da chiudere sopra e sotto. */
  contorno: V2[];
  altezza: number;
}

/** Vano nel muro, in coordinate del muro: s lungo l'asse, quote dal pavimento. */
export interface VanoMuro {
  id: string;
  s0: number;
  s1: number;
  z0: number;
  z1: number;
}

const TOLLERANZA_NODO = 0.02; // 2 cm: estremi più vicini di così sono lo stesso punto
const MITRA_MASSIMA = 3; // oltre 3 spessori lo spigolo vivo diventa una testata dritta

export function preparaMuro(m: { id: string; a: V2; b: V2; spessore: number; altezza: number; stato: StatoOggetto }): MuroCalc | null {
  const l = distanza(m.a, m.b);
  if (!(l > 1e-4) || !(m.spessore > 0) || !(m.altezza > 0)) return null;
  const d = normalizza(meno(m.b, m.a));
  return { ...m, lunghezza: l, d, n: perpendicolare(d) };
}

interface Incidenza {
  muro: MuroCalc;
  estremo: "a" | "b";
  /** Direzione che esce dal nodo lungo il muro. */
  u: V2;
  angolo: number;
}

/** Intersezione delle rette p + u·s e q + w·r; restituisce s e r, o null se parallele. */
function incrocia(p: V2, u: V2, q: V2, w: V2): { s: number; r: number } | null {
  const c = vettoriale(u, w);
  if (Math.abs(c) < 1e-9) return null;
  const k = meno(q, p);
  return { s: vettoriale(k, w) / c, r: vettoriale(k, u) / c };
}

export function calcolaIncroci(muri: MuroCalc[]): { estremi: Map<string, EstremiMuro>; nodi: NodoMuri[] } {
  const estremi = new Map<string, EstremiMuro>();
  for (const m of muri) estremi.set(m.id, { piu0: 0, piu1: m.lunghezza, meno0: 0, meno1: m.lunghezza, tappoA: true, tappoB: true });

  // Raggruppa gli estremi vicini in nodi.
  const nodi: { punto: V2; incidenze: Incidenza[] }[] = [];
  for (const m of muri) {
    for (const estremo of ["a", "b"] as const) {
      const punto = m[estremo];
      const u = estremo === "a" ? m.d : per(m.d, -1);
      const inc: Incidenza = { muro: m, estremo, u, angolo: Math.atan2(u.y, u.x) };
      const nodo = nodi.find((n) => distanza(n.punto, punto) <= TOLLERANZA_NODO);
      if (nodo) nodo.incidenze.push(inc);
      else nodi.push({ punto, incidenze: [inc] });
    }
  }

  /** Scrive i parametri, misurati dal nodo lungo u, sul lato sinistro (+90° da u) e destro. */
  const scrivi = (inc: Incidenza, sinistro: number | null, destro: number | null) => {
    const e = estremi.get(inc.muro.id)!;
    const L = inc.muro.lunghezza;
    const lim = (s: number) => Math.max(-MITRA_MASSIMA * inc.muro.spessore, Math.min(L / 2, s));
    if (inc.estremo === "a") {
      // u = d: il lato sinistro di u è il lato più del muro.
      if (sinistro !== null) e.piu0 = lim(sinistro);
      if (destro !== null) e.meno0 = lim(destro);
      e.tappoA = false;
    } else {
      // u = -d: il lato sinistro di u è il lato meno del muro.
      if (sinistro !== null) e.meno1 = L - lim(sinistro);
      if (destro !== null) e.piu1 = L - lim(destro);
      e.tappoB = false;
    }
  };

  const nodiCentrali: NodoMuri[] = [];
  for (const nodo of nodi) {
    const inc = nodo.incidenze;
    if (inc.length === 1) {
      // Estremo libero, oppure appoggiato di testa sulla faccia di un altro muro (incrocio a T).
      const { muro, u } = inc[0];
      const ospite = muri.find((h) => {
        if (h.id === muro.id) return false;
        const s = scalare(meno(nodo.punto, h.a), h.d);
        if (s <= TOLLERANZA_NODO || s >= h.lunghezza - TOLLERANZA_NODO) return false;
        return Math.abs(scalare(meno(nodo.punto, h.a), h.n)) <= h.spessore / 2 + TOLLERANZA_NODO;
      });
      if (!ospite) continue;
      const altroEstremo = inc[0].estremo === "a" ? muro.b : muro.a;
      const lato = Math.sign(scalare(meno(altroEstremo, ospite.a), ospite.n)) || 1;
      const faccia = piu(ospite.a, per(ospite.n, (lato * ospite.spessore) / 2));
      const sx = perpendicolare(u);
      const t = muro.spessore / 2;
      const s1 = incrocia(piu(nodo.punto, per(sx, t)), u, faccia, ospite.d);
      const s2 = incrocia(piu(nodo.punto, per(sx, -t)), u, faccia, ospite.d);
      if (s1 && s2) scrivi(inc[0], s1.s, s2.s);
      continue;
    }

    inc.sort((p, q) => p.angolo - q.angolo);
    const angoli: V2[] = [];
    for (let i = 0; i < inc.length; i++) {
      const p = inc[i];
      const q = inc[(i + 1) % inc.length];
      // Il lato sinistro di p guarda verso q; il lato destro di q guarda verso p.
      const P = piu(nodo.punto, per(perpendicolare(p.u), p.muro.spessore / 2));
      const Q = piu(nodo.punto, per(perpendicolare(q.u), -q.muro.spessore / 2));
      const x = incrocia(P, p.u, Q, q.u);
      if (x && Math.abs(x.s) <= MITRA_MASSIMA * p.muro.spessore && Math.abs(x.r) <= MITRA_MASSIMA * q.muro.spessore) {
        scrivi(p, x.s, null);
        scrivi(q, null, x.r);
        angoli.push(piu(P, per(p.u, x.s)));
      } else {
        // Muri in fila (o angolo troppo acuto): le facce si fermano sul nodo.
        scrivi(p, 0, null);
        scrivi(q, null, 0);
        angoli.push(P, Q);
      }
    }
    if (inc.length >= 3) {
      nodiCentrali.push({ contorno: angoli, altezza: Math.min(...inc.map((i) => i.muro.altezza)) });
    }
  }
  return { estremi, nodi: nodiCentrali };
}

/** Punto 3D sul lato `lato` (+1 / -1) del muro, alla progressiva s e alla quota y. */
function puntoFaccia(m: MuroCalc, lato: number, s: number, y: number): V3 {
  const p = piu(piu(m.a, per(m.n, (lato * m.spessore) / 2)), per(m.d, s));
  return [p.x, y, p.y];
}

/** Impronta del muro in pianta (quadrilatero), con le facce già tagliate negli incroci. */
export function improntaMuro(m: MuroCalc, e: EstremiMuro): V2[] {
  const p = (lato: number, s: number) => piu(piu(m.a, per(m.n, (lato * m.spessore) / 2)), per(m.d, s));
  return [p(1, e.piu0), p(1, e.piu1), p(-1, e.meno1), p(-1, e.meno0)];
}

/** Intervalli di [da, a] non coperti da quelli dati (ordinati, non sovrapposti). */
function scoperti(da: number, a: number, coperti: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  let cursore = da;
  for (const [x, y] of coperti) {
    if (x > cursore) out.push([cursore, Math.min(x, a)]);
    cursore = Math.max(cursore, y);
  }
  if (cursore < a) out.push([cursore, a]);
  return out.filter(([x, y]) => y - x > 1e-6);
}

/**
 * Muro estruso con i suoi vani. `vani` deve essere già ordinato e senza sovrapposizioni
 * (lo fa `sistemaVani`). Le facce dentro il vano (spallette, architrave, davanzale) vanno
 * nel costruttore `spallette` se dato (per colorarle a parte), altrimenti nel muro.
 */
export function costruisciMuro(m: MuroCalc, e: EstremiMuro, vani: VanoMuro[], muro: CostruttoreMesh, spallette?: (vano: VanoMuro) => CostruttoreMesh): void {
  const H = m.altezza;
  const eps = 1e-6;

  // Facce lunghe: colonne tra i bordi dei vani.
  for (const lato of [1, -1]) {
    const s0 = lato === 1 ? e.piu0 : e.meno0;
    const s1 = lato === 1 ? e.piu1 : e.meno1;
    const normale: V3 = [m.n.x * lato, 0, m.n.y * lato];
    const bordi = [s0, s1, ...vani.flatMap((v) => [v.s0, v.s1])].filter((s) => s >= s0 && s <= s1).sort((x, y) => x - y);
    for (let i = 0; i + 1 < bordi.length; i++) {
      const p = bordi[i];
      const q = bordi[i + 1];
      if (q - p < eps) continue;
      const mezzo = (p + q) / 2;
      const vano = vani.find((v) => v.s0 <= mezzo && mezzo <= v.s1);
      const strisce: [number, number][] = vano ? [[0, vano.z0], [vano.z1, H]] : [[0, H]];
      for (const [y0, y1] of strisce) {
        if (y1 - y0 < eps) continue;
        muro.quad(puntoFaccia(m, lato, p, y0), puntoFaccia(m, lato, q, y0), puntoFaccia(m, lato, q, y1), puntoFaccia(m, lato, p, y1), normale);
      }
    }
  }

  // Sopra e sotto: l'impronta, interrotta dove un vano arriva in cima o a terra.
  const impronta = improntaMuro(m, e);
  const sMin = Math.min(e.piu0, e.meno0);
  const sMax = Math.max(e.piu1, e.meno1);
  const fasce = (vaniCheTagliano: VanoMuro[]) => scoperti(sMin, sMax, vaniCheTagliano.map((v) => [v.s0, v.s1] as [number, number]));
  for (const [da, a] of fasce(vani.filter((v) => v.z1 >= H - eps))) {
    const pezzo = tagliaTraDue(impronta, m.a, m.d, da, a);
    muro.poligono(pezzo.map((p) => [p.x, H, p.y] as V3), [0, 1, 0]);
  }
  for (const [da, a] of fasce(vani.filter((v) => v.z0 <= eps))) {
    const pezzo = tagliaTraDue(impronta, m.a, m.d, da, a);
    muro.poligono(pezzo.map((p) => [p.x, 0, p.y] as V3), [0, -1, 0]);
  }

  // Testate libere.
  const dir: V3 = [m.d.x, 0, m.d.y];
  if (e.tappoA) {
    muro.quad(puntoFaccia(m, 1, e.piu0, 0), puntoFaccia(m, -1, e.meno0, 0), puntoFaccia(m, -1, e.meno0, H), puntoFaccia(m, 1, e.piu0, H), [-dir[0], 0, -dir[2]]);
  }
  if (e.tappoB) {
    muro.quad(puntoFaccia(m, 1, e.piu1, 0), puntoFaccia(m, -1, e.meno1, 0), puntoFaccia(m, -1, e.meno1, H), puntoFaccia(m, 1, e.piu1, H), dir);
  }

  // Dentro i vani: spallette, architrave, davanzale.
  for (const v of vani) {
    const c = spallette ? spallette(v) : muro;
    const z1 = Math.min(v.z1, H);
    c.quad(puntoFaccia(m, 1, v.s0, v.z0), puntoFaccia(m, -1, v.s0, v.z0), puntoFaccia(m, -1, v.s0, z1), puntoFaccia(m, 1, v.s0, z1), dir);
    c.quad(puntoFaccia(m, 1, v.s1, v.z0), puntoFaccia(m, -1, v.s1, v.z0), puntoFaccia(m, -1, v.s1, z1), puntoFaccia(m, 1, v.s1, z1), [-dir[0], 0, -dir[2]]);
    if (v.z1 < H - eps) {
      c.quad(puntoFaccia(m, 1, v.s0, v.z1), puntoFaccia(m, 1, v.s1, v.z1), puntoFaccia(m, -1, v.s1, v.z1), puntoFaccia(m, -1, v.s0, v.z1), [0, -1, 0]);
    }
    if (v.z0 > eps) {
      c.quad(puntoFaccia(m, 1, v.s0, v.z0), puntoFaccia(m, 1, v.s1, v.z0), puntoFaccia(m, -1, v.s1, v.z0), puntoFaccia(m, -1, v.s0, v.z0), [0, 1, 0]);
    }
  }
}

/** Vetro a metà spessore del muro, visibile dai due lati. */
export function costruisciVetro(m: MuroCalc, v: VanoMuro, c: CostruttoreMesh): void {
  const p = (s: number, y: number) => puntoFaccia(m, 0, s, y);
  const n: V3 = [m.n.x, 0, m.n.y];
  c.quad(p(v.s0, v.z0), p(v.s1, v.z0), p(v.s1, v.z1), p(v.s0, v.z1), n);
  c.quad(p(v.s0, v.z0), p(v.s1, v.z0), p(v.s1, v.z1), p(v.s0, v.z1), [-n[0], 0, -n[2]]);
}

/** Muratura che chiude un vano (tamponamento). */
export function costruisciTamponamento(m: MuroCalc, v: VanoMuro, c: CostruttoreMesh): void {
  const mezzo = piu(m.a, per(m.d, (v.s0 + v.s1) / 2));
  const rot = Math.atan2(m.d.y, m.d.x);
  c.scatola(mezzo.x, mezzo.y, v.z0, v.s1 - v.s0, m.spessore, v.z1 - v.z0, rot);
}

/**
 * Riporta i vani dentro il tratto pieno del muro e toglie quelli sovrapposti.
 * Restituisce i vani buoni e gli avvisi per quelli corretti o scartati.
 */
export function sistemaVani(m: MuroCalc, e: EstremiMuro, richiesti: (VanoMuro & { nome: string })[]): { vani: VanoMuro[]; avvisi: string[] } {
  const avvisi: string[] = [];
  const margine = 0.01;
  const da = Math.max(e.piu0, e.meno0, 0) + margine;
  const a = Math.min(e.piu1, e.meno1, m.lunghezza) - margine;
  const buoni: VanoMuro[] = [];
  for (const r of [...richiesti].sort((x, y) => x.s0 - y.s0)) {
    let { s0, s1 } = r;
    const z0 = Math.max(0, r.z0);
    const z1 = Math.min(m.altezza, r.z1);
    if (s0 < da || s1 > a) {
      avvisi.push(`${r.nome}: esce dal muro, ridotta alla parte che ci sta.`);
      s0 = Math.max(s0, da);
      s1 = Math.min(s1, a);
    }
    if (s1 - s0 < 0.05 || z1 - z0 < 0.05) {
      avvisi.push(`${r.nome}: non ci sta nel muro, non disegnata.`);
      continue;
    }
    const prima = buoni[buoni.length - 1];
    if (prima && s0 < prima.s1 + margine) {
      avvisi.push(`${r.nome}: si sovrappone a un'altra apertura dello stesso muro, non disegnata.`);
      continue;
    }
    buoni.push({ id: r.id, s0, s1, z0, z1 });
  }
  return { vani: buoni, avvisi };
}

