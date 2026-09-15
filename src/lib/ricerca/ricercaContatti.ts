/**
 * Filtri della ricerca contatti in alto a destra.
 *
 * La ricerca cercava la frase intera in nome, cognome o email: «Lia Logar» non
 * trovava nessuno (il nome è «Lia», il cognome «Logar»), un contatto importato
 * come «RoccoPagnotta» nemmeno, e il telefono non si cercava affatto (BeMade,
 * 15/09). Ora ogni parola deve comparire in uno dei campi, e un numero si cerca
 * nel telefono senza badare a spazi e prefisso.
 *
 * Restituisce le condizioni per `.or()` di PostgREST: più `.or()` in fila
 * valgono tutte insieme (una per parola).
 */

const MAX_PAROLE = 5;
const CAMPI = ["first_name", "last_name", "email", "phone"] as const;

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
 * Le cifre da cercare se il testo è un numero di telefono: «+39 347 984 5700»,
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

export function filtriRicercaContatti(testo: string): string[] {
  const telefono = cifreTelefono(testo);
  if (telefono) return [`phone.ilike.%${telefono}%`];
  return paroleRicerca(testo).map((parola) => CAMPI.map((campo) => `${campo}.ilike.%${parola}%`).join(","));
}
