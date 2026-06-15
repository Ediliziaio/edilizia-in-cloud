import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";
import { isMissingTableError, isMissingColumnError } from "./_shared";

/**
 * useOutreachConversations — logica condivisa dell'inbox cold.
 *
 * Estratta da OutreachInbox per essere riusata sia dall'inbox compatta sia dal
 * client a 3 pannelli (OutreachMailClient): query (inviate + risposte +
 * contatti + caselle), raggruppamento per contatto in conversazioni con thread,
 * derivazione della CASELLA di riferimento per conversazione, mutazioni
 * (segna-letto, bulk lette/archivia) e azioni di risposta (Bozza AI / Invia).
 *
 * Tutto il rendering (lista, thread, box risposta) resta nei componenti: qui
 * vive solo lo stato/dati condiviso, così non duplichiamo ~200 righe di logica.
 *
 * Colonne reali (migrazioni 20270815000000 / 20270816000000 / 20270818000000):
 *   outreach_send_queue:      id, contact_id, to_email, subject, body, sent_at, sender_account_id, status
 *   outreach_replies:         id, contact_id, from_email, subject, snippet, received_at, status, intent
 *   outreach_sender_accounts: id, email, provider, status (la casella che ha inviato)
 *   marketing_contacts:       id, first_name, last_name, company_name, email
 */

const T_SENT = "outreach_send_queue";
const T_REPLIES = "outreach_replies";
const T_CONTACTS = "marketing_contacts";
const T_SENDERS = "outreach_sender_accounts";
const T_ENROLLMENTS = "outreach_enrollments";
const T_SEQUENCES = "outreach_sequences";
const T_SUPPRESSIONS = "email_suppressions";
const T_CONV_STATE = "outreach_conversation_state";

// Stati enrollment che il dispatcher considera "chiusi" (non riprendibili dalla UI).
const TERMINAL_ENROLLMENT = new Set(["completed", "stopped", "replied", "bounced", "opted_out"]);

/** Etichette + colore degli stati sequenza per i badge del pannello contesto. */
export const ENROLLMENT_STATUS_META: Record<string, { label: string; cls: string }> = {
  active: { label: "Attiva", cls: "border-emerald-200 bg-emerald-100 text-emerald-700" },
  paused: { label: "In pausa", cls: "border-orange-200 bg-orange-100 text-orange-700" },
  completed: { label: "Completata", cls: "border-blue-200 bg-blue-100 text-blue-700" },
  replied: { label: "Ha risposto", cls: "border-green-200 bg-green-100 text-green-700" },
  stopped: { label: "Fermata", cls: "bg-muted text-muted-foreground" },
  bounced: { label: "Bounce", cls: "border-red-200 bg-red-100 text-red-700" },
  opted_out: { label: "Opt-out", cls: "border-red-200 bg-red-100 text-red-700" },
};

/** Una sequenza è "viva" (riprendibile/pausabile) se non è in uno stato terminale. */
export function isEnrollmentLive(status: string): boolean {
  return !TERMINAL_ENROLLMENT.has(status);
}

// Etichette intento (Unibox NLP).
export const INTENT_META: Record<string, { label: string; cls: string }> = {
  interested: { label: "Interessato", cls: "border-green-200 bg-green-100 text-green-700" },
  question: { label: "Domanda", cls: "border-blue-200 bg-blue-100 text-blue-700" },
  not_interested: { label: "Non interessato", cls: "border-red-200 bg-red-100 text-red-700" },
  unsubscribe: { label: "Disiscrizione", cls: "border-red-200 bg-red-100 text-red-700" },
  out_of_office: { label: "Fuori sede", cls: "border-amber-200 bg-amber-100 text-amber-700" },
  auto_reply: { label: "Auto-risposta", cls: "bg-muted text-muted-foreground" },
  other: { label: "Altro", cls: "bg-muted text-muted-foreground" },
};

export interface SenderRow {
  id: string;
  email: string;
  provider: string;
  status: string;
  /** Brand della casella (per recuperarne la firma da inserire nelle risposte). */
  brand_id: string | null;
}

interface SentRow {
  id: string;
  contact_id: string | null;
  to_email: string | null;
  subject: string | null;
  body: string | null;
  sent_at: string | null;
  sender_account_id: string | null;
  /** Stato della riga di coda: 'sent' qui (filtrato) ma teniamo il campo per onestà. */
  status: string | null;
  /** Errore provider/coda (per stati non riusciti, anche se ora filtriamo i 'sent'). */
  last_error: string | null;
  /** Tentativi di invio (utile nel tooltip se >1). */
  attempts: number | null;
  /** Prima apertura tracciata (open-tracking opt-in), o null. Colonna 20270821000000. */
  opened_at: string | null;
  /** Numero di aperture tracciate. 0 se mai aperta o tracking off. Colonna 20270821000000. */
  open_count: number | null;
}

/**
 * Stato di consegna ONESTO di un'email inviata, derivato dalle colonne reali di
 * outreach_send_queue. L'Outreach Engine NON traccia aperture/click/bounce per
 * messaggio (quel tracking vive su email_logs lato campagne): qui non inventiamo
 * stati. Mappa 1:1 con outreach_send_queue.status + sent_at/last_error/attempts.
 */
export interface MsgDelivery {
  /** sent = spedita dalla casella; failed/skipped/cancelled = non consegnata; queued/sending = in corso. */
  state: "sent" | "queued" | "sending" | "failed" | "skipped" | "cancelled" | "unknown";
  sentAt: string | null;
  error: string | null;
  attempts: number | null;
  /** Open-tracking (opt-in): prima apertura tracciata, o null se mai aperta/tracking off. */
  openedAt: string | null;
  /** Open-tracking (opt-in): numero di aperture. 0 se mai aperta o tracking off. */
  openCount: number;
}

interface ReplyRow {
  id: string;
  contact_id: string | null;
  from_email: string | null;
  subject: string | null;
  snippet: string | null;
  received_at: string | null;
  status: string;
  intent: string | null;
}

export interface ContactRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  tags: string[] | null;
  source: string | null;
  optout_email: boolean | null;
  last_activity_at: string | null;
}

/** Stato sequenza del lead (enrollment + nome sequenza + prossimo invio). */
export interface LeadSequence {
  enrollmentId: string;
  sequenceId: string;
  sequenceName: string | null;
  /** active | paused | completed | stopped | replied | bounced | opted_out */
  status: string;
  currentStep: number;
  nextActionAt: string | null;
}

/** Contesto completo del lead per il pannello laterale del client. */
export interface LeadContext {
  contact: ContactRow;
  /** Iscrizioni del contatto, più recenti prima. */
  sequences: LeadSequence[];
  /** È in blocklist email (email_suppressions) per la company admin. */
  suppressed: boolean;
  sentCount: number;
  replyCount: number;
  lastActivityAt: string | null;
}

export interface ThreadMsg {
  id: string;
  direction: "out" | "in";
  subject: string | null;
  /** HTML per le inviate (nostre), testo grezzo per le risposte. */
  body: string | null;
  at: string | null;
  intent: string | null;
  /** Stato di consegna (solo per le inviate, direction='out'). */
  delivery?: MsgDelivery;
}

/** Riepilogo AI di una conversazione (edge outreach-ai-summary). */
export interface AiSummary {
  /** Frase di sintesi (1 riga, IT) su a che punto siamo e cosa vuole il prospect. */
  summary: string;
  /** Hint sull'intento dell'ultima risposta (2-4 parole). */
  intentHint: string;
  /** Bozza di risposta proposta (da inserire nel box con "Usa come bozza"). */
  suggestedReply: string;
}

export interface Conversation {
  key: string;
  contact: ContactRow | null;
  /** Email di fallback quando manca il contatto (display + ricerca). */
  email: string | null;
  messages: ThreadMsg[];
  lastAt: string | null;
  lastSnippet: string;
  lastIntent: string | null;
  unread: boolean;
  /** Ha almeno una risposta in arrivo già letta (status='read') → archiviabile. */
  hasRead: boolean;
  /** Ha ≥1 risposta in arrivo e tutte sono archiviate → nascosta di default. */
  archived: boolean;
  /** Caselle (sender_account_id) che hanno inviato a questo contatto. */
  senderAccountIds: string[];
  /** Casella di riferimento = la più recente che ha inviato (può essere null). */
  primarySenderId: string | null;
  /** N. email inviate nel thread (mini-stat del pannello contesto). */
  sentCount: number;
  /** N. risposte in arrivo nel thread (mini-stat del pannello contesto). */
  replyCount: number;
  /** Sequenze (outreach_sequences.id) a cui il contatto è iscritto. Per il filtro campagna. */
  sequenceIds: string[];
  /** Nomi delle sequenze iscritte (allineati a sequenceIds), per tooltip/UX. */
  sequenceNames: string[];
  /** Posticipata fino a (ISO) se snoozed_until > now, altrimenti null. Solo per i contatti collegati. */
  snoozedUntil: string | null;
}

export type StatusFilter = "all" | "interested" | "unread" | "snoozed" | "archived";

/** Finestra rapida sull'ultima attività della conversazione (lastAt). */
export type DateFilter = "all" | "today" | "7d" | "30d";

/** Voce del selettore "Filtra per sequenza/campagna" (id reale + label). */
export interface SequenceOption {
  id: string;
  name: string;
}

const UNREAD = "unread";
const READ = "read";
const ARCHIVED = "archived";

/**
 * Confine inferiore (epoch ms) della finestra `DateFilter`, oppure null per "tutto".
 * Esportata per testabilità (logica pura).
 */
export function dateFilterFloor(filter: DateFilter, now: number = Date.now()): number | null {
  switch (filter) {
    case "today": return now - 24 * 60 * 60 * 1000;
    case "7d": return now - 7 * 24 * 60 * 60 * 1000;
    case "30d": return now - 30 * 24 * 60 * 60 * 1000;
    default: return null;
  }
}

/** Preset del menu "Posticipa". `custom` apre il selettore data. */
export type SnoozePreset = "3h" | "tomorrow" | "3d" | "1w";

/**
 * Calcola l'istante (ISO) a cui riportare in vista una conversazione posticipata.
 * Logica pura (testabile): `from` di default è ora.
 *   3h       → +3 ore
 *   tomorrow → domani alle 9:00 (ora locale)
 *   3d / 1w  → +3 giorni / +7 giorni
 */
export function snoozeUntil(preset: SnoozePreset, from: Date = new Date()): string {
  const d = new Date(from.getTime());
  switch (preset) {
    case "3h":
      d.setHours(d.getHours() + 3);
      break;
    case "tomorrow":
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0, 0, 0);
      break;
    case "3d":
      d.setDate(d.getDate() + 3);
      break;
    case "1w":
      d.setDate(d.getDate() + 7);
      break;
  }
  return d.toISOString();
}

export function contactName(c: ContactRow | null, email: string | null): string {
  if (c) {
    const full = `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim();
    if (full) return full;
    if (c.company_name) return c.company_name;
    if (c.email) return c.email;
  }
  return email || "Contatto sconosciuto";
}

export function iniziali(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export function relativeTime(iso: string | null): string {
  if (!iso) return "";
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: it });
  } catch {
    return "";
  }
}

export function fullTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(d);
}

export function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/** Provider compatti per il badge casella. */
export function providerLabel(provider: string): string {
  switch (provider) {
    case "ses": return "SES";
    case "smtp": return "SMTP";
    case "resend": return "Resend";
    case "elastic_email": return "EE";
    case "sendgrid": return "SendGrid";
    case "brevo": return "Brevo";
    case "mailgun": return "Mailgun";
    default: return provider.toUpperCase();
  }
}

/** Pallino di stato casella (active/warming/paused/disabled). */
export function senderStatusColor(status: string): string {
  switch (status) {
    case "active": return "bg-emerald-500";
    case "warming": return "bg-amber-500";
    case "paused": return "bg-orange-500";
    default: return "bg-muted-foreground/40";
  }
}

/**
 * Hook condiviso: carica i dati, costruisce le conversazioni, espone mutazioni
 * e azioni. I componenti gestiscono solo selezione/filtri/rendering.
 */
export function useOutreachConversations(companyId: string) {
  const qc = useQueryClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  // Colonne base sempre presenti (migrazione core 20270815000000) + le due
  // dell'open-tracking (20270821000000) che potrebbero non essere ancora applicate.
  const SENT_BASE_COLS = "id,contact_id,to_email,subject,body,sent_at,sender_account_id,status,last_error,attempts";
  const SENT_OPEN_COLS = "opened_at,open_count";

  const sentQ = useQuery({
    queryKey: ["outreach-inbox-sent", companyId],
    retry: false,
    queryFn: async () => {
      // Prova con le colonne open-tracking; se la migrazione 20270821000000 non è
      // applicata il select fallisce (colonna inesistente) → ricade sulle colonne
      // base senza rompere l'inbox (open_count/opened_at sintetizzati a 0/null).
      const run = (cols: string) =>
        db.from(T_SENT)
          .select(cols)
          .eq("company_id", companyId)
          .eq("status", "sent")
          .order("sent_at", { ascending: false })
          .limit(500);
      let { data, error } = await run(`${SENT_BASE_COLS},${SENT_OPEN_COLS}`);
      if (error && isMissingColumnError(error)) {
        ({ data, error } = await run(SENT_BASE_COLS));
      }
      if (error) throw error;
      return (data ?? []).map((r: Record<string, unknown>) => ({
        ...r,
        opened_at: (r.opened_at as string | null) ?? null,
        open_count: (r.open_count as number | null) ?? null,
      })) as SentRow[];
    },
  });

  const repliesQ = useQuery({
    queryKey: ["outreach-inbox-replies", companyId],
    retry: false,
    queryFn: async () => {
      const { data, error } = await db
        .from(T_REPLIES)
        .select("*")
        .eq("company_id", companyId)
        .order("received_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as ReplyRow[];
    },
  });

  const contactsQ = useQuery({
    queryKey: ["outreach-inbox-contacts", companyId],
    retry: false,
    queryFn: async () => {
      const { data, error } = await db
        .from(T_CONTACTS)
        .select("id,first_name,last_name,company_name,email,phone,tags,source,optout_email,last_activity_at")
        .eq("company_id", companyId)
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as ContactRow[];
    },
  });

  // Caselle del pool: servono al pannello sinistro del client e ai badge casella.
  // retry:false + non blocca la UI se assente (le inviate possono comunque mostrarsi).
  const sendersQ = useQuery({
    queryKey: ["outreach-inbox-senders", companyId],
    retry: false,
    queryFn: async () => {
      const { data, error } = await db
        .from(T_SENDERS)
        .select("id,email,provider,status,brand_id")
        .eq("company_id", companyId)
        .order("email");
      if (error) throw error;
      return (data ?? []) as SenderRow[];
    },
  });

  // Firme dei brand (per l'inserimento rapido nelle risposte). Best-effort:
  // colonna `signature` aggiunta da 20270819000000; se assente o vuota → niente
  // voce "Firma" nel menu snippet. Una sola query, mappata brand_id → firma.
  const brandSigsQ = useQuery({
    queryKey: ["outreach-inbox-brand-signatures", companyId],
    retry: false,
    queryFn: async () => {
      const { data, error } = await db
        .from("outreach_brands")
        .select("id,signature")
        .eq("company_id", companyId);
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; signature: string | null }>;
    },
  });

  // Iscrizioni a sequenza per TUTTI i contatti dell'azienda → mappa contatto →
  // sequenze (id + nome). Serve al filtro "per sequenza/campagna" nella lista
  // conversazioni e popola sequenceIds/sequenceNames per conversazione. Una sola
  // query enrollments + una per i nomi (evita N+1). Best-effort: se la tabella
  // manca (migrazione non applicata) il filtro semplicemente non mostra opzioni.
  const enrollmentsAllQ = useQuery({
    queryKey: ["outreach-inbox-enrollments", companyId],
    retry: false,
    queryFn: async () => {
      const { data, error } = await db
        .from(T_ENROLLMENTS)
        .select("contact_id,sequence_id")
        .eq("company_id", companyId)
        .limit(5000);
      if (error) throw error;
      return (data ?? []) as Array<{ contact_id: string | null; sequence_id: string | null }>;
    },
  });

  // Sequenze attive dell'azienda (per le opzioni del dropdown filtro). I nomi di
  // TUTTE le sequenze (anche non attive) servono comunque per le etichette delle
  // conversazioni, quindi carichiamo l'elenco completo e filtriamo lato opzioni.
  const sequencesQ = useQuery({
    queryKey: ["outreach-inbox-sequences", companyId],
    retry: false,
    queryFn: async () => {
      const { data, error } = await db
        .from(T_SEQUENCES)
        .select("id,name,status")
        .eq("company_id", companyId)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; name: string; status: string }>;
    },
  });

  // Stato snooze per conversazione (contact_id → snoozed_until). Best-effort: se
  // la tabella manca (migrazione non applicata) il filtro "Posticipate" resta
  // vuoto e nulla viene nascosto. Carichiamo solo le righe ancora posticipate
  // (snoozed_until nel futuro): le scadute non servono più (la conversazione
  // riappare da sola). retry:false per non bloccare la UI.
  const snoozeStateQ = useQuery({
    queryKey: ["outreach-inbox-snooze", companyId],
    retry: false,
    queryFn: async () => {
      const { data, error } = await db
        .from(T_CONV_STATE)
        .select("contact_id,snoozed_until")
        .eq("company_id", companyId)
        .gt("snoozed_until", new Date().toISOString());
      if (error) throw error;
      return (data ?? []) as Array<{ contact_id: string; snoozed_until: string | null }>;
    },
  });

  const markRead = useMutation({
    mutationFn: async (contactId: string) => {
      const { error } = await db
        .from(T_REPLIES)
        .update({ status: READ })
        .eq("company_id", companyId)
        .eq("contact_id", contactId)
        .eq("status", UNREAD);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["outreach-inbox-replies", companyId] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Errore"),
  });

  // Bulk: segna lette le risposte non lette. Senza argomenti agisce su TUTTA
  // l'azienda (comportamento storico); con un elenco di contactId agisce SOLO
  // sulle conversazioni selezionate (selezione multipla del client). Le
  // conversazioni senza contatto collegato non hanno risposte etichettabili per
  // contatto, quindi vengono semplicemente ignorate dal filtro `.in()`.
  const markAllRead = useMutation({
    mutationFn: async (contactIds?: string[]) => {
      let q = db.from(T_REPLIES).update({ status: READ })
        .eq("company_id", companyId)
        .eq("status", UNREAD);
      if (contactIds && contactIds.length > 0) q = q.in("contact_id", contactIds);
      const { error } = await q;
      if (error) throw error;
    },
    onSuccess: (_res, contactIds) => {
      toast.success(contactIds && contactIds.length > 0
        ? "Conversazioni selezionate segnate come lette"
        : "Tutte le risposte segnate come lette");
      qc.invalidateQueries({ queryKey: ["outreach-inbox-replies", companyId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Errore"),
  });

  // Bulk: archivia le risposte lette → escono dalla lista di default. Senza
  // argomenti agisce su tutta l'azienda; con un elenco di contactId agisce solo
  // sulle conversazioni selezionate. Allineato a markAllRead.
  const archiveRead = useMutation({
    mutationFn: async (contactIds?: string[]) => {
      let q = db.from(T_REPLIES).update({ status: ARCHIVED })
        .eq("company_id", companyId)
        .eq("status", READ);
      if (contactIds && contactIds.length > 0) q = q.in("contact_id", contactIds);
      const { error } = await q;
      if (error) throw error;
    },
    onSuccess: (_res, contactIds) => {
      toast.success(contactIds && contactIds.length > 0
        ? "Conversazioni selezionate archiviate"
        : "Conversazioni lette archiviate");
      qc.invalidateQueries({ queryKey: ["outreach-inbox-replies", companyId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Errore"),
  });

  // Intent 1-click: aggiorna l'intent dell'ULTIMA risposta in arrivo del contatto.
  // L'intent vive per-risposta (outreach_replies.intent); la conversazione mostra
  // quello della risposta più recente, quindi è quella che aggiorniamo.
  const setIntent = useMutation({
    mutationFn: async ({ contactId, intent }: { contactId: string; intent: string }) => {
      const { data: last, error: selErr } = await db
        .from(T_REPLIES)
        .select("id")
        .eq("company_id", companyId)
        .eq("contact_id", contactId)
        .order("received_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (selErr) throw selErr;
      if (!last?.id) throw new Error("Nessuna risposta da etichettare per questo contatto");
      const { error } = await db
        .from(T_REPLIES)
        .update({ intent, intent_confidence: 1 })
        .eq("id", last.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Intento aggiornato");
      qc.invalidateQueries({ queryKey: ["outreach-inbox-replies", companyId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Errore"),
  });

  // Posticipa una conversazione: upsert dello stato (snoozed_until) per contatto.
  // Upsert su (company_id, contact_id) così ri-posticipare aggiorna la riga senza
  // duplicare. La conversazione esce dalle viste normali (hook) finché scade.
  const snoozeConversation = useMutation({
    mutationFn: async ({ contactId, until }: { contactId: string; until: string }) => {
      const { error } = await db
        .from(T_CONV_STATE)
        .upsert(
          { company_id: companyId, contact_id: contactId, snoozed_until: until, updated_at: new Date().toISOString() },
          { onConflict: "company_id,contact_id" },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Conversazione posticipata");
      qc.invalidateQueries({ queryKey: ["outreach-inbox-snooze", companyId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Errore"),
  });

  // Annulla il posticipo: azzera snoozed_until (la riga resta, innocua). La
  // conversazione riappare subito nelle viste normali.
  const unsnooze = useMutation({
    mutationFn: async ({ contactId }: { contactId: string }) => {
      const { error } = await db
        .from(T_CONV_STATE)
        .update({ snoozed_until: null, updated_at: new Date().toISOString() })
        .eq("company_id", companyId)
        .eq("contact_id", contactId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Posticipo annullato");
      qc.invalidateQueries({ queryKey: ["outreach-inbox-snooze", companyId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Errore"),
  });

  const sendersById = useMemo(
    () => new Map((sendersQ.data ?? []).map((s) => [s.id, s])),
    [sendersQ.data],
  );

  // brand_id → firma (non vuota). Per l'inserimento rapido della firma in risposta.
  const brandSignatureById = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of brandSigsQ.data ?? []) {
      const sig = (b.signature ?? "").trim();
      if (sig) m.set(b.id, sig);
    }
    return m;
  }, [brandSigsQ.data]);

  /** Firma del brand della casella che ha inviato la conversazione (o null). */
  const signatureForSender = (senderId: string | null | undefined): string | null => {
    if (!senderId) return null;
    const brandId = sendersById.get(senderId)?.brand_id ?? null;
    return brandId ? brandSignatureById.get(brandId) ?? null : null;
  };

  const conversations = useMemo<Conversation[]>(() => {
    const sent = sentQ.data ?? [];
    const replies = repliesQ.data ?? [];
    const contacts = contactsQ.data ?? [];
    const byId = new Map(contacts.map((c) => [c.id, c]));

    const groups = new Map<string, Conversation>();
    const ensure = (contactId: string | null, email: string | null): Conversation => {
      const key = contactId ?? (email ? `email:${email.toLowerCase()}` : "unknown");
      let conv = groups.get(key);
      if (!conv) {
        conv = {
          key,
          contact: contactId ? byId.get(contactId) ?? null : null,
          email,
          messages: [],
          lastAt: null,
          lastSnippet: "",
          lastIntent: null,
          unread: false,
          hasRead: false,
          archived: false,
          senderAccountIds: [],
          primarySenderId: null,
          sentCount: 0,
          replyCount: 0,
          sequenceIds: [],
          sequenceNames: [],
          snoozedUntil: null,
        };
        groups.set(key, conv);
      } else if (!conv.email && email) {
        conv.email = email;
      }
      return conv;
    };

    // Tiene traccia della casella più recente che ha inviato in ogni conversazione.
    const latestSenderAt = new Map<string, number>();
    const senderSeen = new Map<string, Set<string>>();

    for (const s of sent) {
      // Senza contact_id raggruppiamo per email destinataria, così la conversazione resta tracciabile.
      if (!s.contact_id && !s.to_email) continue;
      const conv = ensure(s.contact_id, s.to_email);
      conv.sentCount++;
      conv.messages.push({
        id: `s:${s.id}`,
        direction: "out",
        subject: s.subject,
        body: s.body,
        at: s.sent_at,
        intent: null,
        delivery: {
          state: (s.status as MsgDelivery["state"]) ?? "unknown",
          sentAt: s.sent_at,
          error: s.last_error,
          attempts: s.attempts,
          openedAt: s.opened_at,
          openCount: s.open_count ?? 0,
        },
      });
      if (s.sender_account_id) {
        let seen = senderSeen.get(conv.key);
        if (!seen) { seen = new Set(); senderSeen.set(conv.key, seen); }
        if (!seen.has(s.sender_account_id)) {
          seen.add(s.sender_account_id);
          conv.senderAccountIds.push(s.sender_account_id);
        }
        // La casella di riferimento è quella dell'invio più recente.
        const t = new Date(s.sent_at ?? 0).getTime();
        if (t >= (latestSenderAt.get(conv.key) ?? -Infinity)) {
          latestSenderAt.set(conv.key, t);
          conv.primarySenderId = s.sender_account_id;
        }
      }
    }

    // Conteggio risposte in arrivo e quante archiviate, per stabilire se la
    // conversazione è interamente archiviata (→ fuori dalla lista di default).
    const inCount = new Map<string, number>();
    const archivedCount = new Map<string, number>();
    for (const r of replies) {
      if (!r.contact_id && !r.from_email) continue;
      const conv = ensure(r.contact_id, r.from_email);
      conv.replyCount++;
      conv.messages.push({
        id: `r:${r.id}`,
        direction: "in",
        subject: r.subject,
        body: r.snippet,
        at: r.received_at,
        intent: r.intent,
      });
      if (r.status === UNREAD) conv.unread = true;
      if (r.status === READ) conv.hasRead = true;
      inCount.set(conv.key, (inCount.get(conv.key) ?? 0) + 1);
      if (r.status === ARCHIVED) archivedCount.set(conv.key, (archivedCount.get(conv.key) ?? 0) + 1);
    }

    // Sequenze per contatto (per il filtro campagna + etichette). Le iscrizioni
    // sono per contact_id; le conversazioni senza contatto restano senza sequenza.
    const seqNameById = new Map((sequencesQ.data ?? []).map((s) => [s.id, s.name]));
    const seqIdsByContact = new Map<string, Set<string>>();
    for (const e of enrollmentsAllQ.data ?? []) {
      if (!e.contact_id || !e.sequence_id) continue;
      let set = seqIdsByContact.get(e.contact_id);
      if (!set) { set = new Set(); seqIdsByContact.set(e.contact_id, set); }
      set.add(e.sequence_id);
    }

    // Snooze per contatto (contact_id → snoozed_until). La query porta solo le
    // righe ancora nel futuro; le scadute non compaiono → snoozedUntil resta null.
    const snoozeByContact = new Map<string, string>();
    for (const s of snoozeStateQ.data ?? []) {
      if (s.contact_id && s.snoozed_until) snoozeByContact.set(s.contact_id, s.snoozed_until);
    }

    const list = Array.from(groups.values());
    for (const conv of list) {
      const inN = inCount.get(conv.key) ?? 0;
      conv.archived = inN > 0 && (archivedCount.get(conv.key) ?? 0) === inN;
      // Messaggi del thread in ordine cronologico ASC (il più recente in fondo).
      conv.messages.sort((a, b) => new Date(a.at ?? 0).getTime() - new Date(b.at ?? 0).getTime());
      const last = conv.messages[conv.messages.length - 1];
      conv.lastAt = last?.at ?? null;
      conv.lastSnippet = last
        ? (last.direction === "out" ? "Tu: " : "") + (last.body ? stripHtml(last.body).slice(0, 140) : "—")
        : "—";
      // Intent dell'ultima risposta in arrivo (non delle inviate).
      const lastIn = [...conv.messages].reverse().find((m) => m.direction === "in" && m.intent);
      conv.lastIntent = lastIn?.intent ?? null;
      // Sequenze del contatto collegato (vuote per le email sciolte).
      const cid = conv.contact?.id ?? null;
      const seqSet = cid ? seqIdsByContact.get(cid) : undefined;
      if (seqSet && seqSet.size > 0) {
        conv.sequenceIds = [...seqSet];
        conv.sequenceNames = conv.sequenceIds.map((id) => seqNameById.get(id) ?? "Sequenza");
      }
      // Posticipata: solo le conversazioni con contatto collegato hanno uno stato snooze.
      conv.snoozedUntil = cid ? snoozeByContact.get(cid) ?? null : null;
    }
    // Conversazioni ordinate per ultima attività desc.
    list.sort((a, b) => new Date(b.lastAt ?? 0).getTime() - new Date(a.lastAt ?? 0).getTime());
    return list;
  }, [sentQ.data, repliesQ.data, contactsQ.data, enrollmentsAllQ.data, sequencesQ.data, snoozeStateQ.data]);

  const counts = useMemo(() => ({
    // Solo conversazioni attive (non interamente archiviate, non posticipate) per i
    // contatori di testata: le posticipate sono nascoste dalle viste normali e
    // hanno un proprio contatore dedicato.
    interested: conversations.filter((c) => !c.archived && !c.snoozedUntil && c.lastIntent === "interested").length,
    unread: conversations.filter((c) => !c.archived && !c.snoozedUntil && c.unread).length,
    read: conversations.filter((c) => !c.archived && !c.snoozedUntil && c.hasRead).length,
    snoozed: conversations.filter((c) => !c.archived && !!c.snoozedUntil).length,
    archived: conversations.filter((c) => c.archived).length,
  }), [conversations]);

  // Conversazioni NON LETTE per casella (badge nel pannello sinistro del client).
  // Le posticipate non contano: sono fuori dalle viste normali finché scadono.
  const unreadBySender = useMemo(() => {
    const m = new Map<string, number>();
    for (const conv of conversations) {
      if (conv.archived || conv.snoozedUntil || !conv.unread) continue;
      for (const id of conv.senderAccountIds) m.set(id, (m.get(id) ?? 0) + 1);
    }
    return m;
  }, [conversations]);

  // Opzioni del dropdown "Filtra per sequenza/campagna": sequenze attive +
  // qualsiasi sequenza che abbia almeno una conversazione (così se una campagna
  // è stata messa in pausa/archiviata ma ha ancora thread, resta filtrabile).
  // Ordinate per nome, deduplicate.
  const sequenceOptions = useMemo<SequenceOption[]>(() => {
    const seqs = sequencesQ.data ?? [];
    const withConv = new Set<string>();
    for (const conv of conversations) for (const id of conv.sequenceIds) withConv.add(id);
    const out = new Map<string, string>();
    for (const s of seqs) {
      if (s.status === "active" || withConv.has(s.id)) out.set(s.id, s.name);
    }
    return [...out.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "it"));
  }, [sequencesQ.data, conversations]);

  const isLoading = sentQ.isLoading || repliesQ.isLoading || contactsQ.isLoading;
  const errored = sentQ.error || repliesQ.error;
  const tableMissing =
    (sentQ.error && isMissingTableError(sentQ.error)) ||
    (repliesQ.error && isMissingTableError(repliesQ.error));

  /**
   * Filtro stato + ricerca + casella + sequenza + data, riusabile da entrambi i
   * componenti. `sequenceId`/`dateFilter` sono opzionali (back-compat con l'inbox
   * compatta che passa solo i primi argomenti).
   */
  const filterConversations = (
    convs: Conversation[],
    filter: StatusFilter,
    search: string,
    senderId?: string | null,
    sequenceId?: string | null,
    dateFilter: DateFilter = "all",
  ): Conversation[] => {
    const q = search.trim().toLowerCase();
    const floor = dateFilterFloor(dateFilter);
    return convs.filter((conv) => {
      // Le conversazioni interamente archiviate appaiono solo sotto il filtro "Archiviate".
      if (filter === "archived") { if (!conv.archived) return false; }
      else if (conv.archived) return false;
      // Le posticipate (snoozed_until > now) appaiono SOLO sotto "Posticipate" e
      // sono nascoste da tutte le altre viste finché l'ora non passa.
      if (filter === "snoozed") { if (!conv.snoozedUntil) return false; }
      else if (filter !== "archived" && conv.snoozedUntil) return false;
      if (filter === "interested" && conv.lastIntent !== "interested") return false;
      if (filter === "unread" && !conv.unread) return false;
      // Filtro casella: la conversazione deve aver usato la casella selezionata.
      if (senderId && !conv.senderAccountIds.includes(senderId)) return false;
      // Filtro sequenza/campagna: il contatto deve essere iscritto a quella sequenza.
      if (sequenceId && !conv.sequenceIds.includes(sequenceId)) return false;
      // Filtro data: l'ultima attività deve cadere dentro la finestra scelta.
      if (floor != null) {
        const t = conv.lastAt ? new Date(conv.lastAt).getTime() : 0;
        if (!(t >= floor)) return false;
      }
      if (q) {
        const name = contactName(conv.contact, conv.email).toLowerCase();
        const email = (conv.contact?.email || conv.email || "").toLowerCase();
        if (!name.includes(q) && !email.includes(q)) return false;
      }
      return true;
    });
  };

  return {
    // dati
    conversations,
    counts,
    sendersById,
    senders: sendersQ.data ?? [],
    unreadBySender,
    sequenceOptions,
    // stato query
    isLoading,
    errored,
    tableMissing,
    // mutazioni
    markRead,
    markAllRead,
    archiveRead,
    setIntent,
    snoozeConversation,
    unsnooze,
    // helper
    filterConversations,
    signatureForSender,
    queryClient: qc,
  };
}

/**
 * useLeadContext — contesto laterale del lead per il client Posta.
 *
 * Dato il contatto selezionato, carica le sue iscrizioni (outreach_enrollments)
 * con il nome della sequenza e verifica se l'email è in blocklist
 * (email_suppressions). Le mini-stats (inviate/risposte/ultima attività) arrivano
 * già pronte dalla Conversation, quindi qui non servono altre query. Disabilitato
 * quando manca il contatto (conversazione senza lead collegato).
 */
export function useLeadContext(
  companyId: string,
  contact: ContactRow | null,
  conversation: { sentCount: number; replyCount: number; lastAt: string | null } | null,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const contactId = contact?.id ?? null;
  const email = (contact?.email ?? "").trim().toLowerCase();

  const enrollmentsQ = useQuery({
    queryKey: ["outreach-lead-enrollments", companyId, contactId],
    enabled: !!contactId,
    retry: false,
    queryFn: async () => {
      const { data, error } = await db
        .from(T_ENROLLMENTS)
        .select("id,sequence_id,status,current_step,next_action_at,created_at")
        .eq("company_id", companyId)
        .eq("contact_id", contactId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as Array<{
        id: string; sequence_id: string; status: string;
        current_step: number; next_action_at: string | null; created_at: string;
      }>;
      // Nomi sequenza in un colpo solo (evita N+1).
      const seqIds = [...new Set(rows.map((r) => r.sequence_id).filter(Boolean))];
      const nameById = new Map<string, string>();
      if (seqIds.length) {
        const { data: seqs } = await db
          .from(T_SEQUENCES).select("id,name").in("id", seqIds);
        for (const s of (seqs ?? []) as Array<{ id: string; name: string }>) nameById.set(s.id, s.name);
      }
      return rows.map<LeadSequence>((r) => ({
        enrollmentId: r.id,
        sequenceId: r.sequence_id,
        sequenceName: nameById.get(r.sequence_id) ?? null,
        status: r.status,
        currentStep: r.current_step,
        nextActionAt: r.next_action_at,
      }));
    },
  });

  // In blocklist? email_normalized è generata da `email`: confrontiamo su quello.
  const suppressionQ = useQuery({
    queryKey: ["outreach-lead-suppressed", companyId, email],
    enabled: !!email,
    retry: false,
    queryFn: async () => {
      const { data, error } = await db
        .from(T_SUPPRESSIONS)
        .select("id")
        .eq("email_normalized", email)
        .or(`company_id.eq.${companyId},company_id.is.null`)
        .limit(1);
      if (error) throw error;
      return (data ?? []).length > 0;
    },
  });

  const context = useMemo<LeadContext | null>(() => {
    if (!contact) return null;
    return {
      contact,
      sequences: enrollmentsQ.data ?? [],
      suppressed: (suppressionQ.data ?? false) || !!contact.optout_email,
      sentCount: conversation?.sentCount ?? 0,
      replyCount: conversation?.replyCount ?? 0,
      lastActivityAt: conversation?.lastAt ?? contact.last_activity_at ?? null,
    };
  }, [contact, enrollmentsQ.data, suppressionQ.data, conversation]);

  return {
    context,
    isLoading: enrollmentsQ.isLoading || suppressionQ.isLoading,
    /** La sequenza "viva" più recente (per le azioni pausa/riprendi). */
    liveSequence: (enrollmentsQ.data ?? []).find((s) => isEnrollmentLive(s.status)) ?? null,
  };
}

/**
 * useLeadActions — mutazioni d'azione rapida sul lead selezionato: pausa/riprendi
 * sequenza, sopprimi (opt-out). La conversione lead→opportunità riusa il dialog
 * dedicato (OutreachConvertContactDialog), non serve duplicarla qui.
 *
 * Pausa = enrollment 'paused' + righe coda future 'queued' → 'cancelled' (il
 * dispatcher salta gli enrollment 'paused'; cancellare le righe ferma subito i
 * follow-up — STESSA operazione dell'auto-pausa server-side). Riprendi = riporta
 * l'enrollment ad 'active'; le nuove righe le riaccoda il dispatcher avanzando la
 * cadenza, ma per ripartire subito riaccodiamo lo step corrente.
 */
export function useLeadActions(companyId: string) {
  const qc = useQueryClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const invalidate = (contactId: string | null) => {
    qc.invalidateQueries({ queryKey: ["outreach-inbox-sent", companyId] });
    qc.invalidateQueries({ queryKey: ["outreach-inbox-replies", companyId] });
    qc.invalidateQueries({ queryKey: ["outreach-lead-enrollments", companyId, contactId] });
    qc.invalidateQueries({ queryKey: ["outreach-lead-suppressed", companyId] });
  };

  // Pausa TUTTE le sequenze vive del contatto (idempotente).
  const pauseSequence = useMutation({
    mutationFn: async (contactId: string) => {
      const { data: enrs, error: selErr } = await db
        .from(T_ENROLLMENTS)
        .select("id,status")
        .eq("company_id", companyId)
        .eq("contact_id", contactId)
        .eq("status", "active");
      if (selErr) throw selErr;
      const ids = ((enrs ?? []) as Array<{ id: string }>).map((e) => e.id);
      if (ids.length === 0) return { paused: 0 };
      const { error: updErr } = await db
        .from(T_ENROLLMENTS)
        .update({ status: "paused", next_action_at: null })
        .in("id", ids);
      if (updErr) throw updErr;
      // Ferma subito i follow-up già accodati ma non ancora spediti.
      const { error: qErr } = await db
        .from(T_SENT)
        .update({ status: "cancelled", last_error: "sequenza in pausa (manuale)" })
        .in("enrollment_id", ids)
        .eq("status", "queued");
      if (qErr) throw qErr;
      return { paused: ids.length };
    },
    onSuccess: (res, contactId) => {
      toast.success(res.paused > 0 ? "Sequenza messa in pausa" : "Nessuna sequenza attiva da mettere in pausa");
      invalidate(contactId);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Errore"),
  });

  // Riprendi: riporta le sequenze in pausa del contatto ad 'active' e riaccoda lo
  // step corrente così riparte subito (entro la finestra d'invio del dispatcher).
  const resumeSequence = useMutation({
    mutationFn: async (contactId: string) => {
      const { data: enrs, error: selErr } = await db
        .from(T_ENROLLMENTS)
        .select("id,sequence_id,current_step")
        .eq("company_id", companyId)
        .eq("contact_id", contactId)
        .eq("status", "paused");
      if (selErr) throw selErr;
      const rows = (enrs ?? []) as Array<{ id: string; sequence_id: string; current_step: number }>;
      if (rows.length === 0) return { resumed: 0 };
      const nowIso = new Date().toISOString();
      const { error: updErr } = await db
        .from(T_ENROLLMENTS)
        .update({ status: "active", next_action_at: nowIso })
        .in("id", rows.map((r) => r.id));
      if (updErr) throw updErr;
      // Dati contatto per la riga di coda.
      const { data: c } = await db
        .from(T_CONTACTS).select("id,email").eq("id", contactId).maybeSingle();
      const toEmail = (c as { email?: string } | null)?.email ?? null;
      // Step corrente di ciascuna sequenza → riaccoda una riga 'queued' se manca.
      for (const r of rows) {
        const { data: step } = await db
          .from("outreach_sequence_steps")
          .select("subject,body")
          .eq("sequence_id", r.sequence_id)
          .eq("step_order", r.current_step)
          .maybeSingle();
        // Non duplicare: salta se esiste già una riga 'queued' per quell'enrollment.
        const { data: pending } = await db
          .from(T_SENT).select("id").eq("enrollment_id", r.id).eq("status", "queued").limit(1);
        if (((pending ?? []) as unknown[]).length > 0) continue;
        await db.from(T_SENT).insert({
          company_id: companyId,
          enrollment_id: r.id,
          contact_id: contactId,
          channel: "email",
          to_email: toEmail,
          subject: (step as { subject?: string } | null)?.subject ?? "",
          body: (step as { body?: string } | null)?.body ?? "",
          status: "queued",
          scheduled_for: nowIso,
        });
      }
      return { resumed: rows.length };
    },
    onSuccess: (res, contactId) => {
      toast.success(res.resumed > 0 ? "Sequenza ripresa" : "Nessuna sequenza in pausa da riprendere");
      invalidate(contactId);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Errore"),
  });

  // Sopprimi (opt-out): blocklist email_suppressions + optout_email sul contatto +
  // pausa le sequenze vive. Coerente con l'opt-out automatico del reply-handler.
  const suppressContact = useMutation({
    mutationFn: async ({ contactId, email }: { contactId: string; email: string | null }) => {
      const nowIso = new Date().toISOString();
      const normalized = (email ?? "").trim().toLowerCase();
      if (normalized) {
        const { error: supErr } = await db
          .from(T_SUPPRESSIONS)
          .upsert(
            {
              email: normalized,
              company_id: companyId,
              reason: "unsubscribe",
              suppressed_at: nowIso,
              notes: "Opt-out manuale dalla Posta cold",
            },
            { onConflict: "company_id,email_normalized,reason", ignoreDuplicates: true },
          );
        if (supErr) throw supErr;
      }
      const { error: cErr } = await db
        .from(T_CONTACTS)
        .update({ optout_email: true, optout_at: nowIso, optout_reason: "manual" })
        .eq("id", contactId);
      if (cErr) throw cErr;
      // Ferma le sequenze vive (active|paused) → opted_out + annulla la coda.
      const { data: enrs } = await db
        .from(T_ENROLLMENTS)
        .select("id")
        .eq("company_id", companyId)
        .eq("contact_id", contactId)
        .in("status", ["active", "paused"]);
      const ids = ((enrs ?? []) as Array<{ id: string }>).map((e) => e.id);
      if (ids.length) {
        await db.from(T_ENROLLMENTS)
          .update({ status: "opted_out", next_action_at: null, stop_reason: "optout_email" })
          .in("id", ids);
        await db.from(T_SENT)
          .update({ status: "cancelled", last_error: "optout_email" })
          .in("enrollment_id", ids)
          .eq("status", "queued");
      }
    },
    onSuccess: (_res, vars) => {
      toast.success("Contatto soppresso: non riceverà più email cold");
      invalidate(vars.contactId);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Errore"),
  });

  return { pauseSequence, resumeSequence, suppressContact };
}

/**
 * useReplyComposer — stato + azioni del box risposta (Bozza AI + Invio),
 * condiviso tra inbox e client. Mantiene la textarea e gli stati di caricamento.
 */
export function useReplyComposer(companyId: string) {
  const qc = useQueryClient();
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [aiDrafting, setAiDrafting] = useState(false);
  const [summarizing, setSummarizing] = useState(false);

  // Invia la risposta DALLA stessa casella che ha contattato il prospect
  // (edge outreach-reply-send). Richiede il contact_id.
  const sendReply = async (contactId: string) => {
    const text = replyText.trim();
    if (!text) {
      toast.error("Scrivi una risposta prima di inviare");
      return;
    }
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("outreach-reply-send", {
        body: { contact_id: contactId, body: text.replace(/\n/g, "<br>") },
      });
      if (error) throw error;
      if (data && (data as { error?: string }).error) throw new Error((data as { error?: string }).error);
      toast.success("Risposta inviata");
      setReplyText("");
      qc.invalidateQueries({ queryKey: ["outreach-inbox-sent", companyId] });
      qc.invalidateQueries({ queryKey: ["outreach-inbox-replies", companyId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Invio non riuscito");
    } finally {
      setSending(false);
    }
  };

  // Genera una bozza con l'AI (edge outreach-ai-reply): ricostruisce il thread
  // lato server e mette il testo nella textarea, pronto da editare e inviare.
  const draftWithAi = async (contactId: string) => {
    setAiDrafting(true);
    try {
      const { data, error } = await supabase.functions.invoke("outreach-ai-reply", {
        body: { contact_id: contactId },
      });
      if (error) throw error;
      if (data && (data as { error?: string }).error) throw new Error((data as { error?: string }).error);
      const draft = (data as { draft?: string })?.draft?.trim();
      if (!draft) throw new Error("Nessuna bozza generata");
      setReplyText(draft);
      toast.success("Bozza generata — rivedila e invia");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Generazione bozza non riuscita");
    } finally {
      setAiDrafting(false);
    }
  };

  /**
   * Riepilogo AI della conversazione (edge outreach-ai-summary): manda il thread
   * già pronto dal client e ritorna { summary, intentHint, suggestedReply }, o
   * null in caso di errore. Best-effort lato edge (torna 200 con campi vuoti se
   * l'AI è giù); qui distinguiamo "non disponibile" (edge assente/non deployata)
   * con un toast soft, senza rompere la UI. Non tocca la textarea: è l'UI a
   * decidere quando inserire suggestedReply ("Usa come bozza").
   */
  const summarizeWithAi = async (messages: ThreadMsg[]): Promise<AiSummary | null> => {
    setSummarizing(true);
    try {
      const payload = messages.map((m) => ({
        direction: m.direction,
        subject: m.subject,
        body: m.body,
        intent: m.intent,
        at: m.at,
      }));
      const { data, error } = await supabase.functions.invoke("outreach-ai-summary", {
        body: { messages: payload },
      });
      if (error) throw error;
      const d = (data ?? {}) as { summary?: string; intent_hint?: string; suggested_reply?: string };
      const summary: AiSummary = {
        summary: (d.summary ?? "").trim(),
        intentHint: (d.intent_hint ?? "").trim(),
        suggestedReply: (d.suggested_reply ?? "").trim(),
      };
      if (!summary.summary && !summary.suggestedReply) {
        // 200 con campi vuoti: l'AI non ha prodotto nulla di utile (best-effort edge).
        toast.message("Riepilogo non disponibile al momento");
        return null;
      }
      return summary;
    } catch {
      // Edge non deployata o errore di rete: degrada con grazia, niente crash UI.
      toast.error("Riepilogo non disponibile");
      return null;
    } finally {
      setSummarizing(false);
    }
  };

  return { replyText, setReplyText, sending, aiDrafting, sendReply, draftWithAi, summarizing, summarizeWithAi };
}
