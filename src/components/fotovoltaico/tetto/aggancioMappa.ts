import { poligonoValido, type PuntoFv } from "../../../../supabase/functions/_shared/fvDisegnoCommerciale";

/** Tolleranza espressa in metri corrispondenti a pochi pixel allo zoom corrente. */
export function agganciaPuntoFv(p: PuntoFv, vertici: PuntoFv[], precedente: PuntoFv | undefined, tolleranza: number, direzione = { x: 1, y: 0 }): { punto: PuntoFv; tipo: "vertice" | "allineamento" | null } {
  const vicino = vertici.reduce<PuntoFv | undefined>((best, q) =>
    Math.hypot(q.x - p.x, q.y - p.y) <= tolleranza &&
      (!best || Math.hypot(q.x - p.x, q.y - p.y) < Math.hypot(best.x - p.x, best.y - p.y)) ? q : best, undefined);
  if (vicino) return { punto: { ...vicino }, tipo: "vertice" as const };
  if (precedente && Math.hypot(p.x - precedente.x, p.y - precedente.y) > tolleranza * 2) {
    const l = Math.hypot(direzione.x, direzione.y) || 1, ux = direzione.x / l, uy = direzione.y / l;
    const dx = p.x - precedente.x, dy = p.y - precedente.y, lungo = dx * ux + dy * uy, traverso = -dx * uy + dy * ux;
    if (Math.abs(traverso) <= tolleranza) return { punto: { x: precedente.x + lungo * ux, y: precedente.y + lungo * uy }, tipo: "allineamento" as const };
    if (Math.abs(lungo) <= tolleranza) return { punto: { x: precedente.x - traverso * uy, y: precedente.y + traverso * ux }, tipo: "allineamento" as const };
  }
  return { punto: p, tipo: null };
}

/** Cambia una quota in pianta mantenendo direzione del lato e tutti gli altri vertici. */
export function impostaLunghezzaLatoFv(punti: PuntoFv[], lato: number, metri: number): PuntoFv[] {
  if (!Number.isInteger(lato) || lato < 0 || lato >= punti.length || !Number.isFinite(metri) || metri < .1 || metri > 400) throw Error("Indica una lunghezza tra 0,1 e 400 metri.");
  const a = punti[lato], j = (lato + 1) % punti.length, b = punti[j], l = Math.hypot(b.x - a.x, b.y - a.y);
  if (l < 1e-6) throw Error("Il lato selezionato non ha una direzione valida.");
  const next = punti.map((p, i) => i === j ? { x: a.x + (b.x - a.x) * metri / l, y: a.y + (b.y - a.y) * metri / l } : { ...p });
  if (!poligonoValido(next) || next.some(p => Math.abs(p.x) > 400 || Math.abs(p.y) > 400)) throw Error("Questa quota crea un contorno non valido: controlla i vertici vicini.");
  return next;
}
