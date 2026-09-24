/**
 * Come si cerca un contatto, in tutta l'app: barra in alto, pagina Contatti,
 * selettori nelle finestre.
 *
 * Le ricerche cercavano la frase intera dentro un campo solo: «Lia Logar» non
 * trovava nessuno (il nome è «Lia», il cognome «Logar»), come «Elide Ruggiata»
 * sulla pagina Contatti di BeMade (24/09). Ora ogni parola deve comparire in uno
 * dei campi, e un numero si cerca nel telefono comunque sia scritto e nella
 * partita IVA.
 *
 * Restituisce le condizioni per `.or()` di PostgREST: più `.or()` in fila
 * valgono tutte insieme (una per parola).
 */

const MAX_PAROLE = 5;
/** Chi è, come si raggiunge, dove sta, i suoi codici. */
const CAMPI = ["first_name", "last_name", "email", "phone", "company_name", "city", "fiscal_code", "vat_number"] as const;

/** Toglie i caratteri che rompono la sintassi di `.or()` e rende letterali i jolly. */
function pulisci(parola: string): string {
  return parola
    .replace(/[,()"]/g, "")
    .replace(/[\\%_]/g, (c) => `\\${c}`);
}

export function paroleRicerca(testo: string): string[] {
  return testo
    .split(/\s+/)
    .map(pulisci)
    .filter((p) => p.length > 0)
    .slice(0, MAX_PAROLE);
}

/**
 * Le cifre da cercare se il testo è un numero: «+39 347 984 5700»,
 * «347-9845700», «00393479845700» → «3479845700». Null se non è un numero.
 */
export function cifreTelefono(testo: string): string | null {
  const compatto = testo.trim().replace(/[\s.\-/()]/g, "");
  if (!/^\+?\d{6,}$/.test(compatto)) return null;
  let cifre = compatto.replace(/^\+/, "");
  if (cifre.startsWith("0039")) cifre = cifre.slice(4);
  else if (cifre.startsWith("39") && cifre.length > 10) cifre = cifre.slice(2);
  return cifre;
}

/** Le cifre in fila anche se nel numero salvato ci sono spazi o trattini: «0546620120» trova «0546 620120». */
export function espressioneCifre(cifre: string): string {
  return cifre.split("").join("[^0-9]*");
}

/** Ogni parola in almeno uno dei campi dati. Per altre tabelle, coi loro campi. */
export function filtriRicercaParole(testo: string, campi: readonly string[]): string[] {
  return paroleRicerca(testo).map((parola) => campi.map((campo) => `${campo}.ilike.%${parola}%`).join(","));
}

export function filtriRicercaContatti(testo: string): string[] {
  const numero = cifreTelefono(testo);
  if (numero) return [`phone.imatch.${espressioneCifre(numero)},vat_number.ilike.%${numero}%`];
  return filtriRicercaParole(testo, CAMPI);
}
