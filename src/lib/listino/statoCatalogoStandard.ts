/** Una base senza prezzo non è una vecchia tariffa archiviata. */
export function lavorazioneStandardDaCompletare(voce: {
  attivo?: boolean | null;
  fonte?: string | null;
  prezzo_vendita?: number | null;
}): boolean {
  return voce.attivo === false && voce.fonte === "Base standard da personalizzare" && !(Number(voce.prezzo_vendita) > 0);
}
