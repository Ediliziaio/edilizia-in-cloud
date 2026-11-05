/**
 * Telaio strutturale da una griglia di allineamenti (come in un esecutivo strutturale):
 * pilastri a ogni incrocio, travi lungo gli allineamenti, un solaio sopra, con numeri e lettere
 * degli allineamenti e le quote delle campate. Tutto si rimette in discussione dopo, elemento per elemento.
 */
import * as C from "./comandi";
import type { Pianta, Punto, StatoElemento } from "./adattatore";

export interface ParametriTelaio {
  /** Luci delle campate lungo x e lungo y, in cm. */
  campateX: number[];
  campateY: number[];
  pilastro: { larghezza: number; profondita: number };
  trave: { larghezza: number; altezza: number };
  /** Spessore del solaio in cm; 0 = niente solaio. */
  solaio: number;
  /** L'angolo in alto a sinistra della griglia (centro del primo pilastro). */
  origine: Punto;
  stato: StatoElemento;
  etichette: boolean;
}

export interface EsitoTelaio {
  pianta: Pianta;
  /** Gli elementi creati (pilastri, travi, solaio): servono per ripeterli sugli altri piani. */
  elementi: string[];
}

export const LIMITE_CAMPATE = 12;

/** «500, 420; 450» → [500, 420, 450], in cm, partendo da metri; vuoto o non valido → null. */
export function leggiCampate(testo: string): number[] | null {
  const parti = testo.split(/[;\s]+|,(?=\s)/).map((s) => s.trim()).filter(Boolean);
  if (!parti.length || parti.length > LIMITE_CAMPATE) return null;
  const n = parti.map((s) => Math.round(Number(s.replace(",", ".")) * 100));
  return n.every((v) => Number.isFinite(v) && v >= 150 && v <= 1500) ? n : null;
}

const lettera = (i: number) => String.fromCharCode(65 + (i % 26)).repeat(1 + Math.floor(i / 26));

export function generaTelaio(pianta: Pianta, p: ParametriTelaio): EsitoTelaio {
  const xs = [0], ys = [0];
  for (const c of p.campateX) xs.push(xs[xs.length - 1] + c);
  for (const c of p.campateY) ys.push(ys[ys.length - 1] + c);
  const at = (i: number, j: number): Punto => ({ x: p.origine.x + xs[i], y: p.origine.y + ys[j] });
  let corrente = pianta;
  const creati: string[] = [];
  const aggiungi = (voce: { tipo: string; larghezza: number; profondita: number; altezza?: number; etichetta?: string }, centro: Punto, rotazione = 0) => {
    const r = C.aggiungiElemento(corrente, voce, centro, { stato: p.stato, rotazione });
    corrente = r.pianta;
    creati.push(r.id);
  };

  // solaio sotto a tutto: si vede il resto sopra
  if (p.solaio > 0) {
    const a = at(0, 0), b = at(p.campateX.length, p.campateY.length);
    aggiungi({ tipo: "solaio", larghezza: b.x - a.x + p.pilastro.larghezza, profondita: b.y - a.y + p.pilastro.profondita, altezza: p.solaio, etichetta: "Solaio" },
      { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  }
  // travi: lungo x su ogni riga, lungo y su ogni colonna
  for (let j = 0; j <= p.campateY.length; j++) {
    for (let i = 0; i < p.campateX.length; i++) {
      const a = at(i, j), b = at(i + 1, j);
      aggiungi({ tipo: "trave", larghezza: p.campateX[i], profondita: p.trave.larghezza, altezza: p.trave.altezza }, { x: (a.x + b.x) / 2, y: a.y });
    }
  }
  for (let i = 0; i <= p.campateX.length; i++) {
    for (let j = 0; j < p.campateY.length; j++) {
      const a = at(i, j), b = at(i, j + 1);
      aggiungi({ tipo: "trave", larghezza: p.campateY[j], profondita: p.trave.larghezza, altezza: p.trave.altezza }, { x: a.x, y: (a.y + b.y) / 2 }, 90);
    }
  }
  // pilastri in cima: nel disegno restano visibili sopra alle travi
  let n = 0;
  for (let j = 0; j <= p.campateY.length; j++) {
    for (let i = 0; i <= p.campateX.length; i++) {
      n += 1;
      aggiungi({ tipo: "pilastro", larghezza: p.pilastro.larghezza, profondita: p.pilastro.profondita, altezza: 300, etichetta: `P${n}` }, at(i, j));
    }
  }
  if (p.etichette) {
    // numeri degli allineamenti in alto, lettere a sinistra
    for (let i = 0; i <= p.campateX.length; i++) corrente = C.aggiungiTesto(corrente, { x: at(i, 0).x, y: p.origine.y - 120 }, String(i + 1)).pianta;
    for (let j = 0; j <= p.campateY.length; j++) corrente = C.aggiungiTesto(corrente, { x: p.origine.x - 120, y: at(0, j).y }, lettera(j)).pianta;
    // quote delle campate
    for (let i = 0; i < p.campateX.length; i++) corrente = C.aggiungiQuota(corrente, at(i, 0), at(i + 1, 0), -70).pianta;
    for (let j = 0; j < p.campateY.length; j++) corrente = C.aggiungiQuota(corrente, at(0, j), at(0, j + 1), 70).pianta;
  }
  return { pianta: corrente, elementi: creati };
}
