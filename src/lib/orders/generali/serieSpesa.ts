/**
 * Previsto contro reale, mese per mese (Panoramica della commessa generale, 14/11/2026).
 *
 * Tre misure, ognuna cumulata a fine mese:
 * - costi: il piano (ogni voce di costo col suo mese, divisa sulla sua durata) contro lo speso
 *   registrato alla sua data;
 * - ricavi: il piano (le voci di ricavo, es. le vendite delle unità) contro quello ottenuto
 *   (fatture e vendite registrate);
 * - margine: ricavi − costi, del piano e del reale.
 * Il reale si ferma a oggi; il piano prosegue fino alla fine. Le voci senza mese non entrano.
 */
import { distanzaMesi, distribuisci, meseDi, type RigaReale, type VocePiano } from "./pianoConti";
import { aggiungiMesi } from "./pianoCategorie";
import { stimaMancante } from "./budgetCompletezza";

export type Misura = "costi" | "ricavi" | "margine";

export interface PuntoConfronto {
  mese: string;
  costiPiano: number;
  costiReale: number | null;
  ricaviPiano: number;
  ricaviReale: number | null;
  marginePiano: number;
  margineReale: number | null;
}

export interface TotaliMisura {
  /** Reale a oggi. */
  realeOggi: number;
  /** Piano a oggi. */
  pianoOggi: number;
  /** Piano a fine lavori. */
  pianoTotale: number;
  /** Reale − piano a oggi. */
  differenza: number;
}

export interface SerieConfronto {
  punti: PuntoConfronto[];
  oggi: string;
  totali: Record<Misura, TotaliMisura>;
  /** Voci del piano ancora da stimare (stessa regola del percorso «Completa l'operazione»). */
  vociSenzaImporto: number;
  /** Voci di ricavo senza mese: nel totale del piano ci sono, nella linea no. */
  ricaviSenzaMese: number;
}

const tondo = (n: number) => Math.round(n * 100) / 100;

/** Il segno «buono» di ogni misura: un costo sopra il piano è male, un ricavo o un margine sopra è bene. */
export const sopraEBene = (m: Misura) => m !== "costi";

export function serieConfronto(voci: VocePiano[], righe: RigaReale[], oggiData: string): SerieConfronto {
  const oggi = oggiData.slice(0, 7);
  const piano = { costo: new Map<string, number>(), ricavo: new Map<string, number>() };
  const reale = { costo: new Map<string, number>(), ricavo: new Map<string, number>() };
  for (const v of voci) {
    if (!v.mese || !v.importo) continue;
    for (const q of distribuisci(v.importo, v.mese, v.durataMesi)) piano[v.tipo].set(q.mese, (piano[v.tipo].get(q.mese) ?? 0) + q.importo);
  }
  for (const r of righe) {
    if (!r.importo) continue;
    const m = meseDi(r.data, oggi);
    reale[r.tipo].set(m, (reale[r.tipo].get(m) ?? 0) + r.importo);
  }
  const vociSenzaImporto = voci.filter((v) => v.tipo === "costo" && stimaMancante(v)).length;
  const ricaviSenzaMese = voci.filter((v) => v.tipo === "ricavo" && !v.mese && v.importo).length;
  const vuoto: TotaliMisura = { realeOggi: 0, pianoOggi: 0, pianoTotale: 0, differenza: 0 };
  const mesi = [...piano.costo.keys(), ...piano.ricavo.keys(), ...reale.costo.keys(), ...reale.ricavo.keys()].sort();
  if (mesi.length === 0) {
    return { punti: [], oggi, totali: { costi: vuoto, ricavi: vuoto, margine: vuoto }, vociSenzaImporto, ricaviSenzaMese };
  }
  mesi.push(oggi);
  mesi.sort();
  const primo = mesi[0];
  const quanti = distanzaMesi(primo, mesi[mesi.length - 1]) + 1;
  let cp = 0, cr = 0, rp = 0, rr = 0;
  const punti: PuntoConfronto[] = [];
  let aOggi: PuntoConfronto | null = null;
  for (let i = 0; i < quanti; i++) {
    const mese = aggiungiMesi(primo, i);
    cp = tondo(cp + (piano.costo.get(mese) ?? 0));
    rp = tondo(rp + (piano.ricavo.get(mese) ?? 0));
    cr = tondo(cr + (reale.costo.get(mese) ?? 0));
    rr = tondo(rr + (reale.ricavo.get(mese) ?? 0));
    const passato = mese <= oggi;
    const p: PuntoConfronto = {
      mese,
      costiPiano: cp,
      ricaviPiano: rp,
      marginePiano: tondo(rp - cp),
      costiReale: passato ? cr : null,
      ricaviReale: passato ? rr : null,
      margineReale: passato ? tondo(rr - cr) : null,
    };
    if (passato) aOggi = p;
    punti.push(p);
  }
  const fine = punti[punti.length - 1];
  const tot = (pianoOggi: number, realeOggi: number, pianoTotale: number): TotaliMisura => ({
    pianoOggi, realeOggi, pianoTotale, differenza: tondo(realeOggi - pianoOggi),
  });
  return {
    punti,
    oggi,
    totali: {
      costi: tot(aOggi?.costiPiano ?? 0, aOggi?.costiReale ?? 0, fine.costiPiano),
      ricavi: tot(aOggi?.ricaviPiano ?? 0, aOggi?.ricaviReale ?? 0, fine.ricaviPiano),
      margine: tot(aOggi?.marginePiano ?? 0, aOggi?.margineReale ?? 0, fine.marginePiano),
    },
    vociSenzaImporto,
    ricaviSenzaMese,
  };
}
