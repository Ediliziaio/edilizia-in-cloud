// Dalla descrizione del modello di visione (rispostaAI.ts) alla planimetria:
// scala, muri ricavati dai contorni dei locali, aperture appoggiate ai muri,
// origine di ogni misura.
//
// Regola del founder: niente misure inventate presentate come vere. Qui si
// decide l'origine:
//   · da_documento — la scala viene da una quota o da una superficie scritta
//     sul disegno, oppure il locale dello schizzo ha le sue misure scritte;
//   · stimata — scala presa dalle porte (80 cm), schizzo senza misure,
//     descrizione a parole, spessori e altezze di default;
//   · rilevata — solo quando una persona conferma (applicaMisuraUtente).

import type {
  Apertura, Destinazione, IngressoGenerazione, Locale, Misura, Muro, Origine, Planimetria, Punto, ScalaPianta,
} from "./modelloProvvisorio.ts";
import type { Coppia, RispostaAI } from "./rispostaAI.ts";
import { area, distanza, mediana, proiezione, puntoDentro } from "./geometria.ts";

export interface OpzioniCostruzione {
  ingresso: IngressoGenerazione;
  /** Dimensioni dell'immagine in pixel (o del foglio del PDF in punti): servono a non deformarla. */
  larghezzaImmagine?: number | null;
  altezzaImmagine?: number | null;
  sorgentePath?: string | null;
}

/** Due facce entro questa distanza sono lo stesso muro (cm). */
const TOLLERANZA_MURO = 35;
const SPESSORE_ESTERNO = 30;
const SPESSORE_INTERNO = 10;
const ALTEZZA_LOCALE = 270;
const LARGHEZZA_PORTA = 80;
const ALTEZZE_APERTURA: Record<Apertura["tipo"], { h: number; davanzale: number | null }> = {
  porta: { h: 210, davanzale: null },
  finestra: { h: 140, davanzale: 90 },
  portafinestra: { h: 230, davanzale: 0 },
};

const m = (valore: number, origine: Origine): Misura => ({ valore: Math.round(valore * 10) / 10, origine });

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
  if (porte.length) return { cm_per_unita: LARGHEZZA_PORTA / mediana(porte), metodo: "porte", concordi: 0 };
  return null;
}

// ── Muri dai contorni dei locali ─────────────────────────────────────────────

interface Faccia {
  /** 0 = orizzontale (coordinata y costante), 1 = verticale (x costante). */
  asse: 0 | 1;
  quota: number;
  da: number;
  a: number;
  /** +1 se il locale sta dalla parte delle coordinate crescenti. */
  lato: 1 | -1;
}

function facceDiLocale(contorno: Punto[]): { facce: Faccia[]; oblique: Array<[Punto, Punto]> } {
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
      const prova = { x: mezzo.x, y: mezzo.y + 2 };
      facce.push({ asse: 0, quota: mezzo.y, da: Math.min(a.x, b.x), a: Math.max(a.x, b.x), lato: puntoDentro(prova, contorno) ? 1 : -1 });
    } else if (dx <= dy * 0.09) {
      const prova = { x: mezzo.x + 2, y: mezzo.y };
      facce.push({ asse: 1, quota: mezzo.x, da: Math.min(a.y, b.y), a: Math.max(a.y, b.y), lato: puntoDentro(prova, contorno) ? 1 : -1 });
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
  const da = Math.min(...gruppo.map((f) => f.da));
  const a = Math.max(...gruppo.map((f) => f.a));
  const p1 = asse === 0 ? { x: da, y: quota } : { x: quota, y: da };
  const p2 = asse === 0 ? { x: a, y: quota } : { x: quota, y: a };
  return { asse, p1, p2, spessore, esterno };
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

// ── Costruzione ──────────────────────────────────────────────────────────────

export class ErroreCostruzione extends Error {
  codice: "non_leggibile" | "nessun_locale";
  constructor(codice: "non_leggibile" | "nessun_locale", messaggio: string) {
    super(messaggio);
    this.codice = codice;
  }
}

export function costruisciPlanimetria(r: RispostaAI, opz: OpzioniCostruzione): Planimetria {
  if (!r.leggibile) throw new ErroreCostruzione("non_leggibile", r.motivo_non_leggibile ?? "Il documento non si legge.");
  const locali3 = r.locali.filter((l) => l.contorno.length >= 3);
  if (!locali3.length) throw new ErroreCostruzione("nessun_locale", "Nel documento non ho trovato stanze.");

  const avvisi: string[] = [];
  let conv: (c: Coppia) => Punto;
  let scala: ScalaPianta;
  let origineForma: (l: (typeof locali3)[number]) => Origine;

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

  // Locali
  const altezzaGenerale = r.altezza_m && r.altezza_m > 1.5 && r.altezza_m < 8 ? r.altezza_m * 100 : null;
  const locali: Locale[] = locali3.map((l, i) => {
    const contorno = l.contorno.map(conv).map((p) => ({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 }));
    const hScritta = l.altezza_scritta_m && l.altezza_scritta_m > 1.5 && l.altezza_scritta_m < 8 ? l.altezza_scritta_m * 100 : null;
    const altezza = hScritta ? m(hScritta, "da_documento") : altezzaGenerale ? m(altezzaGenerale, "da_documento") : m(ALTEZZA_LOCALE, "stimata");
    return {
      id: `l${i + 1}`,
      nome: l.nome,
      destinazione: l.destinazione as Destinazione,
      contorno,
      origine_forma: origineForma(l),
      altezza,
      superficie_scritta_mq: l.superficie_scritta_mq,
    };
  });
  if (locali.some((l) => l.altezza.origine === "stimata")) {
    avvisi.push("Altezza dei locali non scritta: ho messo 2,70 m.");
  }

  // Muri
  const facce: Faccia[] = [];
  const oblique: Array<[Punto, Punto]> = [];
  for (const l of locali) {
    const f = facceDiLocale(l.contorno);
    facce.push(...f.facce);
    oblique.push(...f.oblique);
  }
  const grezzi: MuroGrezzo[] = raggruppa(facce).map(muroDaGruppo);
  for (const [a, b] of oblique) {
    const doppione = grezzi.some((w) => w.asse === null && proiezione(a, w.p1, w.p2).distanza < TOLLERANZA_MURO && proiezione(b, w.p1, w.p2).distanza < TOLLERANZA_MURO);
    if (!doppione) grezzi.push({ asse: null, p1: { ...a }, p2: { ...b }, spessore: SPESSORE_INTERNO, esterno: false });
  }
  chiudiAngoli(grezzi);

  const origineMisure: Origine = locali.every((l) => l.origine_forma === "da_documento") ? "da_documento" : "stimata";
  const altezzaMuri = Math.max(...locali.map((l) => l.altezza.valore));
  const muri: Muro[] = grezzi
    .filter((w) => distanza(w.p1, w.p2) >= 10)
    .map((w, i) => ({
      id: `m${i + 1}`,
      p1: arrotonda(w.p1),
      p2: arrotonda(w.p2),
      spessore: m(w.spessore, "stimata"),
      altezza: m(altezzaMuri, locali.every((l) => l.altezza.origine === "da_documento") ? "da_documento" : "stimata"),
      lunghezza: m(distanza(w.p1, w.p2), origineMisure),
      tipo: "non_noto",
      stato: "esistente",
    }));

  // Aperture
  const aperture: Apertura[] = [];
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
    let migliore: { muro: Muro; t: number; d: number } | null = null;
    for (const w of muri) {
      const lw = distanza(w.p1, w.p2);
      const wd = { x: (w.p2.x - w.p1.x) / lw, y: (w.p2.y - w.p1.y) / lw };
      if (Math.abs(dir.x * wd.x + dir.y * wd.y) < 0.95) continue;
      const pr = proiezione(mezzo, w.p1, w.p2);
      if (pr.t < -0.02 || pr.t > 1.02 || pr.distanza > w.spessore.valore / 2 + TOLLERANZA_MURO) continue;
      if (!migliore || pr.distanza < migliore.d) migliore = { muro: w, t: pr.t, d: pr.distanza };
    }
    if (!migliore) {
      scartate++;
      continue;
    }
    const lw = migliore.muro.lunghezza.valore;
    const larg = Math.min(larghezza, lw - 10);
    const posizione = Math.min(Math.max(migliore.t * lw, larg / 2), lw - larg / 2);
    const occupato = aperture.some((x) => x.muro_id === migliore!.muro.id && Math.abs(x.posizione - posizione) < (x.larghezza.valore + larg) / 2 - 5);
    if (occupato || larg < 30) {
      scartate++;
      continue;
    }
    const std = ALTEZZE_APERTURA[ap.tipo];
    aperture.push({
      id: `a${aperture.length + 1}`,
      muro_id: migliore.muro.id,
      tipo: ap.tipo,
      posizione: Math.round(posizione * 10) / 10,
      larghezza: m(larg, scala.metodo === "porte" ? "stimata" : origineMisure),
      altezza: m(std.h, "stimata"),
      davanzale: std.davanzale === null ? null : m(std.davanzale, "stimata"),
      stato: "esistente",
    });
  }
  if (scartate) avvisi.push(`${scartate === 1 ? "Una porta o finestra non era" : `${scartate} porte o finestre non erano`} chiaramente su un muro: controlla che non manchi nulla.`);

  return {
    versione_schema: "provvisoria-1",
    unita: "cm",
    livelli: [{ id: "p0", nome: "Piano", muri, aperture, locali }],
    scala,
    riferimenti: { ingresso: opz.ingresso, sorgente_path: opz.sorgentePath ?? null, sfondo_dxf: null },
    avvisi,
  };
}

function arrotonda(p: Punto): Punto {
  return { x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 };
}

// ── Conferma della scala da parte dell'utente ────────────────────────────────

/** Ridimensiona tutto il disegno di un fattore (attorno all'origine). */
function ridimensiona(p: Planimetria, f: number): Planimetria {
  const s = (pt: Punto): Punto => arrotonda({ x: pt.x * f, y: pt.y * f });
  const daDocumento = (x: Misura): Misura => (x.origine === "rilevata" ? x : m(x.valore * f, "da_documento"));
  return {
    ...p,
    livelli: p.livelli.map((l) => ({
      ...l,
      locali: l.locali.map((loc) => ({ ...loc, contorno: loc.contorno.map(s), origine_forma: loc.origine_forma === "rilevata" ? "rilevata" : "da_documento" })),
      muri: l.muri.map((w) => ({ ...w, p1: s(w.p1), p2: s(w.p2), lunghezza: daDocumento(w.lunghezza) })),
      aperture: l.aperture.map((a) => ({ ...a, posizione: Math.round(a.posizione * f * 10) / 10, larghezza: daDocumento(a.larghezza) })),
    })),
    scala: p.scala ? { ...p.scala, metodo: "misura_utente", cm_per_unita: Math.round(p.scala.cm_per_unita * f * 10000) / 10000, da_confermare: false } : null,
    avvisi: p.avvisi.filter((a) => !/misura vera|scala|indicative|una sola misura/i.test(a)),
  };
}

/**
 * «Questa parete è 4,20 m»: tutta la pianta in scala si adegua. Vale solo per
 * i disegni in scala (catastale, geometra); su schizzo e descrizione la
 * misura si corregge parete per parete nell'editor.
 */
export function applicaMisuraUtente(p: Planimetria, muroId: string, valoreCm: number): Planimetria {
  if (p.riferimenti.ingresso !== "documento") throw new Error("La scala si conferma solo sui disegni in scala.");
  const muro = p.livelli.flatMap((l) => l.muri).find((w) => w.id === muroId);
  if (!muro || !(valoreCm > 0)) throw new Error("Parete o misura non valida.");
  const f = valoreCm / distanza(muro.p1, muro.p2);
  const nuova = ridimensiona(p, f);
  for (const l of nuova.livelli) {
    for (const w of l.muri) if (w.id === muroId) w.lunghezza = m(valoreCm, "rilevata");
  }
  return nuova;
}

/** Variante per locale: «il soggiorno è largo 4,20 m» (lato orizzontale o verticale del riquadro). */
export function applicaMisuraLocale(p: Planimetria, localeId: string, asse: "x" | "y", valoreCm: number): Planimetria {
  if (p.riferimenti.ingresso !== "documento") throw new Error("La scala si conferma solo sui disegni in scala.");
  const loc = p.livelli.flatMap((l) => l.locali).find((l) => l.id === localeId);
  if (!loc || !(valoreCm > 0)) throw new Error("Locale o misura non valida.");
  const vals = loc.contorno.map((pt) => pt[asse]);
  const attuale = Math.max(...vals) - Math.min(...vals);
  if (!(attuale > 0)) throw new Error("Locale senza dimensione su quel lato.");
  return ridimensiona(p, valoreCm / attuale);
}
