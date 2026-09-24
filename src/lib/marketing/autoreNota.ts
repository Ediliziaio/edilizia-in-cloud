/**
 * Chi ha scritto una nota e quando, detto sempre allo stesso modo.
 *
 * Una nota senza firma non si può pesare: «non interessato» scritto dal
 * titolare vale diversamente da quello di un collega al primo giorno. Le note
 * importate e quelle scritte dal sistema non hanno autore: si dice, invece di
 * lasciare la riga vuota come se l'informazione mancasse per errore.
 */

export interface ProfiloAutore {
  first_name?: string | null;
  last_name?: string | null;
}

/** L'autore da mostrare, o la spiegazione di perché non c'è. */
export function autoreNota(profilo: ProfiloAutore | ProfiloAutore[] | null | undefined): string {
  const p = Array.isArray(profilo) ? profilo[0] : profilo;
  const nome = [p?.first_name, p?.last_name]
    .map((x) => (x ?? "").trim())
    .filter(Boolean)
    .join(" ");
  return nome || "Importata o automatica";
}

/** Data e ora complete: «14/09/2026, 09:12». */
export function dataOraNota(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** La riga sotto la nota: «14/09/2026, 09:12 · Venusia BeMade». */
export function firmaNota(iso: string | null | undefined, profilo: ProfiloAutore | ProfiloAutore[] | null | undefined): string {
  return [dataOraNota(iso), autoreNota(profilo)].filter(Boolean).join(" · ");
}

/** Le note rimaste fuori da un'anteprima: «+1 altra», «+4 altre», o niente. */
export function altreNote(totale: number, mostrate: number): string {
  const resto = totale - mostrate;
  if (resto <= 0) return "";
  return resto === 1 ? "+1 altra" : `+${resto} altre`;
}
