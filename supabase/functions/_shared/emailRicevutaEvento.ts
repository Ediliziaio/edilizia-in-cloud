/**
 * L'evento «Email ricevuta da un contatto» per le automazioni (20/09/2026).
 *
 * Quando un contatto rispondeva a un'email non succedeva niente: la risposta
 * entrava nella posta (e in Conversazioni), ma nessuna automazione poteva
 * accorgersene. Per WhatsApp l'innesco c'era («Messaggio WhatsApp ricevuto»),
 * per le email no: solo «aperta» e «cliccata». Le sequenze di EdiliziaInCloud
 * e Marketing Edile chiedono in più punti «rispondi con una riga», e a quelle
 * righe deve poter seguire un avviso a chi le legge.
 *
 * Le email entrano da due strade, e tutte e due chiamano emettiEmailRicevuta:
 *  - email-poll-inbox: la posta delle caselle collegate (Gmail, Outlook, IMAP);
 *  - email-inbound-reply: l'indirizzo di risposta r-<id>@ delle email marketing.
 *
 * L'evento parte solo se:
 *  - l'email è in arrivo e recente (una casella appena collegata scarica mesi
 *    di posta: non devono diventare migliaia di eventi);
 *  - chi scrive è una persona (niente mailer-daemon, no-reply, bounce) e non
 *    è la casella stessa;
 *  - chi scrive è un contatto del CRM dell'azienda: l'automazione lavora su
 *    un contatto, uno sconosciuto non ne ha.
 *
 * Le regole sono funzioni pure, provate da
 * src/test/logic/emailRicevutaEvento.test.ts.
 */

/** Oltre questo tempo un'email è storia, non una risposta a cui reagire. */
export const ORE_EMAIL_RECENTE = 48;

const MITTENTI_AUTOMATICI = /^(mailer-daemon|postmaster|no-?reply|noreply|do-?not-?reply|donotreply|bounces?|bounce-.*|notifications?|notifiche)@/i;

export interface EmailArrivata {
  cartella: string | null | undefined;
  ricevutaIl: string | null | undefined;
  mittente: string | null | undefined;
  /** L'indirizzo della casella che ha ricevuto (per non segnalare la posta che ci si manda da soli). */
  casella?: string | null;
  adesso?: Date;
}

/** L'email appena salvata è una risposta a cui un'automazione può reagire? */
export function emailDaSegnalare(p: EmailArrivata): boolean {
  if ((p.cartella ?? "inbox") !== "inbox") return false;
  const mittente = String(p.mittente ?? "").trim().toLowerCase();
  if (!mittente || !mittente.includes("@")) return false;
  if (MITTENTI_AUTOMATICI.test(mittente)) return false;
  if (p.casella && mittente === String(p.casella).trim().toLowerCase()) return false;
  const quando = p.ricevutaIl ? new Date(p.ricevutaIl).getTime() : NaN;
  if (!Number.isFinite(quando)) return false;
  const adesso = (p.adesso ?? new Date()).getTime();
  return adesso - quando <= ORE_EMAIL_RECENTE * 3_600_000 && quando - adesso <= 3_600_000;
}

const INIZIO_CITAZIONE = [
  /^\s*>/, // testo citato
  /^\s*Il giorno .+ ha scritto:?\s*$/i,
  /^\s*Il .{6,60} ha scritto:?\s*$/i,
  /^\s*On .+ wrote:?\s*$/i,
  /^\s*-{2,}\s*(Messaggio originale|Original Message|Messaggio inoltrato|Forwarded message)\s*-{2,}\s*$/i,
  /^\s*(Da|From):\s.+@.+/i,
  /^\s*_{10,}\s*$/,
];

/**
 * Quello che la persona ha scritto, senza l'email a cui risponde: nell'avviso
 * deve stare la riga nuova, non le quaranta righe citate sotto.
 */
export function anteprimaMessaggio(testo: string | null | undefined, html: string | null | undefined, max = 600): string {
  let base = String(testo ?? "").trim();
  if (!base && html) {
    base = String(html)
      .replace(/<(style|script)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<blockquote[\s\S]*$/i, " ")
      .replace(/<br\s*\/?>(?=.)/gi, "\n")
      .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"').replace(/&#39;/gi, "'");
  }
  const righe: string[] = [];
  for (const riga of base.replace(/\r/g, "").split("\n")) {
    if (INIZIO_CITAZIONE.some((rx) => rx.test(riga))) break;
    righe.push(riga.replace(/[ \t]+/g, " ").trim());
  }
  const pulito = righe.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  if (pulito.length <= max) return pulito;
  return `${pulito.slice(0, max).replace(/\s+\S*$/, "")}…`;
}

/** Per ILIKE: l'indirizzo va cercato com'è, senza che % e _ facciano da jolly. */
export function indirizzoPerIlike(indirizzo: string): string {
  return indirizzo.trim().replace(/[\\%_]/g, (c) => `\\${c}`);
}

export interface EmailRicevutaDati {
  companyId: string;
  fromEmail: string | null | undefined;
  subject: string | null | undefined;
  testo: string | null | undefined;
  html: string | null | undefined;
  ricevutaIl: string | null | undefined;
  cartella?: string | null;
  casella?: string | null;
  emailInboxId?: string | null;
  /** Già noto (indirizzo di risposta r-<id>@): si salta la ricerca per email. */
  contactId?: string | null;
}

/**
 * Scrive l'evento per il motore delle automazioni. Non lancia mai: la posta è
 * già salvata, e un avviso mancato non deve far fallire chi la scarica.
 */
// deno-lint-ignore no-explicit-any
export async function emettiEmailRicevuta(admin: any, p: EmailRicevutaDati): Promise<boolean> {
  try {
    if (!p.companyId) return false;
    if (!emailDaSegnalare({ cartella: p.cartella ?? "inbox", ricevutaIl: p.ricevutaIl, mittente: p.fromEmail, casella: p.casella })) return false;

    let contactId = p.contactId ?? null;
    if (!contactId) {
      const { data } = await admin
        .from("marketing_contacts")
        .select("id")
        .eq("company_id", p.companyId)
        .is("deleted_at", null)
        .ilike("email", indirizzoPerIlike(String(p.fromEmail)))
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      contactId = data?.id ?? null;
    }
    if (!contactId) return false;

    const { error } = await admin.from("automation_trigger_events").insert({
      company_id: p.companyId,
      trigger_event: "email_received",
      entity_id: contactId,
      entity_type: "contact",
      payload: {
        from: String(p.fromEmail ?? "").trim().toLowerCase(),
        subject: String(p.subject ?? "").slice(0, 300) || "(senza oggetto)",
        message: anteprimaMessaggio(p.testo, p.html),
        channel: "email",
        casella: p.casella ?? null,
        email_inbox_id: p.emailInboxId ?? null,
      },
    });
    if (error) {
      console.error("[email-ricevuta] evento non scritto:", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[email-ricevuta] evento non scritto:", (e as Error)?.message);
    return false;
  }
}
