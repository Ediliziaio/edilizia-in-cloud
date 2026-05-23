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
import { useInfiniteQuery } from "@tanstack/react-query";
import { format, isToday, isYesterday } from "date-fns";
import { it } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Star, Paperclip, Inbox, Send, FileEdit, ShieldAlert, Trash2, AlertTriangle, ChevronDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EmailFilter, EmailSmartCategory } from "../EmailLayout";
import { categoryMatchesPrediction, predictEmailReconciliation } from "../lib/predictiveReconciliation";

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
  ai_category: string | null;
  ai_priority: string | null;
}

interface EmailListProps {
  filter: EmailFilter;
  selectedThreadId: string | null;
  onSelectThread: (threadId: string) => void;
}

interface ThreadPage {
  threads: ThreadRow[];
  totalCount: number | null;
  hasMore: boolean;
  nextOffset: number;
  source: "rpc" | "fallback";
}

const THREAD_PAGE_SIZE = 50;
const FALLBACK_RAW_PAGE_SIZE = 300;

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

function isHighPriority(priority: string | null | undefined): boolean {
  return priority === "alta" || priority === "high";
}

function mergePriority(current: string | null, next: unknown): string | null {
  const incoming = typeof next === "string" ? next : null;
  if (isHighPriority(current) || isHighPriority(incoming)) return "alta";
  if (current === "media" || incoming === "media" || incoming === "medium") return "media";
  if (current === "bassa" || incoming === "bassa" || incoming === "low") return "bassa";
  return current ?? incoming;
}

function categoryValues(category: EmailSmartCategory): string[] {
  switch (category) {
    case "lead":
      return ["lead", "lead_new", "lead_followup"];
    case "quote":
      return ["quote_request", "preventivo", "richiesta_preventivo"];
    case "customer":
      return ["cliente_esistente", "customer"];
    case "supplier":
      return ["fornitore", "supplier", "ddt"];
    case "invoice":
      return ["fattura", "invoice"];
    case "admin":
      return ["pratica_amministrativa", "admin", "documento_amministrativo"];
    case "support":
      return ["support", "assistenza", "ticket"];
    case "spam":
      return ["spam"];
    case "other":
      return ["altro", "other"];
    case "priority":
      return [];
  }
}

function categoryLabel(category: string | null | undefined): string | null {
  switch (category) {
    case "lead":
    case "lead_new":
    case "lead_followup":
      return "Lead";
    case "quote_request":
    case "quote":
    case "preventivo":
    case "richiesta_preventivo":
      return "Preventivo";
    case "cliente_esistente":
    case "customer":
      return "Cliente";
    case "fornitore":
    case "supplier":
    case "ddt":
      return "Fornitore";
    case "fattura":
    case "invoice":
      return "Fattura";
    case "pratica_amministrativa":
    case "admin":
    case "documento_amministrativo":
      return "Pratica";
    case "support":
    case "assistenza":
    case "ticket":
      return "Supporto";
    case "spam":
      return "Spam";
    case "altro":
    case "other":
      return "Altro";
    case "pending":
    case null:
    case undefined:
      return null;
    default:
      return category.replaceAll("_", " ");
  }
}

function hasEffectiveSearch(search: EmailFilter["search"]): boolean {
  if (!search) return false;
  return Object.entries(search).some(([key, value]) => key !== "raw" && value !== undefined && value !== null && value !== false && value !== "");
}

function safeText(value: string | undefined): string | null {
  const cleaned = value?.replace(/[,%()]/g, " ").replace(/\s+/g, " ").trim();
  return cleaned || null;
}

function toIsoOrNull(value: string | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function isRpcUnavailable(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as { code?: string; message?: string; details?: string };
  const text = `${err.message ?? ""} ${err.details ?? ""}`.toLowerCase();
  return err.code === "PGRST202" || text.includes("could not find the function") || text.includes("schema cache");
}

function normalizeThreadRows(rows: Array<Record<string, unknown>>, totalFallback: number | null): ThreadRow[] {
  return rows.map((row) => ({
    id: String(row.id),
    subject_normalized: (row.subject_normalized as string) ?? "",
    last_subject: (row.last_subject as string) ?? null,
    last_from_email: (row.last_from_email as string) ?? null,
    last_from_name: (row.last_from_name as string) ?? null,
    participants: Array.isArray(row.participants) ? (row.participants as string[]) : [],
    message_count: Number(row.message_count ?? 1),
    unread_count: Number(row.unread_count ?? 0),
    has_starred: !!row.has_starred,
    has_attachments: !!row.has_attachments,
    last_received_at: (row.last_received_at as string) ?? new Date().toISOString(),
    preview: (row.preview as string) ?? null,
    ai_category: (row.ai_category as string) ?? null,
    ai_priority: (row.ai_priority as string) ?? null,
  })).slice(0, totalFallback ?? undefined);
}

function predictThread(thread: ThreadRow) {
  return predictEmailReconciliation({
    subject: thread.last_subject || thread.subject_normalized,
    fromEmail: thread.last_from_email,
    fromName: thread.last_from_name,
    preview: thread.preview,
  });
}

function threadMatchesCategory(thread: ThreadRow, category: EmailSmartCategory | undefined): boolean {
  if (!category) return true;
  const prediction = predictThread(thread);
  if (category === "priority") return isHighPriority(thread.ai_priority) || prediction.priority === "alta";
  const aiValues = categoryValues(category);
  if (thread.ai_category && aiValues.includes(thread.ai_category)) return true;
  return categoryMatchesPrediction(prediction, category);
}

function groupRawMessages(data: Array<Record<string, unknown>>, search: EmailFilter["search"]): ThreadRow[] {
  const byThread = new Map<string, ThreadRow>();
  for (const m of data) {
    const tid = m.thread_id as string | null;
    if (!tid) continue;
    if (search?.hasAttachment) {
      const at = m.attachments;
      if (!Array.isArray(at) || at.length === 0) continue;
    }
    const existing = byThread.get(tid);
    if (existing) {
      existing.message_count += 1;
      existing.unread_count += m.is_read ? 0 : 1;
      existing.has_starred = existing.has_starred || !!m.is_starred;
      existing.has_attachments = existing.has_attachments || (Array.isArray(m.attachments) && m.attachments.length > 0);
      existing.ai_priority = mergePriority(existing.ai_priority, m.ai_priority);
      existing.ai_category = existing.ai_category ?? ((m.ai_category as string) ?? null);
      continue;
    }
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
      ai_category: (m.ai_category as string) ?? null,
      ai_priority: (m.ai_priority as string) ?? null,
    });
  }
  return Array.from(byThread.values());
}

async function fetchThreadsFallback(filter: EmailFilter, offset: number): Promise<ThreadPage> {
  const folderKey = filter.folder.type === "system" ? filter.folder.key : null;
  const search = filter.search;
  const hasSearch = hasEffectiveSearch(search);

  // Fallback compatibile con Supabase non ancora migrati: pagina messaggi grezzi,
  // poi raggruppa client-side. La RPC server-side resta il percorso production.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (supabase as any)
    .from("v_my_email_inbox")
    .select("thread_id, subject, from_email, from_name, to_email, received_at, attachments, is_read, is_starred, is_archived, is_trashed, mailbox_folder, oauth_connection_id, preview, status, ai_category, ai_priority")
    .not("thread_id", "is", null)
    .order("received_at", { ascending: false })
    .range(offset, offset + FALLBACK_RAW_PAGE_SIZE - 1);

  if (filter.accountId) q = q.eq("oauth_connection_id", filter.accountId);

  if (folderKey === "inbox") {
    q = q.eq("mailbox_folder", "inbox").eq("is_archived", false).eq("is_trashed", false);
  } else if (folderKey === "sent") {
    q = q.eq("mailbox_folder", "sent");
  } else if (folderKey === "starred") {
    q = q.eq("is_starred", true).eq("is_trashed", false);
  } else if (folderKey === "spam") {
    q = q.or("mailbox_folder.eq.spam,status.eq.spam");
  } else if (folderKey === "trash") {
    q = q.eq("is_trashed", true);
  } else if (folderKey === "archive") {
    q = q.eq("is_archived", true).eq("is_trashed", false);
  } else if (folderKey === "drafts") {
    return { threads: [], totalCount: 0, hasMore: false, nextOffset: offset, source: "fallback" };
  }

  // Non filtriamo le categorie lato DB nel fallback: molte email storiche non
  // hanno ancora ai_category/ai_priority, quindi la riconciliazione predittiva
  // client-side deve poter valutare la pagina completa.

  if (hasSearch && search) {
    const from = safeText(search.from);
    const to = safeText(search.to);
    const subject = safeText(search.subject);
    const text = safeText(search.text);
    if (from) q = q.ilike("from_email", `%${from}%`);
    if (to) q = q.ilike("to_email", `%${to}%`);
    if (subject) q = q.ilike("subject", `%${subject}%`);
    if (text) q = q.or(`subject.ilike.%${text}%,from_email.ilike.%${text}%,from_name.ilike.%${text}%`);
    if (search.hasStar) q = q.eq("is_starred", true);
    if (search.isUnread) q = q.eq("is_read", false);
    const before = toIsoOrNull(search.before);
    const after = toIsoOrNull(search.after);
    if (before) q = q.lt("received_at", before);
    if (after) q = q.gt("received_at", after);
  }

  const { data, error } = await q;
  if (error) throw error;

  const rawRows = (data ?? []) as Array<Record<string, unknown>>;
  return {
    threads: groupRawMessages(rawRows, search),
    totalCount: null,
    hasMore: rawRows.length === FALLBACK_RAW_PAGE_SIZE,
    nextOffset: offset + rawRows.length,
    source: "fallback",
  };
}

async function fetchThreadPage(filter: EmailFilter, offset: number): Promise<ThreadPage> {
  const folderKey = filter.folder.type === "system" ? filter.folder.key : "inbox";
  const search = filter.search;
  const pageLimit = filter.category ? 150 : THREAD_PAGE_SIZE;

  if (folderKey === "drafts") {
    return { threads: [], totalCount: 0, hasMore: false, nextOffset: offset, source: "rpc" };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("email_list_threads", {
    p_folder: folderKey,
    p_account_id: filter.accountId ?? null,
    // Le categorie vengono rifinite anche lato client con regole predittive
    // senza AI, quindi chiediamo una pagina ampia e poi filtriamo localmente.
    p_category: null,
    p_search_text: safeText(search?.text),
    p_from: safeText(search?.from),
    p_to: safeText(search?.to),
    p_subject: safeText(search?.subject),
    p_has_attachment: !!search?.hasAttachment,
    p_has_star: !!search?.hasStar,
    p_is_unread: !!search?.isUnread,
    p_before: toIsoOrNull(search?.before),
    p_after: toIsoOrNull(search?.after),
    p_limit: pageLimit,
    p_offset: offset,
  });

  if (error) {
    if (isRpcUnavailable(error)) return fetchThreadsFallback(filter, offset);
    throw error;
  }

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const totalCount = rows.length > 0 ? Number(rows[0].total_count ?? rows.length) : 0;
  return {
    threads: normalizeThreadRows(rows, pageLimit),
    totalCount,
    hasMore: offset + rows.length < totalCount,
    nextOffset: offset + rows.length,
    source: "rpc",
  };
}

export function EmailList({ filter, selectedThreadId, onSelectThread }: EmailListProps) {
  const { user } = useAuth();
  const userId = user?.id;

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetching,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["email-threads", userId, filter],
    enabled: !!userId,
    initialPageParam: 0,
    staleTime: 20_000,
    gcTime: 5 * 60_000,
    refetchInterval: 60_000,
    queryFn: ({ pageParam }) => fetchThreadPage(filter, Number(pageParam ?? 0)),
    getNextPageParam: (lastPage) => lastPage.hasMore ? lastPage.nextOffset : undefined,
  });

  const pages = data?.pages ?? [];
  const allThreads = pages.flatMap((page) => page.threads);
  const threads = allThreads.filter((thread) => threadMatchesCategory(thread, filter.category));
  const totalCount = filter.category ? null : pages.find((page) => page.totalCount !== null)?.totalCount ?? null;
  const usingFallback = pages.some((page) => page.source === "fallback");
  const isEmpty = !isLoading && threads.length === 0;

  return (
    <ScrollArea className="flex-1 bg-white">
      {isLoading ? (
        <div className="p-3 space-y-2">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-[76px] rounded-2xl" />)}
        </div>
      ) : isError ? (
        <div className="m-3 space-y-3 rounded-2xl border border-rose-100 bg-rose-50 p-4 text-sm text-rose-700">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-semibold">Errore caricamento email</p>
              <p className="mt-0.5 text-rose-600">
                {error instanceof Error ? error.message : "Riprova tra poco."}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 rounded-xl border-rose-200 bg-white text-rose-700 hover:bg-rose-100"
            onClick={() => void refetch()}
            disabled={isFetching}
          >
            {isFetching && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
            Riprova
          </Button>
        </div>
      ) : isEmpty ? (
        <ListEmptyState filter={filter} />
      ) : (
        <div className="space-y-1 p-2">
          <div className="flex items-center justify-between px-2 py-1 text-[11px] text-slate-500">
            <span>
              {totalCount !== null
                ? `Mostro ${threads.length} di ${totalCount} thread`
                : `Mostro ${threads.length} thread`}
            </span>
            {isFetching && !isFetchingNextPage && (
              <span className="inline-flex items-center gap-1 text-blue-600">
                <Loader2 className="h-3 w-3 animate-spin" />
                Aggiorno
              </span>
            )}
          </div>

          {usingFallback && (
            <div className="mx-2 mb-2 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
              Ricerca compatibile attiva: applica la migration email per conteggi e storico ancora più veloci.
            </div>
          )}

          {filter.category && (
            <div className="mx-2 mb-2 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-[11px] text-blue-800">
              Categoria predittiva attiva: se l'AI non ha ancora classificato, uso regole su mittente, oggetto, testo e allegati.
            </div>
          )}

          {threads.map((t) => (
            <ThreadRowItem
              key={t.id}
              thread={t}
              selected={t.id === selectedThreadId}
              onClick={() => onSelectThread(t.id)}
            />
          ))}

          {hasNextPage && (
            <div className="px-2 py-3">
              <Button
                type="button"
                variant="outline"
                className="h-10 w-full rounded-xl border-blue-100 bg-white text-sm text-blue-700 hover:bg-blue-50"
                onClick={() => void fetchNextPage()}
                disabled={isFetchingNextPage}
              >
                {isFetchingNextPage ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ChevronDown className="mr-2 h-4 w-4" />
                )}
                Carica email precedenti
              </Button>
            </div>
          )}
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
  const prediction = predictThread(thread);
  const predictiveCategory = thread.ai_category ? null : prediction.category;
  const category = categoryLabel(thread.ai_category ?? predictiveCategory);
  const highPriority = isHighPriority(thread.ai_priority) || prediction.priority === "alta";

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative w-full rounded-2xl border px-3 py-3 text-left transition-all",
        selected
          ? "border-blue-200 bg-blue-50 shadow-sm"
          : "border-transparent hover:border-blue-100 hover:bg-blue-50/50",
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        <span className={cn("mt-3 h-2 w-2 shrink-0 rounded-full", unread ? "bg-blue-500" : "bg-transparent")} />
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ring-2 ring-white shadow-sm",
            avatarColor(thread.last_from_email),
          )}
        >
          {avatarInitial(thread.last_from_name, thread.last_from_email)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className={cn("truncate text-sm text-slate-800", unread && "font-bold text-slate-950")}>
              {senderLabel}
            </p>
            {thread.message_count > 1 && (
              <span className="rounded-full bg-slate-100 px-1.5 text-[10px] text-slate-500">
                {thread.message_count}
              </span>
            )}
            <span className="ml-auto shrink-0 text-[10px] font-medium text-slate-400">
              {formatRelTime(thread.last_received_at)}
            </span>
          </div>
          <p className={cn("mt-0.5 truncate text-xs", unread ? "font-semibold text-slate-800" : "text-slate-600")}>
            {subject}
          </p>
          {preview && (
            <p className="mt-0.5 truncate text-[11px] text-slate-400">
              {preview}
            </p>
          )}
          <div className="mt-2 flex items-center gap-1.5">
            {highPriority && (
              <Badge className="h-5 gap-1 rounded-full border border-orange-100 bg-orange-50 px-2 text-[9px] font-semibold text-orange-700 hover:bg-orange-50">
                <AlertTriangle className="h-2.5 w-2.5" />
                Priorità
              </Badge>
            )}
            {category && (
              <Badge
                variant="outline"
                title={thread.ai_category
                  ? "Categoria salvata sulla email"
                  : `Categoria predittiva senza AI (${Math.round(prediction.confidence * 100)}%): ${prediction.reasons.join(", ") || "pattern contenuto"}`}
                className="h-5 rounded-full border-blue-100 bg-blue-50 px-2 text-[9px] font-semibold text-blue-700"
              >
                {thread.ai_category ? category : `Regole · ${category}`}
              </Badge>
            )}
            {!thread.ai_priority && prediction.priority === "media" && prediction.targets.length > 0 && (
              <Badge
                variant="outline"
                title={prediction.targets.map((target) => `${target.label} ${Math.round(target.confidence * 100)}%`).join(" · ")}
                className="h-5 rounded-full border-emerald-100 bg-emerald-50 px-2 text-[9px] font-semibold text-emerald-700"
              >
                Riconcilia
              </Badge>
            )}
            {thread.has_starred && <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />}
            {thread.has_attachments && <Paperclip className="h-3.5 w-3.5 text-slate-400" />}
          </div>
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

  if (filter.category) {
    icon = filter.category === "priority" ? AlertTriangle : Inbox;
    title = "Nessuna email in questa vista";
    desc = "Prova a cambiare categoria, account o ricerca. Le email vengono riconciliate prima con regole predittive e poi, se disponibile, con AI.";
  } else if (isInbox) {
    icon = Inbox;
    title = "Inbox vuota";
    desc = "Nessun messaggio in attesa. Le nuove email arriveranno qui ogni 10 minuti dopo il polling.";
  } else if (isStarred) {
    icon = Star;
    title = "Nessun thread importante";
    desc = "Aggiungi una stella ai messaggi importanti per ritrovarli qui rapidamente.";
  } else if (isSent) {
    icon = Send;
    title = "Nessun inviato";
    desc = "Le email inviate dal client compariranno qui automaticamente.";
  } else if (isDrafts) {
    icon = FileEdit;
    title = "Nessuna bozza";
    desc = "Le bozze auto-salvate sono protette nell'outbox personale.";
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
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-blue-100 bg-blue-50">
        <Icon className="h-6 w-6 text-blue-600" />
      </div>
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      {desc && <p className="mx-auto mt-1 max-w-[280px] text-xs text-slate-500">{desc}</p>}
    </div>
  );
}
