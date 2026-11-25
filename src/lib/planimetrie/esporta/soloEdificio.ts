/**
 * La pianta del piano senza il lotto (25/11/2026). Un lotto grande nella stessa tavola fa
 * scendere la scala fino a 1:500 e le stanze non si leggono più (Callimaco: 2.600 m² di lotto
 * per 210 m² di casa). Si tiene l'edificio, con quello che gli sta a ridosso (scale esterne,
 * balconi), e si toglie il resto: aree esterne, alberi, piscine, curve del terreno. Il lotto
 * resta nella sua tavola, la planimetria generale.
 *
 * Restituisce la stessa vista quando il lotto non c'è o è poco più grande della casa.
 */
import type { Punto, VistaPianta } from "./tipi";

/** Quanto oltre i muri esterni si tiene ancora (scale, rampe, balconi). */
const A_RIDOSSO_CM = 150;

export function soloEdificio(vista: VistaPianta): VistaPianta {
  if (!vista.muri.length || !(vista.aree?.length || vista.terreno)) return vista;
  const punti = vista.muri.flatMap((m) => [m.p1, m.p2]);
  const x0 = Math.min(...punti.map((p) => p.x)) - A_RIDOSSO_CM, x1 = Math.max(...punti.map((p) => p.x)) + A_RIDOSSO_CM;
  const y0 = Math.min(...punti.map((p) => p.y)) - A_RIDOSSO_CM, y1 = Math.max(...punti.map((p) => p.y)) + A_RIDOSSO_CM;
  const esterni = [...(vista.aree ?? []).flatMap((a) => a.contorno), ...vista.elementi.map((e) => e.posizione)];
  if (!esterni.length) return vista;
  const ex0 = Math.min(x0, ...esterni.map((p) => p.x)), ex1 = Math.max(x1, ...esterni.map((p) => p.x));
  const ey0 = Math.min(y0, ...esterni.map((p) => p.y)), ey1 = Math.max(y1, ...esterni.map((p) => p.y));
  // Il lotto aggiunge poco: la tavola resta quella di prima.
  if ((ex1 - ex0) * (ey1 - ey0) < 2 * (x1 - x0) * (y1 - y0)) return vista;
  const dentro = (p: Punto) => p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1;
  return {
    ...vista,
    aree: [],
    terreno: undefined,
    elementi: vista.elementi.filter((e) => dentro(e.posizione)),
    quote: vista.quote.filter((q) => dentro(q.p1) && dentro(q.p2)),
    testi: vista.testi.filter((t) => dentro(t.posizione)),
  };
}
