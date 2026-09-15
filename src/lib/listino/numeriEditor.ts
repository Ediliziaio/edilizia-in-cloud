/**
 * Lettura e controllo dei numeri digitati nell'editor del listino.
 *
 * Tolte da FamilyEditor per poterle provare: dentro il componente erano
 * private, e il difetto che ha bloccato Renova (15/09) non aveva modo di
 * essere coperto da un test. Un campo vuoto nel database arrivava all'editor
 * come testo "null" (String(null)): al salvataggio non era un numero, e il
 * prezzo di vendita del modulo fotovoltaico non si salvava per colpa del
 * prezzo di acquisto, mai toccato.
 */

export function parseDecimalField(value: string, fallback = 0): number {
  let s = (value ?? "").trim();
  // "null"/"undefined" sono ciò che String() produce da un campo vuoto del
  // database: vanno trattati come vuoto, non come un numero sbagliato.
  if (s === "" || s === "null" || s === "undefined") return fallback;
  // M-30 (audit): formato italiano completo — quando c'è la virgola, i punti
  // sono separatori delle migliaia ("1.234,56"): senza lo strip il parse
  // falliva e l'utente vedeva "numero non valido" su un importo legittimo.
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const parsed = Number(s);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export function assertFiniteRange(
  value: number,
  label: string,
  options: { min?: number; max?: number; allowZero?: boolean } = {},
) {
  const { min = 0, max, allowZero = true } = options;
  if (!Number.isFinite(value)) {
    throw new Error(`${label} deve essere un numero valido.`);
  }
  if (!allowZero && value === 0) {
    throw new Error(`${label} deve essere maggiore di zero.`);
  }
  if (value < min) {
    throw new Error(`${label} non può essere negativo.`);
  }
  if (max != null && value > max) {
    throw new Error(`${label} non può superare ${max}.`);
  }
}
