import { lazy, Suspense, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistance } from "date-fns";
import { it } from "date-fns/locale";
import { AlertTriangle, BarChart3, ChevronRight, Loader2, MoreHorizontal, Plus, Search, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuRadioGroup,
  DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent,
  DropdownMenuSubTrigger, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useDebounce } from "@/hooks/useDebounce";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { cn } from "@/lib/utils";
import { SupportFilters } from "./SupportFilters";
import { SupportStats } from "./SupportStats";
import {
  formatSupportHours, isSupportActive, supportMessagePreview, supportPriorityLabels,
  supportStatusLabels, supportTicketLookupCode, type SupportTicketMessage,
} from "./supportInbox";

const AdminSupportChatSheet = lazy(() => import("./AdminSupportChatSheet").then(({ AdminSupportChatSheet }) => ({ default: AdminSupportChatSheet })));
const NewTaskDialog = lazy(() => import("@/components/admin/tasks/NewTaskDialog").then(({ NewTaskDialog }) => ({ default: NewTaskDialog })));

type Queue = "active" | "unanswered" | "all";
type Conversation = {
  companyId: string;
  companyName: string;
  lastMessage: string;
  ticketPreview: ReturnType<typeof supportMessagePreview>;
  lastMessageDate: string | null;
  unansweredByAdmin: boolean;
  status: string;
  priority: string;
  resolvedAt: string | null;
  agingHours: number;
  matchedTicket?: SupportTicketMessage;
  historicalMatch?: boolean;
};

const statusColors: Record<string, string> = {
  open: "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200",
  in_progress: "border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-200",
  pending: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200",
  resolved: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  closed: "border-border bg-muted text-muted-foreground",
};
const priorityOrder: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };

function needsReply(conversation: Conversation) {
  return conversation.unansweredByAdmin && isSupportActive(conversation.status);
}

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={cn("whitespace-nowrap font-medium", statusColors[status])}>
      {supportStatusLabels[status as keyof typeof supportStatusLabels] ?? status}
    </Badge>
  );
}

export function AdminSupportChatList() {
  const [search, setSearch] = useState("");
  const [queue, setQueue] = useState<Queue>("active");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [sortBy, setSortBy] = useState("recent");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [taskPrefill, setTaskPrefill] = useState<Conversation | null>(null);
  const queryClient = useQueryClient();

  const messagesQuery = useQuery({
    queryKey: queryKeys.admin.supportMessages,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("support_messages")
        .select("id, company_id, sender_role, message, created_at")
        .order("created_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return data;
    },
    staleTime: 30_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });
  const companiesQuery = useQuery({
    queryKey: queryKeys.admin.companiesForSupport,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("id, name")
        .eq("is_platform_admin_company", false)
        .order("name");
      if (error) throw error;
      return data;
    },
    staleTime: 600_000,
  });
  const conversationsQuery = useQuery({
    queryKey: queryKeys.admin.supportConversations,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("support_conversations")
        .select("company_id, status, priority, resolved_at, updated_at");
      if (error) throw error;
      return data;
    },
    staleTime: 30_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });
  const activityQuery = useQuery({
    queryKey: [...queryKeys.admin.supportConversations, "last-activity"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_support_last_message_by_company");
      if (error) throw error;
      return data;
    },
    staleTime: 30_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    retry: false,
  });

  const { data: messages } = messagesQuery;
  const { data: companies } = companiesQuery;
  const { data: savedConversations } = conversationsQuery;
  const { data: lastActivities } = activityQuery;
  const observedAt = Math.max(messagesQuery.dataUpdatedAt, conversationsQuery.dataUpdatedAt, activityQuery.dataUpdatedAt);
  const ticketsByCompany = useMemo(() => {
    const byCompany = new Map<string, Array<SupportTicketMessage & { code: string; title: string }>>();
    for (const message of messages ?? []) {
      if (message.sender_role !== "company") continue;
      const { code, title } = supportMessagePreview(message.message);
      if (!code) continue;
      const tickets = byCompany.get(message.company_id) ?? [];
      tickets.push({ ...message, code, title });
      byCompany.set(message.company_id, tickets);
    }
    return byCompany;
  }, [messages]);
  const conversations = useMemo(() => {
    const companyNames = new Map(companies?.map((company) => [company.id, company.name]));
    const saved = new Map(savedConversations?.map((conversation) => [conversation.company_id, conversation]));
    const recent = new Map<string, NonNullable<typeof messages>[number]>();
    for (const message of messages ?? []) {
      if (!recent.has(message.company_id)) recent.set(message.company_id, message);
    }
    const latest = new Map(lastActivities?.map((message) => [message.company_id, message]));

    return [...new Set([...saved.keys(), ...recent.keys(), ...latest.keys()])].map((companyId): Conversation => {
      const conversation = saved.get(companyId);
      const recentMessage = recent.get(companyId);
      const activity = latest.get(companyId);
      const lastMessage = activity && (!recentMessage || Date.parse(activity.created_at) > Date.parse(recentMessage.created_at))
        ? activity
        : recentMessage;
      const unansweredByAdmin = Boolean(lastMessage && lastMessage.sender_role !== "super_admin");
      const lastMessageText = lastMessage === recentMessage ? recentMessage?.message ?? "" : "";
      const ticket = ticketsByCompany.get(companyId)?.[0];
      const reopened = isSupportActive(conversation?.status ?? "open") && conversation?.resolved_at;
      const ticketText = ticket && (!reopened || Date.parse(ticket.created_at) >= Date.parse(reopened))
        ? ticket.message
        : lastMessageText;
      return {
        companyId,
        companyName: companyNames.get(companyId) ?? "Azienda sconosciuta",
        lastMessage: lastMessageText,
        ticketPreview: supportMessagePreview(ticketText),
        lastMessageDate: lastMessage?.created_at ?? conversation?.updated_at ?? null,
        unansweredByAdmin,
        status: conversation?.status ?? "open",
        priority: conversation?.priority ?? "normal",
        resolvedAt: conversation?.resolved_at ?? null,
        agingHours: lastMessage && unansweredByAdmin ? Math.max(0, (observedAt - Date.parse(lastMessage.created_at)) / 3_600_000) : 0,
      };
    });
  }, [companies, lastActivities, messages, observedAt, savedConversations, ticketsByCompany]);

  const counts = {
    active: conversations.filter((conversation) => isSupportActive(conversation.status)).length,
    unanswered: conversations.filter(needsReply).length,
    all: conversations.length,
  };
  const queues: Array<{ id: Queue; label: string }> = [
    { id: "active", label: "Da gestire" },
    { id: "unanswered", label: "Da rispondere" },
    { id: "all", label: "Tutti" },
  ];

  const term = search.trim().toLocaleLowerCase("it");
  const ticketCode = supportTicketLookupCode(search);
  const debouncedCode = useDebounce(ticketCode, 300);
  const exactCode = ticketCode ? "#" + ticketCode : null;
  const hasLocalTicket = exactCode !== null && Array.from(ticketsByCompany.values()).some((tickets) =>
    tickets.some((ticket) => ticket.code.toUpperCase() === exactCode),
  );
  const lookupEnabled = ticketCode !== null && !hasLocalTicket && ticketCode === debouncedCode;
  const ticketLookup = useQuery({
    queryKey: queryKeys.admin.supportTicketByCode(debouncedCode),
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase
        .from("support_messages")
        .select("id, company_id, message, created_at")
        .eq("sender_role", "company")
        .ilike("message", "## 🎫 Ticket #" + debouncedCode + " %")
        .order("created_at", { ascending: false })
        .limit(5)
        .abortSignal(signal);
      if (error) throw error;
      return (data ?? []).filter((message) => supportMessagePreview(message.message).code?.toUpperCase() === "#" + debouncedCode);
    },
    enabled: lookupEnabled,
    staleTime: 60_000,
    retry: false,
  });
  const remoteTickets = lookupEnabled ? ticketLookup.data : undefined;
  const lookingUp = ticketCode !== null && !hasLocalTicket && (ticketCode !== debouncedCode || ticketLookup.isFetching);
  const advancedCount = Number(statusFilter !== "all") + Number(priorityFilter !== "all") + Number(overdueOnly) + Number(sortBy !== "recent");
  const hasFilters = Boolean(term || advancedCount);
  const filtered = conversations.flatMap((conversation): Conversation[] => {
    if (queue === "active" && !isSupportActive(conversation.status)) return [];
    if (queue === "unanswered" && !needsReply(conversation)) return [];
    if (statusFilter !== "all" && conversation.status !== statusFilter) return [];
    if (priorityFilter === "high_or_urgent" && !["high", "urgent"].includes(conversation.priority)) return [];
    if (priorityFilter !== "all" && priorityFilter !== "high_or_urgent" && priorityFilter !== conversation.priority) return [];
    if (overdueOnly && (!needsReply(conversation) || conversation.agingHours <= 24)) return [];
    if (!term) return [conversation];

    const localTicket = ticketsByCompany.get(conversation.companyId)?.find(({ code, title }) =>
      exactCode ? code.toUpperCase() === exactCode
        : [code, title].some((value) => value.toLocaleLowerCase("it").includes(term)),
    );
    const matchedTicket = localTicket ?? remoteTickets?.find((ticket) => ticket.company_id === conversation.companyId);
    if (matchedTicket) {
      const ticketPreview = supportMessagePreview(matchedTicket.message);
      return [{ ...conversation, matchedTicket, ticketPreview, historicalMatch: ticketPreview.code !== conversation.ticketPreview.code }];
    }
    if (exactCode) return [];

    return [conversation.companyName, conversation.lastMessage].some((value) => value.toLocaleLowerCase("it").includes(term))
      ? [conversation]
      : [];
  }).sort((a, b) => {
    const byDate = (Date.parse(b.lastMessageDate ?? "") || 0) - (Date.parse(a.lastMessageDate ?? "") || 0);
    if (sortBy === "oldest") return -byDate;
    if (sortBy === "priority") return (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2) || byDate;
    return byDate;
  });

  const isLoading = messagesQuery.isLoading || companiesQuery.isLoading || conversationsQuery.isLoading;
  const hasError = messagesQuery.isError || companiesQuery.isError || conversationsQuery.isError;

  function resetFilters() {
    setSearch("");
    setStatusFilter("all");
    setPriorityFilter("all");
    setSortBy("recent");
    setOverdueOnly(false);
  }

  async function updateConversation(companyId: string, field: "status" | "priority", value: string) {
    const now = new Date().toISOString();
    const updates = field === "status"
      ? { status: value, updated_at: now, resolved_at: value === "resolved" ? now : null }
      : { priority: value, updated_at: now };
    const { error } = await supabase
      .from("support_conversations")
      .upsert({ company_id: companyId, ...updates }, { onConflict: "company_id" });
    if (error) toast.error(error.message);
    else {
      toast.success("Ticket aggiornato");
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.supportConversations });
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.supportConversationDetail(companyId) });
    }
  }

  return (
    <section aria-label="Elenco ticket di assistenza" className="min-w-0 overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-3 py-2.5 sm:px-4">
        <div className="flex items-center gap-1 overflow-x-auto" role="group" aria-label="Vista ticket">
          {queues.map(({ id, label }) => (
            <Button
              key={id}
              type="button"
              size="sm"
              variant={id === queue ? "secondary" : "ghost"}
              aria-pressed={id === queue}
              className="gap-2 whitespace-nowrap px-2.5"
              onClick={() => { setQueue(id); setStatusFilter("all"); }}
            >
              {label}
              {!isLoading && !hasError && <span className="rounded-full bg-muted-foreground/10 px-1.5 text-xs tabular-nums">{counts[id]}</span>}
            </Button>
          ))}
        </div>
        <div className="ml-auto flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
          <div className="relative min-w-48 grow lg:max-w-xs">
            <Search aria-hidden="true" className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              aria-label="Cerca ticket"
              placeholder="Cerca per azienda, codice o messaggio"
              value={search}
              onChange={(event) => {
                const value = event.target.value;
                setSearch(value);
                if (supportTicketLookupCode(value)) setQueue("all");
              }}
              className="h-9 pl-9"
            />
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button type="button" size="sm" variant="outline" className="gap-1.5">
                <SlidersHorizontal aria-hidden="true" className="h-4 w-4" /> Filtri
                {advancedCount > 0 && <span className="text-xs tabular-nums">{advancedCount}</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72">
              <SupportFilters
                statusFilter={statusFilter}
                onStatusChange={(value) => { setStatusFilter(value); if (value !== "all") setQueue("all"); }}
                priorityFilter={priorityFilter}
                onPriorityChange={setPriorityFilter}
                sortBy={sortBy}
                onSortChange={setSortBy}
                overdueOnly={overdueOnly}
                onOverdueChange={setOverdueOnly}
              />
              <Button type="button" size="sm" variant="ghost" className="mt-3 px-1" onClick={resetFilters} disabled={!hasFilters}>Azzera filtri</Button>
            </PopoverContent>
          </Popover>
          <Button
            type="button"
            size="sm"
            variant={showStats ? "secondary" : "ghost"}
            aria-expanded={showStats}
            onClick={() => setShowStats((value) => !value)}
            className="gap-1.5"
          >
            <BarChart3 aria-hidden="true" className="h-4 w-4" /> Statistiche
          </Button>
        </div>
      </div>

      {showStats && !isLoading && !hasError && <SupportStats conversations={conversations} messages={messages ?? []} observedAt={observedAt} />}

      {hasError ? (
        <Alert variant="destructive" className="m-3 w-auto">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
            Errore nel caricamento dei ticket.
            <Button type="button" size="sm" variant="outline" onClick={() => {
              void messagesQuery.refetch();
              void companiesQuery.refetch();
              void queryClient.invalidateQueries({ queryKey: queryKeys.admin.supportConversations });
            }}>Riprova</Button>
          </AlertDescription>
        </Alert>
      ) : isLoading || (lookingUp && filtered.length === 0) ? (
        <div role="status" className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
          {isLoading ? "Caricamento ticket…" : "Ricerca nello storico…"}
        </div>
      ) : lookupEnabled && ticketLookup.isError && filtered.length === 0 ? (
        <div role="alert" className="space-y-2 px-4 py-10 text-center text-sm">
          <p>Impossibile cercare il codice nello storico.</p>
          <Button type="button" size="sm" variant="outline" onClick={() => void ticketLookup.refetch()}>Riprova</Button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="space-y-2 px-4 py-10 text-center text-sm">
          <p className="font-medium">{hasFilters ? "Nessun ticket corrisponde ai filtri" : queue === "unanswered" ? "Nessun ticket da rispondere" : queue === "active" ? "Nessun ticket da gestire" : "Nessun ticket"}</p>
          {hasFilters && <Button type="button" size="sm" variant="outline" onClick={resetFilters}>Azzera filtri</Button>}
          {!hasFilters && queue !== "all" && counts.all > 0 && (
            <Button type="button" size="sm" variant="outline" onClick={() => setQueue("all")}>Vedi tutti i ticket</Button>
          )}
        </div>
      ) : (
        <table className="w-full table-fixed text-left text-sm">
          <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-2.5 font-medium sm:px-4">Ticket</th>
              <th scope="col" className="hidden w-32 px-2 font-medium md:table-cell lg:w-40">Stato</th>
              <th scope="col" className="hidden w-24 px-2 font-medium lg:table-cell">Priorità</th>
              <th scope="col" className="hidden w-36 px-2 font-medium md:table-cell">Ultimo messaggio</th>
              <th scope="col" className="w-14"><span className="sr-only">Azioni</span></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.map((conversation) => {
              const { companyId, companyName, ticketPreview: preview, lastMessageDate, priority, status, agingHours, historicalMatch } = conversation;
              const updated = lastMessageDate ? formatDistance(new Date(lastMessageDate), new Date(observedAt), { addSuffix: true, locale: it }) : "—";
              const waiting = !historicalMatch && needsReply(conversation);
              const priorityLabel = supportPriorityLabels[priority as keyof typeof supportPriorityLabels] ?? priority;
              return (
                <tr key={companyId} className="group hover:bg-muted/35">
                  <td className="min-w-0">
                    <button
                      type="button"
                      aria-label={"Apri ticket di " + companyName + " · " + preview.title}
                      onClick={() => setSelected(conversation)}
                      className={cn("block w-full min-w-0 border-l-2 px-2.5 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-3.5", waiting ? "border-l-amber-500" : "border-l-transparent")}
                    >
                      <span title={preview.title} className="block truncate font-medium">{preview.title}</span>
                      <span className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                        <span className="truncate">{companyName}</span>
                        {preview.code && <span className="shrink-0 font-mono">{preview.code}</span>}
                        {historicalMatch && <span className="shrink-0">Nello storico</span>}
                        {!historicalMatch && (priority === "high" || priority === "urgent") && <span className="shrink-0 text-amber-800 dark:text-amber-300 lg:hidden">{priorityLabel}</span>}
                      </span>
                    </button>
                    {!historicalMatch && <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-l-2 border-transparent px-2.5 pb-2.5 text-xs text-muted-foreground md:hidden">
                      <StatusBadge status={status} />
                      <span>{waiting ? "Da rispondere · " + formatSupportHours(agingHours) : updated}</span>
                    </div>}
                  </td>
                  <td className="hidden px-2 text-xs text-muted-foreground md:table-cell">{historicalMatch ? "—" : <StatusBadge status={status} />}</td>
                  <td className={cn("hidden px-2 text-xs lg:table-cell", !historicalMatch && (priority === "urgent" || priority === "high") ? "font-medium text-amber-800 dark:text-amber-300" : "text-muted-foreground")}>{historicalMatch ? "—" : priorityLabel}</td>
                  <td className="hidden px-2 text-xs text-muted-foreground md:table-cell">
                    {waiting && <span className="block font-medium text-amber-800 dark:text-amber-300">Da rispondere</span>}
                    {historicalMatch ? "—" : waiting ? formatSupportHours(agingHours) + " di attesa" : updated}
                  </td>
                  <td className="px-2">
                    {!historicalMatch && <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label={"Azioni ticket di " + companyName}>
                          <MoreHorizontal aria-hidden="true" className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem onSelect={() => setSelected(conversation)}>
                          <ChevronRight aria-hidden="true" className="mr-2 h-4 w-4" /> Apri ticket
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setTaskPrefill(conversation)}>
                          <Plus aria-hidden="true" className="mr-2 h-4 w-4" /> Crea attività
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuSub>
                          <DropdownMenuSubTrigger>Cambia stato</DropdownMenuSubTrigger>
                          <DropdownMenuSubContent>
                            <DropdownMenuRadioGroup value={status} onValueChange={(value) => void updateConversation(companyId, "status", value)}>
                              {Object.entries(supportStatusLabels).map(([value, label]) => (
                                <DropdownMenuRadioItem key={value} value={value}>{label}</DropdownMenuRadioItem>
                              ))}
                            </DropdownMenuRadioGroup>
                          </DropdownMenuSubContent>
                        </DropdownMenuSub>
                        <DropdownMenuSub>
                          <DropdownMenuSubTrigger>Cambia priorità</DropdownMenuSubTrigger>
                          <DropdownMenuSubContent>
                            <DropdownMenuRadioGroup value={priority} onValueChange={(value) => void updateConversation(companyId, "priority", value)}>
                              {Object.entries(supportPriorityLabels).map(([value, label]) => (
                                <DropdownMenuRadioItem key={value} value={value}>{label}</DropdownMenuRadioItem>
                              ))}
                            </DropdownMenuRadioGroup>
                          </DropdownMenuSubContent>
                        </DropdownMenuSub>
                      </DropdownMenuContent>
                    </DropdownMenu>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {hasFilters && !isLoading && !hasError && filtered.length > 0 && (
        <div role="status" className="border-t px-4 py-2 text-xs text-muted-foreground">{filtered.length} di {counts[queue]} ticket</div>
      )}

      <Suspense fallback={null}>
        {selected && (
          <AdminSupportChatSheet
            open
            companyId={selected.companyId}
            companyName={selected.companyName}
            requestedTicket={selected.matchedTicket}
            onOpenChange={(open) => {
              if (open) return;
              setSelected(null);
              void queryClient.invalidateQueries({ queryKey: queryKeys.admin.supportMessages });
              void queryClient.invalidateQueries({ queryKey: queryKeys.admin.supportConversations });
            }}
          />
        )}
        {taskPrefill && (
          <NewTaskDialog
            open
            onOpenChange={(open) => { if (!open) setTaskPrefill(null); }}
            prefill={{
              companyId: taskPrefill.companyId,
              type: "support",
              title: "Follow-up assistenza: " + taskPrefill.companyName,
              description: taskPrefill.lastMessage
                ? "Contesto dalla chat:\n\"" + taskPrefill.lastMessage.slice(0, 300) + (taskPrefill.lastMessage.length > 300 ? "…" : "") + "\""
                : undefined,
            }}
          />
        )}
      </Suspense>
    </section>
  );
}
