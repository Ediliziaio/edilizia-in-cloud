/**
 * Campi sportivi: misure regolamentari, linee, attrezzature e superficie.
 *
 * Un campo è un elemento della pianta (rettangolo): larghezza e profondità sono l'ingombro
 * totale, con le fasce di rispetto; il campo di gioco sta al centro, con le sue misure vere.
 * Se l'elemento è più piccolo del campo regolamentare, tutto si riduce in proporzione.
 * Coordinate in cm, centro dell'elemento, x lungo il lato lungo, y lungo il corto.
 *
 * Misure (federazioni italiane e internazionali, valori usuali):
 * - tennis 23,77 × 10,97 (doppio), ingombro 36,6 × 18,3;
 * - padel 20 × 10, con pareti di vetro sul fondo e su 2 m dei lati;
 * - calcio a 5 40 × 20, a 7 65 × 45, a 11 105 × 68;
 * - basket 28 × 15; pallavolo 18 × 9 (zona libera 3 m); beach volley 16 × 8;
 * - pickleball 13,41 × 6,10; bocce 26,5 × 4.
 */
import type { Punto } from "../../../shared/planimetrie/modello.ts";

export type TipoCampo =
  | "campo_tennis" | "campo_padel" | "campo_calcio5" | "campo_calcio7" | "campo_calcio11"
  | "campo_basket" | "campo_pallavolo" | "campo_beach_volley" | "campo_pickleball" | "campo_bocce";

export interface DefinizioneCampo {
  tipo: TipoCampo;
  nome: string;
  /** Campo di gioco (cm): lungo × largo. */
  gioco: [number, number];
  /** Ingombro con le fasce di rispetto (cm): la misura di partenza dell'elemento. */
  ingombro: [number, number];
  /** Colori: campo di gioco, fascia esterna, linee. */
  colori: { gioco: string; fuori: string; linee: string };
  /** Materiale nel 3D (vedi tred/materiali.ts). */
  materiale: { gioco: string; fuori: string };
  /** Prezzo indicativo chiavi in mano (€): fondo, linee, attrezzature, recinzione dove serve. */
  prezzo: number;
  descrizione: string;
}

export const CAMPI: readonly DefinizioneCampo[] = [
  { tipo: "campo_tennis", nome: "Campo da tennis", gioco: [2377, 1097], ingombro: [3660, 1830], colori: { gioco: "#C8643B", fuori: "#B4552F", linee: "#FFFFFF" }, materiale: { gioco: "terra_rossa", fuori: "terra_rossa_scura" }, prezzo: 68000, descrizione: "Campo da tennis in terra rossa, con sottofondo drenante, rete, recinzione e illuminazione" },
  { tipo: "campo_padel", nome: "Campo da padel", gioco: [2000, 1000], ingombro: [2100, 1100], colori: { gioco: "#2D6CB5", fuori: "#24589A", linee: "#FFFFFF" }, materiale: { gioco: "resina_blu", fuori: "resina_blu_scura" }, prezzo: 34000, descrizione: "Campo da padel con struttura in acciaio, pareti in vetro temperato, erba sintetica e illuminazione" },
  { tipo: "campo_calcio5", nome: "Campo da calcio a 5", gioco: [4000, 2000], ingombro: [4400, 2400], colori: { gioco: "#4E9A3E", fuori: "#3F8532", linee: "#FFFFFF" }, materiale: { gioco: "erba_sintetica", fuori: "erba_sintetica_scura" }, prezzo: 48000, descrizione: "Campo da calcio a 5 in erba sintetica, con porte, recinzione e illuminazione" },
  { tipo: "campo_calcio7", nome: "Campo da calcio a 7", gioco: [6500, 4500], ingombro: [7100, 5100], colori: { gioco: "#4E9A3E", fuori: "#3F8532", linee: "#FFFFFF" }, materiale: { gioco: "erba_sintetica", fuori: "erba_sintetica_scura" }, prezzo: 120000, descrizione: "Campo da calcio a 7 in erba sintetica, con porte, recinzione e illuminazione" },
  { tipo: "campo_calcio11", nome: "Campo da calcio a 11", gioco: [10500, 6800], ingombro: [11300, 7400], colori: { gioco: "#4E9A3E", fuori: "#3F8532", linee: "#FFFFFF" }, materiale: { gioco: "erba_sintetica", fuori: "erba_sintetica_scura" }, prezzo: 520000, descrizione: "Campo da calcio a 11 in erba sintetica, con drenaggio, porte e illuminazione" },
  { tipo: "campo_basket", nome: "Campo da basket", gioco: [2800, 1500], ingombro: [3200, 1900], colori: { gioco: "#3E7CC4", fuori: "#2F6AA8", linee: "#FFFFFF" }, materiale: { gioco: "resina_blu", fuori: "resina_blu_scura" }, prezzo: 42000, descrizione: "Campo da basket in resina, con canestri, linee e illuminazione" },
  { tipo: "campo_pallavolo", nome: "Campo da pallavolo", gioco: [1800, 900], ingombro: [2400, 1500], colori: { gioco: "#E08A3C", fuori: "#3E7CC4", linee: "#FFFFFF" }, materiale: { gioco: "resina_arancio", fuori: "resina_blu" }, prezzo: 30000, descrizione: "Campo da pallavolo in resina, con pali, rete e linee" },
  { tipo: "campo_beach_volley", nome: "Campo da beach volley", gioco: [1600, 800], ingombro: [2200, 1400], colori: { gioco: "#E8D3A0", fuori: "#DDC48C", linee: "#2D6CB5" }, materiale: { gioco: "sabbia", fuori: "sabbia" }, prezzo: 18000, descrizione: "Campo da beach volley: scavo, sabbia lavata 40 cm, pali, rete e fettucce" },
  { tipo: "campo_pickleball", nome: "Campo da pickleball", gioco: [1341, 610], ingombro: [1830, 915], colori: { gioco: "#2E7D5B", fuori: "#3A5A8C", linee: "#FFFFFF" }, materiale: { gioco: "resina_verde", fuori: "resina_blu" }, prezzo: 20000, descrizione: "Campo da pickleball in resina, con rete e linee" },
  { tipo: "campo_bocce", nome: "Campo da bocce", gioco: [2650, 400], ingombro: [2750, 450], colori: { gioco: "#D8C3A0", fuori: "#8A6A4B", linee: "#FFFFFF" }, materiale: { gioco: "sabbia", fuori: "legno" }, prezzo: 9000, descrizione: "Campo da bocce con sponde in legno e fondo in sintetico o terra battuta" },
];

export const definizioneCampo = (tipo: string) => CAMPI.find((c) => c.tipo === tipo) ?? null;
export const eCampo = (tipo: string) => tipo.startsWith("campo_") && !!definizioneCampo(tipo);

/** Il disegno di un campo: linee (spezzate), rete, porte, canestri, pareti. */
export interface DisegnoCampo {
  /** Rettangolo del campo di gioco (cm, centrato). */
  gioco: { x0: number; y0: number; x1: number; y1: number };
  linee: Punto[][];
  /** Rete: un segmento (tennis, padel, pallavolo…). */
  rete?: [Punto, Punto];
  /** Porte (calcio): rettangoli dietro la linea di fondo, larghi come la porta. */
  porte: Array<{ x0: number; y0: number; x1: number; y1: number }>;
  /** Canestri (basket): centro del ferro. */
  canestri: Punto[];
  /** Pareti (padel: vetro e rete), come segmenti, con l'altezza in cm. */
  pareti: Array<{ a: Punto; b: Punto; altezza: number; vetro: boolean }>;
  /** Pali della rete. */
  pali: Punto[];
}

const P = (x: number, y: number): Punto => ({ x, y });
const rettangolo = (x0: number, y0: number, x1: number, y1: number): Punto[] => [P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1), P(x0, y0)];
const arco = (cx: number, cy: number, r: number, da: number, a: number, passi = 24): Punto[] =>
  Array.from({ length: passi + 1 }, (_, i) => { const t = da + ((a - da) * i) / passi; return P(cx + Math.cos(t) * r, cy + Math.sin(t) * r); });

/** Le linee del campo, per un elemento largo `L` e profondo `P` (cm). */
export function disegnoCampo(tipo: string, L: number, Pr: number): DisegnoCampo | null {
  const d = definizioneCampo(tipo);
  if (!d) return null;
  // se l'elemento è più piccolo del campo vero, si riduce tutto in proporzione
  const s = Math.min(1, L / d.gioco[0], Pr / d.gioco[1]);
  const lg = d.gioco[0] * s, wg = d.gioco[1] * s;
  const X = lg / 2, Y = wg / 2;
  const k = (v: number) => v * s;
  const out: DisegnoCampo = { gioco: { x0: -X, y0: -Y, x1: X, y1: Y }, linee: [rettangolo(-X, -Y, X, Y)], porte: [], canestri: [], pareti: [], pali: [] };
  const reteTrasversale = (fuori: number) => {
    out.rete = [P(0, -Y - k(fuori)), P(0, Y + k(fuori))];
    out.pali = [P(0, -Y - k(fuori)), P(0, Y + k(fuori))];
  };
  switch (d.tipo) {
    case "campo_tennis": {
      const sing = k(411.5), serv = k(640);
      out.linee.push([P(-X, -sing), P(X, -sing)], [P(-X, sing), P(X, sing)], [P(-serv, -sing), P(-serv, sing)], [P(serv, -sing), P(serv, sing)], [P(-serv, 0), P(serv, 0)], [P(-X, 0), P(-X + k(10), 0)], [P(X, 0), P(X - k(10), 0)]);
      reteTrasversale(91.4);
      break;
    }
    case "campo_padel": {
      const serv = k(695);
      out.linee.push([P(-serv, -Y), P(-serv, Y)], [P(serv, -Y), P(serv, Y)], [P(-serv, 0), P(serv, 0)]);
      reteTrasversale(0);
      // fondo in vetro alto 3 m, sui lati 2 m di vetro e poi rete metallica alta 3 m
      out.pareti.push({ a: P(-X, -Y), b: P(-X, Y), altezza: 300, vetro: true }, { a: P(X, -Y), b: P(X, Y), altezza: 300, vetro: true });
      for (const y of [-Y, Y]) {
        out.pareti.push({ a: P(-X, y), b: P(-X + k(200), y), altezza: 300, vetro: true }, { a: P(X - k(200), y), b: P(X, y), altezza: 300, vetro: true });
        out.pareti.push({ a: P(-X + k(200), y), b: P(X - k(200), y), altezza: 300, vetro: false });
      }
      break;
    }
    case "campo_calcio5":
    case "campo_calcio7":
    case "campo_calcio11": {
      const m = {
        campo_calcio5: { cerchio: 300, area: 600, porta: 300, rigore: 600, piccola: 0 },
        campo_calcio7: { cerchio: 600, area: 1300, porta: 600, rigore: 900, piccola: 500 },
        campo_calcio11: { cerchio: 915, area: 1650, porta: 732, rigore: 1100, piccola: 550 },
      }[d.tipo];
      out.linee.push([P(0, -Y), P(0, Y)], arco(0, 0, k(m.cerchio), 0, Math.PI * 2, 48));
      for (const lato of [-1, 1]) {
        const fondo = lato * X;
        if (d.tipo === "campo_calcio5") {
          // area di rigore: due quarti di cerchio (r 6 m) dai pali uniti da un tratto dritto
          const r = k(m.area), py = k(m.porta) / 2;
          const verso = -lato; // verso il centro del campo
          const q1 = arco(fondo, -py, r, lato > 0 ? Math.PI : 0, lato > 0 ? Math.PI * 1.5 : -Math.PI / 2, 12);
          const q2 = arco(fondo, py, r, lato > 0 ? Math.PI / 2 : Math.PI / 2, lato > 0 ? Math.PI : 0, 12);
          out.linee.push([...q1.reverse(), P(fondo + verso * r, py), ...q2.reverse()].map((q) => P(q.x, Math.max(-Y, Math.min(Y, q.y)))));
        } else {
          const a = k(m.area), wa = d.tipo === "campo_calcio11" ? k(4032) / 2 : k(3000) / 2;
          out.linee.push(rettangolo(Math.min(fondo, fondo - lato * a), -wa, Math.max(fondo, fondo - lato * a), wa));
          const p = k(m.piccola), wp = d.tipo === "campo_calcio11" ? k(1832) / 2 : k(1500) / 2;
          out.linee.push(rettangolo(Math.min(fondo, fondo - lato * p), -wp, Math.max(fondo, fondo - lato * p), wp));
          // lunetta fuori dall'area: arco col centro sul dischetto
          const dischetto = fondo - lato * k(m.rigore);
          const dx = a - k(m.rigore), r = k(m.cerchio);
          if (dx < r) {
            const ang = Math.acos(dx / r);
            const c = lato > 0 ? Math.PI : 0;
            out.linee.push(arco(dischetto, 0, r, c - ang, c + ang, 16));
          }
        }
        out.linee.push([P(fondo - lato * k(m.rigore) - k(15), 0), P(fondo - lato * k(m.rigore) + k(15), 0)]);
        out.porte.push({ x0: Math.min(fondo, fondo + lato * k(150)), y0: -k(m.porta) / 2, x1: Math.max(fondo, fondo + lato * k(150)), y1: k(m.porta) / 2 });
      }
      break;
    }
    case "campo_basket": {
      out.linee.push([P(0, -Y), P(0, Y)], arco(0, 0, k(180), 0, Math.PI * 2, 32));
      for (const lato of [-1, 1]) {
        const fondo = lato * X, cesto = fondo - lato * k(157.5);
        // area dei tre secondi e cerchio del tiro libero
        out.linee.push(rettangolo(Math.min(fondo, fondo - lato * k(580)), -k(245), Math.max(fondo, fondo - lato * k(580)), k(245)));
        out.linee.push(arco(fondo - lato * k(580), 0, k(180), 0, Math.PI * 2, 24));
        // linea da tre: dritta a 0,9 m dalle linee laterali, poi l'arco (r 6,75) attorno al canestro
        const y3 = k(660), r3 = k(675), dx = Math.sqrt(Math.max(0, r3 * r3 - y3 * y3));
        const ang = Math.asin(Math.min(1, y3 / r3));
        const c = lato > 0 ? Math.PI : 0;
        out.linee.push([P(fondo, -y3), P(cesto - lato * dx, -y3), ...arco(cesto, 0, r3, lato > 0 ? c + ang : c - ang, lato > 0 ? c - ang : c + ang, 32), P(cesto - lato * dx, y3), P(fondo, y3)]);
        out.canestri.push(P(cesto, 0));
      }
      break;
    }
    case "campo_pallavolo": {
      out.linee.push([P(-k(300), -Y), P(-k(300), Y)], [P(k(300), -Y), P(k(300), Y)]);
      reteTrasversale(100);
      break;
    }
    case "campo_beach_volley": {
      reteTrasversale(100);
      break;
    }
    case "campo_pickleball": {
      const nv = k(213);
      out.linee.push([P(-nv, -Y), P(-nv, Y)], [P(nv, -Y), P(nv, Y)], [P(-X, 0), P(-nv, 0)], [P(nv, 0), P(X, 0)]);
      reteTrasversale(30);
      break;
    }
    case "campo_bocce": {
      out.linee.push([P(0, -Y), P(0, Y)], [P(-X + k(100), -Y), P(-X + k(100), Y)], [P(X - k(100), -Y), P(X - k(100), Y)], [P(-X + k(250), -Y), P(-X + k(250), Y)], [P(X - k(250), -Y), P(X - k(250), Y)]);
      break;
    }
  }
  return out;
}
