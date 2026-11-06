/** Una ricezione già visibile non va ripetuta per compensare un contatore OdA fermo. */
export function ricezioneNonAllineata(
  articolo: { order_item_id?: string | null; quantity_received?: number | null },
  ricezioni: readonly { order_item_id?: string | null; quantity_received?: number | null }[],
): boolean {
  if (!articolo.order_item_id) return false;
  const registrato = ricezioni
    .filter((r) => r.order_item_id === articolo.order_item_id)
    .reduce((somma, r) => somma + Number(r.quantity_received ?? 0), 0);
  return registrato > Number(articolo.quantity_received ?? 0) + 0.000001;
}
