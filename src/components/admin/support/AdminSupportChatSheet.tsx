import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { ChevronDown, MessageSquareText, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import type { TablesUpdate } from "@/integrations/supabase/types";
import { playNotificationSound } from "@/lib/notificationSound";
import { queryKeys } from "@/lib/queryKeys";
import { cn } from "@/lib/utils";
import { CannedResponsesPicker } from "./CannedResponsesPicker";
import { ConversationActions } from "./ConversationActions";
import { supportMessagePreview, supportTicketDetails, type SupportTicketMessage } from "./supportInbox";

type SupportMessage = SupportTicketMessage & { sender_role: string };
type MessageCursor = Pick<SupportMessage, "created_at" | "id">;
type TicketDetails = NonNullable<ReturnType<typeof supportTicketDetails>>;
const pageSize = 60;

interface AdminSupportChatSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  companyName: string;
  requestedTicket?: SupportTicketMessage;
}

function TicketBody({ ticket }: { ticket: TicketDetails }) {
  return (
    <>
      {ticket.description && <p className="whitespace-pre-wrap break-words text-sm">{ticket.description}</p>}
      {ticket.transcript && (
        <details className="border-t pt-2.5 text-xs text-muted-foreground">
          <summary className="cursor-pointer font-medium">Conversazione con Silvio</summary>
          <p className="mt-2 whitespace-pre-wrap break-words">{ticket.transcript}</p>
        </details>
      )}
    </>
  );
}

function TicketCard({ ticket, date }: { ticket: TicketDetails; date: string }) {
  return (
    <article className="rounded-lg border border-blue-200 bg-card p-3.5 dark:border-blue-900 sm:p-4">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <MessageSquareText aria-hidden="true" className="h-4 w-4 text-blue-600 dark:text-blue-300" />
        <span className="font-mono font-medium text-blue-700 dark:text-blue-300">{ticket.code}</span>
        <time dateTime={date}>{format(new Date(date), "d MMM yyyy · HH:mm", { locale: it })}</time>
      </div>
      <h3 className="mt-1.5 break-words text-sm font-semibold">{ticket.title}</h3>
      {ticket.author && <p className="mt-0.5 break-words text-xs text-muted-foreground">{ticket.author}</p>}
      <div className="mt-3 space-y-3"><TicketBody ticket={ticket} /></div>
    </article>
  );
}

export function AdminSupportChatSheet({ open, onOpenChange, companyId, companyName, requestedTicket }: AdminSupportChatSheetProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState(requestedTicket ? "requests" : "chat");
  const [expandedRequest, setExpandedRequest] = useState(requestedTicket?.id ?? "");
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const sendInFlight = useRef(false);
  const chatScroll = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const chatKey = useMemo(() => queryKeys.admin.supportChat(companyId), [companyId]);
  const conversationKey = queryKeys.admin.supportConversationDetail(companyId);
  const chat = useInfiniteQuery({
    queryKey: chatKey,
    initialPageParam: null as MessageCursor | null,
    queryFn: async ({ pageParam, signal }) => {
      let query = supabase
        .from("support_messages")
        .select("id, sender_role, message, created_at")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(pageSize);
      if (pageParam) {
        query = query.or(
          `created_at.lt.${pageParam.created_at},and(created_at.eq.${pageParam.created_at},id.lt.${pageParam.id})`,
        );
      }
      const { data, error } = await query.abortSignal(signal);
      if (error) throw error;
      return data ?? [];
    },
    getNextPageParam: (page): MessageCursor | undefined => {
      const last = page.at(-1);
      return last && page.length >= pageSize ? { id: last.id, created_at: last.created_at } : undefined;
    },
    enabled: open && !!companyId,
    staleTime: 30_000,
  });
  const { data: convData, isLoading: convLoading, isError: convError, refetch: refetchConversation } = useQuery({
    queryKey: conversationKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("support_conversations")
        .select("status, priority, internal_notes")
        .eq("company_id", companyId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: open && !!companyId,
    staleTime: 30_000,
  });

  const messages = useMemo(() => {
    const entries = (chat.data?.pages ?? []).flat();
    return [...new Map(entries.map((message) => [message.id, message])).values()]
      .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || a.id.localeCompare(b.id));
  }, [chat.data]);
  const requests = useMemo(() => {
    const entries = requestedTicket && !messages.some((message) => message.id === requestedTicket.id)
      ? [...messages, { ...requestedTicket, sender_role: "company" }]
      : messages;
    return entries.flatMap((message) => {
      const details = message.sender_role === "company" ? supportTicketDetails(message.message) : null;
      return details ? [{ message, details }] : [];
    }).sort((a, b) => {
      const selectedFirst = Number(b.message.id === requestedTicket?.id) - Number(a.message.id === requestedTicket?.id);
      return selectedFirst || Date.parse(b.message.created_at) - Date.parse(a.message.created_at);
    });
  }, [messages, requestedTicket]);

  const appendMessage = useCallback((message: SupportMessage) => {
    queryClient.setQueryData<InfiniteData<SupportMessage[], MessageCursor | null>>(chatKey, (history) => {
      if (!history || history.pages.some((page) => page.some((entry) => entry.id === message.id))) return history;
      return { ...history, pages: [[message, ...history.pages[0]], ...history.pages.slice(1)] };
    });
    if (!queryClient.getQueryData(chatKey)) void queryClient.invalidateQueries({ queryKey: chatKey });
    void queryClient.invalidateQueries({ queryKey: queryKeys.admin.supportMessages });
    void queryClient.invalidateQueries({ queryKey: queryKeys.admin.supportConversations });
  }, [chatKey, queryClient]);

  useEffect(() => {
    if (!open || !companyId) return;
    const channel = supabase
      .channel("admin-support-" + companyId)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "support_messages",
        filter: `company_id=eq.${companyId}`,
      }, ({ new: message }) => {
        const received = message as SupportMessage;
        appendMessage(received);
        if (received.sender_role === "company") {
          playNotificationSound();
          toast("Nuovo messaggio da " + companyName, { description: supportMessagePreview(received.message).title.slice(0, 80) });
        }
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [appendMessage, open, companyId, companyName]);

  const latestMessageId = messages.at(-1)?.id;
  useEffect(() => {
    if (tab !== "chat" || !stickToBottom.current || !chatScroll.current) return;
    chatScroll.current.scrollTop = chatScroll.current.scrollHeight;
  }, [chat.isLoading, latestMessageId, tab]);

  const conversationMutation = useMutation({
    mutationFn: async (updates: TablesUpdate<"support_conversations">) => {
      const { error } = await supabase
        .from("support_conversations")
        .upsert({ company_id: companyId, ...updates }, { onConflict: "company_id" });
      if (error) throw error;

      if (updates.status === "resolved" && user) {
        const { data, error: noticeError } = await supabase
          .from("support_messages")
          .insert({
            company_id: companyId,
            sender_id: user.id,
            sender_role: "super_admin",
            message: "[Sistema] Conversazione contrassegnata come risolta",
          })
          .select("id, sender_role, message, created_at")
          .single();
        if (noticeError) toast.error("Conversazione risolta. Avviso in chat non registrato.");
        else appendMessage(data);
      }
    },
    onSuccess: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: conversationKey }),
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.supportConversations }),
    ]),
    onError: () => toast.error("Impossibile aggiornare la conversazione"),
  });

  function handleStatusChange(status: string) {
    if (status === convData?.status) return;
    conversationMutation.mutate({ status, resolved_at: status === "resolved" ? new Date().toISOString() : null });
  }

  async function handleNotesChange(notes: string) {
    try {
      await conversationMutation.mutateAsync({ internal_notes: notes.trim() || null });
      toast.success("Note salvate");
      return true;
    } catch {
      return false;
    }
  }

  async function handleSend() {
    const draft = newMessage;
    const message = draft.trim();
    if (sendInFlight.current || !message || !user) return;
    sendInFlight.current = true;
    setSending(true);
    try {
      const { data, error } = await supabase
        .from("support_messages")
        .insert({ company_id: companyId, sender_id: user.id, sender_role: "super_admin", message })
        .select("id, sender_role, message, created_at")
        .single();
      if (error) throw error;
      stickToBottom.current = true;
      appendMessage(data);
      setNewMessage((current) => (current === draft ? "" : current));
    } catch {
      toast.error("Errore nell'invio del messaggio");
    } finally {
      sendInFlight.current = false;
      setSending(false);
    }
  }

  const changeTab = (value: string) => {
    if (value === "chat") stickToBottom.current = true;
    setTab(value);
  };

  const loadHistory = chat.hasNextPage && (
    <Button type="button" size="sm" variant="outline" disabled={chat.isFetching} onClick={() => void chat.fetchNextPage()}>
      {chat.isFetchingNextPage ? "Caricamento…" : chat.isFetchNextPageError ? "Riprova a caricare i precedenti" : "Carica messaggi precedenti"}
    </Button>
  );
  const chatError = chat.isError && !chat.data && (
    <div role="alert" className="grid justify-items-center gap-2 p-6 text-center text-sm">
      <p>Impossibile caricare i messaggi.</p>
      <Button type="button" size="sm" variant="outline" onClick={() => void chat.refetch()}>Riprova</Button>
    </div>
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex min-h-0 flex-col gap-0 overflow-hidden p-0 sm:max-w-[580px]">
        <SheetHeader className="space-y-0.5 border-b bg-card px-4 py-4 pr-12 text-left sm:px-5 sm:pr-12">
          <SheetTitle className="break-words text-xl">{companyName}</SheetTitle>
          <SheetDescription>Assistenza piattaforma</SheetDescription>
        </SheetHeader>

        <Tabs value={tab} onValueChange={changeTab} className="flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 border-b bg-card px-4 py-2 sm:px-5">
            <TabsList aria-label="Dettaglio assistenza">
              <TabsTrigger value="chat">Conversazione</TabsTrigger>
              <TabsTrigger value="requests">Richieste{!chat.hasNextPage && requests.length > 0 ? " · " + requests.length : ""}</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="chat" className="mt-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden">
            {convError ? (
              <div role="alert" className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2 text-sm">
                Stato e priorità non disponibili.
                <Button type="button" size="sm" variant="outline" onClick={() => void refetchConversation()}>Riprova</Button>
              </div>
            ) : !convLoading && (
              <ConversationActions
                status={convData?.status ?? "open"}
                priority={convData?.priority ?? "normal"}
                internalNotes={convData?.internal_notes ?? null}
                busy={conversationMutation.isPending}
                onStatusChange={handleStatusChange}
                onPriorityChange={(priority) => conversationMutation.mutate({ priority })}
                onNotesChange={handleNotesChange}
                onResolve={() => handleStatusChange("resolved")}
              />
            )}

            <div
              ref={chatScroll}
              className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain bg-muted/20 p-4 sm:p-5"
              onScroll={(event) => {
                const { scrollHeight, scrollTop, clientHeight } = event.currentTarget;
                stickToBottom.current = scrollHeight - scrollTop - clientHeight < 80;
              }}
            >
              {chat.isLoading ? (
                <div className="space-y-3" role="status" aria-label="Caricamento conversazione">
                  <Skeleton className="h-14 w-3/4" />
                  <Skeleton className="ml-auto h-12 w-1/2" />
                </div>
              ) : chatError || (
                <>
                  {chat.hasNextPage && <div className="text-center">{loadHistory}</div>}
                  {messages.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Nessun messaggio</p>}
                  {messages.map((message, index) => {
                    const date = new Date(message.created_at);
                    const day = format(date, "d MMMM yyyy", { locale: it });
                    const previous = messages[index - 1];
                    const showDay = !previous || day !== format(new Date(previous.created_at), "d MMMM yyyy", { locale: it });
                    const isAdmin = message.sender_role === "super_admin";
                    const ticket = message.sender_role === "company" ? supportTicketDetails(message.message) : null;
                    return (
                      <div key={message.id} className="space-y-2">
                        {showDay && <p className="text-center text-xs font-medium text-muted-foreground">{day}</p>}
                        {ticket ? <TicketCard ticket={ticket} date={message.created_at} />
                          : isAdmin && message.message.startsWith("[Sistema]") ? (
                            <p className="text-center text-xs text-muted-foreground">{message.message.slice("[Sistema]".length).trim()}</p>
                          ) : (
                            <div className={cn("flex", isAdmin && "justify-end")}>
                              <div className={cn("min-w-0 max-w-[85%] rounded-xl border px-3 py-2 text-sm", isAdmin ? "border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950" : "bg-card")}>
                                <p className="whitespace-pre-wrap break-words">{message.message}</p>
                                <time className="mt-1 block text-right text-xs text-muted-foreground" dateTime={message.created_at}>{format(date, "HH:mm")}</time>
                              </div>
                            </div>
                          )}
                      </div>
                    );
                  })}
                </>
              )}
            </div>

            <div className="flex shrink-0 items-end gap-2 border-t bg-card p-3 sm:p-4">
              <CannedResponsesPicker onSelect={(content) => setNewMessage((draft) => draft.trim() ? draft + "\n\n" + content : content)} />
              <Textarea
                value={newMessage}
                onChange={(event) => setNewMessage(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    void handleSend();
                  }
                }}
                aria-label="Risposta"
                placeholder="Scrivi una risposta…"
                className="max-h-28 min-h-11 flex-1 resize-y"
                rows={1}
              />
              <Button type="button" size="icon" aria-label="Invia risposta" className="h-11 w-11 shrink-0" onClick={() => void handleSend()} disabled={!newMessage.trim() || sending || !user}>
                <Send aria-hidden="true" className="h-4 w-4" />
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="requests" className="mt-0 min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain bg-muted/20 p-4 sm:p-5">
            {requests.length === 0 && (
              chat.isLoading ? <Skeleton className="h-16 w-full" /> : chatError || (
                <p className="py-5 text-center text-sm text-muted-foreground">
                  {chat.hasNextPage ? "Nessuna richiesta nei messaggi caricati." : "Nessuna richiesta con codice in questa conversazione."}
                </p>
              )
            )}
            {requests.map(({ message, details }) => (
              <div key={message.id} className="overflow-hidden rounded-lg border bg-card">
                <button
                  type="button"
                  className="flex w-full items-center gap-3 px-3.5 py-3 text-left hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  aria-expanded={expandedRequest === message.id}
                  onClick={() => setExpandedRequest((selected) => selected === message.id ? "" : message.id)}
                >
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-sm font-medium">{details.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      <span className="font-mono">{details.code}</span>
                      <span> · {format(new Date(message.created_at), "d MMM yyyy", { locale: it })}</span>
                    </p>
                  </div>
                  <ChevronDown aria-hidden="true" className={cn("h-4 w-4 shrink-0 text-muted-foreground", expandedRequest === message.id && "rotate-180")} />
                </button>
                {expandedRequest === message.id && (
                  <div className="space-y-3 border-t px-3.5 py-3 text-sm">
                    {details.author && <p className="text-xs text-muted-foreground">{details.author}</p>}
                    <TicketBody ticket={details} />
                  </div>
                )}
              </div>
            ))}
            {chat.hasNextPage && <div className="pt-2 text-center">{loadHistory}</div>}
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
