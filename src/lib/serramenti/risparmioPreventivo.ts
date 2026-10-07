/**
 * Quello che il preventivo conserva del risparmio energetico (06/10/2026): i campi che il PDF e la pagina del
 * cliente leggono (`risparmio_eur_anno`, `co2_risparmiata_t_anno`, `payback_anni`, `risparmio_calcolato`),
 * composti dal calcolo di sempre (`calcolaRisparmio`, `calcolaCashflow`) e arrotondati come le colonne del
 * database (euro al centesimo, CO₂ al chilo di tonnellata): così il valore scritto e quello riletto sono lo
 * stesso, e rientrando nello step non si riscrive niente.
 *
 * Il PDF decide di mostrare risparmio e recupero guardando `risparmio_eur_anno` (non `risparmio_calcolato`):
 * spegnere il risparmio vuol dire quindi azzerare anche l'importo, non solo il segno di spunta.
 */
import { calcolaCashflow } from "@/lib/serramenti/ecobonus";
import type { OutputRisparmio } from "@/lib/serramenti/risparmio";

const arrotonda = (n: number, decimali: number): number => {
  const f = 10 ** decimali;
  return Math.round(n * f) / f;
};

export interface CampiRisparmio {
  risparmio_calcolato: boolean;
  risparmio_eur_anno: number | null;
  co2_risparmiata_t_anno: number | null;
  /** Assente quando senza detrazione non c'è recupero da calcolare: il valore che c'è non si tocca. */
  payback_anni?: number | null;
  /** Assente quando il risparmio è spento. */
  cantiere_zona_climatica?: string;
}

/** L'anno in cui la spesa si ripaga: spesa totale contro risparmio in bolletta e detrazione, come il grafico dei 10 anni. */
export function paybackAtteso(input: { totale: number; risparmioEurAnno: number; detrazioneEurAnno: number }): number | null {
  return calcolaCashflow({
    costo_iniziale: input.totale,
    risparmio_eur_anno: input.risparmioEurAnno,
    detrazione_eur_anno: input.detrazioneEurAnno,
    inflazione_energia_pct: 3,
  }).payback_anni;
}

/**
 * I campi da scrivere per un calcolo di risparmio (null = spento o senza serramenti: si azzera tutto). Il payback
 * si calcola dal risparmio GIÀ arrotondato, quello che resta scritto, e solo se c'è una detrazione.
 */
export function campiRisparmio(
  calcolo: OutputRisparmio | null,
  contesto: { totale: number; detrazioneEurAnno: number | null },
): CampiRisparmio {
  if (!calcolo) {
    return { risparmio_calcolato: false, risparmio_eur_anno: null, co2_risparmiata_t_anno: null, payback_anni: null };
  }
  const risparmio = arrotonda(calcolo.risparmio_eur_anno, 2);
  const campi: CampiRisparmio = {
    risparmio_calcolato: true,
    risparmio_eur_anno: risparmio,
    co2_risparmiata_t_anno: arrotonda(calcolo.co2_risparmiata_kg_anno / 1000, 3),
    cantiere_zona_climatica: calcolo.zona_climatica,
  };
  if (contesto.detrazioneEurAnno != null) {
    campi.payback_anni = paybackAtteso({ totale: contesto.totale, risparmioEurAnno: risparmio, detrazioneEurAnno: contesto.detrazioneEurAnno });
  }
  return campi;
}
