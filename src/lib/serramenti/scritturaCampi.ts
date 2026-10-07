/**
 * «Scrivere solo se è cambiato» (06/10/2026): lo step Economia scrive nel preventivo appena l'utente sceglie,
 * senza pulsante, e non deve scrivere a vuoto — né aprendo lo step né rimettendo lo stesso valore — perché ogni
 * scrittura segna il preventivo come modificato e fa partire un salvataggio.
 *
 * Il confronto tiene conto di come tornano i dati dal database: i numeri possono arrivare come testo («40.00»),
 * le cifre sono arrotondate dalla colonna, e le liste (rate, piani) si confrontano per contenuto — anche con le
 * chiavi degli oggetti in un altro ordine: il database (jsonb) le dà per lunghezza e poi in ordine alfabetico
 * (`when, label, percentuale`), il codice le scrive come capita (`label, percentuale, when`), e un confronto per testo
 * le vedrebbe diverse anche quando dicono la stessa cosa.
 */

const comeNumero = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

const TOLLERANZA = 0.0005;

/**
 * `a` e `b` dicono la stessa cosa? Vuoto (null / undefined) è uguale a vuoto, anche per un campo mancante dentro un
 * oggetto; i numeri si confrontano con una piccola tolleranza; le liste elemento per elemento, nell'ordine; gli oggetti
 * chiave per chiave, in qualunque ordine. Un testo che somiglia a un numero vale come numero solo di fuori («40.00»
 * dal database contro 40) o contro un numero vero: dentro una lista due testi sono due testi (il nome di una rata «1»
 * non è «1.0»).
 */
function uguali(a: unknown, b: unknown, dentro: boolean): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  if (typeof a === "object" || typeof b === "object") {
    if (typeof a !== "object" || typeof b !== "object") return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => uguali(x, b[i], true));
    const oa = a as Record<string, unknown>;
    const ob = b as Record<string, unknown>;
    return [...new Set([...Object.keys(oa), ...Object.keys(ob)])].every((chiave) => uguali(oa[chiave], ob[chiave], true));
  }
  const x = comeNumero(a);
  const y = comeNumero(b);
  if (x != null && y != null && (!dentro || typeof a === "number" || typeof b === "number")) return Math.abs(x - y) < TOLLERANZA;
  return a === b;
}

/** `salvato` e `nuovo` dicono cose diverse? Vuoto (null / undefined) è uguale a vuoto. */
export function valoriDiversi(salvato: unknown, nuovo: unknown): boolean {
  return !uguali(salvato, nuovo, false);
}
