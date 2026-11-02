/**
 * Unità di un edificio (appartamenti, negozi, box): superfici, superficie commerciale e
 * millesimi di proprietà, dalla pianta.
 *
 * Ogni locale con il campo «unità» conta per quella unità, su tutti i piani; «Parti comuni» (e
 * simili) non conta. Superficie commerciale = netta di ogni locale × un coefficiente secondo la
 * destinazione (criteri usuali di mercato, DPR 138/1998 semplificato): abitativo 1, balconi e
 * terrazzi 0,30, cantine e ripostigli esterni 0,25, garage e box 0,50. I muri non si contano (la
 * pianta misura al filo interno): è una superficie netta ragguagliata, non quella catastale.
 *
 * Millesimi: in proporzione alla superficie commerciale, arrotondati a due decimali, con la
 * somma che fa 1000 esatti. Sono una proposta: la tabella vera la firma un tecnico.
 */
import { areaPoligono } from "../../../shared/planimetrie/geometria.ts";
import type { Planimetria, StatoVendita, VenditaUnita } from "../../../shared/planimetrie/modello.ts";
import { statoPerAmbito } from "../../../shared/render-planimetria/vincoli.ts";

export const COEFFICIENTI_UNITA: Record<string, number> = { balcone: 0.3, terrazzo: 0.3, cantina: 0.25, garage: 0.5 };
const comune = (s: string) => /comun|condominial|androne/i.test(s);

export interface LocaleUnita { id: string; livelloId: string; livello: string; nome: string; destinazione: string; mq: number; coefficiente: number }
export interface Unita {
  sigla: string;
  piani: string[];
  locali: LocaleUnita[];
  mqNetti: number;
  mqCommerciali: number;
  millesimi: number;
  vendita: VenditaUnita;
  /** Prezzo pattuito se c'è, altrimenti prezzo al mq × superficie commerciale. */
  prezzo: number | null;
  /** Da incassare: prezzo meno incassato (solo per le unità prenotate o vendute). */
  residuo: number | null;
}

const arr2 = (v: number) => Math.round(v * 100) / 100;

export function unitaDellEdificio(doc: Planimetria, ambito = "fatto"): Unita[] {
  const per = new Map<string, LocaleUnita[]>();
  for (const l of [...doc.livelli].sort((a, b) => a.quota - b.quota)) {
    const stato = statoPerAmbito(doc, l.id, ambito) ?? l.fatto;
    for (const loc of stato.locali) {
      if (!loc.unita?.trim() || comune(loc.unita)) continue;
      const mq = areaPoligono(loc.contorno) / 10_000;
      const lista = per.get(loc.unita.trim()) ?? [];
      lista.push({ id: loc.id, livelloId: l.id, livello: l.nome, nome: loc.nome, destinazione: loc.destinazione, mq: arr2(mq), coefficiente: COEFFICIENTI_UNITA[loc.destinazione] ?? 1 });
      per.set(loc.unita.trim(), lista);
    }
  }
  const unita = [...per.entries()].map(([sigla, locali]): Unita => {
    const mqNetti = arr2(locali.reduce((t, l) => t + l.mq, 0));
    const mqCommerciali = arr2(locali.reduce((t, l) => t + l.mq * l.coefficiente, 0));
    const vendita = doc.vendite?.[sigla] ?? {};
    return {
      sigla, locali, mqNetti, mqCommerciali, millesimi: 0, vendita,
      piani: [...new Set(locali.map((l) => l.livello))],
      prezzo: vendita.prezzoPattuito ? Math.round(vendita.prezzoPattuito) : vendita.prezzoMq ? Math.round(vendita.prezzoMq * mqCommerciali) : null,
      residuo: null,
    };
  });
  // millesimi: arrotondati, poi il resto all'unità più grande perché la somma faccia 1000
  const totale = unita.reduce((t, u) => t + u.mqCommerciali, 0);
  if (totale > 0) {
    for (const u of unita) u.millesimi = arr2((u.mqCommerciali / totale) * 1000);
    const scarto = arr2(1000 - unita.reduce((t, u) => t + u.millesimi, 0));
    const grande = unita.reduce((m, u) => (u.mqCommerciali > m.mqCommerciali ? u : m), unita[0]);
    if (grande) grande.millesimi = arr2(grande.millesimi + scarto);
  }
  for (const u of unita) {
    if (u.vendita.stato && u.vendita.stato !== "libera" && u.prezzo != null) u.residuo = Math.max(0, u.prezzo - (u.vendita.incassato ?? u.vendita.caparra ?? 0));
  }
  return unita.sort((a, b) => a.sigla.localeCompare(b.sigla, "it", { numeric: true }));
}

/** Il riepilogo delle vendite: listino, venduto e prenotato, incassato e da incassare. */
export function riepilogoVendite(unita: Unita[]) {
  const somma = (f: (u: Unita) => number) => unita.reduce((t, u) => t + f(u), 0);
  const trattate = unita.filter((u) => u.vendita.stato && u.vendita.stato !== "libera");
  return {
    listino: somma((u) => u.prezzo ?? 0),
    venduto: somma((u) => (u.vendita.stato === "venduta" ? u.prezzo ?? 0 : 0)),
    prenotato: somma((u) => (u.vendita.stato === "prenotata" ? u.prezzo ?? 0 : 0)),
    incassato: trattate.reduce((t, u) => t + (u.vendita.incassato ?? u.vendita.caparra ?? 0), 0),
    daIncassare: trattate.reduce((t, u) => t + (u.residuo ?? 0), 0),
    libere: unita.length - trattate.length,
  };
}

export const NOMI_STATO_VENDITA: Record<StatoVendita, string> = { libera: "Libera", prenotata: "Prenotata", venduta: "Venduta" };

/** Il documento con il listino aggiornato per un'unità (campi vuoti tolti). */
export function conVendita(doc: Planimetria, sigla: string, v: VenditaUnita): Planimetria {
  const pulita: VenditaUnita = {
    ...(v.prezzoMq != null && v.prezzoMq > 0 ? { prezzoMq: v.prezzoMq } : {}),
    ...(v.stato && v.stato !== "libera" ? { stato: v.stato } : {}),
    ...(v.note?.trim() ? { note: v.note.trim() } : {}),
    ...(v.acquirente?.trim() ? { acquirente: v.acquirente.trim() } : {}),
    ...(v.prezzoPattuito != null && v.prezzoPattuito > 0 ? { prezzoPattuito: v.prezzoPattuito } : {}),
    ...(v.caparra != null && v.caparra > 0 ? { caparra: v.caparra } : {}),
    ...(v.incassato != null && v.incassato > 0 ? { incassato: v.incassato } : {}),
    ...(v.dataPreliminare ? { dataPreliminare: v.dataPreliminare } : {}),
    ...(v.dataRogito ? { dataRogito: v.dataRogito } : {}),
  };
  const vendite = { ...(doc.vendite ?? {}) };
  if (Object.keys(pulita).length) vendite[sigla] = pulita;
  else delete vendite[sigla];
  const { vendite: _prima, ...resto } = doc;
  return Object.keys(vendite).length ? { ...resto, vendite } : resto;
}
