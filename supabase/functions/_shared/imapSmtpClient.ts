/**
 * imapSmtpClient — minimal IMAP/SMTP clients via Deno.connectTls
 *
 * Implementazione compatta (no dipendenze esterne) per:
 *   - SMTP: AUTH LOGIN + EHLO + STARTTLS (port 587) o TLS diretto (port 465),
 *     MAIL FROM, RCPT TO, DATA, QUIT. Compatibile con la maggior parte dei
 *     provider italiani (Aruba, Libero, Register, iCloud, Yahoo).
 *   - IMAP: LOGIN, SELECT INBOX, UID SEARCH UNSEEN SINCE date, UID FETCH BODY[],
 *     LOGOUT. Parser FETCH base con normalizzazione headers (no MIME parser
 *     completo: best-effort multipart text/plain extract).
 *
 * Note: questo NON è un client production-grade — gestisce solo i percorsi
 * standard. Per casi edge (server custom, SMTP con OAuth XOAUTH2, IMAP IDLE)
 * usare denomailer + imap-deno specializzati.
 */

// ─────────────────────────────────────────────────────────────────────────────
// SMTP Client
// ─────────────────────────────────────────────────────────────────────────────

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;       // true = TLS diretto (465); false = STARTTLS (587)
  username: string;
  password: string;
}

export interface SmtpAttachment {
  filename: string;
  mimeType: string;
  contentBase64: string;  // base64-encoded content
}

export interface SmtpMessage {
  from: string;
  fromName?: string | null;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  bodyHtml?: string | null;
  bodyText?: string | null;
  inReplyTo?: string | null;
  references?: string[];
  attachments?: SmtpAttachment[];
  headers?: Record<string, string>;
  /** Message-ID da usare (default: <uuid@host-smtp>). Serve al threading dei follow-up. */
  messageId?: string | null;
}

export async function smtpSend(cfg: SmtpConfig, msg: SmtpMessage): Promise<{ messageId: string }> {
  const { host, port, secure, username, password } = cfg;

  let conn: Deno.TcpConn | Deno.TlsConn = secure
    ? await Deno.connectTls({ hostname: host, port })
    : await Deno.connect({ hostname: host, port });

  const decoder = new TextDecoder("utf-8", { fatal: false });
  const encoder = new TextEncoder();
  const buf = new Uint8Array(8192);

  /**
   * Una risposta SMTP completa, non il primo pacchetto che passa.
   *
   * `EHLO` risponde con più righe (`250-PIPELINING`, `250-SIZE`, … `250 OK`) e
   * TCP non garantisce che arrivino insieme: leggendo una volta sola, il resto
   * restava nel socket e veniva scambiato per la risposta del comando dopo —
   * da lì in poi ogni controllo guardava la risposta sbagliata. Qui si legge
   * finché non arriva la riga conclusiva (codice seguito da spazio).
   */
  async function readLine(): Promise<string> {
    let risposta = "";
    const completa = () => /(?:^|\r\n)\d{3} [^\r\n]*\r\n$/.test(risposta);
    while (!completa()) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const scadenza = new Promise<never>((_, rifiuta) => {
        timer = setTimeout(() => rifiuta(new Error("smtp_timeout")), 30_000);
      });
      let n: number | null;
      try {
        n = await Promise.race([conn.read(buf), scadenza]);
      } finally {
        if (timer !== undefined) clearTimeout(timer);
      }
      if (n === null) {
        if (risposta) break;
        throw new Error("smtp_connection_closed");
      }
      risposta += decoder.decode(buf.subarray(0, n as number), { stream: true });
    }
    return risposta;
  }
  async function send(line: string): Promise<void> {
    await conn.write(encoder.encode(line + "\r\n"));
  }
  async function expect(prefix: string): Promise<string> {
    const resp = await readLine();
    // Il codice che conta è quello dell'ultima riga: le precedenti sono
    // continuazioni (`250-…`) e possono avere lo stesso numero o meno.
    const conclusiva = (resp.trimEnd().split("\r\n").pop() ?? resp).trim();
    if (!conclusiva.startsWith(prefix)) {
      throw new Error(`smtp_unexpected: ${conclusiva.slice(0, 200)}`);
    }
    return resp;
  }

  try {
    // Greeting
    await expect("220");
    // Il nome dell'EHLO finisce nell'intestazione Received che il destinatario
    // legge: «edilizia-in-cloud» non è un host, e Gmail lo nota.
    await send(`EHLO ${EHLO_HOST}`);
    let ehloResp = await readLine();

    // STARTTLS se port 587 e server lo supporta
    if (!secure && ehloResp.toLowerCase().includes("starttls")) {
      await send("STARTTLS");
      await expect("220");
      // Upgrade a TLS
      conn = await Deno.startTls(conn as Deno.TcpConn, { hostname: host });
      await send(`EHLO ${EHLO_HOST}`);
      ehloResp = await readLine();
    }

    // AUTH LOGIN
    await send("AUTH LOGIN");
    await expect("334");
    await send(btoa(username));
    await expect("334");
    await send(btoa(password));
    await expect("235");

    // MAIL FROM
    await send(`MAIL FROM:<${msg.from}>`);
    await expect("250");

    const recipients = [...msg.to, ...(msg.cc ?? []), ...(msg.bcc ?? [])];
    for (const r of recipients) {
      await send(`RCPT TO:<${r}>`);
      const rcpt = await readLine();
      if (!(rcpt.trimEnd().split("\r\n").pop() ?? rcpt).trim().startsWith("250")) {
        // Rifiuto DEL DESTINATARIO (utente inesistente, relay negato): taggato
        // per distinguerlo da un guasto della casella.
        throw new Error(`smtp_rcpt_rejected: ${rcpt.slice(0, 200)}`);
      }
    }

    await send("DATA");
    await expect("354");

    const messageId = msg.messageId || `<${crypto.randomUUID()}@${dominioDi(msg.from)}>`;
    const rfc822 = buildRFC822({
      from: msg.from, fromName: msg.fromName,
      to: msg.to, cc: msg.cc, bcc: msg.bcc,
      subject: msg.subject, bodyHtml: msg.bodyHtml, bodyText: msg.bodyText,
      inReplyTo: msg.inReplyTo, references: msg.references,
      messageId,
      attachments: msg.attachments,
      headers: msg.headers,
    });
    // Dot-stuffing (RFC 5321): righe che iniziano con . vanno raddoppiate
    const stuffed = rfc822.replace(/\r\n\./g, "\r\n..");
    await send(stuffed + "\r\n.");
    await expect("250");

    await send("QUIT");
    try { conn.close(); } catch { /* ignore */ }
    return { messageId };
  } catch (e) {
    try { conn.close(); } catch { /* ignore */ }
    throw e;
  }
}

/**
 * smtpTestConnection — verifica che le credenziali SMTP siano valide senza
 * inviare alcuna email. Imita l'handshake di `smtpSend` fino all'AUTH LOGIN:
 *   1. apre la connessione (TLS diretto se `secure`, altrimenti plain)
 *   2. legge il banner 220
 *   3. EHLO outreach.local
 *   4. se NON secure e il server annuncia STARTTLS → STARTTLS + upgrade TLS + EHLO
 *   5. AUTH LOGIN con username/password base64 (attende 235)
 *   6. QUIT e chiude.
 * Ritorna {ok:true} se l'auth riesce, altrimenti {ok:false, error}.
 */
export async function smtpTestConnection(cfg: SmtpConfig): Promise<{ ok: boolean; error?: string }> {
  const { host, port, secure, username, password } = cfg;

  let conn: Deno.TcpConn | Deno.TlsConn;
  try {
    conn = secure
      ? await Deno.connectTls({ hostname: host, port })
      : await Deno.connect({ hostname: host, port });
  } catch (e) {
    return { ok: false, error: `smtp_connect: ${e instanceof Error ? e.message : String(e)}` };
  }

  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const buf = new Uint8Array(8192);

  async function readLine(): Promise<string> {
    const n = await conn.read(buf);
    if (n === null) throw new Error("smtp_connection_closed");
    return decoder.decode(buf.subarray(0, n));
  }
  async function send(line: string): Promise<void> {
    await conn.write(encoder.encode(line + "\r\n"));
  }
  async function expect(prefix: string): Promise<string> {
    const resp = await readLine();
    if (!resp.startsWith(prefix)) {
      throw new Error(`smtp_unexpected: ${resp.slice(0, 200)}`);
    }
    return resp;
  }

  try {
    // Greeting
    await expect("220");
    await send(`EHLO outreach.local`);
    let ehloResp = await readLine();

    // STARTTLS se port 587 e server lo supporta
    if (!secure && ehloResp.toLowerCase().includes("starttls")) {
      await send("STARTTLS");
      await expect("220");
      conn = await Deno.startTls(conn as Deno.TcpConn, { hostname: host });
      await send(`EHLO outreach.local`);
      ehloResp = await readLine();
    }

    // AUTH LOGIN
    await send("AUTH LOGIN");
    await expect("334");
    await send(btoa(username));
    await expect("334");
    await send(btoa(password));
    await expect("235");

    await send("QUIT");
    try { conn.close(); } catch { /* ignore */ }
    return { ok: true };
  } catch (e) {
    try { conn.close(); } catch { /* ignore */ }
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function escapeHeader(s: string): string {
  // RFC 2047 encoded-word per header con caratteri non-ASCII.
  // Il control char \x00 nella range è intenzionale (definisce
  // l'inizio del range ASCII completo 0x00-0x7F).
  // eslint-disable-next-line no-control-regex
  if (!/[^\x00-\x7F]/.test(s)) return s;
  const utf8 = new TextEncoder().encode(s);
  let bin = "";
  for (const b of utf8) bin += String.fromCharCode(b);
  return `=?UTF-8?B?${btoa(bin)}?=`;
}


// ─────────────────────────────────────────────────────────────────────────────
// Il messaggio in uscita deve sembrare scritto da una persona, non da uno script
//
// 10/09/2026: la stessa email, dallo stesso server di Register, dalla webmail
// arriva in inbox e da EiC finisce in spam. Confrontate byte per byte, le
// differenze erano tutte nostre: Message-ID sul dominio del relay, Date in
// GMT nel formato di `toUTCString()`, From senza nome, HTML nudo senza
// <html><body> con dentro gli attributi di Google Sheets, codifica 8bit,
// EHLO con un nome che non è un host. Nessuna da sola decide; tutte insieme
// disegnano il ritratto di un mailer automatico.
// ─────────────────────────────────────────────────────────────────────────────

/** L'host con cui ci presentiamo ai server SMTP. */
const EHLO_HOST = "app.ediliziaincloud.com";

/** "Thu, 10 Sep 2026 13:09:54 +0200": la data come la scrive un client di posta. */
export function dataRfc5322(d = new Date(), fuso = "Europe/Rome"): string {
  const parti = new Intl.DateTimeFormat("en-US", {
    timeZone: fuso, weekday: "short", day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZoneName: "longOffset",
  }).formatToParts(d);
  const v = (t: string) => parti.find((x) => x.type === t)?.value ?? "";
  // "GMT+02:00" → "+0200"
  const off = (v("timeZoneName").replace("GMT", "") || "+00:00").replace(":", "");
  const ora = v("hour") === "24" ? "00" : v("hour");
  return `${v("weekday")}, ${v("day")} ${v("month")} ${v("year")} ${ora}:${v("minute")}:${v("second")} ${off || "+0000"}`;
}

/** Il dominio di chi scrive: il Message-ID va lì, non sul server che inoltra. */
export function dominioDi(indirizzo: string): string {
  const m = /@([A-Za-z0-9.-]+)/.exec(indirizzo);
  return m ? m[1].toLowerCase() : "ediliziaincloud.com";
}

/**
 * Quoted-printable (RFC 2045): righe sotto i 76 caratteri, solo ASCII.
 * Tutti i client di posta lo usano per l'HTML; l'8bit è legale ma è un altro
 * tratto da script.
 */
export function quotedPrintable(testo: string): string {
  const byte = new TextEncoder().encode(testo.replace(/\r?\n/g, "\r\n"));
  let out = ""; let riga = "";
  const spingi = (pezzo: string) => {
    if (riga.length + pezzo.length > 75) { out += riga + "=\r\n"; riga = ""; }
    riga += pezzo;
  };
  for (let i = 0; i < byte.length; i++) {
    const b = byte[i];
    if (b === 13 && byte[i + 1] === 10) { // fine riga: spazio finale va protetto
      if (riga.endsWith(" ") || riga.endsWith("\t")) riga = riga.slice(0, -1) + (riga.endsWith(" ") ? "=20" : "=09");
      out += riga + "\r\n"; riga = ""; i++; continue;
    }
    if ((b >= 33 && b <= 126 && b !== 61) || b === 32 || b === 9) spingi(String.fromCharCode(b));
    else spingi("=" + b.toString(16).toUpperCase().padStart(2, "0"));
  }
  return out + riga;
}

/**
 * Toglie dall'HTML quello che un client di posta non scriverebbe mai: script,
 * fogli di stile, attributi `data-*` (Google Sheets ne lascia a decine),
 * `class`, `id`, gestori di eventi. Gli stili inline restano, perché sono
 * l'unico modo che l'editor ha per il grassetto o un colore voluto — ma i
 * colori "urlati" vengono da chi incolla, non da chi scrive, e Gmail li
 * conta. Non è un sanitizer di sicurezza (l'HTML lo manda l'utente a sé
 * stesso e ai suoi contatti): è una spazzola.
 */
export function ripulisciHtmlEmail(html: string): string {
  let h = String(html ?? "");
  h = h.replace(/<(script|style|iframe|object|embed|meta|link|head|title)\b[^>]*>[\s\S]*?<\/\1>/gi, "");
  h = h.replace(/<(meta|link|base)\b[^>]*\/?>/gi, "");
  h = h.replace(/<!--[\s\S]*?-->/g, "");
  // attributi: via data-*, class, id, on*, dir="auto" (firma di un editor web)
  h = h.replace(/<([a-zA-Z][\w:-]*)(\s[^>]*)?>/g, (_m, tag: string, attrs: string | undefined) => {
    if (!attrs) return `<${tag}>`;
    const puliti = attrs.replace(/\s+(data-[\w-]+|class|id|on\w+|contenteditable|spellcheck|dir|role|aria-[\w-]+)(\s*=\s*("[^"]*"|'[^']*'|[^\s>]+))?/gi, "");
    return `<${tag}${puliti.trimEnd()}>`;
  });
  // Gli <span> con colori, font e allineamento non li scrive nessuno a mano:
  // arrivano da un incolla (Google Sheets, Word, una pagina web). L'editor
  // non ha nemmeno un pulsante per il colore. Restano solo grassetto,
  // corsivo e sottolineato; il resto è rumore che i filtri contano.
  h = h.replace(/<span([^>]*)\sstyle\s*=\s*("([^"]*)"|'([^']*)')/gi, (_m, prima: string, _q, a: string | undefined, b: string | undefined) => {
    const stile = (a ?? b ?? "").split(";").map((x) => x.trim()).filter(Boolean)
      .filter((x) => /^(font-weight|font-style|text-decoration)\s*:/i.test(x));
    return stile.length ? `<span${prima} style="${stile.join("; ")}"` : `<span${prima}`;
  });
  // <span> senza attributi non serve a niente: via, così l'HTML somiglia a un testo
  h = h.replace(/<span\s*>([\s\S]*?)<\/span>/gi, "$1");
  return h.trim();
}

/** L'HTML incorniciato come lo manda un client di posta: documento intero, non frammento. */
export function documentoHtmlEmail(frammento: string): string {
  const corpo = ripulisciHtmlEmail(frammento);
  // Un frammento senza blocchi (solo testo, o solo <span>) va messo in un paragrafo.
  const inBlocchi = /^\s*<(p|div|table|ul|ol|h[1-6]|blockquote|pre)\b/i.test(corpo) ? corpo : `<p>${corpo}</p>`;
  return `<!DOCTYPE html>\r\n<html><head><meta http-equiv="Content-Type" content="text/html; charset=UTF-8"></head>\r\n`
    + `<body style="font-family: Arial, Helvetica, sans-serif; font-size: 14px; line-height: 1.5; color: #222;">\r\n`
    + `${inBlocchi}\r\n</body></html>`;
}

/** Testo semplice dall'HTML, per la parte text/plain quando manca. */
export function testoDaHtml(html: string): string {
  return ripulisciHtmlEmail(html)
    .replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|h[1-6]|blockquote)>/gi, "\n\n").replace(/<\/(li|tr)>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "- ").replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function buildRFC822(opts: {
  from: string;
  fromName?: string | null;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  bodyHtml?: string | null;
  bodyText?: string | null;
  inReplyTo?: string | null;
  references?: string[];
  messageId: string;
  attachments?: SmtpAttachment[];
  headers?: Record<string, string>;
}): string {
  const fromHeader = opts.fromName ? `${escapeHeader(opts.fromName)} <${opts.from}>` : opts.from;
  // L'ORDINE conta. Provato il 10/09/2026 con invii differenziali dallo
  // stesso server alla stessa casella: il blocco «From, To, Subject, Date,
  // Message-ID, MIME-Version, Content-Type» finisce in spam su Gmail, lo
  // stesso identico messaggio con «MIME-Version, Date, From, To, Subject,
  // Message-ID, Content-Type» arriva in inbox. È l'impronta dei mailer da
  // script (PHP mail(), cron), e i filtri hanno regole apposta.
  const lines: string[] = [];
  lines.push(`MIME-Version: 1.0`);
  lines.push(`Date: ${dataRfc5322()}`);
  lines.push(`From: ${fromHeader}`);
  lines.push(`To: ${opts.to.join(", ")}`);
  if (opts.cc && opts.cc.length > 0) lines.push(`Cc: ${opts.cc.join(", ")}`);
  // Bcc NON va in headers (privacy)
  lines.push(`Subject: ${escapeHeader(opts.subject)}`);
  lines.push(`Message-ID: ${opts.messageId}`);
  if (opts.inReplyTo) lines.push(`In-Reply-To: ${opts.inReplyTo}`);
  if (opts.references && opts.references.length > 0) lines.push(`References: ${opts.references.join(" ")}`);
  if (opts.headers) {
    for (const [k, v] of Object.entries(opts.headers)) {
      if (v != null && String(v).length) lines.push(`${escapeHeader(k)}: ${escapeHeader(String(v))}`);
    }
  }

  const hasHtml = !!opts.bodyHtml && opts.bodyHtml.trim().length > 0;
  const hasAttachments = !!opts.attachments && opts.attachments.length > 0;
  // L'HTML esce sempre come documento intero e ripulito; la parte testo c'è
  // sempre (se manca, si ricava dall'HTML): è quella che i filtri leggono
  // per confrontarla con l'HTML, e un'email solo-HTML è un altro segnale.
  const html = hasHtml ? documentoHtmlEmail(opts.bodyHtml as string) : "";
  const testo = (opts.bodyText && opts.bodyText.trim().length > 0)
    ? opts.bodyText
    : (hasHtml ? testoDaHtml(opts.bodyHtml as string) : "");

  let bodyPart = "";
  const altBoundary = `=_alt_${crypto.randomUUID().replace(/-/g, "")}`;
  if (hasHtml) {
    bodyPart =
      `Content-Type: multipart/alternative;\r\n boundary="${altBoundary}"\r\n\r\n` +
      `--${altBoundary}\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n${quotedPrintable(testo)}\r\n\r\n` +
      `--${altBoundary}\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n${quotedPrintable(html)}\r\n\r\n` +
      `--${altBoundary}--`;
  } else {
    bodyPart = `Content-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n${quotedPrintable(testo)}`;
  }

  if (!hasAttachments) {
    return lines.join("\r\n") + "\r\n" + bodyPart;
  }

  // Wrap body + attachments in multipart/mixed
  const mixedBoundary = `=_mix_${crypto.randomUUID().replace(/-/g, "")}`;
  lines.push(`Content-Type: multipart/mixed;\r\n boundary="${mixedBoundary}"`);
  let out = lines.join("\r\n") + "\r\n\r\n";
  out += `--${mixedBoundary}\r\n${bodyPart}\r\n\r\n`;
  for (const att of opts.attachments!) {
    const safeName = escapeHeader(att.filename);
    out += `--${mixedBoundary}\r\n`;
    out += `Content-Type: ${att.mimeType}; name="${safeName}"\r\n`;
    out += `Content-Disposition: attachment; filename="${safeName}"\r\n`;
    out += `Content-Transfer-Encoding: base64\r\n\r\n`;
    // Wrap base64 a 76 char per riga (RFC 2045)
    const wrapped = att.contentBase64.replace(/(.{76})/g, "$1\r\n");
    out += wrapped + "\r\n\r\n";
  }
  out += `--${mixedBoundary}--`;
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// IMAP Client (minimal)
// ─────────────────────────────────────────────────────────────────────────────

export interface ImapConfig {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
}

export interface ImapMessage {
  uid: string;
  messageId: string;
  from: string;
  fromName: string | null;
  to: string;
  subject: string;
  date: string;
  text: string;
  html: string | null;
  inReplyTo: string | null;
  references: string[];
  /**
   * Header rilevanti per il rilevamento autorisposte (lowercase→valore). Solo un
   * sottoinsieme (Auto-Submitted, Precedence, X-Autoreply…): non l'intero blocco.
   */
  headers: Record<string, string>;
  attachments: Array<{ filename: string; mime: string; contentBase64: string }>;
}

/** Header che ci interessano per classificare le autorisposte (RFC 3834 & co.). */
const AUTOREPLY_HEADER_NAMES = [
  "auto-submitted", "precedence", "x-autoreply", "x-autorespond",
  "x-auto-response-suppress", "x-mailer", "from",
];

/**
 * Il «Test connessione» del riquadro di collegamento.
 *
 * Si fermava al login, e diceva «riuscito» anche quando la posta poi non
 * sarebbe arrivata — è successo davvero: casella verde, inbox vuota, e il
 * guasto era nella ricerca dei messaggi, un passo più in là. Adesso il test
 * percorre la strada intera: entra, apre la INBOX e cerca davvero, cioè fa le
 * stesse tre cose che farà il polling.
 */
export async function imapTestConnection(cfg: ImapConfig): Promise<boolean> {
  const conn = cfg.secure
    ? await Deno.connectTls({ hostname: cfg.host, port: cfg.port })
    : await Deno.connect({ hostname: cfg.host, port: cfg.port });
  const decoder = new TextDecoder("utf-8", { fatal: false });
  const encoder = new TextEncoder();
  const buf = new Uint8Array(8192);
  let tag = 0;
  const nextTag = () => `A${++tag}`;
  async function leggi(): Promise<number | null> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const scadenza = new Promise<never>((_, rifiuta) => {
      timer = setTimeout(() => rifiuta(new Error("imap_timeout")), 20_000);
    });
    try {
      return await Promise.race([conn.read(buf), scadenza]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }
  async function send(cmd: string): Promise<string> {
    const t = nextTag();
    await conn.write(encoder.encode(`${t} ${cmd}\r\n`));
    let result = "";
    const conclusa = () => new RegExp(`(?:^|\\r\\n)${t} (OK|NO|BAD)\\b`).test(result);
    while (!conclusa()) {
      const n = await leggi();
      if (n === null) break;
      result += decoder.decode(buf.subarray(0, n as number), { stream: true });
    }
    if (!new RegExp(`(?:^|\\r\\n)${t} OK\\b`).test(result)) {
      throw new Error(`imap_${result.slice(0, 200)}`);
    }
    return result;
  }
  try {
    // Saluto
    const n = await leggi();
    if (n === null) throw new Error("imap_connection_closed");
    const citata = (v: string) => `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
    await send(`LOGIN ${citata(cfg.username)} ${citata(cfg.password)}`);
    await send(`SELECT INBOX`);
    // La stessa ricerca del polling, sugli ultimi sette giorni: se il server
    // non la accetta è meglio saperlo adesso che a caselle collegate.
    const dal = new Date(Date.now() - 7 * 864e5).toUTCString().slice(5, 16).replace(/ /g, "-");
    const ricerca = await send(`UID SEARCH SINCE ${dal}`);
    if (!ricerca.split("\r\n").some((r) => r.startsWith("* SEARCH"))) {
      throw new Error("imap_ricerca_non_supportata");
    }
    await send(`LOGOUT`);
    try { conn.close(); } catch { /* ignore */ }
    return true;
  } catch (e) {
    try { conn.close(); } catch { /* ignore */ }
    throw e;
  }
}

/**
 * Scarica i messaggi nuovi dalla INBOX.
 *
 * Due trappole, entrambe costate una casella che sembrava funzionare e non
 * portava dentro niente (10/09/2026, info@ediliziaincloud.com su Register):
 *
 * 1. LA DATA. IMAP vuole `11-Aug-2026`, con i trattini. Con gli spazi il
 *    server risponde `BAD Invalid search date parameter`, e chi legge la
 *    risposta cercando la riga `* SEARCH` non la trova: zero messaggi, nessun
 *    errore, «Sync completato: nessuna nuova email». Per mesi.
 * 2. UNSEEN. Chi collega una casella la tiene aperta anche altrove (Spark,
 *    la webmail, il telefono): appena legge un messaggio lì, quel messaggio
 *    per EiC non esiste più. Per la posta personale servono TUTTI i messaggi
 *    del periodo, con il cursore UID a evitare di rileggerli ogni giro.
 */
export async function imapScaricaNuovi(
  cfg: ImapConfig,
  sinceDate: Date,
  maxMessages = 20,
  /**
   * Cursore UID: se presente si leggono i messaggi con UID > sinceUid (letti o
   * no), invece di ripartire dalla data ogni volta.
   */
  sinceUid?: number | null,
  /** Senza cursore: prendere anche i messaggi già letti altrove. */
  includiLette = false,
): Promise<ImapMessage[]> {
  const conn = cfg.secure
    ? await Deno.connectTls({ hostname: cfg.host, port: cfg.port })
    : await Deno.connect({ hostname: cfg.host, port: cfg.port });
  // `stream: true`: un accento a cavallo di due letture TCP, senza, diventa "\uFFFD".
  const decoder = new TextDecoder("utf-8", { fatal: false });
  const encoder = new TextEncoder();
  let buffer = "";
  const readBuf = new Uint8Array(16384);
  let tag = 0;
  const nextTag = () => `A${++tag}`;

  /**
   * Una lettura che non torna mai teneva impegnata la funzione fino al taglio
   * dell'ambiente, e le altre caselle di quel giro non venivano nemmeno
   * provate. Meglio una casella in errore che un giro perso per tutti.
   */
  async function leggiConScadenza(): Promise<number | null> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const scadenza = new Promise<never>((_, rifiuta) => {
      timer = setTimeout(() => rifiuta(new Error("imap_timeout")), 30_000);
    });
    try {
      return await Promise.race([conn.read(readBuf), scadenza]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  async function readUntil(condition: (s: string) => boolean): Promise<string> {
    while (!condition(buffer)) {
      const n = await leggiConScadenza();
      if (n === null) break;
      buffer += decoder.decode(readBuf.subarray(0, n as number), { stream: true });
    }
    const result = buffer;
    buffer = "";
    return result;
  }

  /** Il tag conclusivo sta a inizio riga: dentro un messaggio può esserci di tutto. */
  const conclusa = (t: string) => (s: string) =>
    new RegExp(`(?:^|\\r\\n)${t} (OK|NO|BAD)\\b`).test(s);

  async function send(cmd: string): Promise<string> {
    const t = nextTag();
    await conn.write(encoder.encode(`${t} ${cmd}\r\n`));
    return await readUntil(conclusa(t));
  }

  try {
    await readUntil((s) => s.includes("OK") || s.includes("BYE"));
    // In una stringa fra virgolette IMAP vanno protetti sia \ sia ": senza il
    // primo, una password che contiene una barra rovesciata falliva il login
    // con un errore incomprensibile.
    const citata = (v: string) => `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
    const rispostaLogin = await send(`LOGIN ${citata(cfg.username)} ${citata(cfg.password)}`);
    if (/(?:^|\r\n)A\d+ (NO|BAD)\b/.test(rispostaLogin)) {
      throw new Error(`imap_login_rifiutato: ${(rispostaLogin.match(/(?:^|\r\n)A\d+ (?:NO|BAD)[^\r\n]*/) ?? [""])[0].trim()}`);
    }
    const rispostaSelect = await send(`SELECT INBOX`);
    if (/(?:^|\r\n)A\d+ (NO|BAD)\b/.test(rispostaSelect)) {
      throw new Error(`imap_inbox_non_apribile: ${(rispostaSelect.match(/(?:^|\r\n)A\d+ (?:NO|BAD)[^\r\n]*/) ?? [""])[0].trim()}`);
    }

    // La data va con i trattini: "11-Aug-2026". Con gli spazi è BAD.
    const dateStr = sinceDate.toUTCString().slice(5, 16).replace(/ /g, "-");
    const conCursore = typeof sinceUid === "number" && sinceUid > 0;
    const ricerca = conCursore
      ? `UID SEARCH UID ${sinceUid! + 1}:*`
      : `UID SEARCH ${includiLette ? "" : "UNSEEN "}SINCE ${dateStr}`;
    const searchResp = await send(ricerca);
    const searchLine = searchResp.split("\r\n").find((l) => l.startsWith("* SEARCH")) ?? null;
    if (searchLine === null) {
      // Il server ha rifiutato la ricerca. Senza questo controllo la risposta
      // «BAD» diventava silenziosamente «nessun messaggio nuovo».
      const motivo = searchResp.split("\r\n").find((l) => / (NO|BAD) /.test(l)) ?? searchResp.slice(0, 120);
      throw new Error(`imap_search_rifiutata: ${motivo.trim()}`);
    }
    // "n:*" restituisce l'ultimo messaggio anche se il suo UID e' < n: filtro esplicito.
    const uids = searchLine.replace("* SEARCH", "").trim().split(/\s+/).filter(Boolean)
      .filter((u) => !conCursore || parseInt(u, 10) > (sinceUid as number))
      // I più recenti: su una casella con storico, i primi per UID sono i più
      // vecchi e riempirebbero il tetto senza mai arrivare a oggi.
      .slice(-maxMessages);

    const messages: ImapMessage[] = [];
    for (const uid of uids) {
      try {
        const fetchResp = await send(`UID FETCH ${uid} (BODY.PEEK[])`);
        const parsed = parseImapMessage(uid, fetchResp);
        if (parsed) messages.push(parsed);
      } catch { /* skip single message errors */ }
    }

    await send(`LOGOUT`);
    try { conn.close(); } catch { /* ignore */ }
    return messages;
  } catch (e) {
    try { conn.close(); } catch { /* ignore */ }
    throw e;
  }
}

export function parseImapMessage(uid: string, fetchResp: string): ImapMessage | null {
  // Estrae il blocco RFC822 tra parentesi graffe {N}\r\n...
  const sizeMatch = /\{(\d+)\}\r\n/.exec(fetchResp);
  if (!sizeMatch) return null;
  const start = sizeMatch.index + sizeMatch[0].length;
  const size = parseInt(sizeMatch[1], 10);
  // `size` è in BYTE, mentre qui si tagliano CARATTERI: su un'email in 8bit
  // con accenti — un italiano che scrive «però» da un client qualsiasi — i due
  // numeri divergono e il messaggio arriverebbe monco, spesso senza l'ultima
  // parte MIME. La fine vera è la chiusura del FETCH.
  const chiusura = fetchResp.lastIndexOf("\r\n)\r\n");
  const raw = chiusura > start
    ? fetchResp.substring(start, chiusura)
    : fetchResp.substring(start, start + size);

  // Header parser semplice
  const headerEnd = raw.indexOf("\r\n\r\n");
  const headersBlock = headerEnd > -1 ? raw.substring(0, headerEnd) : raw;
  const bodyBlock = headerEnd > -1 ? raw.substring(headerEnd + 4) : "";

  const getHeader = (name: string): string => {
    const re = new RegExp(`^${name}:\\s*(.*?)(?:\\r\\n(?![ \\t])|$)`, "ims");
    const m = re.exec(headersBlock);
    return m ? m[1].replace(/\r\n[ \t]+/g, " ").trim() : "";
  };

  const fromRaw = getHeader("From");
  const fromMatch = /^(?:"?([^"<]+?)"?\s*)?<?([^\s<>]+@[^\s<>]+)>?$/.exec(fromRaw);

  // Body + allegati: walker MIME ricorsivo (gestisce multipart/alternative
  // annidato in multipart/mixed) con decodifica per-parte e cattura allegati.
  const acc: { text: string; html: string; attachments: ImapMessage["attachments"] } = {
    text: "", html: "", attachments: [],
  };
  walkMimePart(bodyBlock, headersBlock, acc, 0);
  let text = acc.text;
  let html: string | null = acc.html || null;
  if (!text && html) {
    text = html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  }

  // Sottoinsieme di header utile al rilevamento autorisposte (lowercase→valore).
  const headers: Record<string, string> = {};
  for (const name of AUTOREPLY_HEADER_NAMES) {
    const v = getHeader(name);
    if (v) headers[name] = v;
  }

  return {
    uid,
    messageId: getHeader("Message-ID") || `imap-${uid}@local`,
    from: fromMatch?.[2] || fromRaw,
    fromName: fromMatch?.[1]?.trim() || null,
    to: getHeader("To"),
    subject: decodeRFC2047(getHeader("Subject")),
    date: getHeader("Date"),
    text: text.slice(0, 32000),
    html: html ? html.slice(0, 64000) : null,
    inReplyTo: getHeader("In-Reply-To") || null,
    references: getHeader("References").split(/\s+/).filter(Boolean),
    headers,
    attachments: acc.attachments,
  };
}

/**
 * decodeMimeBody — decodifica il corpo di una parte MIME in base a
 * Content-Transfer-Encoding (base64 / quoted-printable) e charset dichiarati
 * nei suoi header. Senza questo i corpi base64/QP venivano mostrati grezzi
 * (HTML illeggibile, accenti italiani come "=C3=A8"). Fallback: testo as-is.
 */
function decodeMimeBody(rawBody: string, partHeaders: string): string {
  const cte = valoreHeader(partHeaders, "content-transfer-encoding").toLowerCase();
  const charset = (/charset="?([^"\r\n;]+)"?/i.exec(valoreHeader(partHeaders, "content-type"))?.[1] ?? "utf-8").trim();
  const toText = (bytes: Uint8Array): string => {
    for (const cs of [charset, "utf-8"]) {
      try { return new TextDecoder(cs, { fatal: false }).decode(bytes); } catch { /* prova il prossimo */ }
    }
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  };
  try {
    if (cte.includes("base64")) {
      const clean = rawBody.replace(/[^A-Za-z0-9+/=]/g, "");
      const bin = atob(clean);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return toText(bytes);
    }
    if (cte.includes("quoted-printable")) {
      const unfolded = rawBody.replace(/=\r?\n/g, ""); // soft line breaks
      const out: number[] = [];
      for (let i = 0; i < unfolded.length; i++) {
        if (unfolded[i] === "=" && /^[0-9A-Fa-f]{2}$/.test(unfolded.substr(i + 1, 2))) {
          out.push(parseInt(unfolded.substr(i + 1, 2), 16));
          i += 2;
        } else {
          out.push(unfolded.charCodeAt(i) & 0xff);
        }
      }
      return toText(new Uint8Array(out));
    }
  } catch { /* fallback al testo grezzo */ }
  return rawBody;
}

/**
 * walkMimePart — visita ricorsiva di una parte MIME. Riempie acc.text/acc.html
 * (decodificati) e acc.attachments (filename + mime + base64 grezzo). Gestisce
 * multipart annidato (mixed→alternative). Max 4 livelli, max 10 allegati.
 */
/**
 * Il valore di un header, righe di continuazione comprese.
 *
 * Cercare `content-type:` con una regex qualunque dentro il blocco header è
 * una trappola: la firma DKIM elenca i campi firmati come
 * `h=content-type:mime-version:subject:…`, e quella è la PRIMA occorrenza. Il
 * messaggio veniva così letto come se il suo tipo fosse
 * «mime-version:subject:…» invece di «multipart/alternative»: il corpo non
 * veniva mai estratto e l'email arrivava senza testo. Vale per qualunque email
 * firmata, cioè quasi tutte (10/09/2026, verificato su una email da Gmail).
 *
 * Serve anche il ripiegamento: un Content-Type può continuare sulla riga dopo,
 * ed è lì che spesso finisce il `boundary`.
 */
export function valoreHeader(headers: string, nome: string): string {
  const re = new RegExp(`^${nome}:[ \\t]*([^\\r\\n]*(?:\\r\\n[ \\t][^\\r\\n]*)*)`, "im");
  const m = re.exec(headers);
  return m ? m[1].replace(/\r\n[ \t]+/g, " ").trim() : "";
}

function walkMimePart(
  block: string,
  headers: string,
  acc: { text: string; html: string; attachments: ImapMessage["attachments"] },
  depth: number,
): void {
  const ctIntero = valoreHeader(headers, "content-type");
  const ct = (ctIntero.split(";")[0] || "text/plain").trim().toLowerCase();
  if (ct.startsWith("multipart") && depth < 4) {
    const boundary = /boundary="?([^";\r\n]+)"?/i.exec(ctIntero)?.[1];
    if (!boundary) return;
    for (const part of block.split(`--${boundary}`)) {
      const he = part.indexOf("\r\n\r\n");
      if (he < 0) continue;
      walkMimePart(part.substring(he + 4), part.substring(0, he), acc, depth + 1);
    }
    return;
  }
  // Anche qui si leggono gli header giusti, non la prima cosa che somiglia.
  const disposizione = valoreHeader(headers, "content-disposition");
  const codifica = valoreHeader(headers, "content-transfer-encoding").toLowerCase();
  const fn = /(?:file)?name\*?=(?:"([^"\r\n]+)"|([^;\r\n]+))/i.exec(`${ctIntero}; ${disposizione}`);
  const filename = fn ? (fn[1] ?? fn[2] ?? "").trim() : "";
  const isAttachment = disposizione.toLowerCase().startsWith("attachment") ||
    (!!filename && !ct.startsWith("text/"));
  if (isAttachment && filename) {
    if (codifica.includes("base64") && acc.attachments.length < 10) {
      acc.attachments.push({
        filename: decodeRFC2047(filename),
        mime: ct || "application/octet-stream",
        contentBase64: block.replace(/[^A-Za-z0-9+/=]/g, ""),
      });
    }
    return;
  }
  if (ct.startsWith("text/plain") && !acc.text) acc.text = decodeMimeBody(block, headers).trim();
  else if (ct.startsWith("text/html") && !acc.html) acc.html = decodeMimeBody(block, headers).trim();
}

/**
 * imapAppend — copia un messaggio RFC822 nella cartella "Inviati" del server IMAP
 * (comando APPEND con flag \Seen), così le email spedite via SMTP compaiono anche
 * nella webmail del provider. Prova i nomi cartella comuni (Sent/INBOX.Sent/…).
 * Best-effort: ritorna {ok} senza lanciare.
 */
export async function imapAppend(cfg: ImapConfig, rfc822: string): Promise<{ ok: boolean; folder?: string; error?: string }> {
  let conn: Deno.TcpConn | Deno.TlsConn;
  try {
    conn = cfg.secure
      ? await Deno.connectTls({ hostname: cfg.host, port: cfg.port })
      : await Deno.connect({ hostname: cfg.host, port: cfg.port });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  const decoder = new TextDecoder("utf-8", { fatal: false });
  const encoder = new TextEncoder();
  const buf = new Uint8Array(8192);
  let tag = 0;
  const nextTag = () => `A${++tag}`;
  /**
   * Si ferma sul tag conclusivo O sulla richiesta di continuare (`+`).
   *
   * Dopo `APPEND … {N}` il server risponde «+ Ready» e poi ASPETTA il
   * messaggio: cercando solo il tag, la lettura restava appesa mentre il
   * server restava in attesa dei byte — un abbraccio mortale che teneva
   * occupata la funzione fino al taglio dell'ambiente. La copia in «Inviati»
   * non poteva riuscire, e ogni invio ci lasciava dentro un minuto buono.
   */
  const readResp = async (t: string): Promise<string> => {
    let result = "";
    const conclusa = () =>
      new RegExp(`(?:^|\\r\\n)${t} (OK|NO|BAD)\\b`).test(result) ||
      /(?:^|\r\n)\+/.test(result);
    while (!conclusa()) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const scadenza = new Promise<never>((_, rifiuta) => {
        timer = setTimeout(() => rifiuta(new Error("imap_timeout")), 30_000);
      });
      let n: number | null;
      try {
        n = await Promise.race([conn.read(buf), scadenza]);
      } finally {
        if (timer !== undefined) clearTimeout(timer);
      }
      if (n === null) break;
      result += decoder.decode(buf.subarray(0, n as number), { stream: true });
    }
    return result;
  };
  const cmd = async (c: string): Promise<string> => {
    const t = nextTag();
    await conn.write(encoder.encode(`${t} ${c}\r\n`));
    return await readResp(t);
  };
  // CRLF garantiti + size in BYTE (UTF-8) per il literal {N}.
  const msg = rfc822.replace(/\r?\n/g, "\r\n");
  const bytes = encoder.encode(msg);
  const candidates = ["Sent", "INBOX.Sent", "Sent Items", "INBOX.Sent Items", "Posta inviata", "INBOX.Posta inviata"];
  try {
    await conn.read(buf); // greeting
    const proteggi = (v: string) => `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
    const login = await cmd(`LOGIN ${proteggi(cfg.username)} ${proteggi(cfg.password)}`);
    if (!login.includes("OK")) { try { conn.close(); } catch { /* */ } return { ok: false, error: "imap_login_failed" }; }
    // Il nome della cartella «Inviati» cambia da provider a provider — Sent,
    // INBOX.Sent, "Posta inviata" — ma il server sa dire qual è: la marca con
    // \\Sent (RFC 6154). Prima si tirava a indovinare, e su una casella con un
    // nome fuori elenco la copia non riusciva mai.
    let cartelle = candidates;
    try {
      const lista = await cmd(`LIST "" "*"`);
      const marcata = lista.split("\r\n")
        .filter((r) => r.startsWith("* LIST") && /\\Sent\b/i.test(r))
        .map((r) => (r.match(/"([^"]*)"\s*$/) ?? r.match(/\s(\S+)\s*$/))?.[1])
        .find(Boolean);
      if (marcata) cartelle = [marcata, ...candidates.filter((c) => c !== marcata)];
    } catch { /* si continua con i nomi soliti */ }

    for (const folder of cartelle) {
      const t = nextTag();
      // APPEND con literal: server risponde "+ " poi inviamo il messaggio.
      await conn.write(encoder.encode(`${t} APPEND "${folder}" (\\Seen) {${bytes.length}}\r\n`));
      const cont = await readResp(t).catch(() => "");
      if (/(?:^|\r\n)\+/.test(cont)) {
        await conn.write(bytes);
        await conn.write(encoder.encode("\r\n"));
        const fin = await readResp(t);
        if (fin.includes(`${t} OK`)) { await cmd("LOGOUT"); try { conn.close(); } catch { /* */ } return { ok: true, folder }; }
      }
      // folder inesistente o errore → prova il prossimo nome
    }
    try { conn.close(); } catch { /* */ }
    return { ok: false, error: "no_sent_folder_matched" };
  } catch (e) {
    try { conn.close(); } catch { /* */ }
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function decodeRFC2047(s: string): string {
  // =?charset?B?base64?= o =?charset?Q?quoted?=
  return s.replace(/=\?([^?]+)\?([BbQq])\?([^?]+)\?=/g, (_, _charset, enc, payload) => {
    try {
      if (enc.toUpperCase() === "B") {
        const bin = atob(payload);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return new TextDecoder().decode(bytes);
      } else {
        return payload.replace(/_/g, " ").replace(/=([0-9A-Fa-f]{2})/g, (_: string, hex: string) =>
          String.fromCharCode(parseInt(hex, 16)),
        );
      }
    } catch {
      return payload;
    }
  });
}

/** @deprecated nome storico: la funzione non prende più solo i non letti. */
export const imapFetchUnreadSince = imapScaricaNuovi;
