/**
 * Tipi condivisi del wizard Ristrutturazione.
 */
import type { RstProgetto } from "@/types/ristrutturazione";

/**
 * Patch dei campi editabili del progetto dal wizard (esclusi i campi
 * gestiti dal sistema: id, company_id, totali derivati).
 */
export type RstFormPatch = Partial<
  Omit<RstProgetto, "id" | "company_id" | "totale_imponibile" | "totale">
>;

/** Firma comune dell'onChange controllato passato agli step. */
export type RstOnChange = <K extends keyof RstFormPatch>(
  key: K,
  value: RstFormPatch[K],
) => void;
