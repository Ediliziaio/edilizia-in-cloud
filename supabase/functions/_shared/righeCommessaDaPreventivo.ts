/**
 * Le righe di un preventivo come diventano righe di commessa: UNA sola
 * funzione per le due strade («Converti in Cantiere», edge
 * converti-preventivo-cantiere, e «Crea commessa (rivedi)», useQuotePrefill),
 * che prima avevano ognuna la sua copia del conto e divergevano:
 *
 *  - le righe OPZIONALI non sono vendute (il PDF le mostra a parte e le tiene
 *    fuori dal totale): «rivedi» le copiava lo stesso, e la somma delle righe
 *    superava il totale accettato;
 *  - lo sconto di riga viaggia con la riga: «rivedi» lo perdeva, e le righe
 *    costavano più del preventivo;
 *  - order_items.quantity è un intero (create_order_atomic fa `::integer`): una
 *    quantità decimale (85,5 m², 7,5 ore) faceva fallire la creazione di tutta
 *    la commessa. La riga diventa 1 × il suo totale, con la quantità vera nella
 *    descrizione: i conti restano esatti;
 *  - una riga a quantità 0 non vende niente e non entra.
 *
 * Funzione pura, usata anche dai test.
 */

export type RigaCommessa = {
  name: string;
  description: string | null;
  quantity: number;
  unit_price: number | null;
  purchase_price: number;
  vat_rate: number | null;
  discount_percent: number | null;
  family_id: string | null;
  axis_selections: Record<string, string> | null;
  misure_preventivo: { larghezza?: number; altezza?: number } | null;
  measure_status: "da_rilevare" | null;
};

/** Le categorie che non sono articoli: subtotali, sconti in riga (già nel totale), note. */
export const CATEGORIE_NON_ARTICOLO = new Set(["subtotale", "sconto", "nota"]);

const round2 = (n: number) => Math.round(n * 100) / 100;

export function righeCommessaDaPreventivo(righe: Array<Record<string, unknown>>): RigaCommessa[] {
  return righe
    .filter((r) => !CATEGORIE_NON_ARTICOLO.has(String(r.item_category ?? "")))
    // Le righe OPZIONALI sono proposte che il cliente non ha scelto.
    .filter((r) => r.is_optional !== true)
    // Quantità 0: la riga non vende niente (null o non numerica sì: vale 1, come prima).
    .filter((r) => !(r.quantity != null && Number(r.quantity) === 0))
    .map((r) => {
      const suMisura = !!r.family_id;
      const mx = r.misura_x as number | null | undefined;
      const my = r.misura_y as number | null | undefined;
      const misurePreventivo = mx != null || my != null
        ? { ...(mx != null ? { larghezza: Number(mx) } : {}), ...(my != null ? { altezza: Number(my) } : {}) }
        : null;
      const q = Number(r.quantity) || 1;
      const intera = Number.isInteger(q);
      const unitario = r.unit_price != null ? Number(r.unit_price) : null;
      const costo = r.prezzo_acquisto != null ? Number(r.prezzo_acquisto) : 0;
      const um = typeof r.unit_of_measure === "string" ? r.unit_of_measure : "";
      const euro = (n: number) => n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const quantitaVera = intera
        ? null
        : `${q.toLocaleString("it-IT")}${um ? ` ${um}` : ""}${unitario != null ? ` × ${euro(unitario)} €` : ""}`;
      const descrizione = (r.description as string | null | undefined) ?? null;
      return {
        name: String(r.name ?? ""),
        description: quantitaVera ? [quantitaVera, descrizione].filter(Boolean).join(" — ") : descrizione,
        quantity: intera ? q : 1,
        unit_price: unitario == null ? null : intera ? unitario : round2(unitario * q),
        purchase_price: intera ? costo : round2(costo * q),
        vat_rate: r.vat_rate != null ? Number(r.vat_rate) : null,
        discount_percent: r.discount_percent != null ? Number(r.discount_percent) : null,
        family_id: suMisura ? (r.family_id as string) : null,
        axis_selections: suMisura ? ((r.axis_selections as Record<string, string> | null) ?? null) : null,
        misure_preventivo: suMisura ? misurePreventivo : null,
        measure_status: suMisura ? "da_rilevare" : null,
      };
    });
}
