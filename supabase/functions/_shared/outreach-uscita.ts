// Via d'uscita «invisibile» del cold in stile umano: niente header
// List-Unsubscribe (Gmail lo trasforma nel bottone «Annulla iscrizione», che
// dichiara l'invio massivo), ma una frase nel corpo che invita a rispondere
// «no». La risposta la legge il poller: l'opt-out funziona senza farsi vedere.

export const FRASE_USCITA_DEFAULT = "Se non ti interessa, rispondi «no» e non ti scrivo più.";

const FRASI_USCITA = [
  // Solo l'imperativo rivolto al lettore («rispondi», «rispondimi»): «ti
  // rispondo … anche se la risposta è no» non è una via d'uscita.
  /\brispond(i|imi|ete|etemi)\b[^.\n]{0,40}(«no»|"no"|'no'|\bno\b|\bstop\b|\bbasta\b)/i,
  /non ti (scrivo|scriverò|disturbo|disturberò) (più|piu)/i,
  /smetto di scriver/i,
  /non ricever\w* (più|piu|altre)/i,
  /(togli|cancell|rimuov)\w*[^.\n]{0,30}(lista|elenco)/i,
  /disiscri/i,
];

/** true se il testo contiene già un modo esplicito per dire «basta». */
export function haFraseUscita(testo: string): boolean {
  const t = (testo ?? "").replace(/\s+/g, " ");
  return FRASI_USCITA.some((re) => re.test(t));
}
