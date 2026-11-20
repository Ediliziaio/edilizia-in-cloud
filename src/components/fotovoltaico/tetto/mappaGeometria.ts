import { type MappaFv } from "../../../../supabase/functions/_shared/fvMappa";
import { creaPianoReale, type EdificioReale } from "./tettoReale";
import { edificioDaFalde, faldaDaOrto } from "./rilievoLocale";
import {
  areaPoligono,
  type DisegnoCommercialeFv,
  poligonoValido,
  type PuntoFv,
  puntoNelPoligono,
  segmentiSiIncrociano,
} from "../../../../supabase/functions/_shared/fvDisegnoCommerciale";
const sulBordo = (p: PuntoFv, ps: PuntoFv[]) =>
  ps.some((a, i) => {
    const b = ps[(i + 1) % ps.length],
      dx = b.x - a.x,
      dy = b.y - a.y,
      t = Math.max(
        0,
        Math.min(
          1,
          ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy),
        ),
      );
    return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy) < .001;
  });
function verificaSovrapposizioni(m: MappaFv) {
  for (let i = 0; i < m.falde.length; i++) {
    for (let j = i + 1; j < m.falde.length; j++) {
      const a = m.falde[i].punti, b = m.falde[j].punti;
      const interni = a.some((p) =>
        puntoNelPoligono(p, b) && !sulBordo(p, b)
      ) || b.some((p) => puntoNelPoligono(p, a) && !sulBordo(p, a));
      const incroci = a.some((p, i) =>
        b.some((q, j) =>
          segmentiSiIncrociano(
            p,
            a[(i + 1) % a.length],
            q,
            b[(j + 1) % b.length],
          )
        )
      );
      const uguali = Math.abs(areaPoligono(a) - areaPoligono(b)) < .001 &&
        a.every((p) => sulBordo(p, b));
      if (interni || incroci || uguali) {
        throw Error(
          `${m.falde[i].nome} e ${
            m.falde[j].nome
          } si sovrappongono: correggi i contorni.`,
        );
      }
    }
  }
}
export function edificioDaMappaFv(m: MappaFv): EdificioReale {
  if (!m.falde.length) throw Error("Disegna almeno una falda sul tetto.");
  verificaSovrapposizioni(m);
  const falde = m.falde.map((f) => {
    if (!poligonoValido(f.punti)) {
      throw Error(
        `${f.nome}: il perimetro deve essere semplice e senza incroci.`,
      );
    }
    return {
      ...faldaDaOrto(f.punti, 8, f.inclinazione, f.azimut, f.id),
      nome: f.nome,
    };
  });
  return {
    ...edificioDaFalde(falde, true),
    id: "tetto-da-mappa",
    attributi: {
      schemaPreventivo: true,
      origine: "satellite",
      altezzaStimata: true,
    },
  };
}
export function pianoDaMappaFv(
  m: MappaFv,
  modulo: DisegnoCommercialeFv["modulo"],
): DisegnoCommercialeFv {
  return { ...creaPianoReale(edificioDaMappaFv(m), modulo), mappa: m };
}
