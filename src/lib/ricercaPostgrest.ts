/**
 * Il testo scritto in una casella di ricerca, pronto per i filtri PostgREST.
 *
 * Virgole e parentesi separano le condizioni di `.or()`: cercare «tubo 20,5»
 * spezzava il filtro e la ricerca finiva in errore. `%` è il jolly di `ilike`,
 * le virgolette delimitano i valori e la barra rovesciata è il suo carattere
 * di escape. Il trattino basso resta: nei codici serve, e come jolly trova
 * comunque se stesso.
 */
export function termineDiRicerca(valore: unknown, lunghezzaMassima = 80): string {
  if (valore == null) return "";
  return String(valore)
    .replace(/[%(),"\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, lunghezzaMassima);
}
