/**
 * Le voci di un computo che non sono lavori dell'impresa (17/11/2026).
 *
 * I computi dei bonus (ecobonus, sismabonus) mettono nello stesso documento i lavori e quello che il bonus
 * rimborsa: progettazione, direzione lavori, responsabile dei lavori, asseverazioni, Inarcassa, visto di
 * conformità, IVA. Sono onorari dei tecnici e imposte: non diventano fasi, sottofasi o materiali della commessa.
 *
 * Con i capitoli decidono i capitoli («ONERI TECNICI ECO», «IVA LAVORI ECOBONUS»…): così «Progettazione
 * dell'impianto di ponteggio» negli oneri della sicurezza resta un costo del cantiere. Solo dove il PDF non
 * stampa i capitoli conta la descrizione. La stessa regola, in SQL, sta in `commessa_lavorazioni_dal_computo`
 * (migrazione 20290418220000): se cambia qui, cambia là.
 */

export const CAPITOLO_NON_LAVORI = /oneri tecnici|\biva\b|visto di conformit|asseveraz|inarcassa|\bcassa\b|progettazion|spese tecniche/i;
export const DESCRIZIONE_NON_LAVORI =
  /^(progettazione(\s+categoria|\s+[a-z]{1,2}\s?\d|\s*$)|d\.?\s?l\.?\s|direzione (dei )?lavori|coordinament[oi] (della )?sicurezza|responsabile (dei )?lavori|asseverazion|inarcassa|cassa\b|iva\b|visto di conformit|ape (ante|post)|r\.?\s?l\.?\s)/i;

export function eNonLavoro(capitoli: Array<string | null | undefined>, descrizione: string | null | undefined): boolean {
  const c = capitoli.map((x) => x?.trim()).filter(Boolean).join(" | ");
  if (c) return CAPITOLO_NON_LAVORI.test(c);
  return DESCRIZIONE_NON_LAVORI.test((descrizione ?? "").trim());
}
