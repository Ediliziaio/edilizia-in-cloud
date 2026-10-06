/**
 * Il testo di un prodotto del listino come lo leggono anteprima e PDF.
 *
 * Funzioni pure e leggere (nessun import): le usano l'anteprima a destra, l'adattatore
 * del PDF e il selettore voci. Il calcolo del prezzo sta in `prodottiListino`.
 */

/** Testo del listino: spazi e a capo ridotti, vuoto = niente. */
export function testoDelListino(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.replace(/\s+/g, " ").trim();
  return t.length > 0 ? t : null;
}

/**
 * La descrizione del prodotto come sta nel PDF: una sola frase corta. Quelle del
 * listino possono essere lunghe come una scheda tecnica; qui si taglia a una parola
 * intera, con i puntini.
 */
export function descrizioneBreve(testo: string | null | undefined, massimo = 220): string | null {
  const t = testoDelListino(testo);
  if (!t) return null;
  if (t.length <= massimo) return t;
  const taglio = t.slice(0, massimo - 1);
  const ultimoSpazio = taglio.lastIndexOf(" ");
  const intero = ultimoSpazio > massimo * 0.6 ? taglio.slice(0, ultimoSpazio) : taglio;
  return `${intero.replace(/[\s,;:.\-–—]+$/u, "")}…`;
}
