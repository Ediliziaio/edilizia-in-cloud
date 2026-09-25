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

/**
 * Il corpo dell'email come parte: testo scritto dal brand, eventuale frase
 * d'uscita aggiunta dal motore, firma.
 *
 * Restituisce anche il testo da passare al linter, SENZA la frase d'uscita
 * aggiunta dal motore. Il linter ferma un'email oltre le 120 parole: contando
 * anche la frase che il motore mette da sé, testi scritti a 101-117 parole
 * (firma inclusa, verificati nell'editor) venivano scartati tutti. Il 14/09 ha
 * bloccato 98 primi contatti di ThermoDMR in due ore. Chi scrive risponde di
 * quello che scrive; ciò che aggiunge il motore non gli può togliere l'invio.
 */
export function componiCorpo(opz: {
  /** Corpo già personalizzato (HTML). */
  corpo: string;
  /** Il motore aggiunge la frase d'uscita se il corpo non ne ha una. */
  aggiungiUscita: boolean;
  /** Frase del brand; vuota = predefinita. */
  frase?: string | null;
  /** Firma già personalizzata (HTML o testo); vuota = nessuna. */
  firma?: string | null;
}): { html: string; htmlDaControllare: string } {
  // La firma si scrive nel pannello con gli a capo, ma l'email parte in HTML:
  // senza <br> «Filippo Monti» e «ThermoDMR · +39…» uscivano sulla stessa riga.
  const firma = (opz.firma ?? "").trim()
    ? `<br><br>${(opz.firma as string).replace(/\r?\n/g, "<br>")}`
    : "";
  let uscita = "";
  if (opz.aggiungiUscita) {
    const frase = (opz.frase ?? "").trim() || FRASE_USCITA_DEFAULT;
    uscita = `<br><br>${frase.replace(/&/g, "&amp;").replace(/</g, "&lt;")}`;
  }
  // Il P.S. va sotto la firma, come in una mail vera (25/09/2026): prima la
  // firma finiva in coda al corpo e il P.S. restava sopra il nome.
  const ps = firma || uscita ? inizioPostScriptum(opz.corpo) : -1;
  const [testo, coda] = ps >= 0 ? [opz.corpo.slice(0, ps), opz.corpo.slice(ps)] : [opz.corpo, ""];
  return {
    html: `${testo}${uscita}${firma}${coda}`,
    htmlDaControllare: `${opz.corpo}${firma}`,
  };
}

/**
 * Dove comincia il P.S. finale del corpo HTML (gli a capo che lo precedono
 * compresi), o -1. Conta solo un P.S. che chiude il messaggio: l'ultimo
 * paragrafo che comincia con «P.S.» / «PS:» dopo un doppio a capo.
 */
export function inizioPostScriptum(corpoHtml: string): number {
  const re = /(?:<br\s*\/?>\s*){2,}(?=P\.?\s?S\.?[:\s])/gi;
  let ultimo = -1;
  for (const m of corpoHtml.matchAll(re)) ultimo = m.index ?? -1;
  return ultimo;
}
