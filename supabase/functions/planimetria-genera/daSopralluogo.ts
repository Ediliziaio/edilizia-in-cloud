// Ingresso «dal sopralluogo» (v1): dall'elenco delle stanze con mq e altezza
// esce una pianta a riquadri. Le superfici sono quelle rilevate; la forma e la
// disposizione sono inventate per avere qualcosa da correggere, e quindi
// «stimate». Il modulo Sopralluoghi non cambia: si leggono survey_areas
// (name, area_data.superficie in mq, area_data.altezza in m).

import type { PiantaGenerata } from "./generazione.ts";
import { costruisciPlanimetria } from "./costruisci.ts";
import { destinazioneDa, numero, type RispostaAI } from "./rispostaAI.ts";

export interface StanzaSopralluogo {
  nome: string;
  superficie_mq: number | null;
  altezza_m: number | null;
}

/** survey_areas → stanze; le aree senza superficie restano fuori (e lo si dice). */
export function stanzeDaAreeSopralluogo(aree: Array<{ name: string; area_data: Record<string, unknown> | null }>): StanzaSopralluogo[] {
  return aree.map((a) => ({
    nome: a.name,
    superficie_mq: numero(a.area_data?.superficie ?? a.area_data?.superficie_mq ?? null),
    altezza_m: numero(a.area_data?.altezza ?? a.area_data?.altezza_m ?? null),
  }));
}

export function planimetriaDaSopralluogo(stanze: StanzaSopralluogo[], sorgente: string | null = null): PiantaGenerata {
  const valide = stanze.filter((s) => s.superficie_mq && s.superficie_mq > 0.5 && s.superficie_mq < 500);
  if (!valide.length) throw new Error("Nel sopralluogo non ci sono stanze con la superficie.");
  const totale = valide.reduce((s, x) => s + x.superficie_mq!, 0);
  // Righe di stanze affiancate, tutte larghe uguale: le aree restano esatte.
  const righe = Math.max(1, Math.round(Math.sqrt(valide.length / 1.5)));
  const larghezza = Math.sqrt(totale * 1.4);
  const perRiga = totale / righe;
  const gruppi: StanzaSopralluogo[][] = [[]];
  let accumulata = 0;
  for (const s of valide) {
    const corrente = gruppi[gruppi.length - 1];
    if (corrente.length && accumulata + s.superficie_mq! / 2 > perRiga * gruppi.length && gruppi.length < righe) {
      gruppi.push([s]);
    } else {
      corrente.push(s);
    }
    accumulata += s.superficie_mq!;
  }
  const risposta: RispostaAI = {
    sistema: "metri",
    leggibile: true,
    motivo_non_leggibile: null,
    altezza_m: null,
    locali: [],
    aperture: [],
    quote: [],
  };
  // Fra due stanze c'è un tramezzo (10 cm): le righe sono tutte larghe uguale
  // fuori tutto e ogni stanza ha esattamente la sua superficie.
  const tramezzo = 0.1;
  let y = 0;
  for (const g of gruppi) {
    const area = g.reduce((s, x) => s + x.superficie_mq!, 0);
    const netta = larghezza - tramezzo * (g.length - 1);
    const profondita = area / netta;
    let x = 0;
    for (const s of g) {
      const w = s.superficie_mq! / profondita;
      risposta.locali.push({
        nome: s.nome,
        destinazione: destinazioneDa(null, s.nome),
        contorno: [[x, y], [x + w, y], [x + w, y + profondita], [x, y + profondita]],
        superficie_scritta_mq: s.superficie_mq,
        altezza_scritta_m: s.altezza_m,
        misure_lette: false,
      });
      x += w + tramezzo;
    }
    y += profondita + tramezzo;
  }
  const g = costruisciPlanimetria(risposta, { ingresso: "sopralluogo", sorgentePath: sorgente });
  // Le altezze del sopralluogo le ha misurate una persona.
  const locali = g.planimetria.livelli[0].fatto.locali;
  for (const loc of locali) {
    const s = valide.find((v) => v.nome === loc.nome);
    if (!s?.altezza_m) continue;
    loc.altezza = s.altezza_m * 100;
    loc.origineMisure = { ...(loc.origineMisure ?? {}), altezza: "rilevata" };
  }
  const senza = stanze.length - valide.length;
  g.generazione.avvisi = [
    "Le superfici sono quelle del sopralluogo; forma e posizione delle stanze sono indicative: spostale come sono davvero.",
    ...(senza ? [`${senza === 1 ? "Una stanza non aveva" : `${senza} stanze non avevano`} la superficie e non è nella pianta.`] : []),
    ...(locali.some((l) => (l.origineMisure?.altezza ?? l.origine) !== "rilevata") ? ["Altezza non indicata per alcune stanze: ho messo 2,70 m."] : []),
  ];
  return g;
}
