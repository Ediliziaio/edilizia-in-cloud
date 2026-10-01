/** These categories need an actual verbale, not just an order id and notes.
 * The current order signing path exposes no document to the recipient. */
export function missingCampoDocument(type: unknown, category: unknown): boolean {
  return type === "order" && [
    "collaudo_finale", "verbale_consegna", "accettazione_lavori",
  ].includes(String(category));
}
export const CAMPO_DOCUMENT_REQUIRED = "Prima della firma prepara il verbale con verifiche, esito ed eventuali riserve. La richiesta collegata al solo ordine non contiene un documento da firmare.";
