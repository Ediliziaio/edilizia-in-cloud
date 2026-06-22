/**
 * Tipi condivisi del wizard Bagni.
 */
import type { BgnProgetto } from "@/types/bagni";

/**
 * Patch dei campi editabili del progetto dal wizard (esclusi i campi
 * gestiti dal sistema: id, company_id, totali derivati).
 */
export type BgnFormPatch = Partial<
  Omit<BgnProgetto, "id" | "company_id" | "totale_imponibile" | "totale">
>;

/** Firma comune dell'onChange controllato passato agli step. */
export type BgnOnChange = <K extends keyof BgnFormPatch>(
  key: K,
  value: BgnFormPatch[K],
) => void;
