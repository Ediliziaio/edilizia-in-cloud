/** La categoria dichiarata prevale: nessuna deduzione dal nome o dal prezzo. */
export type DestinazioneVoce = "materiale" | "lavorazione" | "esclusa" | "da_verificare";
export interface VoceDaClassificare { item_category?: unknown; item_type?: unknown; is_optional?: unknown; quantity?: unknown }
const servizi = new Set(["posa", "trasporto", "smaltimento", "nolo", "tiro_piano", "pratica"]);
export function destinazioneVoce(r: VoceDaClassificare): DestinazioneVoce {
  if (r.is_optional === true || (r.quantity != null && Number(r.quantity) === 0)) return "esclusa";
  const categoria = String(r.item_category ?? "");
  if (["nota", "subtotale", "sconto"].includes(categoria)) return "esclusa";
  if (categoria === "prodotto") return "materiale";
  if (servizi.has(categoria)) return "lavorazione";
  if (!categoria && r.item_type === "service") return "lavorazione";
  if (!categoria && r.item_type === "product") return "materiale";
  return "da_verificare";
}
export function separaVoci<T extends VoceDaClassificare>(righe: T[]) {
  return {
    materiali: righe.filter(r => destinazioneVoce(r) === "materiale"),
    lavorazioni: righe.filter(r => destinazioneVoce(r) === "lavorazione"),
    escluse: righe.filter(r => destinazioneVoce(r) === "esclusa"),
    daVerificare: righe.filter(r => destinazioneVoce(r) === "da_verificare"),
  };
}

/** Stesso contratto per le due strade di conversione. Nessun prezzo ricavato dai soli materiali. */
export function contrattoPreventivo(q: {subtotal?: unknown; discount_amount?: unknown; total?: unknown; vat_amount?: unknown}) {
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const totaleIvato = round2(Number(q.total ?? 0));
  const conSubtotale = Number(q.subtotal ?? 0) > 0;
  const imponibile = conSubtotale ? round2(Number(q.subtotal) - Number(q.discount_amount ?? 0)) : totaleIvato;
  const aliquotaMedia = conSubtotale && imponibile > 0 ? round2(Number(q.vat_amount ?? 0) / imponibile * 100) : 0;
  return { imponibile, aliquotaMedia, totaleIvato };
}
