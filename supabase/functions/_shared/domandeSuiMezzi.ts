// Le domande sul parco mezzi e attrezzi (05/10/2026), riconosciute senza
// chiamare il classificatore AI: stanno con i cantieri (area operations).
// File a sé, senza import, perché lo provano anche i test del frontend.

/**
 * «Dov'è il demolitore?», «chi ha il furgone?», «quanto ponteggio è montato?»:
 * domande sul parco mezzi e attrezzi, che stanno con i cantieri. Serve un
 * oggetto del parco E una domanda su dove sta o chi lo ha: «mezzo» da solo
 * non basta («mezzo milione», «in mezzo»).
 */
export function isMezziQuestion(query: string): boolean {
  // l'apostrofo curvo della tastiera del telefono («dov’è») vale quello dritto
  const q = query.toLowerCase().replace(/[’‘`]/g, "'");
  const hasOggetto = /\b(mezzi|automezz\w*|attrezz\w*|furgon\w*|ponteggi?o?|transenn\w*|escavator\w*|miniescavator\w*|demolitor\w*|martell\w*|generator\w*|betonier\w*|flessibil\w*|trapan\w*|avvitator\w*|livell\w* laser|gru|piattaform\w*|sollevator\w*|targa)\b/.test(q);
  const asksDove = /\b(dove\b|dov'|chi (ce )?l'ha|chi ha|chi li ha|in carico|a bordo|si trova\w*|finit\w*|non (si )?trov\w*|ultima volta|montat\w*|liber\w*|in magazzino|in officina|rott\w*|guast\w*|cosa c'[eè])/.test(q);
  return hasOggetto && asksDove;
}
