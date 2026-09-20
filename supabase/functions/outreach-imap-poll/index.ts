/**
 * outreach-imap-poll — lettura risposte e bounce delle caselle del pool (cron).
 *
 * Due famiglie di caselle:
 *   • SMTP con IMAP: si legge la casella via IMAP con CURSORE UID (prima
 *     "UNSEEN SINCE data" rileggeva ogni 15' le stesse risposte non aperte);
 *   • Gmail/Outlook via OAuth: la posta e' gia' scaricata da email-poll-inbox
 *     in email_inbox ogni 2 minuti; qui si leggono le righe nuove di quella
 *     connessione.
 * Caselle in warm-up INCLUSE: spediscono, quindi ricevono risposte.
 *
 * UN GIRO NON LE FA TUTTE (20/09/2026). Con 90 caselle nel pool il giro non
 * finiva più: due sessioni IMAP a casella, in fila, sono minuti. pg_net
 * chiudeva la connessione a 120 secondi e il runtime, non vedendo più né una
 * richiesta né un lavoro in sospeso, ritirava il worker a metà (EarlyDrop, 24
 * volte su 24). Dal 16/09 nessun giro era arrivato in fondo: 31 caselle mai
 * lette, 24 ferme da oltre un giorno, e la parte OAuth, l'avviso degli errori
 * e il registro dei giri — che stanno DOPO il ciclo — mai raggiunti. Nel
 * frattempo la coda dei cron restava ferma due minuti ogni quarto d'ora.
 * Ora: si parte dalle caselle ferme da più tempo, se ne fanno al massimo
 * MAX_CASELLE_PER_GIRO (25 caselle costano ~1,2 s di CPU su un tetto di 2) e
 * non oltre TEMPO_MASSIMO_MS; le altre al giro dopo, che parte ogni 5 minuti.
 * A pg_net si risponde subito (serveConMetricheRapida) e il lavoro finisce
 * sotto waitUntil, così il worker non viene ritirato.
 *
 * Per ogni messaggio: (1) e' un mancato recapito? → suppression + stop
 * iscrizione + contatore bounce; (2) altrimenti match contatto per mittente →
 * handleInboundReply (dedup per Message-ID, intent AI, stop sequenza, opt-out).
 *
 * Auth: solo cron interno (service role bearer o x-cron-secret).
 */

// deno-lint-ignore-file no-explicit-any

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";
import { imapFetchUnreadSince, imapCuraWarmup, type ImapConfig } from "../_shared/imapSmtpClient.ts";
import { matchReplyToContact, type KnownContact } from "../_shared/outreach-reply-match.ts";
import { rilasciaLock, handleInboundReply } from "../_shared/outreach-reply-handler.ts";
import { idsCitati, scegliInvio, scegliIscrizione, testoInvito, type InvioFatto } from "../_shared/outreachRispostaBrand.ts";
import { parseBounce, type BounceInfo } from "../_shared/outreach-bounce.ts";
import { htmlToPlainText } from "../_shared/outreach-template.ts";
import { shouldAutoPause } from "../_shared/outreach-dispatch-logic.ts";
import { alertOutreach, logRun } from "../_shared/outreachAlert.ts";

import { serveConMetricheRapida } from "../_shared/withMetricsRapida.ts";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("PROACTIVE_CRON_SECRET") || "";
const PLATFORM_COMPANY = "00000000-0000-0000-0000-000000000001";
const DAY_MS = 86_400_000;
const PER_MAILBOX = 30;
/** Caselle SMTP per giro: il limite vero è la CPU del worker (2 s), non il tempo. */
const MAX_CASELLE_PER_GIRO = 25;
/** Oltre questo tempo non si apre un'altra casella: il giro deve arrivare in fondo. */
const TEMPO_MASSIMO_MS = 140_000;

interface Casella { id: string; email: string; brand_id?: string | null }
interface MsgIn {
  messageId: string | null;
  from: string;
  subject: string;
  text: string;
  inReplyTo: string | null;
  references: string[];
  headers: Record<string, string>;
}

/** Estrae l'indirizzo bare da "Nome <email@x.com>" o "email@x.com". Lowercase. */
function addrOf(from: string): string {
  const m = (from || "").match(/<([^>]+)>/);
  return (m ? m[1] : from || "").trim().toLowerCase();
}

async function applicaBounce(admin: any, mb: Casella, b: BounceInfo): Promise<void> {
  if (b.failedEmails.length === 0) {
    console.warn(`[outreach-imap-poll] ${mb.email}: NDR senza destinatario riconoscibile (${b.reason ?? "?"})`);
    return;
  }
  for (const email of b.failedEmails) {
    if (b.hard) {
      await admin.from("email_suppressions").upsert(
        { company_id: PLATFORM_COMPANY, email, reason: "hard_bounce", notes: `NDR su ${mb.email}: ${(b.reason ?? "").slice(0, 120)}` },
        { onConflict: "company_id,email_normalized,reason" },
      );
    }
    const { data: contatti } = await admin.from("marketing_contacts").select("id,email")
      .eq("company_id", PLATFORM_COMPANY).ilike("email", email);
    const ids = ((contatti ?? []) as Array<{ id: string }>).map((c) => c.id);
    if (!ids.length) continue;
    if (b.hard && b.dnd) {
      // DND email sul contatto (il titolare, 15/09/2026): il flusso si ferma qui
      // sotto, ma senza DND un altro invio (un'altra sequenza, una campagna,
      // un'automazione) ripartirebbe verso un indirizzo che non va più bene.
      // Solo gli indirizzi identici: in ilike «_» fa da jolly.
      const esatti = ((contatti ?? []) as Array<{ id: string; email: string | null }>)
        .filter((c) => (c.email ?? "").trim().toLowerCase() === email).map((c) => c.id);
      if (esatti.length) {
        await admin.from("marketing_contacts")
          .update({ optout_email: true, optout_at: new Date().toISOString(), optout_reason: "hard_bounce" })
          .in("id", esatti).not("optout_email", "is", true);
      }
    }
    const { data: enrs } = await admin.from("outreach_enrollments").select("id")
      .eq("company_id", PLATFORM_COMPANY).in("contact_id", ids).in("status", ["active", "paused"]);
    const eids = ((enrs ?? []) as Array<{ id: string }>).map((e) => e.id);
    if (!eids.length) continue;
    if (b.hard) {
      // Indirizzo inesistente: la sequenza si ferma, i follow-up in coda spariscono.
      await admin.from("outreach_enrollments")
        .update({ status: "bounced", next_action_at: null, stop_reason: "hard_bounce" }).in("id", eids);
      await admin.from("outreach_send_queue")
        .update({ status: "cancelled", last_error: "hard bounce" }).in("enrollment_id", eids).eq("status", "queued");
      // L'azienda esce dal lock con esito «bounce» (12 mesi di cooldown).
      for (const cid of ids) await rilasciaLock(admin, cid, null, "bounce");
    } else {
      console.warn(`[outreach-imap-poll] ${mb.email}: bounce temporaneo per ${email} (${b.reason ?? "?"}), sequenza lasciata attiva`);
    }
  }
  if (b.hard) {
    const { data: row } = await admin.from("outreach_sender_accounts")
      .select("bounce_count, complaint_count").eq("id", mb.id).maybeSingle();
    const bc = ((row?.bounce_count as number | null) ?? 0) + 1;
    const patch: Record<string, unknown> = { bounce_count: bc };
    if (shouldAutoPause(bc, (row?.complaint_count as number | null) ?? 0)) patch.status = "paused";
    await admin.from("outreach_sender_accounts").update(patch).eq("id", mb.id);
    // La pausa automatica fermava la casella in silenzio: il titolare deve saperlo.
    if (patch.status === "paused") {
      await alertOutreach(admin, {
        chiave: `autopausa:${mb.id}`, tipo: "outreach_casella_in_pausa", ogniOre: 24,
        titolo: `Casella messa in pausa per i rimbalzi: ${mb.email}`,
        testo: `${bc} indirizzi inesistenti: la casella non spedisce più finché non la riattivi da Deliverability. Troppi rimbalzi rovinano la reputazione del dominio: conviene ripulire la lista prima di ripartire.`,
        url: "/admin/marketing?tab=deliverability",
      });
    }
  }
}

/** Tra gli indirizzi candidati, quelli a cui la casella ha spedito (30 gg). */
async function destinatariRecenti(admin: any, senderId: string, emails: string[]): Promise<string[]> {
  const puliti = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter((e) => /^[^\s,]+@[^\s,]+$/.test(e)))].slice(0, 20);
  if (puliti.length === 0) return [];
  const { data } = await admin.from("outreach_send_queue").select("to_email")
    .eq("sender_account_id", senderId).eq("status", "sent")
    .gte("sent_at", new Date(Date.now() - 30 * DAY_MS).toISOString())
    .or(puliti.map((e) => `to_email.ilike.${e}`).join(","))
    .limit(50);
  const spediti = new Set(((data ?? []) as Array<{ to_email: string | null }>).map((r) => String(r.to_email ?? "").toLowerCase()));
  return puliti.filter((e) => spediti.has(e));
}

/** Un messaggio arrivato nella casella: bounce, risposta di un prospect o rumore. */
async function processa(admin: any, mb: Casella, msg: MsgIn, poolEmails?: Set<string>): Promise<"bounce" | "risposta" | "ignorato"> {
  // Warm-up fra caselle del pool: non è una risposta di prospect e non deve
  // toccare i contatori dei bounce.
  const mittente = (msg.from.match(/[^\s<>"]+@[^\s<>"]+/) ?? [msg.from])[0].toLowerCase();
  if (poolEmails?.has(mittente)) return "ignorato";
  const bounce = parseBounce({ from: msg.from, subject: msg.subject, text: msg.text, ignoreEmails: [mb.email] });
  if (bounce.isBounce) {
    // Contano SOLO gli indirizzi a cui questa casella ha davvero scritto negli
    // ultimi 30 giorni: il classificatore gira anche sulla posta personale
    // delle caselle OAuth (newsletter, notifiche) e il testo libero e' pieno
    // di indirizzi che non c'entrano.
    const noti = await destinatariRecenti(admin, mb.id, bounce.failedEmails);
    if (noti.length === 0) return "ignorato";
    await applicaBounce(admin, mb, { ...bounce, failedEmails: noti });
    return "bounce";
  }

  const addr = addrOf(msg.from);
  if (!addr || addr === mb.email.toLowerCase()) return "ignorato";
  const { data: cands } = await admin.from("marketing_contacts").select("id, email")
    .eq("company_id", PLATFORM_COMPANY).ilike("email", addr);
  const match = matchReplyToContact(
    { from: msg.from, inReplyTo: msg.inReplyTo, references: msg.references },
    (cands ?? []) as KnownContact[],
  );
  if (!match) return "ignorato";

  // A QUALE BRAND ha risposto (18/09/2026). Lo stesso contatto può essere
  // iscritto a tutti e tre i servizi: prendere la prima iscrizione attiva
  // faceva scrivere nell'avviso un brand che non gli aveva mai scritto. Si
  // parte dagli invii veri a quell'indirizzo — header citato, poi questa
  // casella, poi il brand della casella.
  const { data: invii } = await admin.from("outreach_send_queue")
    .select("enrollment_id, brand_id, sender_account_id, message_id, sent_at")
    .eq("company_id", PLATFORM_COMPANY).eq("contact_id", match.id).eq("status", "sent")
    .order("sent_at", { ascending: false }).limit(50);
  const scelta = scegliInvio((invii ?? []) as InvioFatto[], {
    casellaId: mb.id,
    brandCasella: mb.brand_id ?? null,
    citati: idsCitati(msg.inReplyTo, msg.references),
  });
  // L'header è la prova; poi vale la casella che ha ricevuto, perché chi
  // risponde risponde proprio a quell'indirizzo.
  let brandId = (scelta?.motivo === "header" ? scelta.invio.brand_id : null)
    ?? (mb.brand_id ?? null) ?? (scelta?.invio.brand_id ?? null);
  let enrollmentId = scelta?.invio.enrollment_id ?? null;
  if (!enrollmentId) {
    // Nessun invio in coda (coda ripulita, o risposta girata a mano): si
    // ripiega sulle iscrizioni vive, preferendo il brand della casella.
    const { data: enrs } = await admin.from("outreach_enrollments")
      .select("id, sequence_id, enrolled_at")
      .eq("company_id", PLATFORM_COMPANY).eq("contact_id", match.id).in("status", ["active", "paused"]);
    const righe = (enrs ?? []) as Array<{ id: string; sequence_id: string | null; enrolled_at: string | null }>;
    const seqIds = [...new Set(righe.map((e) => e.sequence_id).filter(Boolean))] as string[];
    const brandDiSequenza = new Map<string, string | null>();
    if (seqIds.length) {
      const { data: seqs } = await admin.from("outreach_sequences").select("id, brand_id").in("id", seqIds);
      for (const sq of (seqs ?? []) as Array<{ id: string; brand_id: string | null }>) brandDiSequenza.set(sq.id, sq.brand_id);
    }
    const iscrizione = scegliIscrizione(
      righe.map((e) => ({
        id: e.id,
        brandId: e.sequence_id ? brandDiSequenza.get(e.sequence_id) ?? null : null,
        iscrittoIl: e.enrolled_at,
      })),
      mb.brand_id ?? null,
    );
    enrollmentId = iscrizione?.id ?? null;
    if (!brandId) brandId = iscrizione?.brandId ?? null;
  }

  await handleInboundReply(admin, {
    contactId: match.id, enrollmentId,
    brandId, senderAccountId: mb.id, invito: testoInvito(scelta, mb.email),
    from: msg.from, subject: msg.subject, text: msg.text, messageId: msg.messageId, headers: msg.headers,
    casella: mb.email,
  });
  return "risposta";
}

// A pg_net (il cron) si risponde entro pochi secondi: vedi _shared/rispostaRapidaCron.ts.
serveConMetricheRapida("outreach-imap-poll", async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
  const cronHeader = req.headers.get("x-cron-secret") || "";
  const authorized = (!!token && token === SERVICE_ROLE) || (!!CRON_SECRET && cronHeader === CRON_SECRET);
  if (!authorized) return json({ error: "unauthorized" }, 401, cors);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const avvio = new Date();
  const esito = { checked: 0, replies: 0, bounces: 0, ignored: 0, rimandate: 0, errors: [] as string[] };
  const conta = (r: "bounce" | "risposta" | "ignorato") => {
    if (r === "bounce") esito.bounces++; else if (r === "risposta") esito.replies++; else esito.ignored++;
  };

  try {
    // Gli indirizzi del pool: un messaggio che arriva da uno di loro è warm-up,
    // non una risposta di prospect né un bounce da contare.
    const poolEmails = new Set<string>();
    try {
      const { data: pool } = await admin.from("outreach_sender_accounts").select("email");
      for (const r of (pool ?? []) as Array<{ email: string | null }>) if (r.email) poolEmails.add(String(r.email).toLowerCase());
    } catch { /* senza elenco si va avanti: il warm-up in ricezione salta */ }

    // A. Caselle SMTP con IMAP (attive O in warm-up), connessione sana.
    const { data: smtpBoxes, error: mErr } = await admin
      .from("outreach_sender_accounts")
      .select("id, email, brand_id, imap_host, imap_port, imap_secure, smtp_username, secret_ref, last_imap_check_at, last_imap_uid")
      .eq("provider", "smtp").in("status", ["active", "warming"]).eq("connection_status", "ok")
      .not("imap_host", "is", null)
      // Rotazione: prima chi non viene letto da più tempo (mai lette in testa).
      // Senza un ordine il database restituiva sempre le stesse per prime, e
      // le ultime arrivate non venivano lette mai.
      .order("last_imap_check_at", { ascending: true, nullsFirst: true });
    if (mErr) throw mErr;

    let tentate = 0;
    for (const mb of (smtpBoxes ?? []) as any[]) {
      // Contano i tentativi, non i successi: una casella che fallisce resta in
      // testa alla rotazione, e non deve poter consumare il giro intero.
      if (tentate >= MAX_CASELLE_PER_GIRO || Date.now() - avvio.getTime() > TEMPO_MASSIMO_MS) {
        esito.rimandate = (smtpBoxes ?? []).length - tentate;
        break;
      }
      tentate++;
      try {
        if (!mb.secret_ref) { esito.errors.push(`${mb.email}: secret_ref mancante`); continue; }
        const { data: password, error: secErr } = await admin.rpc("outreach_mailbox_secret", { p_ref: mb.secret_ref });
        if (secErr || !password) { esito.errors.push(`${mb.email}: segreto non risolto`); continue; }
        const cfg: ImapConfig = { host: mb.imap_host, port: mb.imap_port, secure: mb.imap_secure, username: mb.smtp_username ?? mb.email, password };
        const since = mb.last_imap_check_at ? new Date(mb.last_imap_check_at) : new Date(Date.now() - DAY_MS);
        const lastUid = parseInt(String(mb.last_imap_uid ?? ""), 10);
        const messages = await imapFetchUnreadSince(cfg, since, PER_MAILBOX, Number.isFinite(lastUid) && lastUid > 0 ? lastUid : null);
        esito.checked++;
        let maxUid = Number.isFinite(lastUid) ? lastUid : 0;
        for (const m of messages) {
          const n = parseInt(m.uid, 10);
          if (Number.isFinite(n) && n > maxUid) maxUid = n;
          try {
            conta(await processa(admin, mb, {
              messageId: m.messageId || null, from: m.from, subject: m.subject,
              text: m.text || (m.html ? htmlToPlainText(m.html) : ""),
              inReplyTo: m.inReplyTo, references: m.references ?? [], headers: m.headers ?? {},
            }, poolEmails));
          } catch (e) { esito.errors.push(`${mb.email}/${m.uid}: ${e instanceof Error ? e.message : String(e)}`); }
        }
        const upd: Record<string, unknown> = { last_imap_check_at: new Date().toISOString() };
        if (maxUid > 0) upd.last_imap_uid = String(maxUid);
        await admin.from("outreach_sender_accounts").update(upd).eq("id", mb.id);

        // Il lato ricezione del warm-up: le email delle altre caselle del pool
        // escono dallo spam e risultano lette. Best-effort, mai bloccante.
        const altre = [...poolEmails].filter((e) => e !== String(mb.email).toLowerCase());
        if (altre.length) {
          try {
            const w = await imapCuraWarmup(cfg, altre);
            if (w.salvati || w.letti) console.log(`[outreach-imap-poll] warm-up ${mb.email}: ${w.salvati} tolte dallo spam, ${w.letti} segnate lette`);
          } catch (e) { esito.errors.push(`${mb.email}: warm-up ricezione — ${e instanceof Error ? e.message : String(e)}`); }
        }
      } catch (e) {
        esito.errors.push(`${mb.email}: IMAP fallito — ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // B. Caselle Gmail/Outlook (OAuth): la posta e' gia' in email_inbox.
    const { data: oauthBoxes, error: oErr } = await admin
      .from("outreach_sender_accounts")
      .select("id, email, brand_id, oauth_connection_id, last_imap_check_at")
      .in("provider", ["gmail", "outlook"]).in("status", ["active", "warming"])
      .not("oauth_connection_id", "is", null);
    if (oErr) throw oErr;

    for (const mb of (oauthBoxes ?? []) as any[]) {
      try {
        const sinceIso = mb.last_imap_check_at ?? new Date(Date.now() - DAY_MS).toISOString();
        const { data: rows, error: rErr } = await admin
          .from("email_inbox")
          .select("id, message_id, from_email, from_name, subject, raw_text, raw_html, received_at, created_at, in_reply_to, references_ids, headers")
          .eq("oauth_connection_id", mb.oauth_connection_id)
          .or("mailbox_folder.eq.inbox,mailbox_folder.is.null")
          // cursore su created_at (inserimento), non received_at: un messaggio
          // scaricato in ritardo con data vecchia non deve sparire
          .gt("created_at", sinceIso)
          .order("created_at", { ascending: true })
          .limit(PER_MAILBOX);
        if (rErr) throw rErr;
        esito.checked++;
        let ultimo: string | null = null;
        for (const r of (rows ?? []) as any[]) {
          ultimo = r.created_at ?? ultimo;
          const from = r.from_name ? `${r.from_name} <${r.from_email}>` : String(r.from_email ?? "");
          const headers: Record<string, string> = {};
          if (r.headers && typeof r.headers === "object") {
            for (const [k, v] of Object.entries(r.headers as Record<string, unknown>)) headers[k.toLowerCase()] = String(v ?? "");
          }
          try {
            conta(await processa(admin, mb, {
              messageId: r.message_id || null, from, subject: String(r.subject ?? ""),
              text: r.raw_text || (r.raw_html ? htmlToPlainText(r.raw_html) : ""),
              inReplyTo: r.in_reply_to ?? null, references: (r.references_ids ?? []) as string[], headers,
            }));
          } catch (e) { esito.errors.push(`${mb.email}/${r.id}: ${e instanceof Error ? e.message : String(e)}`); }
        }
        if (ultimo) await admin.from("outreach_sender_accounts").update({ last_imap_check_at: ultimo }).eq("id", mb.id);
      } catch (e) {
        esito.errors.push(`${mb.email}: lettura posta OAuth fallita — ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    if (esito.errors.length) {
      await alertOutreach(admin, {
        chiave: "poll-risposte", tipo: "outreach_poll_errore", ogniOre: 6,
        titolo: `Lettura risposte outreach: ${esito.errors.length} errori`,
        testo: esito.errors.slice(0, 3).join(" · ").slice(0, 300),
        url: "/admin/marketing?tab=deliverability",
      });
    }
    await logRun(admin, "outreach-imap-poll", avvio, esito);
    return json(esito, 200, cors);
  } catch (e) {
    await logRun(admin, "outreach-imap-poll", avvio, esito, e instanceof Error ? e.message : String(e));
    return json({ error: e instanceof Error ? e.message : String(e), ...esito }, 500, cors);
  }
});

function json(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
