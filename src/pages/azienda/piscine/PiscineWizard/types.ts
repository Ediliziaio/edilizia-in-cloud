/**
 * Tipi condivisi del wizard Piscine.
 */
import type { PisProgetto } from "@/types/piscine";

/**
 * Patch dei campi editabili del progetto dal wizard (esclusi i campi
 * gestiti dal sistema: id, company_id, totali derivati).
 */
export type PisFormPatch = Partial<
  Omit<PisProgetto, "id" | "company_id" | "totale_imponibile" | "totale">
>;

/** Firma comune dell'onChange controllato passato agli step. */
export type PisOnChange = <K extends keyof PisFormPatch>(
  key: K,
  value: PisFormPatch[K],
) => void;
