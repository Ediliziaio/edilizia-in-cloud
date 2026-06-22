/**
 * Tipi condivisi del wizard Pavimenti.
 */
import type { PavProgetto } from "@/types/pavimenti";

/**
 * Patch dei campi editabili del progetto dal wizard (esclusi i campi
 * gestiti dal sistema: id, company_id, totali derivati).
 */
export type PavFormPatch = Partial<
  Omit<PavProgetto, "id" | "company_id" | "totale_imponibile" | "totale">
>;

/** Firma comune dell'onChange controllato passato agli step. */
export type PavOnChange = <K extends keyof PavFormPatch>(
  key: K,
  value: PavFormPatch[K],
) => void;
