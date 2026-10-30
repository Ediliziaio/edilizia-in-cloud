// Dalla descrizione del modello di visione (rispostaAI.ts) alla planimetria del
// modello della fase 1 (shared/planimetrie/modello.ts): scala, muri ricavati
// dai contorni dei locali, aperture appoggiate ai muri, origine di ogni misura.
//
// Regola del founder: niente misure inventate presentate come vere. Qui si
// decide l'origine:
//   · da_documento — la scala viene da una quota o da una superficie scritta
//     sul disegno, oppure il locale dello schizzo ha le sue misure scritte;
//   · stimata — scala presa dalle porte (80 cm), schizzo senza misure,
//     descrizione a parole, spessori e altezze di default;
//   · rilevata — solo quando una persona conferma (applicaMisuraUtente).
//
// Si lavora con y verso il basso, come nell'immagine; il documento finale ha
// y verso l'alto (convenzione del modello) e si capovolge alla fine.

import {
  VERSIONE_SCHEMA,
  type Apertura, type CampoMisura, type Destinazione, type Locale, type Muro, type Origine, type OrigineMisure, type Planimetria, type Punto, type Verso,
} from "../../../shared/planimetrie/modello.ts";
import type { Coppia, LocaleAI, RispostaAI } from "./rispostaAI.ts";
import type { IngressoGenerazione, InfoGenerazione, PiantaGenerata, ScalaPianta } from "./generazione.ts";
import { area, distanza, mediana, proiezione, puntoDentro } from "./geometria.ts";

export interface OpzioniCostruzione {
  ingresso: IngressoGenerazione;
  /** Dimensioni dell'immagine in pixel (o del foglio del PDF in punti): servono a non deformarla. */
  larghezzaImmagine?: number | null;
  altezzaImmagine?: number | null;
  sorgentePath?: string | null;
  titolo?: string;
}

/** Due facce entro questa distanza sono lo stesso muro (cm). */
const TOLLERANZA_MURO = 35;
const SPESSORE_ESTERNO = 30;
const SPESSORE_INTERNO = 10;
const ALTEZZA_LOCALE = 270;
const LARGHEZZA_PORTA = 80;
const ALTEZZE_APERTURA: Record<Apertura["tipo"], { h: number; davanzale: number }> = {
  porta: { h: 210, davanzale: 0 },
  finestra: { h: 140, davanzale: 90 },
  portafinestra: { h: 230, davanzale: 0 },
  varco: { h: 210, davanzale: 0 },
};

const arr = (v: number) => Math.round(v * 10) / 10;

// ── Scala ────────────────────────────────────────────────────────────────────

interface Stima {
  cm_per_unita: number;
  metodo: ScalaPianta["metodo"];
  concordi: number;
}

function concordiConMediana(valori: number[]): number[] {
  const med = mediana(valori);
  return valori.filter((v) => Math.abs(v - med) / med <= 0.12);
}

export function stimaScala(r: RispostaAI, conv: (c: Coppia) => Punto): Stima | null {
  const daQuote = r.quote
    .map((q) => {
      const d = distanza(conv(q.da), conv(q.a));
      return d > 0 ? (q.valore_m * 100) / d : NaN;
    })
    .filter((v) => Number.isFinite(v) && v > 0);
  if (daQuote.length) {
    const buone = concordiConMediana(daQuote);
    return { cm_per_unita: mediana(buone), metodo: "quota_letta", concordi: buone.length };
  }
  const daSuperfici = r.locali
    .filter((l) => l.superficie_scritta_mq && l.contorno.length >= 3)
    .map((l) => Math.sqrt((l.superficie_scritta_mq! * 10_000) / area(l.contorno.map(conv))))
    .filter((v) => Number.isFinite(v) && v > 0);
  if (daSuperfici.length) {
    const buone = concordiConMediana(daSuperfici);
    return { cm_per_unita: mediana(buone), metodo: "superficie_letta", concordi: buone.length };
  }
  const porte = r.aperture
    .filter((a) => a.tipo === "porta")
    .map((a) => distanza(conv(a.da), conv(a.a)))
    .filter((d) => d > 0);
  if (porte.length) {
    // le porte molto più strette delle altre sono letture sbagliate
    const med = mediana(porte);
    return { cm_per_unita: LARGHEZZA_PORTA / mediana(porte.filter((d) => d > med * 0.6)), metodo: "porte", concordi: 0 };
  }
  return null;
}

// ── Muri dai contorni dei locali ─────────────────────────────────────────────

interface Faccia {
  /** 0 = orizzontale (y costante), 1 = verticale (x costante). */
  asse: 0 | 1;
  quota: number;
  da: number;
  a: number;
  /** +1 se il locale sta dalla parte delle coordinate crescenti. */
  lato: 1 | -1;
  locale: number;
  vertice: number;
}

function facceDiLocale(contorno: Punto[], locale: number): { facce: Faccia[]; oblique: Array<[Punto, Punto]> } {
  const facce: Faccia[] = [];
  const oblique: Array<[Punto, Punto]> = [];
  for (let i = 0; i < contorno.length; i++) {
    const a = contorno[i];
    const b = contorno[(i + 1) % contorno.length];
    const dx = Math.abs(b.x - a.x);
    const dy = Math.abs(b.y - a.y);
    if (dx < 1 && dy < 1) continue;
    const mezzo = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    if (dy <= dx * 0.09) {
      const lato = puntoDentro({ x: mezzo.x, y: mezzo.y + 2 }, contorno) ? 1 : -1;
      facce.push({ asse: 0, quota: mezzo.y, da: Math.min(a.x, b.x), a: Math.max(a.x, b.x), lato, locale, vertice: i });
    } else if (dx <= dy * 0.09) {
      const lato = puntoDentro({ x: mezzo.x + 2, y: mezzo.y }, contorno) ? 1 : -1;
      facce.push({ asse: 1, quota: mezzo.x, da: Math.min(a.y, b.y), a: Math.max(a.y, b.y), lato, locale, vertice: i });
    } else {
      oblique.push([a, b]);
    }
  }
  return { facce, oblique };
}

/** Gruppi di facce parallele, vicine e affiancate: diventano un muro ciascuno. */
function raggruppa(facce: Faccia[]): Faccia[][] {
  const padre = facce.map((_, i) => i);
  const trova = (i: number): number => (padre[i] === i ? i : (padre[i] = trova(padre[i])));
  for (let i = 0; i < facce.length; i++) {
    for (let j = i + 1; j < facce.length; j++) {
      const f = facce[i];
      const g = facce[j];
      if (f.asse !== g.asse || Math.abs(f.quota - g.quota) > TOLLERANZA_MURO) continue;
      const sovrapp = Math.min(f.a, g.a) - Math.max(f.da, g.da);
      // Stessa parte: si uniscono solo se si toccano in fila. Parti opposte: se si affiancano davvero.
      if (f.lato === g.lato ? sovrapp > -TOLLERANZA_MURO / 2 && Math.abs(f.quota - g.quota) < 12 : sovrapp > 20) {
        padre[trova(i)] = trova(j);
      }
    }
  }
  const gruppi = new Map<number, Faccia[]>();
  facce.forEach((f, i) => {
    const r = trova(i);
    gruppi.set(r, [...(gruppi.get(r) ?? []), f]);
  });
  return [...gruppi.values()];
}

interface MuroGrezzo {
  asse: 0 | 1 | null;
  p1: Punto;
  p2: Punto;
  spessore: number;
  esterno: boolean;
  facce: Faccia[];
}

function muroDaGruppo(gruppo: Faccia[]): MuroGrezzo {
  const asse = gruppo[0].asse;
  const piu = gruppo.filter((f) => f.lato === 1);
  const meno = gruppo.filter((f) => f.lato === -1);
  const media = (fs: Faccia[]) => fs.reduce((s, f) => s + f.quota * (f.a - f.da), 0) / fs.reduce((s, f) => s + (f.a - f.da), 0);
  let quota: number;
  let spessore: number;
  let esterno = false;
  if (piu.length && meno.length) {
    // Locali da tutte e due le parti: le facce sono i due fili del muro.
    const qPiu = media(piu);
    const qMeno = media(meno);
    const gap = qPiu - qMeno;
    spessore = gap >= 4 ? Math.min(50, Math.max(8, gap)) : SPESSORE_INTERNO;
    quota = (qPiu + qMeno) / 2;
  } else {
    // Locali da una parte sola: muro di perimetro, l'asse sta fuori dal locale.
    esterno = true;
    spessore = SPESSORE_ESTERNO;
    const lato = piu.length ? 1 : -1;
    quota = media(gruppo) - (lato * spessore) / 2;
  }
  spessore = Math.round(spessore);
  const da = Math.min(...gruppo.map((f) => f.da));
  const a = Math.max(...gruppo.map((f) => f.a));
  const p1 = asse === 0 ? { x: da, y: quota } : { x: quota, y: da };
  const p2 = asse === 0 ? { x: a, y: quota } : { x: quota, y: a };
  return { asse, p1, p2, spessore, esterno, facce: gruppo };
}

/** Allunga le estremità fino all'asse del muro perpendicolare vicino: angoli chiusi. */
function chiudiAngoli(muri: MuroGrezzo[]): void {
  for (const w of muri) {
    if (w.asse === null) continue;
    const k = w.asse === 0 ? "x" : "y";
    const q = w.asse === 0 ? "y" : "x";
    for (const estremo of [w.p1, w.p2]) {
      let migliore: number | null = null;
      for (const v of muri) {
        if (v.asse === null || v.asse === w.asse) continue;
        const posV = v.p1[k];
        const daV = Math.min(v.p1[q], v.p2[q]) - TOLLERANZA_MURO;
        const aV = Math.max(v.p1[q], v.p2[q]) + TOLLERANZA_MURO;
        const d = Math.abs(posV - estremo[k]);
        if (d <= TOLLERANZA_MURO + v.spessore / 2 && w.p1[q] >= daV && w.p1[q] <= aV && (migliore === null || d < Math.abs(migliore - estremo[k]))) {
          migliore = posV;
        }
      }
      if (migliore !== null) estremo[k] = migliore;
    }
  }
}

/** Porta i lati dei locali sul filo del loro muro: la pianta torna coerente. */
function allineaLocali(contorni: Punto[][], muri: MuroGrezzo[]): void {
  for (const w of muri) {
    if (w.asse === null) continue;
    const quota = w.asse === 0 ? w.p1.y : w.p1.x;
    const k = w.asse === 0 ? "y" : "x";
    for (const f of w.facce) {
      const filo = quota + (f.lato * w.spessore) / 2;
      const c = contorni[f.locale];
      c[f.vertice][k] = filo;
      c[(f.vertice + 1) % c.length][k] = filo;
    }
  }
}

/**
 * Schizzo, descrizione e sopralluogo danno stanze che si TOCCANO (le misure
 * sono nette, i muri ignorati). Per non rimpicciolirle, dove due stanze si
 * toccano si apre lo spazio di un tramezzo e si sposta di 10 cm tutto quello
 * che sta oltre: le superfici restano quelle scritte.
 */
function separaStanzeAccostate(contorni: Punto[][]): void {
  const facce = contorni.flatMap((c, i) => facceDiLocale(c, i).facce);
  for (const asse of [0, 1] as const) {
    const k = asse === 0 ? "y" : "x";
    const linee: number[] = [];
    for (const g of raggruppa(facce.filter((f) => f.asse === asse))) {
      const piu = g.filter((f) => f.lato === 1);
      const meno = g.filter((f) => f.lato === -1);
      if (!piu.length || !meno.length) continue;
      const q = g.reduce((s, f) => s + f.quota, 0) / g.length;
      if (Math.max(...g.map((f) => f.quota)) - Math.min(...g.map((f) => f.quota)) < 4 && !linee.some((l) => Math.abs(l - q) < 1)) linee.push(q);
    }
    if (!linee.length) continue;
    for (const c of contorni) {
      const minimo = Math.min(...c.map((p) => p[k]));
      for (const p of c) {
        const passate = linee.filter((q) => q < p[k] - 1 || (Math.abs(q - p[k]) <= 1 && minimo >= q - 1)).length;
        p[k] += passate * SPESSORE_INTERNO;
      }
    }
  }
}

// ── Costruzione ──────────────────────────────────────────────────────────────

export class ErroreCostruzione extends Error {
  codice: "non_leggibile" | "nessun_locale";
  constructor(codice: "non_leggibile" | "nessun_locale", messaggio: string) {
    super(messaggio);
    this.codice = codice;
  }
}

/** Origine dell'oggetto + le sole misure che se ne discostano. */
function origini(origine: Origine, misure: OrigineMisure): { origine: Origine; origineMisure?: OrigineMisure } {
  const diverse = Object.fromEntries(Object.entries(misure).filter(([, o]) => o !== origine)) as OrigineMisure;
  return Object.keys(diverse).length ? { origine, origineMisure: diverse } : { origine };
}

export function costruisciPlanimetria(r: RispostaAI, opz: OpzioniCostruzione): PiantaGenerata {
  if (!r.leggibile) throw new ErroreCostruzione("non_leggibile", r.motivo_non_leggibile ?? "Il documento non si legge.");
  const locali3 = r.locali.filter((l) => l.contorno.length >= 3);
  if (!locali3.length) throw new ErroreCostruzione("nessun_locale", "Nel documento non ho trovato stanze.");

  const avvisi: string[] = [];
  let conv: (c: Coppia) => Punto;
  let scala: ScalaPianta;
  let origineForma: (l: LocaleAI) => Origine;

  if (r.sistema === "immagine") {
    const W = opz.larghezzaImmagine && opz.larghezzaImmagine > 0 ? opz.larghezzaImmagine : 1000;
    const H = opz.altezzaImmagine && opz.altezzaImmagine > 0 ? opz.altezzaImmagine : 1000;
    const inPixel = (c: Coppia): Punto => ({ x: (c[0] / 1000) * W, y: (c[1] / 1000) * H });
    let stima = stimaScala(r, inPixel);
    if (!stima) {
      // Nessun appiglio: scala di ripiego (pianta larga circa 10 m), tutta da confermare.
      const xs = locali3.flatMap((l) => l.contorno.map((c) => inPixel(c).x));
      const larghezza = Math.max(...xs) - Math.min(...xs) || W;
      stima = { cm_per_unita: 1000 / larghezza, metodo: "porte", concordi: 0 };
      avvisi.push("Non ho trovato misure scritte: le dimensioni sono indicative finché non scrivi la misura vera di una parete.");
    } else if (stima.metodo === "porte") {
      avvisi.push("Sul disegno non ci sono misure: ho preso le porte larghe 80 cm. Scrivi la misura vera di una parete per sistemare tutta la pianta.");
    } else if (stima.concordi < 2) {
      avvisi.push("Ho trovato una sola misura per capire la scala: controlla una parete che conosci.");
    }
    const k = stima.cm_per_unita;
    conv = (c) => {
      const p = inPixel(c);
      return { x: p.x * k, y: p.y * k };
    };
    scala = {
      metodo: stima.metodo,
      cm_per_unita: Math.round(k * 10000) / 10000,
      da_confermare: stima.metodo === "porte" || stima.concordi < 2,
    };
    const daDocumento = stima.metodo === "quota_letta" || stima.metodo === "superficie_letta";
    origineForma = () => (daDocumento ? "da_documento" : "stimata");
  } else {
    conv = (c) => ({ x: c[0] * 100, y: c[1] * 100 });
    scala = { metodo: "in_metri", cm_per_unita: 1, da_confermare: opz.ingresso !== "sopralluogo" };
    origineForma = (l) => (opz.ingresso === "schizzo" && l.misure_lette ? "da_documento" : "stimata");
    if (opz.ingresso === "descrizione") {
      avvisi.push("Pianta di esempio costruita dalla descrizione: tutte le misure sono stimate, vanno controllate.");
    } else if (opz.ingresso === "schizzo" && locali3.some((l) => !l.misure_lette)) {
      avvisi.push("Alcune stanze non avevano misure scritte sullo schizzo: le loro dimensioni sono stimate.");
    }
  }

  // Locali (ancora con y verso il basso)
  const altezzaGenerale = r.altezza_m && r.altezza_m > 1.5 && r.altezza_m < 8 ? r.altezza_m * 100 : null;
  const contorni = locali3.map((l) => l.contorno.map(conv));
  if (r.sistema === "metri") separaStanzeAccostate(contorni);
  const altezze = locali3.map((l) => {
    const hScritta = l.altezza_scritta_m && l.altezza_scritta_m > 1.5 && l.altezza_scritta_m < 8 ? l.altezza_scritta_m * 100 : null;
    if (hScritta) return { valore: hScritta, origine: "da_documento" as Origine };
    if (altezzaGenerale) return { valore: altezzaGenerale, origine: "da_documento" as Origine };
    return { valore: ALTEZZA_LOCALE, origine: "stimata" as Origine };
  });
  if (altezze.some((h) => h.origine === "stimata") && opz.ingresso !== "sopralluogo") {
    avvisi.push("Altezza dei locali non scritta: ho messo 2,70 m.");
  }

  // Muri
  const facce: Faccia[] = [];
  const oblique: Array<[Punto, Punto]> = [];
  contorni.forEach((c, i) => {
    const f = facceDiLocale(c, i);
    facce.push(...f.facce);
    oblique.push(...f.oblique);
  });
  const grezzi: MuroGrezzo[] = raggruppa(facce).map(muroDaGruppo);
  allineaLocali(contorni, grezzi);
  for (const [a, b] of oblique) {
    const doppione = grezzi.some((w) => w.asse === null && proiezione(a, w.p1, w.p2).distanza < TOLLERANZA_MURO && proiezione(b, w.p1, w.p2).distanza < TOLLERANZA_MURO);
    if (!doppione) grezzi.push({ asse: null, p1: { ...a }, p2: { ...b }, spessore: SPESSORE_INTERNO, esterno: false, facce: [] });
  }
  chiudiAngoli(grezzi);
  const muriBuoni = grezzi.filter((w) => distanza(w.p1, w.p2) >= 10);

  const formaLocali = locali3.map(origineForma);
  const origineMuri: Origine = formaLocali.every((o) => o === "da_documento") ? "da_documento" : "stimata";
  const altezzaMuri = Math.max(...altezze.map((h) => h.valore));
  const origineAltezzaMuri: Origine = altezze.every((h) => h.origine === "da_documento") ? "da_documento" : "stimata";

  // Aperture: segmento del vano → muro più vicino e parallelo
  interface ApInt { muro: number; tipo: Apertura["tipo"]; inizio: number; larghezza: number }
  const vani: ApInt[] = [];
  let scartate = 0;
  for (const ap of r.aperture) {
    const a = conv(ap.da);
    const b = conv(ap.a);
    const larghezza = distanza(a, b);
    if (larghezza < 30) {
      scartate++;
      continue;
    }
    const mezzo = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const dir = { x: (b.x - a.x) / larghezza, y: (b.y - a.y) / larghezza };
    let migliore: { muro: number; t: number; d: number } | null = null;
    muriBuoni.forEach((w, i) => {
      const lw = distanza(w.p1, w.p2);
      const wd = { x: (w.p2.x - w.p1.x) / lw, y: (w.p2.y - w.p1.y) / lw };
      if (Math.abs(dir.x * wd.x + dir.y * wd.y) < 0.95) return;
      const pr = proiezione(mezzo, w.p1, w.p2);
      if (pr.t < -0.02 || pr.t > 1.02 || pr.distanza > w.spessore / 2 + TOLLERANZA_MURO) return;
      if (!migliore || pr.distanza < migliore.d) migliore = { muro: i, t: pr.t, d: pr.distanza };
    });
    if (!migliore) {
      scartate++;
      continue;
    }
    const { muro, t } = migliore as { muro: number; t: number };
    const lw = distanza(muriBuoni[muro].p1, muriBuoni[muro].p2);
    const larg = arr(Math.min(larghezza, lw - 10));
    const inizio = arr(Math.min(Math.max(t * lw - larg / 2, 0), lw - larg));
    const occupato = vani.some((x) => x.muro === muro && inizio < x.inizio + x.larghezza && x.inizio < inizio + larg);
    if (occupato || larg < 30) {
      scartate++;
      continue;
    }
    vani.push({ muro, tipo: ap.tipo, inizio, larghezza: larg });
  }
  if (scartate) avvisi.push(`${scartate === 1 ? "Una porta o finestra non era" : `${scartate} porte o finestre non erano`} chiaramente su un muro: controlla che non manchi nulla.`);

  // Capovolge y: il modello ha y verso l'alto.
  const tutti = [...contorni.flat(), ...muriBuoni.flatMap((w) => [w.p1, w.p2])];
  const maxY = Math.max(...tutti.map((p) => p.y));
  const su = (p: Punto): Punto => ({ x: arr(p.x), y: arr(maxY - p.y) });

  const muri: Muro[] = muriBuoni.map((w, i) => ({
    id: `m${i + 1}`,
    p1: su(w.p1),
    p2: su(w.p2),
    spessore: w.spessore,
    altezza: altezzaMuri,
    tipo: w.esterno ? "esterno" : w.spessore > 15 ? "portante" : "tramezzo",
    stato: "esistente",
    ...origini(origineMuri, { spessore: "stimata", altezza: origineAltezzaMuri }),
  }));
  const locali: Locale[] = locali3.map((l, i) => ({
    id: `l${i + 1}`,
    nome: l.nome,
    destinazione: l.destinazione as Destinazione,
    contorno: contorni[i].map(su),
    altezza: altezze[i].valore,
    ...origini(formaLocali[i], { altezza: altezze[i].origine }),
  }));
  const origineVani: Origine = scala.metodo === "porte" ? "stimata" : origineMuri;
  const aperture: Apertura[] = vani.map((v, i) => {
    const std = ALTEZZE_APERTURA[v.tipo];
    return {
      id: `a${i + 1}`,
      muroId: muri[v.muro].id,
      tipo: v.tipo,
      offset: v.inizio,
      larghezza: v.larghezza,
      altezza: std.h,
      davanzale: std.davanzale,
      manovra: v.tipo === "varco" ? "nessuna" : "battente",
      verso: null as Verso | null,
      stato: "esistente",
      ...origini(origineVani, { altezza: "stimata", davanzale: "stimata" }),
    };
  });

  const superfici: Record<string, number> = {};
  locali3.forEach((l, i) => {
    if (l.superficie_scritta_mq) superfici[`l${i + 1}`] = l.superficie_scritta_mq;
  });
  const planimetria: Planimetria = {
    schema: VERSIONE_SCHEMA,
    unita: "cm",
    ...(opz.titolo ? { titolo: opz.titolo } : {}),
    scala: 100,
    livelli: [{ id: "pt", nome: "Piano", quota: 0, fatto: { muri, aperture, locali, elementi: [], quote: [], testi: [] }, proposte: [] }],
  };
  const generazione: InfoGenerazione = {
    ingresso: opz.ingresso,
    scala,
    avvisi,
    sorgente_path: opz.sorgentePath ?? null,
    sfondo_dxf: null,
    superfici_scritte: superfici,
  };
  return { planimetria, generazione };
}

// ── Conferma della scala da parte dell'utente ────────────────────────────────

/**
 * Dopo la conferma della scala, le misure in pianta (`inPianta`) diventano «da
 * documento», salvo quelle già rilevate; le altre (`proprie`: spessore, altezza,
 * davanzale) restano com'erano.
 */
function dopoScala<T extends { origine: Origine; origineMisure?: OrigineMisure }>(o: T, inPianta: CampoMisura[], proprie: CampoMisura[]): T {
  const origine: Origine = o.origine === "rilevata" ? "rilevata" : "da_documento";
  const misure: OrigineMisure = {};
  for (const c of proprie) misure[c] = o.origineMisure?.[c] ?? o.origine;
  for (const c of inPianta) if (o.origineMisure?.[c] === "rilevata") misure[c] = "rilevata";
  const { origineMisure: _vecchie, ...resto } = o;
  return { ...resto, ...origini(origine, misure) } as T;
}

function ridimensiona(g: PiantaGenerata, f: number): PiantaGenerata {
  const s = (pt: Punto): Punto => ({ x: arr(pt.x * f), y: arr(pt.y * f) });
  const p = g.planimetria;
  return {
    planimetria: {
      ...p,
      livelli: p.livelli.map((l) => ({
        ...l,
        fatto: {
          ...l.fatto,
          locali: l.fatto.locali.map((loc) => dopoScala({ ...loc, contorno: loc.contorno.map(s) }, ["contorno"], ["altezza"])),
          muri: l.fatto.muri.map((w) => dopoScala({ ...w, p1: s(w.p1), p2: s(w.p2) }, ["lunghezza"], ["spessore", "altezza"])),
          aperture: l.fatto.aperture.map((a) => dopoScala({ ...a, offset: arr(a.offset * f), larghezza: arr(a.larghezza * f) }, ["offset", "larghezza"], ["altezza", "davanzale"])),
          quote: l.fatto.quote.map((q) => ({ ...q, p1: s(q.p1), p2: s(q.p2) })),
          testi: l.fatto.testi.map((t) => ({ ...t, posizione: s(t.posizione) })),
          elementi: l.fatto.elementi.map((e) => ({ ...e, posizione: s(e.posizione) })),
        },
      })),
    },
    generazione: {
      ...g.generazione,
      scala: g.generazione.scala ? { ...g.generazione.scala, metodo: "misura_utente", cm_per_unita: Math.round(g.generazione.scala.cm_per_unita * f * 10000) / 10000, da_confermare: false } : null,
      avvisi: g.generazione.avvisi.filter((a) => !/misura vera|scala|indicative|una sola misura/i.test(a)),
    },
  };
}

function soloInScala(g: PiantaGenerata) {
  if (g.generazione.ingresso !== "documento") throw new Error("La scala si conferma solo sui disegni in scala.");
}

/**
 * «Questa parete è 4,20 m»: tutta la pianta in scala si adegua. Vale solo per
 * i disegni in scala (catastale, geometra); su schizzo e descrizione la
 * misura si corregge parete per parete nell'editor.
 */
export function applicaMisuraUtente(g: PiantaGenerata, muroId: string, valoreCm: number): PiantaGenerata {
  soloInScala(g);
  const muro = g.planimetria.livelli.flatMap((l) => l.fatto.muri).find((w) => w.id === muroId);
  if (!muro || !(valoreCm > 0)) throw new Error("Parete o misura non valida.");
  const nuova = ridimensiona(g, valoreCm / distanza(muro.p1, muro.p2));
  for (const l of nuova.planimetria.livelli) {
    l.fatto.muri = l.fatto.muri.map((w) => {
      if (w.id !== muroId) return w;
      const misure: OrigineMisure = { spessore: w.origineMisure?.spessore ?? w.origine, altezza: w.origineMisure?.altezza ?? w.origine };
      return { ...w, ...origini("rilevata", misure) };
    });
  }
  return nuova;
}

/** Variante per locale: «il soggiorno è largo 4,20 m» (lato orizzontale x o verticale y). */
export function applicaMisuraLocale(g: PiantaGenerata, localeId: string, asse: "x" | "y", valoreCm: number): PiantaGenerata {
  soloInScala(g);
  const loc = g.planimetria.livelli.flatMap((l) => l.fatto.locali).find((l) => l.id === localeId);
  if (!loc || !(valoreCm > 0)) throw new Error("Locale o misura non valida.");
  const vals = loc.contorno.map((pt) => pt[asse]);
  const attuale = Math.max(...vals) - Math.min(...vals);
  if (!(attuale > 0)) throw new Error("Locale senza dimensione su quel lato.");
  return ridimensiona(g, valoreCm / attuale);
}
