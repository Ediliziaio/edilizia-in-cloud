import type { ElementoPer3D, LocalePer3D, PiantaPer3D, Telecamera3D, V3, Vista3D } from "./tipi";
import { eAmbienteInterno } from "../../../../shared/planimetrie/modello";
import type { ArredoNelFotogramma } from "../../../../shared/render-planimetria/prompt";
import { chiaveModelloElemento, modelloElemento } from "./elementi";
import { puntoNelPoligono, v2, type V2 } from "./geometria2d";
import { muroPresente } from "./scena";
import { ALTEZZA_OCCHI, apertureDelLocale, proietta, vistaDentroLocale, type AperturaLocale } from "./telecamera";

interface Ingombro {
  elemento: ElementoPer3D; tipo: string; centro: V2; l: number; p: number; h: number; cos: number; sin: number; peso: number;
}
const PESI: Record<string, number> = { wc: 5, bidet: 3, lavabo: 5, doccia: 4, vasca: 4, scrivania: 6, libreria: 3, armadio: 3, lavatrice: 1, sedia: 1, letto: 6, comodino: 1, divano: 5, divano_angolare: 5, poltrona: 3, mobile_tv: 3, tavolo: 4, tavolo_rotondo: 4, cucina: 6, cucina_angolare: 6, isola_cucina: 4, frigorifero: 3 };

function ingombri(pianta: PiantaPer3D, locale: LocalePer3D): Ingombro[] {
  return pianta.elementi.filter((e) => e.localeId ? e.localeId === locale.id : puntoNelPoligono(e.centro, locale.contorno)).map((e) => {
    const modello = modelloElemento(e.tipo), m = modello.misure, r = e.rotazione * Math.PI / 180;
    const tipo = chiaveModelloElemento(e.tipo) ?? e.tipo;
    const l = (e.larghezza ?? m.l * 100) / 100, p = (e.profondita ?? m.p * 100) / 100, h = (e.altezza ?? m.h * 100) / 100;
    const peso = tipo === "armadio" && locale.destinazione === "studio" ? 1 : tipo === "scrivania" && locale.destinazione === "camera" ? 2 : PESI[tipo] ?? 1;
    const hVisibile = tipo === "wc" && (e.modello === "sospeso" || e.modello === "filo_muro")
      ? h : Math.max(h, ...modello.blocchi(l, p, h).map((b) => b.y + b.h));
    return { elemento: e, tipo, centro: v2(e.centro.x / 100, e.centro.y / 100), l,
      p, h: hVisibile, cos: Math.cos(r), sin: Math.sin(r), peso };
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
function segmentoNelLocale(da: V3, a: V3, contorno: V2[], frazione = 1): boolean {
  for (let i = 1; i <= 12; i++) if (!puntoNelPoligono(v2(da[0] + (a[0] - da[0]) * i / 12 * frazione, da[2] + (a[2] - da[2]) * i / 12 * frazione), contorno)) return false;
  return true;
}

function* puntiCamera(pianta: PiantaPer3D, vista: Vista3D, contorno: V2[], elementi: Ingombro[], passo: number) {
  const xs = contorno.map(p => p.x), ys = contorno.map(p => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const muri = pianta.muri.filter(m => muroPresente(m.stato, vista)).map(m => ({
    a: v2(m.a.x / 100, m.a.y / 100), b: v2(m.b.x / 100, m.b.y / 100), margine: m.spessore / 200 + .16,
  }));
  const passiX = Math.min(40, Math.max(2, Math.ceil((maxX - minX) / passo)));
  const passiY = Math.min(40, Math.max(2, Math.ceil((maxY - minY) / passo)));
  for (let i = 0; i <= passiX; i++) for (let j = 0; j <= passiY; j++) {
    const p = v2(minX + (maxX - minX) * i / passiX, minY + (maxY - minY) * j / passiY);
    if (!puntoNelPoligono(p, contorno) || contorno.some((a, k) => distanzaSegmento(p, a, contorno[(k + 1) % contorno.length]) < .18)) continue;
    if (muri.some(m => distanzaSegmento(p, m.a, m.b) < m.margine)) continue;
    if (elementi.some(e => {
      const q = coordinateLocali(p, e);
      return Math.abs(q.x) < e.l / 2 + .18 && Math.abs(q.y) < e.p / 2 + .18;
    })) continue;
    yield p;
  }
}

/** Visibilità stimata degli ingombri: utile per confrontare le viste, non certifica le misure. */
export function arrediInquadrati(pianta: PiantaPer3D, locale: LocalePer3D, camera: Telecamera3D, aspetto = 1.5) {
  return stimaVisibilitaArredi(ingombri(pianta, locale), locale.contorno.map(p => v2(p.x / 100, p.y / 100)), camera, aspetto);
}

function stimaVisibilitaArredi(oggetti: Ingombro[], contorno: V2[], camera: Telecamera3D, aspetto: number) {
  return oggetti.map((e) => {
    const punti = puntiArredo(e);
    const campioni = punti.map(p => ({ p, q: proietta(camera, aspetto, p) }));
    const proiezioni = campioni.map(c => c.q).filter(p => p.profondita > .15);
    const areaNelFotogramma = proiezioni.length ? Math.max(0, Math.min(1, Math.max(...proiezioni.map((p) => p.x))) - Math.max(-1, Math.min(...proiezioni.map((p) => p.x)))) * Math.max(0, Math.min(1, Math.max(...proiezioni.map((p) => p.y))) - Math.max(-1, Math.min(...proiezioni.map((p) => p.y)))) / 4 : 0;
    let dietroVetro = 0, inFotogramma = 0, x = 0, y = 0;
    const visibili = campioni.filter(({ p, q }) => {
      const inquadrato = q.profondita > 0.15 && Math.abs(q.x) < 0.93 && Math.abs(q.y) < 0.93;
      if (inquadrato) inFotogramma++;
      const visibile = inquadrato && segmentoNelLocale(camera.posizione, p, contorno)
        && !oggetti.some((altro) => altro !== e && altro.elemento.tipo !== "doccia" && intercettaArredo(camera.posizione, p, altro));
      if (visibile) {
        x += q.x;
        y += q.y;
        if (oggetti.some(altro => altro !== e && altro.elemento.tipo === "doccia" && intercettaArredo(camera.posizione, p, altro))) dietroVetro++;
      }
      return visibile;
    }).length;
    const centroVisibile = visibili ? { x: (x / visibili + 1) / 2, y: (1 - y / visibili) / 2 } : null;
    const ritagliato = proiezioni.length < campioni.length || proiezioni.some(q => Math.abs(q.x) > 1 || Math.abs(q.y) > 1);
    return { id: e.elemento.id, tipo: e.elemento.tipo, peso: e.peso, quotaVisibile: visibili / punti.length, quotaDietroVetro: dietroVetro / punti.length,
      quotaNelFotogramma: inFotogramma / punti.length, areaNelFotogramma, centroVisibile, ritagliato };
  });
}

/** Coordinate accanto alla sorgente, senza coprire gli oggetti con testo nell'immagine. */
export function posizioniArrediInquadrati(pianta: PiantaPer3D, localeId: string, camera: Telecamera3D, aspetto: number): ArredoNelFotogramma[] {
  const locale = pianta.locali.find((l) => l.id === localeId);
  if (!locale) return [];
  return arrediInquadrati(pianta, locale, camera, aspetto).flatMap(e => e.centroVisibile && e.quotaVisibile >= .17
    ? [{ id: e.id, ...e.centroVisibile, ...(e.ritagliato ? { ritagliato: true } : {}) }]
    : []);
}

/** Cerca un punto libero e guarda sanitari/scrivania, senza spostare alcun oggetto. */
export function vistaInternaArredata(pianta: PiantaPer3D, localeId: string, opzioni: { vista?: Vista3D; aspetto?: number; fov?: number; verticale?: boolean; arredoId?: string } = {}): Telecamera3D {
  const locale = pianta.locali.find((l) => l.id === localeId);
  if (!locale) throw new Error("Stanza non trovata per l'inquadratura.");
  const { fov = locale.destinazione === "bagno" ? 78 : 70, aspetto = 1.5, vista = "fatto" } = opzioni;
  const base = vistaDentroLocale(locale, fov);
  const bagno = locale.destinazione === "bagno";
  if (opzioni.verticale) base.guarda = [base.guarda[0], base.posizione[1] - (bagno ? .32 : 0), base.guarda[2]];
  const elementi = ingombri(pianta, locale);
  const messaAFuoco = elementi.find(e => e.elemento.id === opzioni.arredoId);
  if (!messaAFuoco && !elementi.some(e => e.peso >= 3)) return base;
  const contorno = locale.contorno.map((p) => v2(p.x / 100, p.y / 100));
  const peso = elementi.reduce((s, e) => s + e.peso, 0);
  const centro: V3 = [elementi.reduce((s, e) => s + e.centro.x * e.peso, 0) / peso, Math.max(0.65, Math.min(1.05, elementi.reduce((s, e) => s + e.h * .55 * e.peso, 0) / peso)), elementi.reduce((s, e) => s + e.centro.y * e.peso, 0) / peso];
  const sguardi: V3[] = messaAFuoco
    ? [[messaAFuoco.centro.x, messaAFuoco.h * .55, messaAFuoco.centro.y]]
    : [centro, ...elementi.filter((e) => e.peso >= 3).flatMap((e) => [.3, .6].map((q): V3 => [centro[0] * (1 - q) + e.centro.x * q, centro[1], centro[2] * (1 - q) + e.centro.y * q]))];
  const aperture = apertureDelLocale(pianta, locale.id, vista);
  let migliore = base, punteggio = -Infinity;
  for (const p of puntiCamera(pianta, vista, contorno, elementi, .12)) {
    for (const guarda of sguardi) {
      const distanza = Math.hypot(guarda[0] - p.x, guarda[2] - p.y);
      if (distanza < .7) continue;
      const altezzaOcchi = Math.min(messaAFuoco ? Math.min(ALTEZZA_OCCHI, 1.02 + messaAFuoco.h * .45) : bagno && !opzioni.verticale ? 1.85 : ALTEZZA_OCCHI, locale.altezza / 100 * .7);
      const inclinazione = bagno ? Math.min(.42, distanza * .16) : Math.min(.18, distanza * .052);
      const t: Telecamera3D = { posizione: [p.x, altezzaOcchi, p.y], guarda: opzioni.verticale && !messaAFuoco ? [guarda[0], altezzaOcchi - inclinazione, guarda[2]] : guarda, fov };
      const visibili = stimaVisibilitaArredi(elementi, contorno, t, aspetto);
      let s = visibili.reduce((n, e) => n + e.peso * (e.quotaVisibile - e.quotaDietroVetro * .6) + (e.quotaVisibile >= .5 ? .6 : 0), 0);
      // Un arredo principale nascosto vale più di un'inquadratura con più finestre.
      s -= visibili.filter((e) => e.peso >= 3).reduce((n, e) => n + Math.max(0, .5 - e.quotaVisibile) * 12, 0);
      s -= visibili.filter((e) => e.peso >= 3).reduce((n, e) => n + (1 - e.quotaNelFotogramma) * e.peso, 0);
      s += visibili.filter((e) => e.peso >= 3).reduce((n, e) => n + e.peso * Math.sqrt(e.areaNelFotogramma) * e.quotaVisibile * 2, 0);
      s -= visibili.filter((e) => e.peso < 3).reduce((n, e) => n + e.areaNelFotogramma * 8, 0);
      s += aperture.filter((a) => { const q = proietta(t, aspetto, a.angoli[0].map((v, k) => (v + a.angoli[2][k]) / 2) as V3); return q.profondita > .2 && Math.abs(q.x) < .9 && Math.abs(q.y) < .9; }).length * .2;
      if (messaAFuoco) {
        const soggetto = visibili.find(e => e.id === messaAFuoco.elemento.id)!;
        s = s * .08 + 30 * soggetto.quotaVisibile + 5 * Math.sqrt(soggetto.areaNelFotogramma) - 12 * soggetto.quotaDietroVetro;
      }
      if (s > punteggio) { punteggio = s; migliore = t; }
    }
  }
  return migliore;
}

function bersaglioArredo(e: Ingombro) {
  const angoli: V3[] = [];
  for (const x of [-e.l / 2, e.l / 2]) for (const z of [-e.p / 2, e.p / 2]) for (const y of [0, e.h]) {
    angoli.push([e.centro.x + x * e.cos - z * e.sin, y, e.centro.y + x * e.sin + z * e.cos]);
  }
  return { angoli, sguardo: [e.centro.x, e.h / 2, e.centro.y] as V3, prove: puntiArredo(e), fronte: v2(-e.sin, e.cos) };
}

function bersaglioApertura(apertura: AperturaLocale) {
  const [a, b, c] = apertura.angoli;
  const sguardo: V3 = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2];
  const prove = apertura.angoli.map((p): V3 => [(p[0] + sguardo[0]) / 2, (p[1] + sguardo[1]) / 2, (p[2] + sguardo[2]) / 2]);
  return { angoli: apertura.angoli, sguardo, prove, fronte: v2(a[2] - b[2], b[0] - a[0]) };
}

type SoggettoDettaglio = { tipo: "apertura" | "arredo"; id: string };

export function vistaDettaglioInterno(pianta: PiantaPer3D, localeId: string, soggetto: SoggettoDettaglio, vista: Vista3D, aspetto: number): Telecamera3D | null {
  const locale = pianta.locali.find(l => l.id === localeId);
  if (!locale || locale.contorno.length < 3) return null;
  const elementi = ingombri(pianta, locale);
  const arredo = soggetto.tipo === "arredo" ? elementi.find(e => e.elemento.id === soggetto.id) : undefined;
  const apertura = soggetto.tipo === "apertura" ? apertureDelLocale(pianta, localeId, vista).find(a => a.id === soggetto.id) : undefined;
  const bersaglio = apertura ? bersaglioApertura(apertura) : arredo && bersaglioArredo(arredo);
  if (!bersaglio) return null;
  const { angoli, sguardo, prove, fronte } = bersaglio;
  const contorno = locale.contorno.map(p => v2(p.x / 100, p.y / 100));
  const ostacoli = elementi.filter(e => e !== arredo && e.tipo !== "doccia");
  const altezza = Math.min(ALTEZZA_OCCHI, locale.altezza / 100 * .7, Math.max(1.1, sguardo[1] + .3));
  let migliore: Telecamera3D | null = null;
  let punteggio = -Infinity;
  for (const p of puntiCamera(pianta, vista, contorno, elementi, .18)) {
    const dx = p.x - sguardo[0], dz = p.y - sguardo[2];
    const distanza = Math.hypot(dx, dz);
    if (distanza < .4) continue;
    const camera: Telecamera3D = { posizione: [p.x, altezza, p.y], guarda: sguardo, fov: 60 };
    const proiezioni = angoli.map(a => proietta(camera, aspetto, a));
    if (proiezioni.some(a => a.profondita <= .05)) continue;
    const estensione = Math.max(...proiezioni.map(a => Math.max(Math.abs(a.x), Math.abs(a.y))));
    // Campo verticale necessario con un margine intorno a tutto il soggetto.
    camera.fov = Math.max(34, 360 / Math.PI * Math.atan(Math.tan(Math.PI / 6) * estensione / .84));
    if (camera.fov > 100) continue;
    const quotaVisibile = prove.filter(a => segmentoNelLocale(camera.posizione, a, contorno, apertura ? .97 : 1)
      && !ostacoli.some(e => intercettaArredo(camera.posizione, a, e))).length / prove.length;
    if (quotaVisibile < .5) continue;
    const orientamento = (dx * fronte.x + dz * fronte.y) / (distanza * Math.hypot(fronte.x, fronte.y));
    const frontalita = apertura ? Math.abs(orientamento) : orientamento;
    const s = quotaVisibile * 8 + frontalita * 2 - Math.abs(camera.fov - 48) / 40 - distanza * .04;
    if (s > punteggio) { migliore = camera; punteggio = s; }
  }
  return migliore;
}

/** In un andito stretto, prova il lato opposto dello stesso vano. */
export function inquadraDettaglio(pianta: PiantaPer3D, localeId: string, soggetto: SoggettoDettaglio, vista: Vista3D, aspetto: number) {
  const camera = vistaDettaglioInterno(pianta, localeId, soggetto, vista, aspetto);
  if (camera) return { telecamera: camera, localeId };
  if (soggetto.tipo !== "apertura" || !apertureDelLocale(pianta, localeId, vista).some(a => a.id === soggetto.id)) return null;
  for (const lato of pianta.locali.filter(l => l.id !== localeId && eAmbienteInterno(l))) {
    const telecamera = vistaDettaglioInterno(pianta, lato.id, soggetto, vista, aspetto);
    if (telecamera) return { telecamera, localeId: lato.id };
  }
  return null;
}
