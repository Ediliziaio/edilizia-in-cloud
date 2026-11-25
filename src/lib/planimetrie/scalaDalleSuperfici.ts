/**
 * La scala di un DWG confermata dalle superfici scritte nelle stanze (25/11/2026).
 *
 * Il riscontro della scala serve a non sbagliare l'unità del file (millimetri per metri: misure
 * cento volte più grandi). Se il progettista ha scritto la superficie dentro le stanze («letto
 * 9.30 mq») e le stanze disegnate tornano, la scala è provata dal disegno stesso: una superficie
 * cresce col quadrato della scala, un'unità sbagliata non può tornare su più stanze. Tutti i piani
 * di un DWG hanno la stessa unità, quindi la prova vale per tutti.
 */
import { areaPoligono } from "../../../shared/planimetrie/geometria.ts";
import type { Planimetria } from "../../../shared/planimetrie/modello.ts";

export interface ProvaScalaSuperfici {
  /** Stanze con la superficie scritta sulla tavola. */
  stanze: number;
  /** Quante tornano entro il 5%. */
  tornano: number;
  /** Scarto mediano, 0-1. */
  scartoMediano: number;
  confermata: boolean;
}

export function scalaDalleSuperfici(doc: Planimetria): ProvaScalaSuperfici {
  const scarti = doc.livelli.flatMap((l) => [l.fatto, ...l.proposte])
    .flatMap((s) => s.locali)
    .filter((l) => (l.superficieDichiarataMq ?? 0) > 0)
    .map((l) => Math.abs(areaPoligono(l.contorno) / 10_000 - l.superficieDichiarataMq!) / l.superficieDichiarataMq!)
    .sort((a, b) => a - b);
  const tornano = scarti.filter((s) => s <= 0.05).length;
  const scartoMediano = scarti.length ? scarti[Math.floor(scarti.length / 2)] : 1;
  return {
    stanze: scarti.length, tornano, scartoMediano,
    confermata: scarti.length >= 4 && tornano / scarti.length >= 0.6 && scartoMediano <= 0.03,
  };
}
