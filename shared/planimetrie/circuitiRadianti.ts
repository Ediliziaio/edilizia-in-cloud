import { distanza, puntoNelPoligono, segmentiSiIncrociano } from "./geometria.ts";
import { attraversamentiImpianto, type AttraversamentoImpianto } from "./impianti.ts";
import type { Punto, StatoPianta } from "./modello.ts";
import { fasceRadianti, zoneRadianti } from "./pavimentoRadiante.ts";

export const COLORI_CIRCUITO = { mandata: "#b94014", ritorno: "#135bb4" } as const;
const SCARTO_BARRE_CM = 12;
const MASSIMO_CIRCUITI_PER_LOCALE = 32;

export interface CircuitoRadiante {
  localeId: string;
  localeNome: string;
  numero: number;
  mandata: Punto[];
  ritorno: Punto[];
  serpentina: Punto[];
  mandataM: number;
  ritornoM: number;
  tuboAttivoM: number;
  totaleM: number;
  superaObiettivo: boolean;
  attraversamenti: AttraversamentoImpianto[];
}

export function nomeCircuito(c: Pick<CircuitoRadiante, "localeNome" | "numero">) {
  return `${c.localeNome} · circuito ${c.numero}`;
}

export function quoteCollettoreRadiante(quotaCm: number) {
  return { mandata: quotaCm, ritorno: quotaCm - SCARTO_BARRE_CM };
}

const metriAlCentimetro = (m: number) => Math.round(m * 100 + 1e-9) / 100;

const sviluppoCm = (punti: Punto[]) => punti.slice(1).reduce((totale, p, i) => totale + distanza(punti[i], p), 0);

/** Unisce le fasce solo dove il raccordo resta interno al poligono. */
function serpentine(contorno: Punto[], passoCm: number): Punto[][] {
  const tracce: Punto[][] = [];
  for (const [sinistra, destra] of fasceRadianti(contorno, passoCm)) {
    const ultima = tracce.at(-1);
    const estremo = ultima?.at(-1);
    const entraDaDestra = estremo ? distanza(estremo, destra) < distanza(estremo, sinistra) : false;
    const da = entraDaDestra ? destra : sinistra, a = entraDaDestra ? sinistra : destra;
    if (ultima && estremo && puntoNelPoligono({ x: (estremo.x + da.x) / 2, y: (estremo.y + da.y) / 2 }, contorno) &&
      !contorno.some((p, i) => segmentiSiIncrociano(estremo, da, p, contorno[(i + 1) % contorno.length]))) {
      ultima.push(da, a);
    } else tracce.push([da, a]);
  }
  return tracce;
}

function dividiSerpentina(punti: Punto[], sviluppo: number): [Punto[], Punto[]] {
  let manca = sviluppo / 2;
  for (let i = 1; i < punti.length; i++) {
    const a = punti[i - 1], b = punti[i], lunghezza = distanza(a, b);
    if (lunghezza && manca <= lunghezza) {
      const t = manca / lunghezza;
      const centro = { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
      return [[...punti.slice(0, i), centro], [centro, ...punti.slice(i)]];
    }
    manca -= lunghezza;
  }
  return [punti, []];
}

function centriPorte(stato: Pick<StatoPianta, "muri" | "aperture">) {
  const muri = new Map(stato.muri.filter(m => m.stato !== "da_demolire").map(m => [m.id, m]));
  return stato.aperture.flatMap(a => {
    const m = muri.get(a.muroId);
    if (!m || a.stato === "da_demolire" || (a.tipo !== "porta" && a.tipo !== "varco")) return [];
    const l = distanza(m.p1, m.p2);
    if (!l) return [];
    const t = (a.offset + a.larghezza / 2) / l;
    return [{ x: m.p1.x + (m.p2.x - m.p1.x) * t, y: m.p1.y + (m.p2.y - m.p1.y) * t }];
  });
}

function collegamento(da: Punto, a: Punto, porte: Punto[], stato: Pick<StatoPianta, "muri" | "aperture">) {
  const candidati = [[da, { x: a.x, y: da.y }, a], [da, { x: da.x, y: a.y }, a]];
  if (porte.length) {
    // Limita la ricerca ai passaggi più vicini alla tratta.
    const vicine = [...porte].sort((p, q) => distanza(da, p) + distanza(p, a) - distanza(da, q) - distanza(q, a)).slice(0, 8);
    for (const p of vicine) candidati.push([da, p, a]);
  }
  return candidati.map(punti => {
    const metri = sviluppoCm(punti) / 100;
    const attraversamenti = attraversamentiImpianto({
      linea: "riscaldamento", daId: "", aId: "", da, a, vertici: punti.slice(1, -1), lunghezzaCm: metri * 100,
    }, stato).filter(v => !v.aperturaId);
    return { punti, metri, attraversamenti };
  }).sort((p, q) => p.attraversamenti.length - q.attraversamenti.length || p.metri - q.metri)[0];
}

/** Stima separata per circuito. La proiezione attiva è schematica, i raccordi sono misurati in pianta. */
export function circuitiRadianti(stato: Pick<StatoPianta, "locali" | "muri" | "aperture" | "pavimentoRadiante" | "collettoreRadiante">): CircuitoRadiante[] {
  const collettore = stato.collettoreRadiante;
  if (!collettore) return [];
  const { posizione, limiteCircuitoM } = collettore;
  const quote = quoteCollettoreRadiante(collettore.quotaCm);
  const porte = centriPorte(stato);
  return zoneRadianti(stato).flatMap(({ locale, zona, tuboM }) => {
    const tracce = serpentine(locale.contorno, zona.passoCm);
    const sviluppo = tracce.reduce((totale, p) => totale + sviluppoCm(p), 0);
    if (!(sviluppo > 0)) return [];
    const risultati: CircuitoRadiante[] = [];
    const stimaCircuito = (serpentina: Punto[]): CircuitoRadiante => {
      const m = collegamento(posizione, serpentina[0], porte, stato);
      const r = collegamento(serpentina[serpentina.length - 1], posizione, porte, stato);
      const mandataM = metriAlCentimetro(m.metri + quote.mandata / 100);
      const ritornoM = metriAlCentimetro(r.metri + quote.ritorno / 100);
      const tuboAttivoM = metriAlCentimetro(tuboM * sviluppoCm(serpentina) / sviluppo);
      const totaleM = metriAlCentimetro(tuboAttivoM + mandataM + ritornoM);
      const attraversamenti = [...m.attraversamenti, ...r.attraversamenti];
      return { localeId: locale.id, localeNome: locale.nome, numero: 0, mandata: m.punti, ritorno: r.punti, serpentina,
        mandataM, ritornoM, tuboAttivoM, totaleM, attraversamenti, superaObiettivo: totaleM > limiteCircuitoM };
    };
    for (let i = 0; i < tracce.length; i++) {
      const c = stimaCircuito(tracce[i]);
      const derivazioni = c.mandataM + c.ritornoM;
      if (c.superaObiettivo && derivazioni < limiteCircuitoM && c.tuboAttivoM > 4 && tracce.length < MASSIMO_CIRCUITI_PER_LOCALE) {
        const [a, b] = dividiSerpentina(c.serpentina, sviluppoCm(c.serpentina));
        if (b.length > 1) { tracce.splice(i, 1, a, b); i--; continue; }
      }
      risultati.push({ ...c, numero: risultati.length + 1 });
    }
    return risultati;
  });
}
