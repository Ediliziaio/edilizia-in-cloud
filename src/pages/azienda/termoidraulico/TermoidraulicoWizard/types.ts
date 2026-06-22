/**
 * Tipi condivisi del wizard Termoidraulico.
 */
import type { IdrProgetto } from "@/types/termoidraulico";

/**
 * Patch dei campi editabili del progetto dal wizard (esclusi i campi
 * gestiti dal sistema: id, company_id, totali derivati).
 */
export type IdrFormPatch = Partial<
  Omit<IdrProgetto, "id" | "company_id" | "totale_imponibile" | "totale">
>;

/** Firma comune dell'onChange controllato passato agli step. */
export type IdrOnChange = <K extends keyof IdrFormPatch>(
  key: K,
  value: IdrFormPatch[K],
) => void;
