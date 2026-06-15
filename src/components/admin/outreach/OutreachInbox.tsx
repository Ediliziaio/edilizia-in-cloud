import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import {
  Inbox, Mail, Search, ChevronLeft, MessageSquare, AlertTriangle, Building2, Send, Loader2, Wand2, CheckCheck, Archive,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";
import { isMissingTableError, MigrationGate } from "./_shared";

/**
 * Inbox conversazioni dell'Outreach Engine — vista client-email per contatto.
 * Unisce le email INVIATE (outreach_send_queue, status='sent') e le RISPOSTE
 * in arrivo (outreach_replies) in un thread per ciascun contatto: lista a
 * sinistra, conversazione a destra. Sostituisce la vecchia OutreachReplyInbox
 * nella scheda "Oggi". Gate finché la migrazione outreach non è applicata.
 *
 * Colonne reali (migrazione 20270815000000 / 20270816000000):
 *   outreach_send_queue: id, contact_id, to_email, subject, body, sent_at, sender_account_id, status
 *   outreach_replies:    id, contact_id, from_email, subject, snippet, received_at, status, intent, message_id(raw)
 *   marketing_contacts:  id, first_name, last_name, company_name, email
 */

const T_SENT = "outreach_send_queue";
const T_REPLIES = "outreach_replies";
const T_CONTACTS = "marketing_contacts";

// Etichette intento (Unibox NLP) — riuso della mappa di OutreachReplyInbox.
const INTENT_META: Record<string, { label: string; cls: string }> = {
  interested: { label: "Interessato", cls: "border-green-200 bg-green-100 text-green-700" },
  question: { label: "Domanda", cls: "border-blue-200 bg-blue-100 text-blue-700" },
  not_interested: { label: "Non interessato", cls: "border-red-200 bg-red-100 text-red-700" },
  unsubscribe: { label: "Disiscrizione", cls: "border-red-200 bg-red-100 text-red-700" },
  out_of_office: { label: "Fuori sede", cls: "border-amber-200 bg-amber-100 text-amber-700" },
  auto_reply: { label: "Auto-risposta", cls: "bg-muted text-muted-foreground" },
  other: { label: "Altro", cls: "bg-muted text-muted-foreground" },
};

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

interface ContactRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  email: string | null;
}

interface ThreadMsg {
  id: string;
  direction: "out" | "in";
  subject: string | null;
  /** HTML per le inviate (nostre), testo grezzo per le risposte. */
  body: string | null;
  at: string | null;
  intent: string | null;
}

interface Conversation {
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
}

const UNREAD = "unread";
const READ = "read";
const ARCHIVED = "archived";

function contactName(c: ContactRow | null, email: string | null): string {
  if (c) {
    const full = `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim();
    if (full) return full;
    if (c.company_name) return c.company_name;
    if (c.email) return c.email;
  }
  return email || "Contatto sconosciuto";
}

function iniziali(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function relativeTime(iso: string | null): string {
  if (!iso) return "";
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: it });
  } catch {
    return "";
  }
}

function fullTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(d);
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function OutreachInbox({ companyId }: { companyId: string }) {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"all" | "interested" | "unread" | "archived">("all");
  const [search, setSearch] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [aiDrafting, setAiDrafting] = useState(false);

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

  const markRead = useMutation({
    mutationFn: async (contactId: string) => {
      const { error } = await db
        .from(T_REPLIES)
        .update({ status: "read" })
        .eq("company_id", companyId)
        .eq("contact_id", contactId)
        .eq("status", UNREAD);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["outreach-inbox-replies", companyId] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Errore"),
  });

  // Azione bulk: tutte le risposte non lette dell'azienda → lette.
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

  // Azione bulk: tutte le risposte lette dell'azienda → archiviate (escono dalla lista di default).
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
        };
        groups.set(key, conv);
      } else if (!conv.email && email) {
        conv.email = email;
      }
      return conv;
    };

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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return conversations.filter((conv) => {
      // Le conversazioni interamente archiviate appaiono solo sotto il filtro "Archiviate".
      if (filter === "archived") { if (!conv.archived) return false; }
      else if (conv.archived) return false;
      if (filter === "interested" && conv.lastIntent !== "interested") return false;
      if (filter === "unread" && !conv.unread) return false;
      if (q) {
        const name = contactName(conv.contact, conv.email).toLowerCase();
        const email = (conv.contact?.email || conv.email || "").toLowerCase();
        if (!name.includes(q) && !email.includes(q)) return false;
      }
      return true;
    });
  }, [conversations, filter, search]);

  const selected = useMemo(
    () => conversations.find((c) => c.key === selectedKey) ?? null,
    [conversations, selectedKey],
  );

  // Apre la conversazione e segna lette le sue risposte non lette (handler onClick:
  // niente setState-in-effect → nessun warning React Compiler). Svuota la bozza
  // di risposta al cambio conversazione.
  const handleSelect = (conv: Conversation) => {
    setSelectedKey(conv.key);
    setReplyText("");
    if (conv.unread && conv.contact?.id) markRead.mutate(conv.contact.id);
  };

  // Invia la risposta DALLA stessa casella che ha contattato il prospect
  // (edge outreach-reply-send). Richiede il contact_id: per le conversazioni
  // raggruppate-per-email senza contatto il box non viene mostrato.
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

  // Genera una bozza di risposta con l'AI (edge outreach-ai-reply): ricostruisce
  // il thread col prospect lato server e mette il testo nella textarea, pronto da
  // editare e inviare. Richiede il contact_id (box mostrato solo se presente).
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

  const isLoading = sentQ.isLoading || repliesQ.isLoading || contactsQ.isLoading;
  const errored = sentQ.error || repliesQ.error;
  const tableMissing =
    (sentQ.error && isMissingTableError(sentQ.error)) ||
    (repliesQ.error && isMissingTableError(repliesQ.error));

  if (tableMissing) {
    return (
      <MigrationGate
        title="Inbox conversazioni — pronta"
        unlocks={[
          "Ogni contatto con il suo thread: tutte le email inviate e le risposte in un colpo d'occhio.",
          "Lista a sinistra, conversazione a destra — come un vero client email.",
          "Filtra per interessati o non letti e lavora prima le trattative calde.",
        ]}
      />
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-[560px] overflow-hidden rounded-xl border bg-card">
        <div className="w-full space-y-2 border-r p-3 md:w-[340px]">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex gap-3 p-2">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="flex-1 space-y-2"><Skeleton className="h-3 w-2/3" /><Skeleton className="h-3 w-1/2" /></div>
            </div>
          ))}
        </div>
        <div className="hidden flex-1 items-center justify-center md:flex">
          <Skeleton className="h-40 w-2/3 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (errored) {
    return (
      <div className="flex items-center gap-2 rounded-xl border bg-card p-4 text-sm text-red-600">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        Errore nel caricamento: {errored instanceof Error ? errored.message : "imprevisto"}
      </div>
    );
  }

  return (
    <div className="flex h-[560px] overflow-hidden rounded-xl border bg-card">
      {/* ═══ Lista conversazioni ═══ */}
      <aside className={cn(
        "flex w-full flex-col border-r bg-background md:w-[340px] md:min-w-[300px]",
        selected ? "hidden md:flex" : "flex",
      )}>
        <div className="border-b p-3">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <Inbox className="h-4 w-4 text-orange-500" /> Conversazioni
            {counts.unread > 0 && <Badge className="bg-orange-500">{counts.unread}</Badge>}
          </h2>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cerca nome o email…"
              aria-label="Cerca conversazione"
              className="h-9 pl-8"
            />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1">
            {([
              { k: "all", label: "Tutte" },
              { k: "interested", label: "Interessati", count: counts.interested },
              { k: "unread", label: "Non lette", count: counts.unread },
              { k: "archived", label: "Archiviate", count: counts.archived },
            ] as const).map((f) => (
              <button
                key={f.k}
                type="button"
                onClick={() => setFilter(f.k)}
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors",
                  filter === f.k ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70",
                )}
              >
                {f.label}
                {"count" in f && f.count > 0 && (
                  <span className="ml-1 rounded-full bg-background/20 px-1 tabular-nums">{f.count}</span>
                )}
              </button>
            ))}
          </div>
          {(counts.unread > 0 || counts.read > 0) && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {counts.unread > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1 text-[11px]"
                  disabled={markAllRead.isPending}
                  onClick={() => markAllRead.mutate()}
                  title="Segna come lette tutte le risposte non lette"
                >
                  {markAllRead.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCheck className="h-3 w-3" />}
                  Segna tutte lette
                </Button>
              )}
              {counts.read > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1 text-[11px]"
                  disabled={archiveRead.isPending}
                  onClick={() => archiveRead.mutate()}
                  title="Archivia le conversazioni le cui risposte sono già state lette"
                >
                  {archiveRead.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Archive className="h-3 w-3" />}
                  Archivia lette
                </Button>
              )}
            </div>
          )}
        </div>

        <ScrollArea className="flex-1">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              <Inbox className="mx-auto mb-2 h-5 w-5 opacity-50" />
              {conversations.length === 0
                ? "Nessuna conversazione ancora. Le email inviate e le risposte compaiono qui."
                : "Nessuna conversazione per questo filtro."}
            </div>
          ) : (
            <ul className="divide-y">
              {filtered.map((conv) => {
                const name = contactName(conv.contact, conv.email);
                const company = conv.contact?.company_name;
                const active = conv.key === selectedKey;
                const intentMeta = conv.lastIntent ? INTENT_META[conv.lastIntent] : null;
                return (
                  <li key={conv.key}>
                    <button
                      onClick={() => handleSelect(conv)}
                      className={cn(
                        "flex w-full gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/60",
                        active && "bg-muted",
                      )}
                    >
                      <div className="relative shrink-0">
                        <Avatar className="h-10 w-10">
                          <AvatarFallback className="bg-primary/10 text-xs text-primary">{iniziali(name)}</AvatarFallback>
                        </Avatar>
                        {conv.unread && (
                          <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full bg-orange-500 ring-2 ring-background" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className={cn("truncate text-sm", conv.unread ? "font-semibold" : "font-medium")}>{name}</span>
                          <span className="shrink-0 text-[10px] text-muted-foreground">{relativeTime(conv.lastAt)}</span>
                        </div>
                        {company && (
                          <div className="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                            <Building2 className="h-3 w-3 shrink-0" />{company}
                          </div>
                        )}
                        <div className="mt-0.5 flex items-center justify-between gap-2">
                          <span className="truncate text-xs text-muted-foreground">{conv.lastSnippet}</span>
                          {intentMeta && (
                            <Badge variant="outline" className={cn("shrink-0 text-[10px]", intentMeta.cls)}>{intentMeta.label}</Badge>
                          )}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
      </aside>

      {/* ═══ Thread ═══ */}
      <section
        key={selectedKey ?? "vuota"}
        className={cn(
          "flex min-w-0 flex-1 flex-col bg-muted/20",
          selected ? "flex max-md:animate-in max-md:slide-in-from-right-4 max-md:fade-in-0 max-md:duration-200" : "hidden md:flex",
        )}
      >
        {!selected ? (
          <div className="flex flex-1 items-center justify-center p-8 text-center text-muted-foreground">
            <div>
              <MessageSquare className="mx-auto mb-3 h-10 w-10 opacity-30" />
              <p className="text-sm">Seleziona una conversazione.</p>
            </div>
          </div>
        ) : (
          <>
            <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-background px-3 sm:px-4">
              <Button variant="ghost" size="icon" className="-ml-1 md:hidden" aria-label="Torna alla lista" onClick={() => setSelectedKey(null)}>
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <Avatar className="h-9 w-9">
                <AvatarFallback className="bg-primary/10 text-xs text-primary">{iniziali(contactName(selected.contact, selected.email))}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{contactName(selected.contact, selected.email)}</div>
                <div className="flex items-center gap-3 truncate text-xs text-muted-foreground">
                  {(selected.contact?.email || selected.email) && (
                    <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" />{selected.contact?.email || selected.email}</span>
                  )}
                  {selected.contact?.company_name && (
                    <span className="inline-flex items-center gap-1"><Building2 className="h-3 w-3" />{selected.contact.company_name}</span>
                  )}
                </div>
              </div>
            </header>

            <ScrollArea className="flex-1 px-3 py-4 sm:px-4">
              <div className="mx-auto max-w-3xl space-y-3">
                {selected.messages.map((m, i) => {
                  const out = m.direction === "out";
                  const prev = selected.messages[i - 1];
                  // Mostra l'oggetto solo se cambia rispetto al messaggio precedente.
                  const showSubject = !!m.subject && m.subject !== prev?.subject;
                  const intentMeta = m.intent ? INTENT_META[m.intent] : null;
                  return (
                    <div key={m.id} className={cn("flex", out ? "justify-end" : "justify-start")}>
                      <div className={cn(
                        "max-w-[85%] rounded-2xl border px-3.5 py-2 shadow-sm",
                        out ? "border-primary/20 bg-primary/10" : "bg-background",
                      )}>
                        <div className="mb-1 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          <Mail className="h-3 w-3" />
                          {out ? "Inviata" : "Risposta"}
                          {intentMeta && (
                            <Badge variant="outline" className={cn("ml-1 px-1 py-0 text-[9px] normal-case", intentMeta.cls)}>{intentMeta.label}</Badge>
                          )}
                        </div>
                        {showSubject && <div className="mb-1 text-sm font-semibold">{m.subject}</div>}
                        {out ? (
                          // Inviate: corpo HTML nostro → render fedele.
                          <div
                            className="prose prose-sm max-w-none break-words text-sm [&_a]:text-primary [&_p]:my-1"
                            dangerouslySetInnerHTML={{ __html: m.body || "—" }}
                          />
                        ) : (
                          // Risposte: testo/snippet grezzo → niente HTML non fidato.
                          <p className="whitespace-pre-wrap break-words text-sm">{m.body || "—"}</p>
                        )}
                        <div className="mt-1 text-right text-[10px] text-muted-foreground">{fullTime(m.at)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>

            {/* ═══ Box risposta 2-vie ═══ */}
            {selected.contact?.id ? (
              <div className="shrink-0 border-t bg-background p-3 sm:px-4">
                <Textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Scrivi una risposta… verrà inviata dalla stessa casella che ha contattato il prospect."
                  aria-label="Testo della risposta"
                  rows={3}
                  className="resize-none text-sm"
                  disabled={sending || aiDrafting}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !sending && replyText.trim()) {
                      e.preventDefault();
                      void sendReply(selected.contact!.id);
                    }
                  }}
                />
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-muted-foreground">⌘/Ctrl + Invio per inviare</span>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void draftWithAi(selected.contact!.id)}
                      disabled={sending || aiDrafting}
                      className="gap-1.5"
                      title="L'AI legge la conversazione e propone una risposta da rivedere"
                    >
                      {aiDrafting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                      {aiDrafting ? "Scrivo…" : "Bozza AI"}
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => void sendReply(selected.contact!.id)}
                      disabled={sending || aiDrafting || !replyText.trim()}
                      className="gap-1.5"
                    >
                      {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      {sending ? "Invio…" : "Invia risposta"}
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="shrink-0 border-t bg-background px-4 py-3 text-[11px] text-muted-foreground">
                Conversazione senza contatto collegato — rispondi dal tuo client email.
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
