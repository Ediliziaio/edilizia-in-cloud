// Fallback a parole chiave per le risposte del cold: quando l'AI è giù, o
// non è sicura, un «no» o un «cancellatemi» devono comunque fermare tutto.
// Vale solo per gli intenti che chiudono (opt-out / non interessato): il
// resto lo decide l'AI, o resta «other».

export type IntentParole = "unsubscribe" | "not_interested" | null;

const RE_UNSUBSCRIBE = [
  /\b(unsubscribe|disiscri\w*|cancell\w+\s*(mi|dalla|dall'|da questa)|rimuov\w+\s*(mi|dalla|dall'|da questa|il mio)|togli\w*\s*(mi|dalla|dall'))/i,
  /\bnon\s+(mi\s+)?(scriv\w+|mand\w+|contatt\w+|invi\w+)\s*(più|piu|altro|altre|mai)/i,
  /\bbasta\s+(email|mail|messaggi|scrivere|mandare)/i,
  /\bstop\b/i,
  /\bsmett\w+\s+di\s+(scriver|mandar)/i,
];

const RE_NOT_INTERESTED = [
  /\bnon\s+(sono|siamo|è|e')\s+interess/i,
  /\bnon\s+(mi|ci)\s+interess/i,
  /\bno[,.]?\s+grazie\b/i,
  /\bnon\s+(ci\s+)?serv\w+/i,
  /\bgià\s+(abbiamo|ho|siamo)\b/i,
];

function pulisci(testo: string): string {
  // Solo la parte scritta dal destinatario: tutto ciò che segue una citazione
  // («Il giorno … ha scritto:» / righe con «>») è nostro, non suo.
  const senzaCitazione = (testo ?? "")
    .split(/\n(?:>|il giorno .{0,80} ha scritto|on .{0,80} wrote)/i)[0];
  return senzaCitazione.replace(/\s+/g, " ").trim();
}

/** Intento da parole chiave: solo «basta» in una delle sue forme, altrimenti null. */
export function intentDaParoleChiave(subject: string, text: string): IntentParole {
  const corpo = pulisci(text);
  const tutto = `${subject ?? ""} ${corpo}`;
  // Un «no» secco (al massimo tre parole) è la risposta alla nostra frase
  // d'uscita: vale come opt-out, non come «forse».
  const parole = corpo.replace(/[^\p{L}\p{N}\s']/gu, " ").trim().split(/\s+/).filter(Boolean);
  if (parole.length > 0 && parole.length <= 3 && /^(no|nò|stop|basta)$/i.test(parole[0])) return "unsubscribe";
  if (RE_UNSUBSCRIBE.some((re) => re.test(tutto))) return "unsubscribe";
  if (RE_NOT_INTERESTED.some((re) => re.test(corpo))) return "not_interested";
  return null;
}
