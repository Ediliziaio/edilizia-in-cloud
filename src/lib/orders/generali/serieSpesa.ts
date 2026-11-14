/**
 * Speso contro piano, mese per mese (Panoramica della commessa generale, 14/11/2026).
 *
 * Il piano dice quanto si spende in ogni mese (ogni voce di costo col suo mese, divisa sulla
 * sua durata); il reale dice quanto si è speso davvero (costi alla loro data). Il grafico li
 * mette uno sopra l'altro, cumulati: dove la linea piena sta sopra la tratteggiata si è speso
 * più del previsto a quella data. Il reale si ferma a oggi; il piano prosegue fino alla fine.
 */
import { distanzaMesi, distribuisci, meseDi, type RigaReale, type VocePiano } from "./pianoConti";
import { aggiungiMesi } from "./pianoCategorie";
import { stimaMancante } from "./budgetCompletezza";

export interface PuntoSpesa {
  mese: string;
  /** Piano cumulato a fine mese. */
  piano: number;
  /** Speso cumulato a fine mese; null dopo oggi. */
  speso: number | null;
}

export interface SerieSpesa {
  punti: PuntoSpesa[];
  oggi: string;
  spesoOggi: number;
  pianoOggi: number;
  /** Speso − piano a oggi: positivo = si è speso più del previsto. */
  differenza: number;
  pianoTotale: number;
  /** Voci del piano ancora da stimare (stessa regola del percorso «Completa l'operazione»). */
  vociSenzaImporto: number;
}

const tondo = (n: number) => Math.round(n * 100) / 100;

export function serieSpesaPianoReale(voci: VocePiano[], righe: RigaReale[], oggiData: string): SerieSpesa {
  const oggi = oggiData.slice(0, 7);
  const pianoPerMese = new Map<string, number>();
  for (const v of voci) {
    if (v.tipo !== "costo" || !v.mese || !v.importo) continue;
    for (const q of distribuisci(v.importo, v.mese, v.durataMesi)) pianoPerMese.set(q.mese, (pianoPerMese.get(q.mese) ?? 0) + q.importo);
  }
  const spesoPerMese = new Map<string, number>();
  for (const r of righe) {
    if (r.tipo !== "costo" || !r.importo) continue;
    const m = meseDi(r.data, oggi);
    spesoPerMese.set(m, (spesoPerMese.get(m) ?? 0) + r.importo);
  }
  const vociSenzaImporto = voci.filter((v) => v.tipo === "costo" && stimaMancante(v)).length;
  const mesi = [...pianoPerMese.keys(), ...spesoPerMese.keys(), oggi].sort();
  if (pianoPerMese.size === 0 && spesoPerMese.size === 0) {
    return { punti: [], oggi, spesoOggi: 0, pianoOggi: 0, differenza: 0, pianoTotale: 0, vociSenzaImporto };
  }
  const primo = mesi[0];
  const quanti = distanzaMesi(primo, mesi[mesi.length - 1]) + 1;
  let piano = 0;
  let speso = 0;
  let pianoOggi = 0;
  let spesoOggi = 0;
  const punti: PuntoSpesa[] = [];
  for (let i = 0; i < quanti; i++) {
    const mese = aggiungiMesi(primo, i);
    piano = tondo(piano + (pianoPerMese.get(mese) ?? 0));
    speso = tondo(speso + (spesoPerMese.get(mese) ?? 0));
    if (mese <= oggi) {
      pianoOggi = piano;
      spesoOggi = speso;
    }
    punti.push({ mese, piano, speso: mese <= oggi ? speso : null });
  }
  return {
    punti,
    oggi,
    spesoOggi,
    pianoOggi,
    differenza: tondo(spesoOggi - pianoOggi),
    pianoTotale: piano,
    vociSenzaImporto,
  };
}
