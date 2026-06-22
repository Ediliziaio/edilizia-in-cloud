/**
 * Tipi condivisi del wizard Elettrico.
 */
import type { EleProgetto } from "@/types/elettrico";

/**
 * Patch dei campi editabili del progetto dal wizard (esclusi i campi
 * gestiti dal sistema: id, company_id, totali derivati).
 */
export type EleFormPatch = Partial<
  Omit<EleProgetto, "id" | "company_id" | "totale_imponibile" | "totale">
>;

/** Firma comune dell'onChange controllato passato agli step. */
export type EleOnChange = <K extends keyof EleFormPatch>(
  key: K,
  value: EleFormPatch[K],
) => void;
