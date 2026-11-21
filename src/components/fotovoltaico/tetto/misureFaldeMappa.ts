import { areaPoligono, type DisegnoCommercialeFv } from "../../../../supabase/functions/_shared/fvDisegnoCommerciale";

/** La pianta satellitare e il piano inclinato hanno misure diverse. */
export function misureFaldeMappa(piano: DisegnoCommercialeFv) {
  return (piano.mappa?.falde ?? []).flatMap((mappa) => {
    const falda = piano.falde.find((f) => f.id === mappa.id);
    if (!falda) return [];
    return [{
      id: falda.id, nome: falda.nome,
      pianta: areaPoligono(mappa.punti), superficie: areaPoligono(falda.punti),
      inclinazione: mappa.inclinazione, azimut: mappa.azimut,
      stimata: mappa.inclinazioneStimata,
      lati: falda.punti.map((p, i) => {
        const q = falda.punti[(i + 1) % falda.punti.length];
        return Math.hypot(q.x - p.x, q.y - p.y);
      }),
    }];
  });
}
