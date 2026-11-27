import { type MappaFv } from "../../../../supabase/functions/_shared/fvMappa";
import { creaPianoReale, riferimentiTettoReale, type EdificioReale } from "./tettoReale";
import { edificioDaFalde, faldaDaOrto } from "./rilievoLocale";
import {
  areaPoligono,
  type DisegnoCommercialeFv,
  poligonoValido,
  type PuntoFv,
  puntoNelPoligono,
  rettangoloNellaFalda,
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
function verificaSovrapposizioni(m: Pick<MappaFv, "falde">) {
  for (let i = 0; i < m.falde.length; i++) {
    for (let j = i + 1; j < m.falde.length; j++) {
      const a = m.falde[i].punti, b = m.falde[j].punti;
      const campioni = (ps: PuntoFv[]) => [...ps, ...ps.map((p, k) => ({ x: (p.x + ps[(k + 1) % ps.length].x) / 2, y: (p.y + ps[(k + 1) % ps.length].y) / 2 }))];
      const interni = campioni(a).some((p) =>
        puntoNelPoligono(p, b) && !sulBordo(p, b)
      ) || campioni(b).some((p) => puntoNelPoligono(p, a) && !sulBordo(p, a));
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
export function erroreFaldeMappaFv(falde: MappaFv["falde"]): string {
  const nonValida = falde.find(f => !poligonoValido(f.punti));
  if (nonValida) return `${nonValida.nome}: correggi i lati incrociati o i vertici sovrapposti.`;
  try {
    verificaSovrapposizioni({ falde });
    return "";
  } catch (e) { return e instanceof Error ? e.message : "Controlla i contorni delle falde."; }
}
export function edificioDaMappaFv(m: MappaFv, altezza = 8): EdificioReale {
  if (!Number.isFinite(altezza) || altezza < 2 || altezza > 150) throw Error("Altezza edificio non valida.");
  if (!m.falde.length) throw Error("Disegna almeno una falda sul tetto.");
  verificaSovrapposizioni(m);
  const falde = m.falde.map((f) => {
    if (!poligonoValido(f.punti)) {
      throw Error(
        `${f.nome}: il perimetro deve essere semplice e senza incroci.`,
      );
    }
    return {
      ...faldaDaOrto(f.punti, altezza + (f.dislivelloGronda ?? 0), f.inclinazione, f.azimut, f.id),
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

/** Aggiorna i contorni conservando posa, ostacoli e impostazioni delle falde non modificate. */
export function aggiornaPianoDaMappaFv(mappa: MappaFv, precedente: DisegnoCommercialeFv | null): DisegnoCommercialeFv {
  const nuovo = pianoDaMappaFv(mappa, precedente?.modulo ?? { corto: 1.134, lungo: 1.762, stimato: true });
  if (!precedente?.mappa) return nuovo;
  const prima = riferimentiTettoReale(edificioDaMappaFv(precedente.mappa));
  const dopo = riferimentiTettoReale(edificioDaMappaFv(mappa));
  const geometria = (f: MappaFv["falde"][number] | undefined) => f ? JSON.stringify([f.punti,f.inclinazione,f.azimut,f.dislivelloGronda ?? 0]) : "";
  const conservate = new Map(mappa.falde.filter(f => geometria(f) === geometria(precedente.mappa!.falde.find(q => q.id === f.id))).map(f => {
    const a = prima.find(q => q.faccia.id === f.id)!.offset, b = dopo.find(q => q.faccia.id === f.id)!.offset;
    return [f.id, { x: b.x-a.x, y: b.y-a.y }];
  }));
  return { ...precedente, ...nuovo,
    falde: nuovo.falde.map(f => {const d=conservate.get(f.id),prima=precedente.falde.find(q=>q.id===f.id);return d&&prima?{...f,punti:prima.punti.map(p=>({x:p.x+d.x,y:p.y+d.y}))}:f;}),
    pannelli: precedente.pannelli.flatMap(p => { const d = conservate.get(p.faldaId); return d ? [{...p,x:p.x+d.x,y:p.y+d.y}] : []; }),
    ostacoli: precedente.ostacoli.flatMap(o => {const f=precedente.falde.find(f=>rettangoloNellaFalda(o,f,0)),d=f&&conservate.get(f.id);return d?[{...o,x:o.x+d.x,y:o.y+d.y}]:[];}),
  };
}
