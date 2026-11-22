import { distanzaPuntoSegmento, segmentiSiIncrociano } from "../../../../shared/planimetrie/geometria.ts";
import { funzionePareteDaVerificare } from "../../../../shared/planimetrie/modello.ts";
import type { Muro, Pianta, Punto } from "./adattatore";
import { eliminaMuro } from "./comandi";

export interface SegniDemolizioni {
  daSegnare: string[];
  protetti: string[];
}

const selezionabile = (m: Muro) => m.tipo === "tramezzo" && m.spessore < 20 && m.origine !== "stimata"
  && m.stato === "esistente" && !funzionePareteDaVerificare(m);

/** Interseziona tutto il movimento, anche se due eventi del puntatore sono lontani. */
export function muriSottoPennello(muri: Muro[], da: Punto, a: Punto, tolleranza: number): SegniDemolizioni {
  const segni: SegniDemolizioni = { daSegnare: [], protetti: [] };
  for (const m of muri) {
    if (m.stato !== "esistente") continue;
    const raggio = tolleranza + m.spessore / 2;
    const distanza = Math.min(
      distanzaPuntoSegmento(da, m.p1, m.p2),
      distanzaPuntoSegmento(a, m.p1, m.p2),
      distanzaPuntoSegmento(m.p1, da, a),
      distanzaPuntoSegmento(m.p2, da, a),
    );
    if (distanza <= raggio || segmentiSiIncrociano(da, a, m.p1, m.p2)) {
      (selezionabile(m) ? segni.daSegnare : segni.protetti).push(m.id);
    }
  }
  return segni;
}

export function segnaDemolizioniDalPennello(pianta: Pianta, ids: readonly string[]): Pianta {
  const voluti = new Set(ids);
  return pianta.muri.filter(m => voluti.has(m.id) && selezionabile(m))
    .reduce((p, m) => eliminaMuro(p, m.id, "progetto"), pianta);
}
