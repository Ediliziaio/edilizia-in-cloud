import type { ElementoPer3D, LocalePer3D, PiantaPer3D, Telecamera3D, V3, Vista3D } from "./tipi";
import { modelloElemento } from "./elementi";
import { puntoNelPoligono, v2, type V2 } from "./geometria2d";
import { ALTEZZA_OCCHI, apertureDelLocale, proietta, vistaDentroLocale } from "./telecamera";

interface Ingombro {
  elemento: ElementoPer3D; centro: V2; l: number; p: number; h: number; cos: number; sin: number; peso: number;
}
const PESI: Record<string, number> = { wc: 5, bidet: 3, lavabo: 5, doccia: 4, vasca: 4, scrivania: 6, libreria: 3, armadio: 1, lavatrice: 1, sedia: 1 };
const NOMI: Record<string, string> = { wc: "WC / TOILET", bidet: "BIDET", lavabo: "WASHBASIN", doccia: "SHOWER", lavatrice: "WASHING MACHINE", scrivania: "DESK", libreria: "BOOKCASE", armadio: "WARDROBE", vasca: "BATHTUB" };

function ingombri(pianta: PiantaPer3D, locale: LocalePer3D): Ingombro[] {
  return pianta.elementi.filter((e) => e.localeId ? e.localeId === locale.id : puntoNelPoligono(e.centro, locale.contorno)).map((e) => {
    const modello = modelloElemento(e.tipo), m = modello.misure, r = e.rotazione * Math.PI / 180;
    const l = (e.larghezza ?? m.l * 100) / 100, p = (e.profondita ?? m.p * 100) / 100, h = (e.altezza ?? m.h * 100) / 100;
    return { elemento: e, centro: v2(e.centro.x / 100, e.centro.y / 100), l,
      p, h: Math.max(h, ...modello.blocchi(l, p, h).map((b) => b.y + b.h)), cos: Math.cos(r), sin: Math.sin(r), peso: PESI[e.tipo] ?? 1 };
  });
}
function coordinateLocali(p: V2, e: Ingombro): V2 {
  const x = p.x - e.centro.x, y = p.y - e.centro.y;
  return v2(x * e.cos + y * e.sin, -x * e.sin + y * e.cos);
}
function distanzaSegmento(p: V2, a: V2, b: V2): number {
  const x = b.x - a.x, y = b.y - a.y, l2 = x * x + y * y;
  const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * x + (p.y - a.y) * y) / l2)) : 0;
  return Math.hypot(p.x - a.x - t * x, p.y - a.y - t * y);
}
function intercettaArredo(da: V3, a: V3, e: Ingombro): boolean {
  const p = coordinateLocali(v2(da[0], da[2]), e), q = coordinateLocali(v2(a[0], a[2]), e);
  let entrata = 0, uscita = 1;
  for (const [inizio, fine, min, max] of [[p.x, q.x, -e.l / 2, e.l / 2], [p.y, q.y, -e.p / 2, e.p / 2], [da[1], a[1], 0, e.h]]) {
    const delta = fine - inizio;
    if (Math.abs(delta) < 1e-8) { if (inizio < min || inizio > max) return false; continue; }
    const t0 = (min - inizio) / delta, t1 = (max - inizio) / delta;
    entrata = Math.max(entrata, Math.min(t0, t1)); uscita = Math.min(uscita, Math.max(t0, t1));
    if (uscita < entrata) return false;
  }
  return entrata < 0.98 && uscita > 0.01;
}
function puntiArredo(e: Ingombro): V3[] {
  const punti: V3[] = [];
  for (const x of [-0.45, 0, 0.45]) for (const y of [-0.45, 0.45]) for (const z of [0.15, 0.9]) {
    punti.push([e.centro.x + x * e.l * e.cos - y * e.p * e.sin, e.h * z, e.centro.y + x * e.l * e.sin + y * e.p * e.cos]);
  }
  return punti;
}
function segmentoNelLocale(da: V3, a: V3, contorno: V2[]): boolean {
  for (let i = 1; i <= 12; i++) if (!puntoNelPoligono(v2(da[0] + (a[0] - da[0]) * i / 12, da[2] + (a[2] - da[2]) * i / 12), contorno)) return false;
  return true;
}

/** Visibilità stimata degli ingombri: utile per confrontare le viste, non certifica le misure. */
export function arrediInquadrati(pianta: PiantaPer3D, locale: LocalePer3D, camera: Telecamera3D, aspetto = 1.5) {
  const oggetti = ingombri(pianta, locale), contorno = locale.contorno.map((p) => v2(p.x / 100, p.y / 100));
  return oggetti.map((e) => {
    const punti = puntiArredo(e);
    const proiezioni = punti.map((p) => proietta(camera, aspetto, p)).filter((p) => p.profondita > .15);
    const areaNelFotogramma = proiezioni.length ? Math.max(0, Math.min(1, Math.max(...proiezioni.map((p) => p.x))) - Math.max(-1, Math.min(...proiezioni.map((p) => p.x)))) * Math.max(0, Math.min(1, Math.max(...proiezioni.map((p) => p.y))) - Math.max(-1, Math.min(...proiezioni.map((p) => p.y)))) / 4 : 0;
    let dietroVetro = 0, inFotogramma = 0;
    const visibili = punti.filter((p) => {
      const q = proietta(camera, aspetto, p);
      const inquadrato = q.profondita > 0.15 && Math.abs(q.x) < 0.93 && Math.abs(q.y) < 0.93;
      if (inquadrato) inFotogramma++;
      const visibile = inquadrato && segmentoNelLocale(camera.posizione, p, contorno)
        && !oggetti.some((altro) => altro !== e && altro.elemento.tipo !== "doccia" && intercettaArredo(camera.posizione, p, altro));
      if (visibile && oggetti.some((altro) => altro !== e && altro.elemento.tipo === "doccia" && intercettaArredo(camera.posizione, p, altro))) dietroVetro++;
      return visibile;
    }).length;
    return { id: e.elemento.id, tipo: e.elemento.tipo, peso: e.peso, quotaVisibile: visibili / punti.length, quotaDietroVetro: dietroVetro / punti.length, quotaNelFotogramma: inFotogramma / punti.length, areaNelFotogramma };
  });
}

/** Posizioni nel fotogramma reale, non una nuova disposizione suggerita all'AI. */
export function descrizioneArrediInquadrati(pianta: PiantaPer3D, localeId: string, camera: Telecamera3D, aspetto = 1.5): string {
  const locale = pianta.locali.find((l) => l.id === localeId);
  if (!locale) return "";
  const nomi: Record<string, string> = { wc: "WC/toilet with cistern", bidet: "bidet", lavabo: "washbasin/vanity", doccia: "shower enclosure", lavatrice: "washing machine", scrivania: "desk", libreria: "bookcase with shelves", armadio: "wardrobe", vasca: "bathtub" };
  const visibili = arrediInquadrati(pianta, locale, camera, aspetto);
  const righe = ingombri(pianta, locale).filter((e) => nomi[e.elemento.tipo] && visibili.find((v) => v.id === e.elemento.id)!.quotaVisibile >= .25).map((e) => {
    const p = proietta(camera, aspetto, [e.centro.x, e.h / 2, e.centro.y]);
    const x = Math.round(Math.max(0, Math.min(1, (p.x + 1) / 2)) * 100), y = Math.round(Math.max(0, Math.min(1, (1 - p.y) / 2)) * 100);
    return `${nomi[e.elemento.tipo]}: image centre x=${x}%, y=${y}% (origin top left), footprint ${Math.round(e.l * 100)}x${Math.round(e.p * 100)} cm`;
  });
  return righe.length ? `AUTHORITATIVE SOURCE FIXTURE POSITIONS: ${righe.join("; ")}. Keep each item at its own source position and orientation. Never swap toilet, bidet, washbasin or washing machine. Preserve partial crops at the frame edge. The 3D blocks identify these exact objects, not interchangeable cabinets. Source labels identify the existing objects: REMOVE all labels and leader lines from the final photograph while keeping those objects in place.` : "";
}

export function etichetteArrediInquadrati(pianta: PiantaPer3D, localeId: string, camera: Telecamera3D, aspetto: number) {
  const locale = pianta.locali.find((l) => l.id === localeId);
  if (!locale || !["bagno", "studio"].includes(locale.destinazione)) return [];
  const visibili = arrediInquadrati(pianta, locale, camera, aspetto);
  return ingombri(pianta, locale).filter((e) => NOMI[e.elemento.tipo] && visibili.find((v) => v.id === e.elemento.id)!.quotaVisibile >= .25).map((e) => {
    const p = proietta(camera, aspetto, [e.centro.x, e.h / 2, e.centro.y]);
    return { id: e.elemento.id, nome: NOMI[e.elemento.tipo], x: Math.max(.05, Math.min(.95, (p.x + 1) / 2)), y: Math.max(.05, Math.min(.95, (1 - p.y) / 2)) };
  });
}

/** Cerca un punto libero e guarda sanitari/scrivania, senza spostare alcun oggetto. */
export function vistaInternaArredata(pianta: PiantaPer3D, localeId: string, opzioni: { vista?: Vista3D; aspetto?: number; fov?: number } = {}): Telecamera3D {
  const locale = pianta.locali.find((l) => l.id === localeId);
  if (!locale) throw new Error("Stanza non trovata per l'inquadratura.");
  const { fov = locale.destinazione === "bagno" ? 78 : 70, aspetto = 1.5, vista = "fatto" } = opzioni;
  const base = vistaDentroLocale(locale, fov);
  if (!["bagno", "studio"].includes(locale.destinazione)) return base;
  const elementi = ingombri(pianta, locale);
  if (!elementi.length) return base;
  const contorno = locale.contorno.map((p) => v2(p.x / 100, p.y / 100));
  const xs = contorno.map((p) => p.x), ys = contorno.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const peso = elementi.reduce((s, e) => s + e.peso, 0);
  const centro: V3 = [elementi.reduce((s, e) => s + e.centro.x * e.peso, 0) / peso, Math.max(0.65, Math.min(1.05, elementi.reduce((s, e) => s + e.h * .55 * e.peso, 0) / peso)), elementi.reduce((s, e) => s + e.centro.y * e.peso, 0) / peso];
  const sguardi: V3[] = [centro, ...elementi.filter((e) => e.peso >= 3).flatMap((e) => [.3, .6].map((q): V3 => [centro[0] * (1 - q) + e.centro.x * q, centro[1], centro[2] * (1 - q) + e.centro.y * q]))];
  const aperture = apertureDelLocale(pianta, locale.id, vista);
  const muri = pianta.muri.filter((m) => vista === "fatto" ? m.stato !== "nuovo" : vista === "progetto" ? m.stato !== "demolire" : true);
  let migliore = base, punteggio = -Infinity;
  const passiX = Math.min(40, Math.max(2, Math.ceil((maxX - minX) / .12))), passiY = Math.min(40, Math.max(2, Math.ceil((maxY - minY) / .12)));
  for (let i = 0; i <= passiX; i++) for (let j = 0; j <= passiY; j++) {
    const p = v2(minX + (maxX - minX) * i / passiX, minY + (maxY - minY) * j / passiY);
    if (!puntoNelPoligono(p, contorno) || contorno.some((a, k) => distanzaSegmento(p, a, contorno[(k + 1) % contorno.length]) < 0.18)) continue;
    if (muri.some((m) => distanzaSegmento(p, v2(m.a.x / 100, m.a.y / 100), v2(m.b.x / 100, m.b.y / 100)) < m.spessore / 200 + .16)) continue;
    if (elementi.some((e) => { const q = coordinateLocali(p, e); return Math.abs(q.x) < e.l / 2 + .18 && Math.abs(q.y) < e.p / 2 + .18; })) continue;
    for (const guarda of sguardi) {
      const distanza = Math.hypot(guarda[0] - p.x, guarda[2] - p.y);
      if (distanza < .7) continue;
      const t: Telecamera3D = { posizione: [p.x, Math.min(locale.destinazione === "bagno" ? 1.85 : ALTEZZA_OCCHI, locale.altezza / 100 * .7), p.y], guarda, fov };
      const visibili = arrediInquadrati(pianta, locale, t, aspetto);
      let s = visibili.reduce((n, e) => n + e.peso * (e.quotaVisibile - e.quotaDietroVetro * .6) + (e.quotaVisibile >= .5 ? .6 : 0), 0);
      // Un arredo principale nascosto vale più di un'inquadratura con più finestre.
      s -= visibili.filter((e) => e.peso >= 3).reduce((n, e) => n + Math.max(0, .5 - e.quotaVisibile) * 12, 0);
      s -= visibili.filter((e) => e.peso >= 3).reduce((n, e) => n + (1 - e.quotaNelFotogramma) * e.peso, 0);
      s += visibili.filter((e) => e.peso >= 3).reduce((n, e) => n + e.peso * Math.sqrt(e.areaNelFotogramma) * e.quotaVisibile * 2, 0);
      s -= visibili.filter((e) => e.peso < 3).reduce((n, e) => n + e.areaNelFotogramma * 8, 0);
      s += aperture.filter((a) => { const q = proietta(t, aspetto, a.angoli[0].map((v, k) => (v + a.angoli[2][k]) / 2) as V3); return q.profondita > .2 && Math.abs(q.x) < .9 && Math.abs(q.y) < .9; }).length * .2;
      if (s > punteggio) { punteggio = s; migliore = t; }
    }
  }
  return migliore;
}
