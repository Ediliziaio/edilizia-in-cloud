// Gli esiti delle email spedite con Elastic Email: consegne, aperture, click,
// rimbalzi, reclami, disiscrizioni (07/11/2026).
//
// Qui ci sono solo le regole, senza chiamate di rete: elastic-email-esiti
// legge gli eventi dall'API di Elastic e passa ogni evento da qui, così le
// regole si provano da sole.
//
// Perché esiste. Fino al 07/11/2026 nessun esito di Elastic arrivava in
// piattaforma: delle 3.255 email Elastic dell'ultimo mese, zero avevano una
// consegna, un'apertura o un rimbalzo registrati. Il webhook
// (email-provider-webhook) non era mai stato chiamato. Elastic gli esiti li
// raccoglie comunque, se il tracciamento è acceso nell'account: si leggono
// con GET /v4/events, senza dover configurare nulla nel suo pannello.

/** Un evento come lo restituisce GET /v4/events (i campi che servono). */
export interface EventoElastic {
  TransactionID?: string | null;
  MsgID?: string | null;
  To?: string | null;
  EventType?: string | null;
  EventDate?: string | null;
  MessageCategory?: string | null;
  Message?: string | null;
}

export type TipoEsito =
  | "consegnata"
  | "aperta"
  | "cliccata"
  | "rimbalzo_definitivo"
  | "non_consegnata"
  | "reclamo"
  | "disiscrizione";

/** Un esito pronto per email_esiti_registra(). */
export interface Esito {
  msg_id: string | null;
  transaction_id: string | null;
  tipo: TipoEsito;
  quando: string;
  email: string | null;
  motivo: string | null;
}

/**
 * Per Elastic un evento «Bounce» è sempre un mancato recapito definitivo (i
 * tentativi che si ripetono sono «FailedAttempt», che qui non si leggono).
 * Ma non ogni mancato recapito prova che l'indirizzo non esiste: per
 * bloccarlo serve una di queste categorie — casella inesistente, o dominio
 * senza posta. Le altre (spam, blacklist, casella piena, timeout…)
 * dipendono dal messaggio o dal mittente, e un blocco sbagliato toglie per
 * sempre un indirizzo buono. Quelle diventano «non_consegnata».
 *
 * Categorie di Elastic che vogliono dire «questo indirizzo non esiste»:
 * casella inesistente, o dominio senza posta. Le altre (casella piena,
 * spam, greylisting, timeout…) passano o dipendono dal messaggio, e un
 * blocco sbagliato toglie per sempre un indirizzo buono.
 */
const CATEGORIE_DEFINITIVE = new Set(["nomailbox", "dnsproblem", "bademailaddress"]);

export function rimbalzoDefinitivo(categoria: string | null | undefined): boolean {
  return CATEGORIE_DEFINITIVE.has(String(categoria ?? "").trim().toLowerCase());
}

/** I tipi di evento che si chiedono a Elastic. */
export const TIPI_EVENTO_ELASTIC = ["Sent", "Open", "Click", "Bounce", "Complaint", "Unsubscribe"] as const;

/**
 * Da evento di Elastic a esito. `null` se l'evento non interessa (Submission,
 * FailedAttempt, tipi nuovi) o se manca ciò che serve ad agganciarlo a un
 * invio (un identificativo) o a datarlo.
 */
export function esitoDaEvento(ev: EventoElastic): Esito | null {
  const msgId = (ev.MsgID ?? "").trim() || null;
  const transactionId = (ev.TransactionID ?? "").trim() || null;
  if (!msgId && !transactionId) return null;

  const data = ev.EventDate ? new Date(ev.EventDate) : null;
  if (!data || Number.isNaN(data.getTime())) return null;

  const tipoGrezzo = String(ev.EventType ?? "").trim().toLowerCase();
  let tipo: TipoEsito;
  switch (tipoGrezzo) {
    case "sent": tipo = "consegnata"; break;
    case "open": tipo = "aperta"; break;
    case "click": tipo = "cliccata"; break;
    case "bounce":
      tipo = rimbalzoDefinitivo(ev.MessageCategory) ? "rimbalzo_definitivo" : "non_consegnata";
      break;
    case "complaint": tipo = "reclamo"; break;
    case "unsubscribe": tipo = "disiscrizione"; break;
    default: return null;
  }

  const email = (ev.To ?? "").trim().toLowerCase() || null;
  const motivo = [ev.MessageCategory, ev.Message].filter((x) => x && String(x).trim()).join(": ").slice(0, 300) || null;
  return { msg_id: msgId, transaction_id: transactionId, tipo, quando: data.toISOString(), email, motivo };
}

/** Eventi letti da Elastic → esiti, scartando quelli che non servono. */
export function esitiDaEventi(eventi: unknown): Esito[] {
  if (!Array.isArray(eventi)) return [];
  const out: Esito[] = [];
  for (const ev of eventi) {
    if (ev && typeof ev === "object") {
      const e = esitoDaEvento(ev as EventoElastic);
      if (e) out.push(e);
    }
  }
  return out;
}

/**
 * Da dove ripartire. Il cursore è la data dell'ultimo evento letto; si
 * riparte un po' prima (SOVRAPPOSIZIONE_MS) perché Elastic può registrare un
 * evento con una data di poco precedente a uno già letto. Rileggere è
 * innocuo: la scrittura tiene il primo istante e i blocchi non si duplicano.
 * Senza cursore si parte da `primoAvvio` (lo storico da importare).
 */
export const SOVRAPPOSIZIONE_MS = 15 * 60 * 1000;

export function inizioFinestra(cursore: string | null | undefined, primoAvvio: Date): Date {
  const t = cursore ? new Date(cursore).getTime() : NaN;
  if (Number.isNaN(t)) return primoAvvio;
  return new Date(t - SOVRAPPOSIZIONE_MS);
}

/** Il cursore nuovo: l'evento più recente letto, mai indietro rispetto al vecchio. */
export function nuovoCursore(esiti: Esito[], vecchio: string | null | undefined): string | null {
  let max = vecchio ? new Date(vecchio).getTime() : NaN;
  let avanzato = false;
  for (const e of esiti) {
    const t = new Date(e.quando).getTime();
    if (!Number.isNaN(t) && (Number.isNaN(max) || t > max)) { max = t; avanzato = true; }
  }
  // Se non avanza si restituisce il vecchio così com'è: riscritto in un altro
  // formato sembrerebbe «cambiato» e verrebbe salvato a ogni giro.
  return avanzato ? new Date(max).toISOString() : (vecchio ?? null);
}

// ── La lista di blocco di Elastic (07/11/2026) ─────────────────────────────
//
// Elastic tiene una lista di indirizzi a cui non spedisce più (GET
// /v4/suppressions: Email, ErrorCode, FriendlyErrorMessage, DateUpdated).
// La piattaforma non la conosceva: nella settimana dal 30/10 le automazioni
// hanno mandato 148 email a 45 di quegli indirizzi, che Elastic non ha mai
// consegnato. Qui si decide quali portare fra i blocchi della piattaforma.
//
// La regola è prudente, perché un blocco sbagliato toglie per sempre un
// indirizzo buono: si blocca solo ciò che il motivo dimostra.

/** Una voce della lista di blocco di Elastic. */
export interface BloccoElastic {
  Email?: string | null;
  ErrorCode?: string | number | null;
  FriendlyErrorMessage?: string | null;
  DateUpdated?: string | null;
}

export type MotivoBlocco = "hard_bounce" | "spam_complaint" | "unsubscribe";

/** Il motivo, o null se il blocco di Elastic non va copiato (temporaneo o non chiaro). */
export function motivoBloccoElastic(b: BloccoElastic): MotivoBlocco | null {
  const testo = String(b.FriendlyErrorMessage ?? "").toLowerCase();
  const codice = parseInt(String(b.ErrorCode ?? "").trim(), 10);

  if (/unsubscri|disiscri|opt.?out/.test(testo)) return "unsubscribe";
  if (/complain|spam report|abuse report|segnalat/.test(testo)) return "spam_complaint";

  // Un 4xx è temporaneo per definizione (anche «450 mailbox unavailable»):
  // la casella può tornare a funzionare. Mai un blocco definitivo.
  if (codice >= 400 && codice < 500) return null;

  // Un 5xx è definitivo per il server che risponde, ma non sempre per
  // l'indirizzo: «550 rejected for policy reasons» dice che il server non
  // vuole la NOSTRA email, non che la casella non esiste.
  const politica = /policy|spam|block|blacklist|reputation|rejected due|denied|not allowed|sender|dmarc|spf|dkim|rate|limit/.test(testo);
  const inesistente = /does not exist|doesn't exist|no such|user unknown|unknown user|not found|invalid (recipient|mailbox|address)|recipient (address )?rejected|mailbox (is )?unavailable|address rejected|inesistente|non esiste|5\.1\.1|5\.1\.0|5\.1\.10/.test(testo);
  if (inesistente && !politica) return "hard_bounce";
  if ([550, 551, 553].includes(codice) && !politica && testo.trim() === "") return "hard_bounce";
  return null;
}

/** Le voci da portare in piattaforma, già classificate. */
export function blocchiDaPortare(lista: unknown): Array<{ email: string; reason: MotivoBlocco; motivo: string; quando: string | null }> {
  if (!Array.isArray(lista)) return [];
  const out: Array<{ email: string; reason: MotivoBlocco; motivo: string; quando: string | null }> = [];
  for (const v of lista as BloccoElastic[]) {
    const email = String(v?.Email ?? "").trim().toLowerCase();
    if (!email.includes("@")) continue;
    const reason = motivoBloccoElastic(v);
    if (!reason) continue;
    const motivo = [v.ErrorCode, v.FriendlyErrorMessage].filter((x) => x !== null && x !== undefined && String(x).trim()).join(" ").slice(0, 250);
    out.push({ email, reason, motivo: motivo || reason, quando: v.DateUpdated ?? null });
  }
  return out;
}
