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
 *
 * Dal 22/09/2026 una risposta automatica è di due tipi (tipoAutorisposta):
 *   - «nuovo_indirizzo»: la casella è dismessa e indica dove scrivere. Il
 *     gestore delle risposte cambia l'indirizzo del contatto e rimanda
 *     l'email a quello nuovo;
 *   - «attesa»: conferma di ricezione, ticket, ferie. Il flusso prosegue.
 * In nessuno dei due casi è una risposta ottenuta: non ferma il flusso, non
 * avvisa, non crea opportunità né task, non entra nei conteggi.
 */

/** Header normalizzati (chiave lowercase → valore). Opzionali. */
export type InboundHeaders = Record<string, string> | null | undefined;

/**
 * La casella non si usa più, per sempre. Nominano la casella (o l'indirizzo,
 * la mail): «la ditta non è più attiva» è una persona, non un risponditore.
 */
const CASELLA_DISMESSA: RegExp[] = [
  // «questa mail non è più attiva», «l'indirizzo e-mail corrente non sarà a
  // breve più in utilizzo», «questo indirizzo email non è più attivo»
  /\b(?:casella|indirizzo|account|e-?mail|mail|posta)\b[^.\n]{0,60}?\bnon\s+(?:è|e'|e’|sarà|sara'|verrà)\s+(?:a\s+breve\s+)?più\s+(?:attiv|in\s+uso|in\s+utilizzo|utilizzat|usat|monitorat|lett|consultat|valid|operativ|gestit)/i,
  // «la presente casella di posta elettronica è stata disattivata», «questa
  // casella di posta a breve sarà dismessa»
  /\b(?:casella|indirizzo|account|e-?mail|mail)\b[^.\n]{0,60}?\b(?:disattivat|dismess|soppress|cessat)/i,
  /\b(?:mailbox|e-?mail\s+address|address|account)\b[^.\n]{0,40}?\b(?:no\s+longer\s+(?:active|in\s+use|monitored|valid|used)|(?:be\s+)?(?:discontinued|deactivated|decommissioned))\b/i,
];

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
  // IT — conferme di ricezione e ticket (22/09/2026: Unareti ed EDP erano
  // passate per una domanda e per un interessato, con flusso fermato,
  // avviso, task di chiamata e opportunità nel CRM).
  /\babbiamo\s+ricevuto\s+(?:la\s+|il\s+)?(?:sua|tua|vostra|vs\.?)\s+(?:e-?mail|mail|richiesta|messaggio|comunicazione|segnalazione)/i,
  /\b(?:confermiamo|si\s+conferma|conferma)\s+(?:l['’]\s*)?(?:avvenuta\s+)?ricezione\b/i,
  /\b(?:sua|tua|vostra|vs\.?)\s+(?:e-?mail|mail|richiesta|comunicazione|segnalazione)\s+(?:è|e'|e’)\s+stata\s+(?:ricevuta|presa\s+in\s+carico|inoltrata|registrata)/i,
  /\bsenza\s+modificare\s+l['’]\s*oggetto\b/i,
  /\binteresse\s+dimostrato\s+verso\b/i,
  // Casella dismessa: «questo indirizzo non è più attivo», «la casella è stata
  // disattivata». Lo scrive un risponditore, non una persona che risponde.
  ...CASELLA_DISMESSA,
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

/**
 * True se oggetto o corpo contengono frasi tipiche di assenza/autorisposta.
 * Il corpo si legge senza la nostra email citata sotto: una frase nostra non
 * deve far passare per automatica la risposta di una persona.
 */
export function textIndicatesAutoReply(subject: string | null | undefined, body: string | null | undefined): boolean {
  const hay = `${subject ?? ""}\n${senzaCitazione(body)}`;
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

// ── «Scrivete a un altro indirizzo» ─────────────────────────────────────────
//
// 22/09/2026, Florin: una risposta automatica che dice di scrivere a un altro
// indirizzo autorizza a cambiare l'indirizzo del contatto e a rimandare
// l'email; una che dice «vi risponderemo» o «sono in ferie» no: il flusso
// prosegue e basta. «In mia assenza scrivete a un collega» è temporaneo,
// l'indirizzo non si cambia. Delle 57 risposte arrivate fino al 22/09, 8
// erano di questo tipo, da 6 aziende, e il flusso continuava a scrivere alla
// casella morta.

/** Che cosa chiede una risposta automatica: un indirizzo nuovo, o di aspettare. */
export type TipoAutorisposta = "nuovo_indirizzo" | "attesa";

/** Annunci di indirizzo nuovo: valgono solo se non si parla di un'assenza. */
const INDIRIZZO_NUOVO: RegExp[] = [
  /\b(?:nuovo|nuova)\s+(?:indirizzo|casella|e-?mail|mail)\b/i,
  /\b(?:variazione|cambio|cambiamento|modifica)\s+(?:di\s+|dell['’]\s*)?(?:indirizzo|e-?mail|casella)\b/i,
  /\bnew\s+(?:e-?mail\s+)?address\b/i,
];

/** Assenze temporanee: il collega indicato qui non è l'indirizzo nuovo. */
const ASSENZA_TEMPORANEA =
  /\b(?:ferie|vacanz|assen[tz]|fuori\s+(?:sede|ufficio)|rientr|fino\s+al\b|in\s+mia\s+assenza|per\s+urgenze|out\s+of\s+(?:the\s+)?office|on\s+(?:vacation|holiday|leave)|until\b)/i;

const LOCALE_DI_SISTEMA = /^(?:no[-_.]?reply|noreply|do[-_.]?not[-_.]?reply|mailer-daemon|postmaster|bounces?|autoreply|abuse)$/i;

/** L'indirizzo nuovo sta a pochi caratteri dall'annuncio: più in là è la firma. */
const DISTANZA_MASSIMA = 320;

const EMAIL_NEL_TESTO =
  /[a-z0-9][a-z0-9._%+-]*@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,24}/gi;

/**
 * Il testo scritto da chi risponde, senza la nostra email citata sotto.
 * Tollera le citazioni sulla stessa riga («… Il giorno lun 21 set 2026 alle
 * 09:38 Mario <m@x.it> ha scritto: …»), che nelle risposte vere sono la norma.
 */
export function senzaCitazione(testo: string | null | undefined): string {
  const t = String(testo ?? "");
  const tagli = [
    /(?:^|\n)[ \t]*>/,
    // Con una data dentro: «il nostro tecnico ha scritto: ok» è testo, non una citazione.
    /\bIl\s+(?:giorno\s+)?[^\n]{0,60}?\d[^\n]{0,100}?\bha\s+scritto\s*:/i,
    /\bOn\s+[^\n]{0,60}?\d[^\n]{0,100}?\bwrote\s*:/i,
    /-{2,}\s*(?:messaggio\s+originale|original\s+message)/i,
    /(?:^|\n)[ \t]*(?:da|from)\s*:\s*[^\n]*@/i,
    /\b(?:Da|From)\s*:\s*"?[^\n<>@]{0,60}<?[\w.+-]+@[\w.-]+>?\s*(?:Inviato|Sent|Data|Date|A|To)\s*:/,
  ];
  let fine = t.length;
  for (const re of tagli) {
    const m = re.exec(t);
    if (m && m.index < fine) fine = m.index;
  }
  return t.slice(0, fine).trim();
}

/**
 * Due indirizzi incollati dalla conversione HTML→testo, come
 * «info@enzoponteggi.itamministrazione@enzoponteggi.it»: si separano dopo il
 * dominio, e mai dentro la parte prima della chiocciola (mario.italiano@…).
 */
function separaIndirizziIncollati(testo: string): string {
  return testo.replace(
    /(@[a-z0-9-]+(?:\.[a-z0-9-]+)*?\.(?:it|com|eu|net|org|info|biz|ch|de|fr|es))(?=[a-z0-9][a-z0-9._%+-]*@)/gi,
    "$1 ",
  );
}

function dominioDi(email: string): string {
  return email.slice(email.indexOf("@") + 1);
}

/**
 * Il nuovo indirizzo di una risposta automatica «scrivete a …», oppure null.
 *
 * Serve un annuncio (casella dismessa, «nuovo indirizzo», «variazione
 * indirizzo») e, entro poche righe, un indirizzo che non sia quello a cui
 * avevamo scritto, né un nostro dominio, né un indirizzo di sistema. Un
 * annuncio «debole» («nuovo indirizzo») insieme a un'assenza («in ferie fino
 * al…») non vale: è il collega che risponde nel frattempo.
 */
export function nuovoIndirizzoDaAutorisposta(args: {
  subject?: string | null;
  body?: string | null;
  /** L'indirizzo a cui avevamo scritto, o il mittente della risposta. */
  vecchi?: Array<string | null | undefined>;
  /** Domini delle nostre caselle: un nostro indirizzo non è mai quello nuovo. */
  nostriDomini?: Iterable<string>;
}): string | null {
  const corpo = senzaCitazione(args.body);
  const testo = separaIndirizziIncollati(`${args.subject ?? ""}\n${corpo}`);

  const inizioForte = primaPosizione(CASELLA_DISMESSA, testo);
  const inizioDebole = primaPosizione(INDIRIZZO_NUOVO, testo);
  let inizio: number;
  if (inizioForte >= 0) inizio = inizioDebole >= 0 ? Math.min(inizioForte, inizioDebole) : inizioForte;
  else if (inizioDebole >= 0 && !ASSENZA_TEMPORANEA.test(testo)) inizio = inizioDebole;
  else return null;

  const vecchi = new Set(
    (args.vecchi ?? []).map((v) => String(v ?? "").trim().toLowerCase()).filter(Boolean),
  );
  const nostri = new Set([...(args.nostriDomini ?? [])].map((d) => String(d).trim().toLowerCase()).filter(Boolean));

  EMAIL_NEL_TESTO.lastIndex = 0;
  for (const m of testo.matchAll(EMAIL_NEL_TESTO)) {
    const pos = m.index ?? 0;
    if (pos < inizio) continue;
    if (pos - inizio > DISTANZA_MASSIMA) break;
    const email = m[0].toLowerCase().replace(/[.\-_]+$/, "");
    const locale = email.slice(0, email.indexOf("@"));
    if (vecchi.has(email)) continue;
    if (LOCALE_DI_SISTEMA.test(locale)) continue;
    if (nostri.has(dominioDi(email))) continue;
    return email;
  }
  return null;
}

/** Il tipo di una risposta già riconosciuta come automatica. */
export function tipoAutorisposta(args: Parameters<typeof nuovoIndirizzoDaAutorisposta>[0]): {
  tipo: TipoAutorisposta;
  nuovoIndirizzo: string | null;
} {
  const nuovoIndirizzo = nuovoIndirizzoDaAutorisposta(args);
  return { tipo: nuovoIndirizzo ? "nuovo_indirizzo" : "attesa", nuovoIndirizzo };
}

function primaPosizione(regole: RegExp[], testo: string): number {
  let prima = -1;
  for (const re of regole) {
    const m = re.exec(testo);
    if (m && (prima < 0 || m.index < prima)) prima = m.index;
  }
  return prima;
}
