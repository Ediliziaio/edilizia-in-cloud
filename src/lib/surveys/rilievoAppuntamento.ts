/**
 * Quando un appuntamento porta con sé un rilievo, e di che tipo.
 * Piano: docs/piano-sopralluoghi-vendita-tecnico.md, lotto 1.
 *
 * Prima «Fissa sopralluogo» creava solo l'appuntamento: il tecnico aveva l'ora in agenda e
 * niente da compilare (51 rilievi tecnici su 51, 109 sopralluoghi preventivo su 110).
 */
import type { TipoSopralluogo } from "@/lib/api/surveys";

/** Tipi di appuntamento che sono un sopralluogo. */
export const TIPI_APPUNTAMENTO_CON_RILIEVO = new Set([
  "sopralluogo_preventivo",
  "rilievo_tecnico",
  "sopralluogo_tecnico",
  "sopralluogo",
  "misurazione",
]);

export const appuntamentoConRilievo = (tipo: string | null | undefined): boolean =>
  !!tipo && TIPI_APPUNTAMENTO_CON_RILIEVO.has(tipo);

/** Il sopralluogo preventivo è del commerciale; il resto è tecnico (stessa regola del database). */
export const tipoRilievoDaAppuntamento = (tipo: string | null | undefined): TipoSopralluogo =>
  tipo === "sopralluogo_preventivo" ? "commerciale" : "tecnico";

/**
 * Di partenza si prepara il rilievo per i sopralluoghi tecnici: senza, il tecnico non ha
 * niente da compilare. Per quello commerciale la spunta parte spenta: non tutti i
 * commerciali compilano un rilievo, e non vanno riempite le liste di bozze vuote.
 */
export const preparaRilievoDiPartenza = (tipo: string | null | undefined): boolean =>
  appuntamentoConRilievo(tipo) && tipoRilievoDaAppuntamento(tipo) === "tecnico";

export interface ModelloRilievo {
  id: string;
  name: string;
  category: string;
}

/** L'ultimo modello usato dall'azienda, se c'è ancora; altrimenti il primo. */
export function modelloDiPartenza(modelli: ModelloRilievo[], ultimoUsato: string | null | undefined): string | null {
  if (ultimoUsato && modelli.some((m) => m.id === ultimoUsato)) return ultimoUsato;
  return modelli[0]?.id ?? null;
}
