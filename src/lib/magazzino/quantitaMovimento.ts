/** Nessun troncamento, nessuna riduzione silenziosa della quantità richiesta. */
export function leggiQuantitaMovimento(value: string): number | null {
  const text = value.trim().replace(",", ".");
  if (!/^\d+(?:\.\d+)?$/.test(text)) return null;
  const quantity = Number(text);
  return Number.isFinite(quantity) && quantity > 0 ? quantity : null;
}

export function erroreQuantitaMovimento(quantity: number | null, serialized: boolean, available?: number): string | null {
  if (quantity == null || !Number.isFinite(quantity) || quantity <= 0) return "Inserisci una quantità maggiore di zero.";
  if (serialized && !Number.isInteger(quantity)) return "Per gli articoli con seriale serve una quantità intera.";
  if (available !== undefined && quantity > available) return `Disponibili ${available.toLocaleString("it-IT")}: riduci la quantità o verifica gli impegni.`;
  return null;
}

const quantitaIt = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 20 });
/** Solo presentazione: non arrotonda o converte la quantità inviata al servizio. */
export const formattaQuantitaMovimento = (value: number) => Number.isFinite(value) ? quantitaIt.format(value) : "—";

/** L’inventario e il riordino ammettono lo zero, ma mai stringhe parziali. */
export function leggiQuantitaNonNegativa(value: string): number | null {
  const text = value.trim().replace(",", ".");
  if (!/^\d+(?:\.\d+)?$/.test(text)) return null;
  const n = Number(text);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
