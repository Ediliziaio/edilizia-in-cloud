/**
 * Il campo data del browser accetta anni fino a 275760: un tasto in più sulla
 * tastiera e la scadenza del DURC diventa il 20/02/60930 (è successo nella
 * demo). Qui si scartano gli anni fuori da un intervallo sensato.
 */
export const DATA_MASSIMA = "2099-12-31";

/** Vera se la data (yyyy-MM-dd) è vuota o ha un anno tra il 2000 e il 2099. */
export function dataPlausibile(data: string | null | undefined): boolean {
  if (!data) return true;
  const anno = Number(data.slice(0, data.indexOf("-")));
  return Number.isInteger(anno) && anno >= 2000 && anno <= 2099;
}
