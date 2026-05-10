/**
 * EmailList — lista threads filtrati per cartella + account
 *
 * Renderizza una riga per thread:
 *   - Avatar from
 *   - From + counter messaggi nel thread
 *   - Subject + preview
 *   - Time relativo
 *   - Star toggle, attachment indicator, unread bold
 *
 * Mostra empty states diversi per cartella (Inbox vuoto vs Sent vuoto).
 */
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow, format, isToday, isYesterday } from "date-fns";
import { it } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Star, Paperclip, Inbox, Send, FileEdit, ShieldAlert, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EmailFilter } from "../EmailLayout";

interface ThreadRow {
  id: string;
  subject_normalized: string;
  last_subject: string | null;
  last_from_email: string | null;
  last_from_name: string | null;
  participants: string[];
  message_count: number;
  unread_count: number;
  has_starred: boolean;
  has_attachments: boolean;
  last_received_at: string;
  preview: string | null;
}

interface EmailListProps {
  filter: EmailFilter;
  selectedThreadId: string | null;
  onSelectThread: (threadId: string) => void;
}

function formatRelTime(d: string): string {
  const date = new Date(d);
  if (isToday(date)) return format(date, "HH:mm");
  if (isYesterday(date)) return "Ieri";
  const diff = Date.now() - date.getTime();
  if (diff < 7 * 24 * 3600 * 1000) return format(date, "EEE", { locale: it });
  return format(date, "d MMM", { locale: it });
}

function avatarInitial(name: string | null, email: string | null): string {
  const src = (name || email || "?").trim();
  return src.charAt(0).toUpperCase();
}

function avatarColor(seed: string | null): string {
  if (!seed) return "bg-slate-500";
  const hash = Array.from(seed).reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const colors = [
    "bg-rose-500", "bg-orange-500", "bg-amber-500", "bg-emerald-500",
    "bg-teal-500", "bg-sky-500", "bg-violet-500", "bg-fuchsia-500",
  ];
  return colors[hash % colors.length];
}

export function EmailList({ filter, selectedThreadId, onSelectThread }: EmailListProps) {
  const { user } = useAuth();
  const userId = user?.id;

  const { data: threads, isLoading } = useQuery({
    queryKey: ["email-threads", userId, filter],
    enabled: !!userId,
    refetchInterval: 30_000,
    queryFn: async () => {
      const isInbox = filter.folder.type === "system" && filter.folder.key === "inbox";
      const isStarred = filter.folder.type === "system" && filter.folder.key === "starred";
      const search = filter.search;
      const hasSearch = !!search && Object.keys(search).filter((k) => k !== "raw").length > 0;

      // Modalità: search attivo → query email_inbox + dedup per thread_id;
      // altrimenti → query v_my_email_threads.
      if (hasSearch && search) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let q = (supabase as any)
          .from("v_my_email_inbox")
          .select("thread_id, subject, from_email, from_name, received_at, attachments, is_read, is_starred, preview, message_count:thread_id")
          .order("received_at", { ascending: false })
          .limit(200);
        if (search.from)        q = q.ilike("from_email", `%${search.from}%`);
        if (search.to)          q = q.ilike("to_email", `%${search.to}%`);
        if (search.subject)     q = q.ilike("subject", `%${search.subject}%`);
        if (search.text)        q = q.or(`subject.ilike.%${search.text}%,from_email.ilike.%${search.text}%,from_name.ilike.%${search.text}%`);
        if (search.hasStar)     q = q.eq("is_starred", true);
        if (search.isUnread)    q = q.eq("is_read", false);
        if (search.before)      q = q.lt("received_at", new Date(search.before).toISOString());
        if (search.after)       q = q.gt("received_at", new Date(search.after).toISOString());
        const { data, error } = await q;
        if (error) throw error;
        // Dedup per thread_id, prendiamo il più recente
        const byThread = new Map<string, ThreadRow>();
        for (const m of (data ?? []) as Array<Record<string, unknown>>) {
          const tid = m.thread_id as string | null;
          if (!tid) continue;
          if (search.hasAttachment) {
            const at = m.attachments;
            if (!Array.isArray(at) || at.length === 0) continue;
          }
          if (!byThread.has(tid)) {
            byThread.set(tid, {
              id: tid,
              subject_normalized: (m.subject as string) ?? "",
              last_subject: (m.subject as string) ?? null,
              last_from_email: (m.from_email as string) ?? null,
              last_from_name: (m.from_name as string) ?? null,
              participants: [],
              message_count: 1,
              unread_count: m.is_read ? 0 : 1,
              has_starred: !!m.is_starred,
              has_attachments: Array.isArray(m.attachments) && m.attachments.length > 0,
              last_received_at: (m.received_at as string) ?? new Date().toISOString(),
              preview: (m.preview as string) ?? null,
            });
          }
        }
        return Array.from(byThread.values());
      }

      if (isInbox || isStarred) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let q = (supabase as any)
          .from("v_my_email_threads")
          .select("id, subject_normalized, last_subject, last_from_email, last_from_name, participants, message_count, unread_count, has_starred, has_attachments, last_received_at, preview")
          .order("last_received_at", { ascending: false })
          .limit(100);
        if (isStarred) q = q.eq("has_starred", true);
        const { data, error } = await q;
        if (error) throw error;
        return (data ?? []) as ThreadRow[];
      }
      return [] as ThreadRow[];
    },
  });

  const isEmpty = !isLoading && (threads?.length ?? 0) === 0;

  return (
    <ScrollArea className="flex-1">
      {isLoading ? (
        <div className="p-3 space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16" />)}
        </div>
      ) : isEmpty ? (
        <ListEmptyState filter={filter} />
      ) : (
        <div className="divide-y">
          {threads!.map((t) => (
            <ThreadRowItem
              key={t.id}
              thread={t}
              selected={t.id === selectedThreadId}
              onClick={() => onSelectThread(t.id)}
            />
          ))}
        </div>
      )}
    </ScrollArea>
  );
}

function ThreadRowItem({
  thread,
  selected,
  onClick,
}: {
  thread: ThreadRow;
  selected: boolean;
  onClick: () => void;
}) {
  const unread = thread.unread_count > 0;
  const senderLabel = thread.last_from_name || thread.last_from_email || "(sconosciuto)";
  const subject = thread.last_subject || thread.subject_normalized || "(senza oggetto)";
  const preview = thread.preview || "";

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full flex items-start gap-2.5 px-3 py-2.5 text-left transition-colors",
        selected ? "bg-violet-50 border-l-4 border-l-violet-500" : "hover:bg-muted/30 border-l-4 border-transparent",
      )}
    >
      <div
        className={cn(
          "h-8 w-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0",
          avatarColor(thread.last_from_email),
        )}
      >
        {avatarInitial(thread.last_from_name, thread.last_from_email)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className={cn("text-sm truncate", unread && "font-bold")}>
            {senderLabel}
          </p>
          {thread.message_count > 1 && (
            <span className="text-[10px] text-muted-foreground bg-muted rounded-full px-1.5">
              {thread.message_count}
            </span>
          )}
          <span className="ml-auto text-[10px] text-muted-foreground shrink-0">
            {formatRelTime(thread.last_received_at)}
          </span>
        </div>
        <p className={cn("text-xs truncate mt-0.5", unread ? "font-semibold" : "text-muted-foreground")}>
          {subject}
        </p>
        {preview && (
          <p className="text-[11px] text-muted-foreground/70 truncate mt-0.5">
            {preview}
          </p>
        )}
        <div className="flex items-center gap-1 mt-1">
          {thread.has_starred && <Star className="h-3 w-3 fill-amber-400 text-amber-400" />}
          {thread.has_attachments && <Paperclip className="h-3 w-3 text-muted-foreground" />}
          {unread && (
            <span className="ml-auto h-1.5 w-1.5 rounded-full bg-violet-500" />
          )}
        </div>
      </div>
    </button>
  );
}

function ListEmptyState({ filter }: { filter: EmailFilter }) {
  const isInbox = filter.folder.type === "system" && filter.folder.key === "inbox";
  const isStarred = filter.folder.type === "system" && filter.folder.key === "starred";
  const isSent = filter.folder.type === "system" && filter.folder.key === "sent";
  const isDrafts = filter.folder.type === "system" && filter.folder.key === "drafts";
  const isSpam = filter.folder.type === "system" && filter.folder.key === "spam";
  const isTrash = filter.folder.type === "system" && filter.folder.key === "trash";

  let icon: React.ComponentType<{ className?: string }> = Inbox;
  let title = "Nessun thread";
  let desc = "";

  if (isInbox) {
    icon = Inbox;
    title = "Inbox vuota";
    desc = "Nessun messaggio in attesa. Le nuove email arriveranno qui ogni 10 minuti dopo il polling.";
  } else if (isStarred) {
    icon = Star;
    title = "Nessun thread importante";
    desc = "Aggiungi una stella ai messaggi importanti per ritrovarli qui rapidamente.";
  } else if (isSent) {
    icon = Send;
    title = "Inviati (in arrivo Sprint E3)";
    desc = "I messaggi che invierai finiranno qui. La UI compose arriva nello Sprint E3.";
  } else if (isDrafts) {
    icon = FileEdit;
    title = "Bozze (in arrivo Sprint E3)";
    desc = "Le bozze auto-salvate compariranno qui quando attiveremo la compose.";
  } else if (isSpam) {
    icon = ShieldAlert;
    title = "Nessun spam";
    desc = "L'AI di triage filtrerà spam evidenti automaticamente.";
  } else if (isTrash) {
    icon = Trash2;
    title = "Cestino vuoto";
  }

  const Icon = icon;
  return (
    <div className="p-8 text-center">
      <div className="mx-auto h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
        <Icon className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium">{title}</p>
      {desc && <p className="text-xs text-muted-foreground mt-1 max-w-[280px] mx-auto">{desc}</p>}
    </div>
  );
}
