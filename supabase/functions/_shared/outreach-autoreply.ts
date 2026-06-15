/**
 * outreach-autoreply — riconoscimento risposte automatiche (auto-reply / OOO).
 * Logica PURA (niente Deno/Supabase): testata in vitest.
 *
 * Perché: una risposta automatica (fuori sede, ticket aperto, mailer-daemon,
 * "no-reply") NON è un segnale di interesse e NON deve fermare la sequenza cold
 * né essere etichettata "interessato". La trattiamo come `auto_reply`: la riga
 * della risposta viene comunque salvata (così resta visibile in Posta) ma la
 * cadenza prosegue.
 *
 * Strategia di rilevamento, dal più al meno affidabile:
 *   1. Header RFC standard, quando disponibili (webhook che li espone o IMAP):
 *      - Auto-Submitted: auto-replied | auto-generated   (RFC 3834)
 *      - Precedence: bulk | junk | auto_reply | list
 *      - X-Autoreply / X-Autorespond / X-Auto-Response-Suppress presenti
 *      - From: contiene mailer-daemon / postmaster / no-reply
 *   2. Euristiche su oggetto/corpo (sempre disponibili) per provider che NON
 *      espongono gli header: "out of office", "fuori sede", "in ferie",
 *      "risposta automatica", "automatic reply", "auto-reply", "vacation"…
 *
 * Tutto best-effort e conservativo: in dubbio NON marca auto-reply (meglio un
 * falso negativo, che lascia la classificazione AI fare il suo lavoro, di un
 * falso positivo che zittisce un lead realmente interessato).
 */

/** Header normalizzati (chiave lowercase → valore). Opzionali. */
export type InboundHeaders = Record<string, string> | null | undefined;

/** Pattern sull'oggetto/corpo (IT + EN) tipici delle autorisposte di assenza. */
const SUBJECT_BODY_PATTERNS: RegExp[] = [
  // EN — out of office / auto reply
  /\bout\s+of\s+(the\s+)?office\b/i,
  /\bauto(?:matic|mated)?[-\s]?repl(?:y|ies)\b/i,
  /\bauto[-\s]?respond/i,
  /\baway\s+from\s+(my\s+)?(desk|office|email)\b/i,
  /\bon\s+(vacation|holiday|leave|annual\s+leave|parental\s+leave)\b/i,
  /\bI\s+am\s+(currently\s+)?(out|away|unavailable)\b/i,
  /\bwill\s+be\s+(out|away|unavailable)\b/i,
  /\bback\s+(in|on)\s+the\s+office\b/i,
  // IT — fuori sede / risposta automatica / ferie
  /\bfuori\s+sede\b/i,
  /\brisposta\s+autom/i,
  /\bmessaggio\s+autom/i,
  /\b(sono|sarò|saremo)\s+(attualmente\s+)?(assente|assenti|fuori\s+ufficio)\b/i,
  /\bin\s+ferie\b/i,
  /\bin\s+congedo\b/i,
  /\bin\s+vacanz/i,
  /\bnon\s+sono\s+(in\s+ufficio|disponibile|raggiungibile)\b/i,
  /\bsarò\s+di\s+ritorno\b/i,
  /\brientr(?:o|erò|iamo)\s+(in\s+ufficio|il\b|lunedì|marted)/i,
  // DE/FR/ES brevi (capitano nei pool internazionali)
  /\babwesenheits/i,            // de: Abwesenheitsnotiz
  /\bautomatische\s+antwort\b/i, // de
  /\babsen(?:t|ce)\s+du\s+bureau\b/i, // fr
  /\bréponse\s+automatique\b/i,  // fr
  /\bausencia\s+de\s+la\s+oficina\b/i, // es
  /\brespuesta\s+autom/i,        // es
];

/** Mittenti "di sistema" che non vanno mai trattati come lead reali. */
const SYSTEM_FROM_PATTERNS: RegExp[] = [
  /mailer-daemon@/i,
  /postmaster@/i,
  /\bno[-_.]?reply@/i,
  /\bnoreply@/i,
  /\bdo[-_.]?not[-_.]?reply@/i,
  /\bbounce[s]?@/i,
  /\bautoreply@/i,
];

function header(headers: InboundHeaders, name: string): string {
  if (!headers) return "";
  // Accetta sia chiavi già lowercase sia con case originale.
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === lower) return String(v ?? "").trim();
  }
  return "";
}

/**
 * True se gli header indicano in modo non ambiguo un'autorisposta.
 * Conforme a RFC 3834 (Auto-Submitted) + convenzioni de-facto (Precedence,
 * X-Autoreply…). `Precedence: list` da solo NON basta (le newsletter legittime
 * lo usano): lo consideriamo solo come segnale debole insieme al resto.
 */
export function headersIndicateAutoReply(headers: InboundHeaders): boolean {
  if (!headers) return false;

  const autoSubmitted = header(headers, "auto-submitted").toLowerCase();
  // RFC 3834: qualunque valore diverso da "no" indica un messaggio automatico.
  if (autoSubmitted && autoSubmitted !== "no") return true;

  const precedence = header(headers, "precedence").toLowerCase();
  if (/\b(bulk|junk|auto_reply|auto-reply|autoreply)\b/.test(precedence)) return true;

  // Header proprietari: la sola presenza è sufficiente.
  if (header(headers, "x-autoreply")) return true;
  if (header(headers, "x-autorespond")) return true;
  if (header(headers, "x-auto-response-suppress")) return true;
  if (/\bauto[_-]?(replied|responder|notify)\b/i.test(header(headers, "x-mailer"))) return true;

  // Mittente di sistema (mailer-daemon/no-reply/postmaster).
  const from = header(headers, "from");
  if (from && SYSTEM_FROM_PATTERNS.some((re) => re.test(from))) return true;

  return false;
}

/** True se oggetto o corpo contengono frasi tipiche di assenza/autorisposta. */
export function textIndicatesAutoReply(subject: string | null | undefined, body: string | null | undefined): boolean {
  const hay = `${subject ?? ""}\n${body ?? ""}`;
  if (!hay.trim()) return false;
  return SUBJECT_BODY_PATTERNS.some((re) => re.test(hay));
}

/**
 * Decisione complessiva: è una risposta automatica?
 * Header (se presenti) hanno priorità; in loro assenza si usano le euristiche su
 * oggetto/corpo. Il mittente è opzionale: se passato, un indirizzo di sistema
 * (mailer-daemon/no-reply) basta da solo.
 */
export function isAutoReply(args: {
  headers?: InboundHeaders;
  subject?: string | null;
  body?: string | null;
  from?: string | null;
}): boolean {
  if (headersIndicateAutoReply(args.headers)) return true;
  if (args.from && SYSTEM_FROM_PATTERNS.some((re) => re.test(args.from!))) return true;
  if (textIndicatesAutoReply(args.subject, args.body)) return true;
  return false;
}
