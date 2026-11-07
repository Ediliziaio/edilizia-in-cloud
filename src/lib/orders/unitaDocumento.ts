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
