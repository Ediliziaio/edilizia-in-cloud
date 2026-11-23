import { distanzaPuntoSegmento, puntoNelPoligono, segmentiSiIncrociano } from "../../../../shared/planimetrie/geometria";
import { angoli, siSovrappongono } from "../../../../shared/planimetrie/interferenze";
import { ARREDI_SOVRAPPONIBILI, rettangoliIngombroArredo } from "../../../../shared/planimetrie/modelliArredo";
import type { Elemento, Punto } from "../../../../shared/planimetrie/modello";

function contorniIngombro(e: Elemento): Punto[][] {
  if (e.tipo !== "cucina_angolare") return [angoli(e)];
  const a = e.rotazione * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  return rettangoliIngombroArredo(e.tipo, e.larghezza, e.profondita).map(({ x, y, larghezza, profondita }) => angoli({
    ...e, larghezza, profondita,
    posizione: { x: e.posizione.x + x * c + y * s, y: e.posizione.y + x * s - y * c },
  }));
}

export function ingombroDentroLocale(e: Elemento, contorno: Punto[]): boolean {
  const lati = contorno.map((a, i) => [a, contorno[(i + 1) % contorno.length]] as const);
  return contorniIngombro(e).every(vertici => {
    // Evita che una rotazione esatta di 90° trasformi un contatto in un incrocio per un errore in virgola mobile.
    const arrotonda = (cm: number) => Math.round(cm * 1e8) / 1e8;
    const ingombro = vertici.map(({ x, y }) => ({ x: arrotonda(x), y: arrotonda(y) }));
    const puntiControllo = ingombro.flatMap((a, i) => {
      const b = ingombro[(i + 1) % ingombro.length];
      return [a, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }];
    });
    return puntiControllo.every(p => puntoNelPoligono(p, contorno) || lati.some(([a, b]) => distanzaPuntoSegmento(p, a, b) < .0001)) &&
      !ingombro.some((a, i) => lati.some(([c, d]) => segmentiSiIncrociano(a, ingombro[(i + 1) % ingombro.length], c, d)));
  });
}

export function ingombriArrediSovrapposti(a: Elemento, b: Elemento): boolean {
  // tappeto sotto il divano, lampada sopra il tavolo, quadro e specchio appesi dietro un mobile: non è un urto
  if (ARREDI_SOVRAPPONIBILI.has(a.tipo) !== ARREDI_SOVRAPPONIBILI.has(b.tipo)) return false;
  if (ARREDI_SOVRAPPONIBILI.has(a.tipo) && a.tipo !== b.tipo) return false;
  const ingombroB = contorniIngombro(b);
  return contorniIngombro(a).some(pezzo => ingombroB.some(altro => siSovrappongono(pezzo, altro)));
}
