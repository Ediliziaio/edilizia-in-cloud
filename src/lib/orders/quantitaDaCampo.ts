import { parseDecimalIT } from "@/lib/parseDecimalIT";

/**
 * La quantità scritta nel campo di una riga della commessa: 12,4 o 12.4, a
 * quattro decimali come la salva il database (order_items.quantity è numeric dal
 * 20281222140000). Prima la finestra arrotondava all'intero: un materiale da
 * 12,4 kg, aperto e risalvato da lì, diventava 12 senza che nessuno se ne accorgesse.
 */
export function quantitaDaCampo(testo: string): number {
  const n = parseDecimalIT(testo);
  return Number.isFinite(n) ? Math.round(n * 10000) / 10000 : 0;
}
