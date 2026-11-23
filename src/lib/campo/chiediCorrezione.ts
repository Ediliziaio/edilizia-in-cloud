import { format, parseISO } from "date-fns";

/**
 * Dove porta «Chiedi una correzione» di un rapportino già inviato (collaudo 23/11/2026).
 * Prima l'operaio leggeva solo «per correggerlo contatta l'ufficio», senza un modo per farlo dall'app.
 * Apre la segnalazione all'ufficio sul cantiere, con il testo già iniziato.
 */
export function linkChiediCorrezione(orderId: string, giorno: string): string {
  const data = parseISO(giorno);
  const quando = Number.isNaN(data.getTime()) ? giorno : format(data, "dd/MM/yyyy");
  const testo = `Correzione del rapportino del ${quando}: `;
  return `/campo/ticket/nuovo/${encodeURIComponent(orderId)}?testo=${encodeURIComponent(testo)}`;
}
