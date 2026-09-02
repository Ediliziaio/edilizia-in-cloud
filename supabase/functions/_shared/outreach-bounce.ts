/**
 * outreach-bounce — riconoscimento PURO dei mancati recapiti (NDR) che arrivano
 * nella casella mittente come email da mailer-daemon/postmaster.
 *
 * Perche' esiste: per le caselle proprie (SMTP/Gmail/Outlook) i bounce non
 * passano da nessun webhook, arrivano in inbox. Il classificatore precedente
 * li trattava come "autorisposta" (mittente di sistema) e la sequenza
 * proseguiva verso indirizzi inesistenti: il segnale spam piu' classico.
 */

export interface BounceInfo {
  isBounce: boolean;
  /** true = indirizzo inesistente/rifiutato (sopprimere); false = temporaneo (solo contare). */
  hard: boolean;
  /** Indirizzi destinatari falliti trovati nel corpo (lowercase, unici). */
  failedEmails: string[];
  reason: string | null;
}

const FROM_SYSTEM = /mailer-daemon|postmaster|mail delivery (sub)?system|delivery[-_ ]?status|bounce/i;
const SUBJECT_BOUNCE = /undeliver|delivery (status )?(notification|failure|report|problem)|mail delivery fail|returned mail|failure notice|delivery has failed|non (e'|è|e) stato (possibile )?recapit|mancata consegna|mancato recapito|impossibile (recapitare|consegnare)|non recapitabil|messaggio non (consegnato|recapitato)|rejected|could not be delivered/i;
const HARD = /\b550\b|5\.1\.[01]\b|5\.4\.1\b|5\.7\.1\b|user unknown|unknown user|does not exist|doesn't exist|no such (user|recipient|mailbox)|mailbox (unavailable|not found)|recipient (address )?rejected|address rejected|invalid recipient|invalid address|inesistente|non esiste|casella (di posta )?(non esiste|inesistente|non trovata)|unrouteable|domain not found|host or domain name not found|nxdomain|account (has been )?disabled/i;
const SOFT = /mailbox (is )?full|over quota|quota exceeded|temporar|4\.[0-9]\.[0-9]\b|\b42[01]\b|\b45[0-2]\b|try again later|greylist|deferred|delayed|will retry|casella piena/i;
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;

export function parseBounce(msg: {
  from: string;
  subject?: string | null;
  text?: string | null;
  /** Indirizzi da ignorare nell'estrazione (la casella mittente, alias). */
  ignoreEmails?: string[];
}): BounceInfo {
  const from = String(msg.from ?? "");
  const subject = String(msg.subject ?? "");
  const text = String(msg.text ?? "");
  const isBounce = FROM_SYSTEM.test(from) || SUBJECT_BOUNCE.test(subject);
  if (!isBounce) return { isBounce: false, hard: false, failedEmails: [], reason: null };

  const ignore = new Set((msg.ignoreEmails ?? []).map((e) => e.trim().toLowerCase()).filter(Boolean));
  const fromAddr = (from.match(/<([^>]+)>/)?.[1] ?? from).trim().toLowerCase();
  ignore.add(fromAddr);
  const found = new Set<string>();
  // Prima i campi strutturati del report (RFC 3464), poi il testo libero.
  const strutturati = text.match(/(?:final-recipient|original-recipient|x-failed-recipients)\s*:\s*(?:rfc822;)?\s*([^\s;,]+)/gi) ?? [];
  for (const riga of strutturati) {
    const m = riga.match(EMAIL_RE);
    if (m) for (const e of m) found.add(e.toLowerCase());
  }
  if (found.size === 0) {
    for (const e of text.match(EMAIL_RE) ?? []) found.add(e.toLowerCase());
  }
  const failedEmails = [...found].filter((e) => !ignore.has(e) && !FROM_SYSTEM.test(e) && !/no-?reply@/i.test(e));

  const corpus = `${subject}\n${text}`;
  const hard = HARD.test(corpus) && !SOFT.test(corpus) ? true : HARD.test(corpus) && !/temporar|try again|will retry|delayed|deferred/i.test(corpus);
  const reason = (corpus.match(HARD)?.[0] ?? corpus.match(SOFT)?.[0] ?? null);
  return { isBounce: true, hard, failedEmails, reason };
}
