import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";
import { isMissingTableError } from "./_shared";

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
}

interface SentRow {
  id: string;
  contact_id: string | null;
  to_email: string | null;
  subject: string | null;
  body: string | null;
  sent_at: string | null;
  sender_account_id: string | null;
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
}

export interface ThreadMsg {
  id: string;
  direction: "out" | "in";
  subject: string | null;
  /** HTML per le inviate (nostre), testo grezzo per le risposte. */
  body: string | null;
  at: string | null;
  intent: string | null;
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
}

export type StatusFilter = "all" | "interested" | "unread" | "archived";

const UNREAD = "unread";
const READ = "read";
const ARCHIVED = "archived";

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

  const sentQ = useQuery({
    queryKey: ["outreach-inbox-sent", companyId],
    retry: false,
    queryFn: async () => {
      const { data, error } = await db
        .from(T_SENT)
        .select("id,contact_id,to_email,subject,body,sent_at,sender_account_id")
        .eq("company_id", companyId)
        .eq("status", "sent")
        .order("sent_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as SentRow[];
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
        .select("id,first_name,last_name,company_name,email")
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
        .select("id,email,provider,status")
        .eq("company_id", companyId)
        .order("email");
      if (error) throw error;
      return (data ?? []) as SenderRow[];
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

  // Bulk: tutte le risposte non lette dell'azienda → lette.
  const markAllRead = useMutation({
    mutationFn: async () => {
      const { error } = await db
        .from(T_REPLIES)
        .update({ status: READ })
        .eq("company_id", companyId)
        .eq("status", UNREAD);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Tutte le risposte segnate come lette");
      qc.invalidateQueries({ queryKey: ["outreach-inbox-replies", companyId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Errore"),
  });

  // Bulk: tutte le risposte lette dell'azienda → archiviate (escono dalla lista di default).
  const archiveRead = useMutation({
    mutationFn: async () => {
      const { error } = await db
        .from(T_REPLIES)
        .update({ status: ARCHIVED })
        .eq("company_id", companyId)
        .eq("status", READ);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Conversazioni lette archiviate");
      qc.invalidateQueries({ queryKey: ["outreach-inbox-replies", companyId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Errore"),
  });

  const sendersById = useMemo(
    () => new Map((sendersQ.data ?? []).map((s) => [s.id, s])),
    [sendersQ.data],
  );

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
      conv.messages.push({
        id: `s:${s.id}`,
        direction: "out",
        subject: s.subject,
        body: s.body,
        at: s.sent_at,
        intent: null,
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
    }
    // Conversazioni ordinate per ultima attività desc.
    list.sort((a, b) => new Date(b.lastAt ?? 0).getTime() - new Date(a.lastAt ?? 0).getTime());
    return list;
  }, [sentQ.data, repliesQ.data, contactsQ.data]);

  const counts = useMemo(() => ({
    // Solo conversazioni attive (non interamente archiviate) per i contatori di testata.
    interested: conversations.filter((c) => !c.archived && c.lastIntent === "interested").length,
    unread: conversations.filter((c) => !c.archived && c.unread).length,
    read: conversations.filter((c) => !c.archived && c.hasRead).length,
    archived: conversations.filter((c) => c.archived).length,
  }), [conversations]);

  const isLoading = sentQ.isLoading || repliesQ.isLoading || contactsQ.isLoading;
  const errored = sentQ.error || repliesQ.error;
  const tableMissing =
    (sentQ.error && isMissingTableError(sentQ.error)) ||
    (repliesQ.error && isMissingTableError(repliesQ.error));

  /** Filtro stato + ricerca testuale, riusabile da entrambi i componenti. */
  const filterConversations = (
    convs: Conversation[],
    filter: StatusFilter,
    search: string,
    senderId?: string | null,
  ): Conversation[] => {
    const q = search.trim().toLowerCase();
    return convs.filter((conv) => {
      // Le conversazioni interamente archiviate appaiono solo sotto il filtro "Archiviate".
      if (filter === "archived") { if (!conv.archived) return false; }
      else if (conv.archived) return false;
      if (filter === "interested" && conv.lastIntent !== "interested") return false;
      if (filter === "unread" && !conv.unread) return false;
      // Filtro casella: la conversazione deve aver usato la casella selezionata.
      if (senderId && !conv.senderAccountIds.includes(senderId)) return false;
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
    // stato query
    isLoading,
    errored,
    tableMissing,
    // mutazioni
    markRead,
    markAllRead,
    archiveRead,
    // helper
    filterConversations,
    queryClient: qc,
  };
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

  return { replyText, setReplyText, sending, aiDrafting, sendReply, draftWithAi };
}
