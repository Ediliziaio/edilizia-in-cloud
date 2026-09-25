/**
 * outreach-reply-handler — logica condivisa "gestisci risposta" del cold outreach.
 *
 * Ricevuta una risposta di un prospect (dal webhook inbound SES/SNS/Mailgun
 * OPPURE dal poller IMAP delle caselle del pool), fa, in ordine:
 *   1. scrive la risposta in outreach_replies (snippet ripulito);
 *   2. classifica l'intento con l'AI (best-effort: non blocca su errore);
 *   3. su risposta STOPpa la sequenza (enrollment → 'replied') e annulla i
 *      messaggi ancora 'queued' di quell'iscrizione;
 *   4. se l'intento è 'unsubscribe', opt-out del contatto + blocklist.
 *
 * Estratta da outreach-inbound/index.ts perché il percorso "lettura risposte via
 * IMAP" (outreach-imap-poll) riusa identica questa logica. Richiede un client
 * Supabase admin (service-role). Tutto best-effort sulla classificazione AI.
 */

// deno-lint-ignore-file no-explicit-any

import { aiRouterComplete } from "./aiRouter.ts";
import {
  normalizeIntent,
  normalizeConfidence,
  INTENT_SYSTEM_PROMPT,
  buildIntentUserPrompt,
} from "./outreach-intent.ts";
import { snippetFrom } from "./outreach-inbound-logic.ts";
import { isAutoReply, tipoAutorisposta, type InboundHeaders } from "./outreach-autoreply.ts";
import { classifyEmail } from "./email-quality.ts";
import { domainHasMx, domainOf, isPecEmail } from "./outreach-email-check.ts";
import { passoDellInvio } from "./outreach-sequence.ts";
import { intentDaParoleChiave, rispostaColSoloNumero, rispostaPiuAvanti } from "./outreach-intent-parole.ts";
import { avvisaSuperAdmin } from "./avvisaSuperAdmin.ts";
import { testoSenzaCitazione } from "./avvisoEmail.ts";
import { iscrizioniDaFermare } from "./outreachRispostaBrand.ts";
import { shouldCreateOpportunity, triggerOpportunityFromSignal } from "./outreach-opportunity-trigger.ts";

/** Dopo quanti giorni si richiama chi ha risposto «più avanti». */
export const GIORNI_PIU_AVANTI = 75;

const PLATFORM_COMPANY = "00000000-0000-0000-0000-000000000001";

export interface InboundReply {
  contactId: string | null;
  enrollmentId?: string | null;
  from: string;
  subject: string;
  text: string;
  messageId?: string | null;
  /** Header RFC normalizzati (lowercase→valore), se il provider/IMAP li espone. */
  headers?: InboundHeaders;
  /** La casella che ha ricevuto la risposta (poll IMAP), per l'avviso al titolare. */
  casella?: string | null;
  /** Il brand a cui ha risposto, deciso da chi legge la posta (outreachRispostaBrand). */
  brandId?: string | null;
  /** La casella che ha ricevuto, per id: resta scritta sulla risposta. */
  senderAccountId?: string | null;
  /** «sì, scritta il 14/09/2026 da info@…» — la verifica dell'invito, già in italiano. */
  invito?: string | null;
  /** L'email a cui risponde (riga di outreach_send_queue): si rimanda se l'indirizzo è cambiato. */
  invioId?: string | null;
}

const INTENTO_IN_CHIARO: Record<string, string> = {
  interested: "interessato",
  question: "fa una domanda",
  not_interested: "non interessato",
  unsubscribe: "chiede di non essere più contattato",
  referral: "indica un'altra persona",
  other: "altro",
};

/**
 * Avviso al titolare per ogni risposta vera (16/09/2026): chi ha risposto, da
 * quale brand e flusso, a quale casella, e cosa ha scritto. Arriva su
 * campanella, push e Gmail (vedi avvisaSuperAdmin). Mai bloccante.
 */
async function avvisaRisposta(
  admin: any, r: InboundReply, fromEmail: string, intent: string | null,
  brandId: string | null, flusso: string,
): Promise<void> {
  try {
    let nome = "";
    let azienda = "";
    let telefono = "";
    if (r.contactId) {
      const { data: c } = await admin.from("marketing_contacts")
        .select("first_name,last_name,company_name,phone").eq("id", r.contactId).maybeSingle();
      nome = [c?.first_name, c?.last_name].filter(Boolean).join(" ");
      azienda = c?.company_name ?? "";
      telefono = c?.phone ?? "";
    }
    let brand = "";
    if (brandId) {
      const { data: b } = await admin.from("outreach_brands").select("name").eq("id", brandId).maybeSingle();
      brand = b?.name ?? "";
    }
    const chi = azienda || nome || fromEmail;
    await avvisaSuperAdmin(admin, {
      tipo: "outreach_risposta_email",
      // Il brand nell'oggetto: tre servizi diversi, e la prima cosa da sapere
      // aprendo la mail è per chi ha risposto questa persona.
      titolo: brand ? `${brand} · Risposta email da ${chi}` : `Risposta email da ${chi}`,
      testo: snippetFrom(r.text, 160) ?? "(risposta senza testo)",
      url: "/admin/marketing?tab=posta",
      tag: `outreach-risposta-${r.messageId ?? fromEmail}`,
      entityType: r.contactId ? "marketing_contact" : undefined,
      entityId: r.contactId,
      email: {
        testo: testoSenzaCitazione(r.text) || "(risposta senza testo)",
        righe: [
          { etichetta: "Da", valore: [nome, fromEmail].filter(Boolean).join(" · ") },
          { etichetta: "Azienda", valore: azienda },
          { etichetta: "Telefono", valore: telefono },
          { etichetta: "Brand", valore: brand },
          { etichetta: "Flusso", valore: flusso },
          { etichetta: "Casella", valore: r.casella ?? "" },
          { etichetta: "Invito verificato", valore: r.invito ?? "" },
          { etichetta: "Oggetto", valore: r.subject ?? "" },
          { etichetta: "Intento", valore: intent ? (INTENTO_IN_CHIARO[intent] ?? intent) : "da classificare" },
        ],
      },
    });
  } catch (e) {
    console.warn("[outreach-reply-handler] avviso risposta non inviato:", e instanceof Error ? e.message : e);
  }
}

/**
 * Il brand a cui ha risposto e il nome del flusso. Il brand lo decide chi ha
 * letto la posta (la casella che ha ricevuto, gli header citati); dalla
 * sequenza arriva il nome del flusso, e il brand solo come ripiego.
 */
async function brandEFlusso(admin: any, r: InboundReply): Promise<{ brandId: string | null; flusso: string }> {
  let brandId = r.brandId ?? null;
  let flusso = "";
  if (r.enrollmentId) {
    const { data: e } = await admin.from("outreach_enrollments").select("sequence_id").eq("id", r.enrollmentId).maybeSingle();
    if (e?.sequence_id) {
      const { data: s } = await admin.from("outreach_sequences").select("name,brand_id").eq("id", e.sequence_id).maybeSingle();
      flusso = s?.name ?? "";
      if (!brandId) brandId = s?.brand_id ?? null;
    }
  }
  return { brandId, flusso };
}

const norm = (e: string | null | undefined) => String(e ?? "").trim().toLowerCase();

/** L'indirizzo da «Nome <email>» o da «email». */
function indirizzoDi(da: string | null | undefined): string {
  const s = String(da ?? "");
  return norm(s.match(/<([^>]+)>/)?.[1] ?? s);
}

/** Domini delle caselle del pool: un nostro indirizzo non è mai quello nuovo. */
async function dominiDelleCaselle(admin: any): Promise<string[]> {
  try {
    const { data } = await admin.from("outreach_sender_accounts").select("email");
    return [...new Set(((data ?? []) as Array<{ email: string | null }>)
      .map((r) => domainOf(r.email ?? "")).filter(Boolean))];
  } catch {
    return [];
  }
}

/** Cosa è successo dopo una risposta «scrivete a un altro indirizzo». */
type EsitoNuovoIndirizzo =
  | "reinviata" | "gia_reinviata" | "indirizzo_aggiornato"
  | "senza_contatto" | "contatto_cancellato" | "indirizzo_non_valido" | "pec" | "soppresso"
  | "cliente_eic" | "dominio_senza_posta" | "gia_in_rubrica" | "troppi_cambi" | "aggiornamento_fallito";

/**
 * Risposta automatica (22/09/2026, Florin: «la risposta automatica non deve
 * contare come risposta ottenuta»): non ferma il flusso, non avvisa, non crea
 * task né opportunità. Una cosa sola si fa: se dice che la casella non si usa
 * più e indica quella nuova, l'indirizzo del contatto cambia e l'email a cui ha
 * risposto si rimanda lì. L'esito resta scritto sulla risposta
 * (raw.tipo_automatica, raw.nuovo_indirizzo, raw.esito_nuovo_indirizzo).
 * Mai bloccante.
 */
async function gestisciAutorisposta(
  admin: any, r: InboundReply, replyId: string | null, raw: Record<string, unknown>,
  fromEmail: string, brandId: string | null,
): Promise<void> {
  let esito: Record<string, unknown> = { tipo_automatica: "attesa" };
  try {
    let emailContatto: string | null = null;
    if (r.contactId) {
      const { data: c } = await admin.from("marketing_contacts").select("email").eq("id", r.contactId).maybeSingle();
      emailContatto = c?.email ?? null;
    }
    const { tipo, nuovoIndirizzo } = tipoAutorisposta({
      subject: r.subject,
      body: r.text,
      vecchi: [indirizzoDi(fromEmail), emailContatto],
      nostriDomini: await dominiDelleCaselle(admin),
    });
    if (tipo === "nuovo_indirizzo" && nuovoIndirizzo) {
      const risultato = await cambiaIndirizzoERimanda(admin, {
        contactId: r.contactId, enrollmentId: r.enrollmentId ?? null, invioId: r.invioId ?? null,
        nuovo: nuovoIndirizzo, brandId,
      });
      esito = { tipo_automatica: "nuovo_indirizzo", nuovo_indirizzo: nuovoIndirizzo, esito_nuovo_indirizzo: risultato };
    }
  } catch (e) {
    esito = { ...esito, errore_automatica: e instanceof Error ? e.message : String(e) };
    console.warn("[outreach-reply-handler] autorisposta:", e instanceof Error ? e.message : e);
  }
  if (replyId) {
    const { error } = await admin.from("outreach_replies").update({ raw: { ...raw, ...esito } }).eq("id", replyId);
    if (error) console.warn("[outreach-reply-handler] esito autorisposta non salvato:", error.message);
  }
}

/** Stessa regola dell'iscrizione (outreach-enroll): ai clienti EiC non si scrive a freddo. */
async function eClienteEic(admin: any, email: string, dominio: string | null, gratuito: boolean): Promise<boolean> {
  const { data: utenti } = await admin.from("profiles").select("email")
    .not("company_id", "is", null).ilike("email", email).limit(5);
  if (((utenti ?? []) as Array<{ email: string | null }>).some((u) => norm(u.email) === email)) return true;
  if (dominio && !gratuito) {
    const { data: aziende } = await admin.from("companies").select("id")
      .is("deleted_at", null).ilike("email", `%@${dominio}`).limit(1);
    if ((aziende ?? []).length) return true;
  }
  return false;
}

/**
 * La casella del contatto è dismessa e l'autorisposta indica quella nuova.
 * Il nuovo indirizzo passa gli stessi controlli di un'iscrizione (sintassi,
 * usa-e-getta, PEC, soppressi, clienti EiC, dominio con posta); se è già di un
 * altro contatto non si crea un doppione e non gli si scrive due volte. Poi
 * l'indirizzo cambia sul contatto e sulle sue email in coda, e l'email a cui
 * ha risposto si rimanda.
 */
async function cambiaIndirizzoERimanda(admin: any, a: {
  contactId: string | null; enrollmentId: string | null; invioId: string | null;
  nuovo: string; brandId: string | null;
}): Promise<EsitoNuovoIndirizzo> {
  if (!a.contactId) return "senza_contatto";
  const { data: c } = await admin.from("marketing_contacts")
    .select("id, email, notes, optout_email, opt_out, unsubscribed").eq("id", a.contactId).maybeSingle();
  if (!c) return "senza_contatto";
  if (c.optout_email || c.opt_out || c.unsubscribed) return "contatto_cancellato";

  const nuovo = norm(a.nuovo);
  const qualita = classifyEmail(nuovo);
  if (!qualita.syntaxValid || qualita.isDisposable) return "indirizzo_non_valido";
  if (isPecEmail(nuovo)) return "pec";
  const { data: soppresso } = await admin.from("email_suppressions").select("id")
    .eq("email_normalized", nuovo).limit(1).maybeSingle();
  if (soppresso?.id) return "soppresso";
  if (await eClienteEic(admin, nuovo, qualita.domain, qualita.isFree)) return "cliente_eic";
  if (!(await domainHasMx(admin, domainOf(nuovo), new Map()))) return "dominio_senza_posta";

  if (norm(c.email) !== nuovo) {
    const { data: altri } = await admin.from("marketing_contacts").select("id, email")
      .eq("company_id", PLATFORM_COMPANY).ilike("email", nuovo).neq("id", c.id).limit(10);
    if (((altri ?? []) as Array<{ email: string | null }>).some((x) => norm(x.email) === nuovo)) return "gia_in_rubrica";
    // Un indirizzo cambiato da poco non si cambia di nuovo: due risponditori che
    // si rimandano a vicenda farebbero girare il contatto all'infinito.
    const trentaGiorniFa = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const { data: cambi } = await admin.from("outreach_replies").select("id")
      .eq("contact_id", c.id).gte("received_at", trentaGiorniFa)
      .in("raw->>esito_nuovo_indirizzo", ["reinviata", "gia_reinviata", "indirizzo_aggiornato"]).limit(1);
    if ((cambi ?? []).length) return "troppi_cambi";

    const giorno = new Date().toLocaleDateString("it-IT", { timeZone: "Europe/Rome" });
    const nota = `${giorno}: email cambiata da ${c.email} a ${nuovo} (risposta automatica: la casella vecchia non è più attiva).`;
    const { error } = await admin.from("marketing_contacts")
      .update({ email: nuovo, notes: c.notes ? `${c.notes}\n${nota}` : nota }).eq("id", c.id);
    if (error) return "aggiornamento_fallito";
    // Le email già in coda del contatto, anche degli altri brand, partono verso
    // l'indirizzo nuovo: quello vecchio non lo legge più nessuno.
    await admin.from("outreach_send_queue").update({ to_email: nuovo })
      .eq("contact_id", c.id).eq("status", "queued").eq("channel", "email");
  }
  return await rimandaEmail(admin, { contactId: c.id, enrollmentId: a.enrollmentId, invioId: a.invioId, nuovo, brandId: a.brandId });
}

/**
 * Rimanda all'indirizzo nuovo l'email a cui è arrivata l'autorisposta, e il
 * flusso riparte da lì: l'iscrizione torna su quel passo e, spedito il
 * reinvio, il motore accoda il successivo con la sua attesa normale. Un flusso
 * chiuso (risposta, rimbalzo, cancellazione, fermato a mano) non riparte.
 */
async function rimandaEmail(admin: any, a: {
  contactId: string; enrollmentId: string | null; invioId: string | null; nuovo: string; brandId: string | null;
}): Promise<EsitoNuovoIndirizzo> {
  if (!a.enrollmentId) return "indirizzo_aggiornato";
  const { data: e } = await admin.from("outreach_enrollments")
    .select("id, status, sequence_id, current_node_id").eq("id", a.enrollmentId).maybeSingle();
  if (!e || !["active", "paused", "completed"].includes(e.status)) return "indirizzo_aggiornato";

  const { data: inviate } = await admin.from("outreach_send_queue")
    .select("id, node_id, brand_id, to_email, sent_at")
    .eq("enrollment_id", e.id).eq("status", "sent").eq("channel", "email").eq("kind", "send")
    .order("sent_at", { ascending: true });
  const spedite = (inviate ?? []) as Array<{
    id: string; node_id: string | null; brand_id: string | null; to_email: string | null; sent_at: string | null;
  }>;
  if (spedite.some((s) => norm(s.to_email) === a.nuovo)) return "gia_reinviata";
  // L'email a cui ha risposto: quella trovata da chi legge la posta, o l'ultima partita.
  const invio = spedite.find((s) => s.id === a.invioId) ?? spedite[spedite.length - 1];
  if (!invio) return "indirizzo_aggiornato";
  const { data: passi } = await admin.from("outreach_sequence_steps")
    .select("id, step_order, channel, subject, body").eq("sequence_id", e.sequence_id);
  const passo = passoDellInvio(
    (passi ?? []) as Array<{ id: string; step_order: number; channel: string; subject: string | null; body: string | null }>,
    invio,
    spedite,
  );
  if (!passo) return "indirizzo_aggiornato";

  const adesso = new Date().toISOString();
  // Prima si accoda il reinvio, poi si annulla il resto: se l'inserimento non
  // riesce, il flusso non resta senza niente in coda.
  const { data: nuova, error } = await admin.from("outreach_send_queue").insert({
    company_id: PLATFORM_COMPANY,
    enrollment_id: e.id,
    contact_id: a.contactId,
    brand_id: invio.brand_id ?? a.brandId ?? null,
    channel: "email",
    kind: "send",
    node_id: invio.node_id ?? null,
    to_email: a.nuovo,
    subject: passo.subject ?? "",
    body: passo.body ?? "",
    status: "queued",
    scheduled_for: adesso,
    primo_contatto: false,
  }).select("id").single();
  if (error || !nuova?.id) return "indirizzo_aggiornato";
  // Il passo dopo, già in coda, riparte dopo il reinvio con la sua attesa.
  await admin.from("outreach_send_queue")
    .update({ status: "cancelled", last_error: "rimandata all'indirizzo nuovo" })
    .eq("enrollment_id", e.id).eq("status", "queued").neq("id", nuova.id);
  await admin.from("outreach_enrollments").update({
    status: e.status === "paused" ? "paused" : "active",
    current_step: passo.step_order,
    current_node_id: invio.node_id ?? e.current_node_id ?? null,
    next_action_at: adesso,
  }).eq("id", e.id);
  return "reinviata";
}

/**
 * Gestisce una risposta in arrivo: inbox + intent + stop sequenza + opt-out.
 * Idempotenza: NON deduplica per messageId (l'inbound non lo faceva); i
 * chiamanti che leggono via IMAP devono evitare di rileggere gli stessi UID.
 */
export async function handleInboundReply(admin: any, r: InboundReply): Promise<void> {
  const nowIso = new Date().toISOString();
  // Dedup per Message-ID: il poll IMAP rileggeva le stesse risposte ogni 15
  // minuti (righe doppie in Posta + una chiamata AI a giro).
  if (r.messageId) {
    const { data: dup } = await admin.from("outreach_replies").select("id")
      .eq("company_id", PLATFORM_COMPANY).eq("message_id", r.messageId).limit(1).maybeSingle();
    if (dup?.id) return;
  }
  const fromEmail = (r.from || "").trim();
  const snippet = snippetFrom(r.text);
  const { brandId, flusso } = await brandEFlusso(admin, r);

  // AUTORISPOSTA (OOO / mailer-daemon / no-reply)? Va trattata a parte: salviamo
  // comunque la riga (resta visibile in Posta), ma NON fermiamo la sequenza e NON
  // la classifichiamo come "interessato". Header (se presenti) + euristiche su
  // oggetto/corpo. Vedi outreach-autoreply.ts.
  const autoReply = isAutoReply({
    headers: r.headers,
    subject: r.subject,
    body: r.text,
    from: fromEmail,
  });

  // 1. Scrivi la risposta nell'inbox. Per le autorisposte fissiamo subito
  // intent='auto_reply' sulla riga (niente classificazione AII a seguire).
  const riga: Record<string, unknown> = {
    company_id: PLATFORM_COMPANY,
    contact_id: r.contactId,
    enrollment_id: r.enrollmentId ?? null,
    brand_id: brandId,
    sender_account_id: r.senderAccountId ?? null,
    channel: "email",
    from_email: fromEmail,
    subject: r.subject ?? null,
    snippet,
    // Un'autorisposta non è una risposta da leggere: entra già letta, e la
    // Posta la tiene fra le «Automatiche».
    status: autoReply ? "read" : "unread",
    intent: autoReply ? "auto_reply" : null,
    intent_confidence: autoReply ? 1 : null,
    received_at: nowIso,
    message_id: r.messageId ?? null,
    raw: {
      from: fromEmail,
      subject: r.subject ?? null,
      message_id: r.messageId ?? null,
      text: r.text ?? null,
      auto_reply: autoReply,
    },
  };
  let { data: inserted, error: insErr } = await admin.from("outreach_replies").insert(riga).select("id").single();
  if (insErr && /brand_id|sender_account_id/.test(String(insErr.message ?? ""))) {
    // Funzione deployata prima della migrazione: la risposta si salva lo stesso.
    delete riga.brand_id;
    delete riga.sender_account_id;
    ({ data: inserted, error: insErr } = await admin.from("outreach_replies").insert(riga).select("id").single());
  }
  if (insErr) throw insErr;

  // Autorisposta: ci fermiamo qui. La sequenza prosegue (nessuno stop), nessuna
  // classificazione AI, nessun opt-out. Se però dice che la casella non si usa
  // più e indica quella nuova, l'indirizzo si cambia e l'email si rimanda.
  if (autoReply) {
    await gestisciAutorisposta(admin, r, inserted?.id ?? null, riga.raw as Record<string, unknown>, fromEmail, brandId);
    return;
  }

  // 2. Classifica l'intento con l'AI (best-effort, non blocca)
  let intent: string | null = null;
  if (inserted?.id) intent = await classifyAndStoreIntent(admin, inserted.id, r.subject ?? "", snippet ?? "");
  // Fallback a parole chiave: senza List-Unsubscribe l'unica via d'uscita è
  // rispondere «no», e deve funzionare anche se l'AI è giù o non è sicura.
  // «Cancellatemi» vince sempre; «non mi interessa» solo se l'AI non ha deciso.
  const daParole = intentDaParoleChiave(r.subject ?? "", r.text ?? "");
  if (daParole === "unsubscribe" || (daParole && (intent === null || intent === "other"))) {
    intent = daParole;
    if (inserted?.id) {
      await admin.from("outreach_replies").update({ intent, intent_confidence: 0.6 }).eq("id", inserted.id);
    }
  }

  // 2-bis-0. La risposta è il solo numero di telefono («Ok 351 …», «338… /
  // Giuseppe»): vuole essere chiamato. Vale anche se l'AI l'ha presa per
  // un'autorisposta («rimando a un numero»): la regola è stretta e si ferma
  // davanti a firme e messaggi automatici. Fino al 24/09/2026 finivano fra
  // «altro»: nessun promemoria di chiamata, nessuna opportunità.
  if ((intent === null || intent === "other" || intent === "auto_reply" || intent === "out_of_office")
      && rispostaColSoloNumero(r.text ?? "")) {
    intent = "interested";
    if (inserted?.id) {
      await admin.from("outreach_replies").update({ intent, intent_confidence: 0.8 }).eq("id", inserted.id);
    }
  }

  // 2-ter. L'AI l'ha riconosciuta automatica (fuori sede, conferma di
  // ricezione) dove le regole non erano arrivate: vale lo stesso. Fino al
  // 22/09/2026 la risposta passava da qui come una vera, e il flusso si
  // fermava. «Fuori sede» dell'AI diventa auto_reply: out_of_office resta il
  // «Dopo» che si segna a mano su una persona che dice «non ora».
  if (intent === "auto_reply" || intent === "out_of_office") {
    const raw = { ...(riga.raw as Record<string, unknown>), auto_reply: true, intento_ai: intent };
    if (inserted?.id) {
      await admin.from("outreach_replies").update({ intent: "auto_reply", status: "read", raw }).eq("id", inserted.id);
    }
    await gestisciAutorisposta(admin, r, inserted?.id ?? null, raw, fromEmail, brandId);
    return;
  }

  // 2-bis. Avviso al titolare: chi ha risposto e cosa, anche su Gmail.
  await avvisaRisposta(admin, r, fromEmail, intent, brandId, flusso);

  // 3. AUTO-PAUSA SU RISPOSTA, ma SOLO nel brand a cui ha risposto (18/09/2026,
  // decisione del titolare: «non deve fermarsi anche negli altri brand perché
  // sono distinti»). Prima una risposta a ThermoDMR fermava anche Marketing
  // Edile ed Edilizia in Cloud: 9 risposte avevano chiuso 15 iscrizioni.
  // «Cancellatemi» resta globale: quello vale per tutti i servizi.
  await stopActiveSequences(admin, r.contactId, r.enrollmentId, {
    brandId,
    tutte: intent === "unsubscribe",
  });

  // 4-bis. TRIGGER: una risposta interessata o una domanda diventa un task di
  // chiamata entro domani (pending in outreach_call_tasks, visibile in "Oggi"):
  // il valore di un cold sta tutto nei minuti dopo la risposta.
  if ((intent === "interested" || intent === "question") && r.contactId) {
    try {
      const { data: c } = await admin.from("marketing_contacts")
        .select("first_name,last_name,company_name,phone").eq("id", r.contactId).maybeSingle();
      let sequenceId: string | null = null;
      if (r.enrollmentId) {
        const { data: e } = await admin.from("outreach_enrollments").select("sequence_id").eq("id", r.enrollmentId).maybeSingle();
        sequenceId = e?.sequence_id ?? null;
      }
      const { data: giaAperto } = await admin.from("outreach_call_tasks").select("id")
        .eq("company_id", PLATFORM_COMPANY).eq("contact_id", r.contactId).eq("status", "pending").limit(1).maybeSingle();
      if (!giaAperto?.id) {
        await admin.from("outreach_call_tasks").insert({
          company_id: PLATFORM_COMPANY,
          enrollment_id: r.enrollmentId ?? null,
          contact_id: r.contactId,
          sequence_id: sequenceId,
          phone: c?.phone ?? null,
          contact_name: [c?.first_name, c?.last_name].filter(Boolean).join(" ") || null,
          company_name: c?.company_name ?? null,
          note: `${intent === "interested" ? "Ha risposto INTERESSATO" : "Ha fatto una DOMANDA"} via email (${fromEmail}): "${(snippet ?? "").slice(0, 240)}"`,
          status: "pending",
          due_at: new Date(Date.now() + 24 * 3_600_000).toISOString(),
        });
      }
    } catch (e) {
      console.warn("[outreach-reply-handler] task chiamata non creato:", e instanceof Error ? e.message : e);
    }
  }

  // 4-bis-1. «Più avanti»: non è un no. Le nostre email lo propongono come
  // risposta («scrivimi più avanti e mi faccio sentire tra qualche mese»), e la
  // promessa la mantiene un promemoria di chiamata fra circa due mesi e mezzo,
  // che compare in «Oggi» quando scade (25/09/2026). Chi è interessato o fa una
  // domanda ha già il suo promemoria per domani, qui sopra.
  if (r.contactId && intent !== "unsubscribe" && intent !== "interested" && intent !== "question"
      && rispostaPiuAvanti(r.text ?? "")) {
    try {
      const { data: giaAperto } = await admin.from("outreach_call_tasks").select("id")
        .eq("company_id", PLATFORM_COMPANY).eq("contact_id", r.contactId).eq("status", "pending").limit(1).maybeSingle();
      if (!giaAperto?.id) {
        const { data: c } = await admin.from("marketing_contacts")
          .select("first_name,last_name,company_name,phone").eq("id", r.contactId).maybeSingle();
        let sequenceId: string | null = null;
        if (r.enrollmentId) {
          const { data: e } = await admin.from("outreach_enrollments").select("sequence_id").eq("id", r.enrollmentId).maybeSingle();
          sequenceId = e?.sequence_id ?? null;
        }
        await admin.from("outreach_call_tasks").insert({
          company_id: PLATFORM_COMPANY,
          enrollment_id: r.enrollmentId ?? null,
          contact_id: r.contactId,
          sequence_id: sequenceId,
          phone: c?.phone ?? null,
          contact_name: [c?.first_name, c?.last_name].filter(Boolean).join(" ") || null,
          company_name: c?.company_name ?? null,
          note: `Aveva risposto «più avanti»: ricontattare (${fromEmail}): "${(snippet ?? "").slice(0, 240)}"`,
          status: "pending",
          due_at: new Date(Date.now() + GIORNI_PIU_AVANTI * 86_400_000).toISOString(),
        });
      }
    } catch (e) {
      console.warn("[outreach-reply-handler] promemoria «più avanti» non creato:", e instanceof Error ? e.message : e);
    }
  }

  // 4-bis-2. TRIGGER OPPORTUNITÀ: "interessato" e "domanda" creano l'opportunità
  // in automatico (contatto tiepido → scheda in pipeline). La politica sta tutta
  // in shouldCreateOpportunity. Best-effort: un errore qui non deve mai far
  // fallire la gestione della risposta.
  if (r.contactId && shouldCreateOpportunity("email", intent)) {
    await triggerOpportunityFromSignal(admin, {
      channel: "email",
      contactId: r.contactId,
      sourceRefTable: "outreach_replies",
      sourceRefId: inserted!.id,
      snippet,
      brandId, // pipeline OMONIMA del brand a cui ha risposto
      label: intent, // "interested" | "question" → registro attività
    });
  }

  // 4-ter. "Non interessato": il cooldown lo tiene il lock del BRAND qui sotto
  // (24 mesi su quell'azienda per quel brand). Il campo `ricontatta_dopo` del
  // contatto non si tocca più: è globale, e avrebbe zittito anche gli altri
  // due servizi — cosa che il titolare ha escluso il 18/09/2026.

  // 4-quater. Il lock multi-brand sull'azienda si chiude con l'esito: opt-out
  // = 10 anni e soppressione dell'azienda, no = 24 mesi, sì = 12 mesi. Prima
  // outreach_release_brand_lock non la chiamava nessuno: i cooldown per
  // azienda restavano sulla carta.
  if (intent === "unsubscribe") await rilasciaLock(admin, r.contactId, r.enrollmentId, "opt_out");
  else if (intent === "not_interested") await rilasciaLock(admin, r.contactId, r.enrollmentId, "risposta_negativa");
  else if (intent === "interested") await rilasciaLock(admin, r.contactId, r.enrollmentId, "risposta_positiva");

  // 4. Se l'AI ha capito "unsubscribe", opt-out del contatto e blocklist.
  if (intent === "unsubscribe") {
    if (r.contactId) {
      await admin.from("marketing_contacts")
        .update({ optout_email: true, optout_at: nowIso, optout_reason: "unsubscribe" }).eq("id", r.contactId);
    }
    if (fromEmail) {
      await admin.from("email_suppressions").upsert(
        { company_id: PLATFORM_COMPANY, email: fromEmail, reason: "unsubscribe", notes: "Richiesta nella risposta (AI)" },
        { onConflict: "company_id,email_normalized,reason" },
      );
    }
  }
}

/** Chiude il lock dell'azienda del contatto con l'esito della risposta (best effort). */
export async function rilasciaLock(
  admin: any, contactId: string | null, enrollmentId: string | null | undefined,
  esito: "opt_out" | "risposta_negativa" | "risposta_positiva" | "bounce",
): Promise<void> {
  if (!contactId) return;
  try {
    const { data: pc } = await admin.from("outreach_prospect_contacts")
      .select("prospect_company_id").eq("contact_id", contactId).maybeSingle();
    if (!pc?.prospect_company_id) return;
    let brandId: string | null = null;
    if (enrollmentId) {
      const { data: e } = await admin.from("outreach_enrollments").select("sequence_id").eq("id", enrollmentId).maybeSingle();
      if (e?.sequence_id) {
        const { data: sq } = await admin.from("outreach_sequences").select("brand_id").eq("id", e.sequence_id).maybeSingle();
        brandId = sq?.brand_id ?? null;
      }
    }
    await admin.rpc("outreach_release_brand_lock", {
      p_prospect_company_id: pc.prospect_company_id, p_brand_id: brandId, p_esito: esito,
    });
  } catch (e) {
    console.warn("[outreach-reply-handler] rilascio lock:", e instanceof Error ? e.message : e);
  }
}

/**
 * Ferma le sequenze cold ancora attive del contatto dopo una sua risposta, nel
 * SOLO brand a cui ha risposto (`tutte` per l'opt-out, che vale ovunque).
 * Stati vivi = 'active' | 'paused' (gli altri sono già terminali). Le porta a
 * 'replied' e annulla i messaggi ancora 'queued'. Se non c'è il contatto ma c'è
 * un enrollmentId esplicito, ferma almeno quello. Idempotente.
 */
async function stopActiveSequences(
  admin: any, contactId: string | null, enrollmentId?: string | null,
  opzioni: { brandId?: string | null; tutte?: boolean } = {},
): Promise<void> {
  let ids: string[] = [];
  if (contactId) {
    const { data: enrs } = await admin
      .from("outreach_enrollments")
      .select("id, sequence_id")
      .eq("company_id", PLATFORM_COMPANY)
      .eq("contact_id", contactId)
      .in("status", ["active", "paused"]);
    const vive = (enrs ?? []) as Array<{ id: string; sequence_id: string | null }>;
    // Il brand di ogni iscrizione, per fermare solo quelle giuste.
    const seqIds = [...new Set(vive.map((e) => e.sequence_id).filter(Boolean))] as string[];
    const brandDiSequenza = new Map<string, string | null>();
    if (seqIds.length && !opzioni.tutte) {
      const { data: seqs } = await admin.from("outreach_sequences").select("id, brand_id").in("id", seqIds);
      for (const sq of (seqs ?? []) as Array<{ id: string; brand_id: string | null }>) brandDiSequenza.set(sq.id, sq.brand_id);
    }
    ids = iscrizioniDaFermare(
      vive.map((e) => ({ id: e.id, brandId: e.sequence_id ? brandDiSequenza.get(e.sequence_id) ?? null : null })),
      { brandRisposta: opzioni.brandId ?? null, iscrizioneScelta: enrollmentId ?? null, tutte: opzioni.tutte },
    );
  }
  // Fallback: nessun contatto collegato ma il chiamante ha trovato un enrollment.
  if (ids.length === 0 && enrollmentId) ids = [enrollmentId];
  if (ids.length === 0) return;

  await admin.from("outreach_enrollments")
    .update({ status: "replied", next_action_at: null, stop_reason: "Risposta del destinatario" })
    .in("id", ids);
  await admin.from("outreach_send_queue")
    .update({ status: "cancelled", last_error: "reply received" })
    .in("enrollment_id", ids)
    .eq("status", "queued");
}

/**
 * Classifica l'intento di una risposta con l'AI (Unibox NLP) e lo salva sulla
 * riga outreach_replies. Best-effort: ogni errore (AI giù, colonna assente
 * prima della migrazione) viene loggato ma non blocca l'ingestione.
 */
async function classifyAndStoreIntent(admin: any, replyId: string, subject: string, snippet: string): Promise<string | null> {
  try {
    const result = await aiRouterComplete({
      supabase: admin,
      taskKey: "outreach_reply_intent",
      messages: [
        { role: "system", content: INTENT_SYSTEM_PROMPT },
        { role: "user", content: buildIntentUserPrompt(subject, snippet) },
      ],
      params: { temperature: 0, max_tokens: 60 },
      responseFormat: { type: "json_object" },
      companyId: PLATFORM_COMPANY,
      userId: null,
      skipCharge: true,
    });
    let intent = "other";
    let confidence = 0;
    try {
      const o = JSON.parse(result.content || "{}");
      intent = normalizeIntent(o.intent);
      confidence = normalizeConfidence(o.confidence);
    } catch { /* default other */ }
    await admin.from("outreach_replies").update({ intent, intent_confidence: confidence }).eq("id", replyId);
    return intent;
  } catch (e) {
    console.warn("[outreach-reply-handler] intent classify skip:", e instanceof Error ? e.message : e);
    return null;
  }
}
