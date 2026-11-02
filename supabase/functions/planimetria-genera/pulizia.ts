// Due controlli sul risultato dell'AI, senza rete e senza modello:
//
//   · prima di costruire la pianta: le scritte che non sono stanze (arredi letti come locali,
//     «S», «W», «L» delle piante a quadretti) vengono sistemate;
//   · dopo averla costruita: le superfici scritte sul disegno (mq) si confrontano con quelle
//     calcolate dalle misure. Se non tornano si avvisa; se tutte sbagliano allo stesso modo si
//     corregge la scala, perché la quota letta dal modello era sbagliata.
//
// Nati dalla prova su 15 piante reali (02/11/2026): in 3 casi su 10 le superfici calcolate erano
// la metà o un terzo di quelle scritte, e un disegno in 3D arredato aveva armadi e cassettiere
// fra i locali.

import type { Destinazione, Planimetria } from "../../../shared/planimetrie/modello.ts";
import type { LocaleAI, RispostaAI } from "./rispostaAI.ts";
import type { PiantaGenerata } from "./generazione.ts";

/** Nomi di mobili: nel disegno sono arredi, non stanze. */
const ARREDO = /^(mobil[ei]|mobile|armadi[o]?|cassettier[ae]|scrivania|tavolo|tavolino|divano|divano angolare|lavello|piano cottura|frigo(rifero)?|libreria|mensola|comodino|credenza|tv|televisore|mobile tv|sedia|poltrona|letto (singolo|matrimoniale)|cucina componibile)(\s|$)/i;

/** Sigle delle piante a quadretti disegnate a mano, e altre abbreviazioni. */
const SIGLE: Record<string, { nome: string; destinazione: Destinazione }> = {
  s: { nome: "Soggiorno", destinazione: "soggiorno" },
  c: { nome: "Cucina", destinazione: "cucina" },
  l: { nome: "Camera", destinazione: "camera" },
  w: { nome: "Bagno", destinazione: "bagno" },
  wc: { nome: "Bagno", destinazione: "bagno" },
  b: { nome: "Bagno", destinazione: "bagno" },
  r: { nome: "Ripostiglio", destinazione: "ripostiglio" },
  rip: { nome: "Ripostiglio", destinazione: "ripostiglio" },
  d: { nome: "Disimpegno", destinazione: "disimpegno" },
  dis: { nome: "Disimpegno", destinazione: "disimpegno" },
  i: { nome: "Ingresso", destinazione: "ingresso" },
};

export interface EsitoPulizia {
  risposta: RispostaAI;
  scartati: string[];
  rinominati: string[];
}

export function pulisciLocali(r: RispostaAI): EsitoPulizia {
  const scartati: string[] = [];
  const rinominati: string[] = [];
  const tenuti: LocaleAI[] = [];
  for (const l of r.locali) {
    const nome = l.nome.trim();
    // il modello dà all'arredo una destinazione qualsiasi («mobili cucina» → cucina, «armadio» → disimpegno): conta il nome
    if (ARREDO.test(nome)) {
      scartati.push(nome);
      continue;
    }
    const sigla = SIGLE[nome.toLowerCase().replace(/\.$/, "")];
    if (sigla && (nome.length <= 3)) {
      rinominati.push(`${nome} → ${sigla.nome}`);
      tenuti.push({ ...l, nome: sigla.nome, destinazione: sigla.destinazione });
      continue;
    }
    tenuti.push(l);
  }
  // Mai svuotare la pianta: se tutto sembrava un arredo, resta la lettura del modello.
  if (!tenuti.length) return { risposta: r, scartati: [], rinominati: [] };
  return { risposta: { ...r, locali: tenuti }, scartati, rinominati };
}

const area = (c: Array<{ x: number; y: number }>): number => {
  let s = 0;
  for (let i = 0; i < c.length; i++) {
    const a = c[i], b = c[(i + 1) % c.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
};
const mediana = (v: number[]): number => {
  const o = [...v].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
};

/** Oltre questo scarto (25%) fra mq scritti e calcolati, la scala è sospetta. */
export const SCARTO_AREE = 0.25;

function scalaLivelli(p: Planimetria, f: number): Planimetria {
  const pt = (q: { x: number; y: number }) => ({ x: Math.round(q.x * f * 10) / 10, y: Math.round(q.y * f * 10) / 10 });
  return {
    ...p,
    livelli: p.livelli.map((l) => ({
      ...l,
      fatto: {
        ...l.fatto,
        muri: l.fatto.muri.map((m) => ({ ...m, p1: pt(m.p1), p2: pt(m.p2) })),
        aperture: l.fatto.aperture.map((a) => ({ ...a, offset: Math.round(a.offset * f * 10) / 10, larghezza: Math.round(a.larghezza * f * 10) / 10 })),
        locali: l.fatto.locali.map((x) => ({ ...x, contorno: x.contorno.map(pt) })),
        elementi: l.fatto.elementi.map((e) => ({
          ...e,
          posizione: pt(e.posizione),
          larghezza: Math.round(e.larghezza * f * 10) / 10,
          profondita: Math.round(e.profondita * f * 10) / 10,
        })),
        ...(l.fatto.aree ? { aree: l.fatto.aree.map((a) => ({ ...a, contorno: a.contorno.map(pt) })) } : {}),
      },
    })),
  };
}

/**
 * Confronta i mq scritti sul disegno con quelli calcolati dalle misure.
 * - Con due o più mq scritti, tutti sbagliati allo stesso modo (rapporti vicini fra loro):
 *   la scala è corretta sui mq scritti e lo si dice.
 * - Se sbagliano in modo diverso (stanze lette male, non solo scala): non si tocca nulla,
 *   si avvisa e la scala resta da confermare.
 */
export function controllaSuperfici(g: PiantaGenerata): PiantaGenerata {
  const scritte = g.generazione.superfici_scritte ?? {};
  const calcolate = new Map<string, number>();
  for (const l of g.planimetria.livelli) for (const x of l.fatto.locali) calcolate.set(x.id, area(x.contorno) / 10_000);
  const rapporti: Array<{ id: string; rapporto: number }> = [];
  for (const [id, mq] of Object.entries(scritte)) {
    const c = calcolate.get(id);
    if (c && c > 0.5 && mq > 0.5) rapporti.push({ id, rapporto: mq / c });
  }
  if (rapporti.length < 1) return g;
  const m = mediana(rapporti.map((r) => r.rapporto));
  if (Math.abs(m - 1) <= SCARTO_AREE) return g;

  const coerenti = rapporti.length >= 2 && rapporti.every((r) => r.rapporto >= m * 0.75 && r.rapporto <= m * 1.33);
  const quanti = rapporti.length === 1 ? "la superficie scritta" : `le ${rapporti.length} superfici scritte`;
  if (coerenti) {
    const f = Math.sqrt(m);
    const scala = g.generazione.scala
      ? { ...g.generazione.scala, metodo: "superficie_letta" as const, cm_per_unita: Math.round(g.generazione.scala.cm_per_unita * f * 10000) / 10000, da_confermare: false }
      : g.generazione.scala;
    return {
      planimetria: scalaLivelli(g.planimetria, f),
      generazione: {
        ...g.generazione,
        scala,
        avvisi: [...g.generazione.avvisi, `La scala letta non tornava con ${quanti} sul disegno: le misure sono state portate a quelle dei metri quadri scritti (×${f.toFixed(2)}). Controlla una parete che conosci.`],
      },
    };
  }
  return {
    planimetria: g.planimetria,
    generazione: {
      ...g.generazione,
      scala: g.generazione.scala ? { ...g.generazione.scala, da_confermare: true } : g.generazione.scala,
      avvisi: [...g.generazione.avvisi, `I metri quadri scritti sul disegno non tornano con le stanze ricavate (${rapporti.slice(0, 3).map((r) => `${r.rapporto.toFixed(1)}×`).join(", ")}): controlla la scala e il disegno delle stanze prima di usarla.`],
    },
  };
}

/** Larghezze normali di una porta interna o di ingresso, in cm: fuori da qui la scala è sospetta. */
const PORTA_MIN = 60;
const PORTA_MAX = 115;
/** Metrature tipiche (m²) per capire se le stanze sono grandi o piccole in modo assurdo. */
const TIPICHE: Partial<Record<string, number>> = { camera: 13, bagno: 5 };

/**
 * La scala letta dalle quote o dalle superfici scritte si dava per buona. Ma il modello sbaglia
 * a collegare un numero al tratto che misura, e una scala sbagliata non si vede: la pianta è
 * pulita ma tutta troppo grande o troppo piccola. Due prove che non richiedono altro:
 * le porte hanno una larghezza che conosciamo, le camere e i bagni una metratura tipica.
 * Se nessuna delle due torna, la scala resta «da confermare» e si dice perché. Non si corregge
 * da soli: senza una misura vera non sappiamo da che parte sbaglia.
 */
export function controllaScala(g: PiantaGenerata): PiantaGenerata {
  const scala = g.generazione.scala;
  if (!scala || scala.da_confermare || scala.metodo === "misura_utente" || scala.metodo === "in_metri") return g;
  const motivi: string[] = [];

  const porte = g.planimetria.livelli.flatMap((l) => l.fatto.aperture.filter((a) => a.tipo === "porta").map((a) => a.larghezza));
  if (porte.length >= 2) {
    const m = mediana(porte);
    if (m < PORTA_MIN || m > PORTA_MAX) motivi.push(`le porte risultano larghe circa ${Math.round(m)} cm (normali: 70-100)`);
  }

  const rapporti: number[] = [];
  for (const l of g.planimetria.livelli) {
    for (const x of l.fatto.locali) {
      const tipica = TIPICHE[x.destinazione];
      const mq = area(x.contorno) / 10_000;
      if (tipica && mq > 0.3) rapporti.push(mq / tipica);
    }
  }
  if (rapporti.length >= 2) {
    const r = mediana(rapporti);
    if (r > 2.5) motivi.push("le camere e i bagni risultano molto più grandi del normale");
    else if (r < 0.4) motivi.push("le camere e i bagni risultano molto più piccoli del normale");
  }
  if (!motivi.length) return g;
  return {
    planimetria: g.planimetria,
    generazione: {
      ...g.generazione,
      scala: { ...scala, da_confermare: true },
      avvisi: [...g.generazione.avvisi, `La scala letta dal disegno non sembra giusta: ${motivi.join("; ")}. Scrivi la misura vera di una parete per sistemarla.`],
    },
  };
}
