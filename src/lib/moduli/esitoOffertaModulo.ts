/**
 * Un preventivo di MODULO (bagni, tetti, serramenti…) vive nel documento di firma
 * `quotes` (la «quote-ombra», vedi quoteBridge). Quando il cliente l'ha già deciso, o è
 * chiuso, non si rimanda per la firma: send-quote-signature risponde 409 («già
 * accettato», «rifiutato»…). Qui lo si sa PRIMA, dalla riga stessa: il pulsante si
 * spegne e nulla viene riscritto (PDF, totali, scadenza).
 *
 * Senza dipendenze (niente supabase): la usano sia la scheda sia il ponte.
 */

export type EsitoOffertaModulo = "accettata" | "rifiutata" | "convertita" | "annullata";

export const FRASI_OFFERTA_MODULO: Record<EsitoOffertaModulo, string> = {
  accettata: "Questo preventivo è già stato firmato dal cliente: non è più modificabile.",
  rifiutata: "Questo preventivo è stato rifiutato dal cliente: non si può rimandare per la firma. Per un'altra offerta serve un nuovo preventivo.",
  convertita: "Questo preventivo è già diventato commessa: non si può rimandare per la firma.",
  annullata: "Questo preventivo è stato annullato: non si può rimandare per la firma.",
};

/**
 * L'esito che chiude l'offerta, o null se si può ancora mandare (bozza, inviata, scaduta:
 * una scaduta si rinnova col reinvio, come fa il server). La firma conta anche se lo
 * stato non è stato ancora allineato; i vecchi stati al maschile («accettato») valgono.
 */
export function esitoOffertaModulo(
  riga: { status?: string | null; signed_at?: string | null } | null | undefined,
): EsitoOffertaModulo | null {
  if (!riga) return null;
  const stato = String(riga.status ?? "").trim().toLowerCase();
  if (riga.signed_at || /^accettat[oa]$/.test(stato)) return "accettata";
  if (/^rifiutat[oa]$/.test(stato)) return "rifiutata";
  if (/^convertit[oa]$/.test(stato)) return "convertita";
  if (/^annullat[oa]$/.test(stato)) return "annullata";
  return null;
}
