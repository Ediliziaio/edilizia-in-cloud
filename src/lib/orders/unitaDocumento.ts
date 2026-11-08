/**
 * L'unità di una riga della commessa su fattura, proforma, DDT e nota di
 * credito: quella della riga (m², kg, ore…), «pz» solo se manca.
 *
 * Prima i documenti scrivevano sempre «pz». Finché le righe decimali entravano
 * in commessa come «1 × il totale» non si vedeva; da quando restano 12,5 m²
 * (07/11/2026) la fattura sarebbe uscita «12,5 pz». L'XML della fattura
 * elettronica tronca l'unità a 10 caratteri (generateXML.ts).
 */
export function unitaDocumento(unita: string | null | undefined): string {
  return unita?.trim() || "pz";
}

/** «12,5 m²»: la quantità con la sua unità; i pezzi senza unità restano un numero. */
export function quantitaConUnita(q: number, unita: string | null | undefined): string {
  const n = Number(q).toLocaleString("it-IT", { maximumFractionDigits: 2 });
  const u = unita?.trim();
  return u && u.toLowerCase() !== "pz" ? `${n} ${u}` : n;
}

/**
 * Il totale delle quantità solo se sono tutte nella stessa unità: 12,5 m² più 3
 * pezzi non fa 15,5 di niente. Altrimenti un trattino. Usato dal PDF della
 * commessa, che fino al 07/11/2026 sommava tutto.
 */
export function totaleQuantita(items: Array<{ quantity?: number | null; unita_misura?: string | null }>): string {
  if (items.length === 0) return "0";
  const unita = new Set(items.map((i) => unitaDocumento(i.unita_misura).toLowerCase()));
  if (unita.size !== 1) return "—";
  const somma = items.reduce((s, i) => s + Number(i.quantity ?? 1), 0);
  return quantitaConUnita(somma, items[0]?.unita_misura);
}
