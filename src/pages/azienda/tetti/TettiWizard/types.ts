/**
 * Tipi condivisi del wizard Tetti.
 */
import type { TetProgetto } from "@/types/tetti";

/**
 * Patch dei campi editabili del progetto dal wizard (esclusi i campi
 * gestiti dal sistema: id, company_id, totali derivati).
 */
export type TetFormPatch = Partial<
  Omit<TetProgetto, "id" | "company_id" | "totale_imponibile" | "totale">
>;

/** Firma comune dell'onChange controllato passato agli step. */
export type TetOnChange = <K extends keyof TetFormPatch>(
  key: K,
  value: TetFormPatch[K],
) => void;
