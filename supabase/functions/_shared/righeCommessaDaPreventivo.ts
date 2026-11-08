import { destinazioneVoce } from "./destinazioneVocePreventivo.ts";
/**
 * Solo i MATERIALI di un preventivo diventano articoli di commessa: UNA sola
 * funzione per le due strade («Converti in Cantiere», edge
 * converti-preventivo-cantiere, e «Crea commessa (rivedi)», useQuotePrefill),
 * che prima avevano ognuna la sua copia del conto e divergevano:
 *
 *  - le righe OPZIONALI non sono vendute (il PDF le mostra a parte e le tiene
 *    fuori dal totale): «rivedi» le copiava lo stesso, e la somma delle righe
 *    superava il totale accettato;
 *  - lo sconto di riga viaggia con la riga: «rivedi» lo perdeva, e le righe
 *    costavano più del preventivo;
 *  - le quantità decimali (85,5 m², 7,5 ore) restano come sono, con la loro
 *    unità: order_items.quantity ha i decimali dalla migrazione 20281222140000 e
 *    create_order_atomic non la converte più in intero (20281222160000), e scrive
 *    l'unità (20281222170000). Prima la riga diventava «1 × il suo totale», con
 *    la quantità vera solo nella descrizione: il totale tornava, ma il confronto
 *    fra fabbisogno e ordini ai fornitori contava 1 invece di 85,5 m²;
 *  - una riga a quantità 0 non vende niente e non entra.
 *
 * Funzione pura, usata anche dai test.
 */

export type RigaCommessa = {
  name: string;
  description: string | null;
  quantity: number;
  /** L'unità della riga del preventivo (m², kg, ore…); null se non c'è. */
  unita_misura: string | null;
  unit_price: number | null;
  purchase_price: number;
  vat_rate: number | null;
  discount_percent: number | null;
  family_id: string | null;
  axis_selections: Record<string, string> | null;
  misure_preventivo: { larghezza_mm?: number; altezza_mm?: number } | null;
  measure_status: "da_rilevare" | null;
};

export function righeCommessaDaPreventivo(righe: Array<Record<string, unknown>>): RigaCommessa[] {
  return righe
    .filter((r) => destinazioneVoce(r) === "materiale")
    // Le righe OPZIONALI sono proposte che il cliente non ha scelto.
    .filter((r) => r.is_optional !== true)
    // Quantità 0: la riga non vende niente (null o non numerica sì: vale 1, come prima).
    .filter((r) => !(r.quantity != null && Number(r.quantity) === 0))
    .map((r) => {
      const suMisura = !!r.family_id;
      const mx = r.misura_x as number | null | undefined;
      const my = r.misura_y as number | null | undefined;
      const misurePreventivo = mx != null || my != null
        ? { ...(mx != null ? { larghezza_mm: Number(mx) } : {}), ...(my != null ? { altezza_mm: Number(my) } : {}) }
        : null;
      // Quattro decimali, come le salva il database.
      const q = Math.round((Number(r.quantity) || 1) * 10000) / 10000;
      const unitario = r.unit_price != null ? Number(r.unit_price) : null;
      const costo = r.prezzo_acquisto != null ? Number(r.prezzo_acquisto) : 0;
      const um = typeof r.unit_of_measure === "string" ? r.unit_of_measure.trim() : "";
      return {
        name: String(r.name ?? ""),
        description: (r.description as string | null | undefined) ?? null,
        quantity: q,
        unita_misura: um || null,
        unit_price: unitario,
        purchase_price: costo,
        vat_rate: r.vat_rate != null ? Number(r.vat_rate) : null,
        discount_percent: r.discount_percent != null ? Number(r.discount_percent) : null,
        family_id: suMisura ? (r.family_id as string) : null,
        axis_selections: suMisura ? ((r.axis_selections as Record<string, string> | null) ?? null) : null,
        misure_preventivo: suMisura ? misurePreventivo : null,
        measure_status: suMisura ? "da_rilevare" : null,
      };
    });
}
