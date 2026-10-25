import { tipoServizioFv } from "./configurazioneValidation";
/** Catalogue cost/margin calculation shared by the picker and the chat. */
export function servizioDaCatalogo(
  s: Record<string, unknown>,
  quantity: number,
) {
  const costo = s.prezzo_netto_default ?? s.prezzo_netto;
  const netto = costo == null || costo === "" ? NaN : Number(costo),
    rawMargin = Number(s.margine_pct_default ?? 0.35);
  if (
    !Number.isFinite(netto) ||
    netto < 0 ||
    !Number.isFinite(rawMargin) ||
    !Number.isFinite(quantity) ||
    quantity <= 0
  )
    throw new Error("Costo, margine o quantità del servizio FV da verificare");
  const margin = Math.min(0.8, Math.max(0, rawMargin));
  const sale =
    s.prezzo_vendita == null
      ? Math.round((netto / (1 - margin)) * 100) / 100
      : Number(s.prezzo_vendita);
  if (!Number.isFinite(sale) || sale < 0)
    throw new Error("Prezzo di vendita del servizio FV non valido");
  return {
    catalogue_id: typeof s.id === "string" ? s.id : null,
    tipo: tipoServizioFv(String(s.codice ?? s.tipo ?? "altro")),
    descrizione: String(s.descrizione ?? s.nome ?? "Servizio"),
    quantita: quantity,
    prezzo_netto: netto,
    prezzo_vendita: sale,
    note_operative: s.note_operative ? String(s.note_operative) : null,
  };
}
