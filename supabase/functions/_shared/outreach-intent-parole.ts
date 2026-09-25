// Fallback a parole chiave per le risposte del cold: quando l'AI è giù, o
// non è sicura, un «no» o un «cancellatemi» devono comunque fermare tutto.
// Per gli intenti che chiudono (opt-out / non interessato), più un caso solo
// che apre: la risposta fatta del solo numero di telefono (in fondo al file).
// Il resto lo decide l'AI, o resta «other».

import { senzaCitazione } from "./outreach-autoreply.ts";

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

// ── La risposta fatta del solo numero di telefono ──────────────────────────
// «3385647736 / Giuseppe», «Ok 351 7881465»: il destinatario chiede di essere
// chiamato. Fino al 24/09/2026 l'AI le metteva fra «altro» — nel suo prompt il
// «rimando a un numero» era un segno di autorisposta — e tre persone di
// ThermoDMR sono rimaste giorni senza chiamata e fuori dalle opportunità.

/** Candidati: 6-14 cifre con spazi, punti, trattini o barre, non attaccate ad altre lettere o cifre. */
const CANDIDATO_TELEFONO = /(?<![\p{L}\p{N}])(?:\+|00)?\d(?:[\s./-]?\d){5,13}(?![\p{L}\p{N}])/gu;

/** Un numero italiano vero: cellulare (3…, 9-10 cifre) o fisso (0…, 6-11 cifre), anche con +39. Le date no. */
function eUnTelefono(candidato: string): boolean {
  let cifre = candidato.replace(/\D/g, "");
  if (cifre.startsWith("0039")) cifre = cifre.slice(4);
  else if (candidato.trim().startsWith("+39")) cifre = cifre.slice(2);
  return /^(?:3\d{8,9}|0\d{5,10})$/.test(cifre);
}

/** Dove comincia la firma: da lì in giù non è più la risposta. */
const INIZIO_FIRMA = /\b(?:cordiali\s+saluti|distinti\s+saluti|cordialmente|un\s+saluto|saluti|inviato\s+da|sent\s+from)\b|(?:^|\n)[ \t]*--[ \t]*(?:\n|$)/i;

/** Segni di firma, di messaggio automatico o di rifiuto: con questi il numero non è un «chiamami». */
const NON_E_UN_CHIAMAMI = /www\.|https?:|@|\bp\.?\s?iva\b|partita\s+iva|\bfax\b|\bvia\s+\p{L}|\bsede\b|urgenz|assen[tz]|ferie|rientr|\bchius[oae]\b|fuori\s+(?:sede|ufficio)|\b(?:chiamare|contattare|rivolgersi|telefonare)\b|\b(?:non|no|nessun\w*|stop|basta)\b|cancell|rimuov|disiscri/iu;

/**
 * Una risposta fatta del solo numero di telefono, al più con un «ok», un «sì,
 * chiamami» o il nome: vale «interessato». Stretta di proposito — chi scrive di
 * più lo legge l'AI — e ferma davanti a firme, messaggi automatici («per
 * urgenze chiamare il…»), date e rifiuti.
 */
export function rispostaColSoloNumero(testo: string | null | undefined): boolean {
  let t = senzaCitazione(String(testo ?? "").replace(/&nbsp;|\u00a0/gi, " "));
  const firma = INIZIO_FIRMA.exec(t);
  if (firma) t = t.slice(0, firma.index);
  t = t.replace(/\s+/g, " ").trim();
  if (!t || t.length > 90) return false;
  const numeri = (t.match(CANDIDATO_TELEFONO) ?? []).filter(eUnTelefono);
  if (numeri.length === 0) return false;
  if (NON_E_UN_CHIAMAMI.test(t)) return false;
  const resto = numeri.reduce((acc, n) => acc.replace(n, " "), t).replace(/[^\p{L}\s]/gu, " ").trim();
  return resto.split(/\s+/).filter(Boolean).length <= 6;
}

// ── «Più avanti»: non è un no, è un «non adesso» ───────────────────────────
// Dal 25/09/2026 le nostre email lo propongono come risposta («scrivimi più
// avanti e mi faccio sentire tra qualche mese»): chi lo scrive va ricontattato,
// non perso fra gli «altro».
const RE_PIU_AVANTI = [
  /\bpi[uù]\s+avanti\b/i,
  /\bpi[uù]\s+in\s+l[aà]\b/i,
  /\bnon\s+(?:adesso|ora|per\s+ora|in\s+questo\s+momento)\b/i,
  /\b(?:per\s+ora|al\s+momento|adesso)\s+no\b/i,
  /\b(?:tra|fra)\s+(?:qualche|un\s+paio\s+di|due|tre|quattro|sei)\s+mes[ei]\b/i,
  /\b(?:ri)?sentiamoci\b/i,
  /\bricontatt\w*\s+(?:tra|fra|dopo|a\s+\p{L}+)/iu,
];

/** La risposta dice «non adesso» (e non chiede di essere cancellato). */
export function rispostaPiuAvanti(testo: string | null | undefined): boolean {
  let t = senzaCitazione(String(testo ?? "").replace(/&nbsp;| /gi, " "));
  const firma = INIZIO_FIRMA.exec(t);
  if (firma) t = t.slice(0, firma.index);
  t = t.replace(/\s+/g, " ").trim();
  if (!t) return false;
  if (intentDaParoleChiave("", t) === "unsubscribe") return false;
  // «Non ricontattatemi (più)» è un basta, anche se le regole dell'opt-out non lo vedono.
  if (/\bnon\s+(?:mi\s+|ci\s+)?(?:ri)?contatt/i.test(t)) return false;
  return RE_PIU_AVANTI.some((re) => re.test(t));
}
