/** Scelta del disegno salvata nel JSON layout_overlay, senza cambiare lo schema.
 * null conserva il comportamento dei progetti esistenti. La scelta senza mappa
 * non contiene coordinate fittizie; conserva un eventuale piano per riprenderlo.
 */
import { leggiPiano, type MisureModulo, type PianoTetto } from "./fvPianoTetto.ts";
import { leggiDisegnoCommerciale, type DisegnoCommercialeFv } from "./fvDisegnoCommerciale.ts";

export type PianoSalvatoFv = {
  x: number; y: number; rot: number; cols: number;
  unita?: "m"; orient?: "v" | "o"; modulo?: MisureModulo;
};
export type SenzaMappaFv = { modalita: "senza_mappa"; piano_precedente?: PianoTetto | DisegnoCommercialeFv };
export type LayoutPosaFv = PianoSalvatoFv | SenzaMappaFv | DisegnoCommercialeFv;

export function preventivoSenzaMappa(raw: unknown): raw is SenzaMappaFv {
  return !!raw && typeof raw === "object" && (raw as Record<string, unknown>).modalita === "senza_mappa";
}

export function cambiaModalitaProgettazione(raw: unknown, senzaMappa: boolean): LayoutPosaFv | null {
  const candidate = preventivoSenzaMappa(raw) ? raw.piano_precedente : raw;
  const piano = leggiDisegnoCommerciale(candidate) ?? leggiPiano(candidate);
  return senzaMappa
    ? { modalita: "senza_mappa", ...(piano ? { piano_precedente: piano } : {}) }
    : piano;
}

/** La resa serve al calcolo energetico, la geometria è facoltativa. */
export function validaDatiTettoFv(dati: { ore_sole_annue: number | null; numero_pannelli_max: number | null }) {
  if (dati.ore_sole_annue == null || !Number.isFinite(dati.ore_sole_annue) || dati.ore_sole_annue <= 0)
    return { valido: false, motivo: "Attendi la stima solare dalla località o riprova il calcolo" };
  if (dati.numero_pannelli_max != null && (!Number.isSafeInteger(dati.numero_pannelli_max) || dati.numero_pannelli_max <= 0))
    return { valido: false, motivo: "Il limite di pannelli, se indicato, deve essere un intero positivo" };
  return { valido: true };
}
