/**
 * Tipi condivisi del wizard Climatizzazione.
 */
import type { ClmProgetto } from "@/types/climatizzazione";

/**
 * Patch dei campi editabili del progetto dal wizard (esclusi i campi
 * gestiti dal sistema: id, company_id, totali derivati).
 */
export type ClmFormPatch = Partial<
  Omit<ClmProgetto, "id" | "company_id" | "totale_imponibile" | "totale">
>;

/** Firma comune dell'onChange controllato passato agli step. */
export type ClmOnChange = <K extends keyof ClmFormPatch>(
  key: K,
  value: ClmFormPatch[K],
) => void;
