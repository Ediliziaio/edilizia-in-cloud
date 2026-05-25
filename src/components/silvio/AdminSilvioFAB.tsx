import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import {
  AlertTriangle,
  Bot,
  ExternalLink,
  Loader2,
  Maximize2,
  MessageCircle,
  Minimize2,
  PanelRightClose,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSuperAdminPermissions } from "@/hooks/useSuperAdminPermissions";
import { useAdminSidebarBadges } from "@/hooks/useAdminSidebarBadges";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const SILVIO_ADMIN_SENDER_ID = "00000000-0000-0000-0000-000000000003";

const SEND_TIMEOUT_MS = 35_000;

type AdminSilvioMeta = {
  channelId: string;
  companyId: string;
};

type AdminSilvioMessage = {
  id: string;
  channel_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  message_type: string | null;
  last_model_id?: string | null;
  last_latency_ms?: number | null;
};

type SilvioAdminRpcClient = typeof supabase & {
  rpc(
    fn: "ensure_user_silvio_admin_channel",
  ): Promise<{ data: string | null; error: { message?: string } | null }>;
};

type AdminSilvioSendPayload = {
  text: string;
  retryAssistantOnly?: boolean;
};

function formatMessageTime(value: string) {
  try {
    return format(new Date(value), "HH:mm", { locale: it });
  } catch {
    return "";
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error("Timeout: Silvio non ha completato la risposta entro 35 secondi."));
    }, timeoutMs);

    promise
      .then(resolve)
      .catch(reject)
      .finally(() => window.clearTimeout(timeoutId));
  });
}

function describeAdminPage(pathname: string) {
  const routeLabels: Array<[RegExp, string]> = [
    [/^\/admin\/aziende/, "Aziende e account clienti"],
    [/^\/admin\/chat/, "Chat team Superadmin"],
    [/^\/admin\/attivita/, "Attività operative e task CS"],
    [/^\/admin\/revenue/, "Revenue, MRR e pagamenti"],
    [/^\/admin\/ticket/, "Assistenza e ticket clienti"],
    [/^\/admin\/ai-/, "Governance AI e Silvio Hub"],
    [/^\/admin\/marketing/, "Marketing e vendite piattaforma"],
    [/^\/admin\/impostazioni/, "Impostazioni Superadmin"],
    [/^\/admin$/, "Dashboard Superadmin"],
  ];

  const match = routeLabels.find(([pattern]) => pattern.test(pathname));
  return {
    label: match?.[1] ?? "Area Superadmin",
    path: pathname,
  };
}

export function AdminSilvioFAB() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { permissions } = useSuperAdminPermissions();
  const { data: sidebarBadges } = useAdminSidebarBadges();
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [panelSize, setPanelSize] = useState<"comfort" | "wide">("comfort");
  const [lastFailedPrompt, setLastFailedPrompt] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const scrollAnchorRef = useRef<HTMLDivElement | null>(null);
  const pageContext = useMemo(() => describeAdminPage(location.pathname), [location.pathname]);
  const unreadCount = sidebarBadges?.chatUnread ?? 0;
  const contextualQuickPrompts = useMemo(
    () => [
      `Analizza questa pagina (${pageContext.label}) e dimmi il rischio P0.`,
      "Dammi le 5 priorità operative di oggi da superadmin.",
      "Analizza criticità clienti, revenue e supporto nelle ultime 24 ore.",
      "Dimmi dove Silvio deve intervenire per far crescere EiC questa settimana.",
    ],
    [pageContext.label],
  );

  useEffect(() => {
    const openHandler = () => setOpen(true);
    window.addEventListener("silvio:open-chat", openHandler);
    return () => window.removeEventListener("silvio:open-chat", openHandler);
  }, []);

  const metaQuery = useQuery({
    queryKey: ["admin-silvio-sidechat-meta", user?.id],
    enabled: open && !!user?.id && permissions.can_manage_companies,
    staleTime: 30 * 60 * 1000,
    queryFn: async (): Promise<AdminSilvioMeta> => {
      const { data: channelId, error: rpcError } = await (supabase as unknown as SilvioAdminRpcClient).rpc(
        "ensure_user_silvio_admin_channel",
      );
      if (rpcError) throw rpcError;
      if (!channelId || typeof channelId !== "string") {
        throw new Error("Canale Silvio Superadmin non disponibile.");
      }

      const { data: channel, error: channelError } = await supabase
        .from("internal_chat_channels")
        .select("id, company_id")
        .eq("id", channelId)
        .maybeSingle();
      if (channelError) throw channelError;
      if (!channel?.company_id) {
        throw new Error("Canale Silvio Superadmin senza company di piattaforma.");
      }

      return {
        channelId,
        companyId: channel.company_id,
      };
    },
  });

  const channelId = metaQuery.data?.channelId ?? null;

  const messagesQuery = useQuery({
    queryKey: ["admin-silvio-sidechat-messages", channelId],
    enabled: open && !!channelId,
    staleTime: 5 * 1000,
    queryFn: async (): Promise<AdminSilvioMessage[]> => {
      if (!channelId) return [];
      const { data, error } = await supabase
        .from("internal_chat_messages")
        .select("id, channel_id, sender_id, content, created_at, message_type, last_model_id, last_latency_ms")
        .eq("channel_id", channelId)
        .order("created_at", { ascending: false })
        .limit(40);
      if (error) throw error;
      return ((data ?? []) as AdminSilvioMessage[]).reverse();
    },
  });
  const messages = useMemo(() => messagesQuery.data ?? [], [messagesQuery.data]);

  useEffect(() => {
    if (!open || !channelId) return;
    const realtimeChannel = supabase
      .channel(`admin-silvio-sidechat:${channelId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "internal_chat_messages",
          filter: `channel_id=eq.${channelId}`,
        },
        () => {
          queryClient.invalidateQueries({
            queryKey: ["admin-silvio-sidechat-messages", channelId],
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(realtimeChannel);
    };
  }, [channelId, open, queryClient]);

  useEffect(() => {
    if (!open || messagesQuery.isFetching) return;
    const timeout = window.setTimeout(() => {
      scrollAnchorRef.current?.scrollIntoView({ block: "end" });
    }, 40);
    return () => window.clearTimeout(timeout);
  }, [messagesQuery.data?.length, messagesQuery.isFetching, open]);

  useEffect(() => {
    if (!open || !channelId || !user?.id || messages.length === 0) return;
    const timeout = window.setTimeout(() => {
      void supabase
        .from("internal_chat_members")
        .update({ last_read_at: new Date().toISOString() })
        .eq("channel_id", channelId)
        .eq("user_id", user.id);
      queryClient.invalidateQueries({ queryKey: ["admin-sidebar-badges", user.id] });
    }, 600);
    return () => window.clearTimeout(timeout);
  }, [channelId, messages.length, open, queryClient, user?.id]);

  const sendMutation = useMutation({
    mutationFn: async (payload: AdminSilvioSendPayload) => {
      const cleanText = payload.text.trim();
      if (!cleanText) return;
      if (!user?.id) throw new Error("Sessione non disponibile.");
      if (!metaQuery.data) throw new Error("Canale Silvio non pronto.");

      if (!payload.retryAssistantOnly) {
        const { error: insertError } = await supabase
          .from("internal_chat_messages")
          .insert({
            channel_id: metaQuery.data.channelId,
            sender_id: user.id,
            company_id: metaQuery.data.companyId,
            content: cleanText,
            message_type: "text",
          });
        if (insertError) throw insertError;

        setPrompt("");
        queryClient.invalidateQueries({
          queryKey: ["admin-silvio-sidechat-messages", metaQuery.data.channelId],
        });
      }

      setLastError(null);
      setLastFailedPrompt(null);
      queryClient.invalidateQueries({
        queryKey: ["admin-silvio-sidechat-messages", metaQuery.data.channelId],
      });

      await supabase
        .from("internal_chat_channels")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", metaQuery.data.channelId);

      await supabase
        .from("internal_chat_members")
        .update({ last_read_at: new Date().toISOString() })
        .eq("channel_id", metaQuery.data.channelId)
        .eq("user_id", user.id);

      const response = await withTimeout(
        supabase.functions.invoke("silvio-admin-chat", {
          body: {
            channel_id: metaQuery.data.channelId,
            message: cleanText,
            page_context: `${pageContext.label} (${pageContext.path})`,
          },
        }),
        SEND_TIMEOUT_MS,
      );

      if (response.error) {
        let apiMessage = response.error.message ?? "Errore Silvio Superadmin";
        const context = (response.error as { context?: unknown }).context;
        try {
          if (context instanceof Response) {
            const body = await context.json();
            apiMessage = body?.error ?? body?.message ?? apiMessage;
          }
        } catch {
          // Mantiene il messaggio Supabase quando il body non e' JSON.
        }
        const enrichedError = new Error(apiMessage) as Error & { retryableText?: string };
        enrichedError.retryableText = cleanText;
        throw enrichedError;
      }
    },
    onSuccess: () => {
      if (channelId) {
        queryClient.invalidateQueries({
          queryKey: ["admin-silvio-sidechat-messages", channelId],
        });
      }
      setLastError(null);
      setLastFailedPrompt(null);
    },
    onError: (error) => {
      const maybeRetryable = error as Error & { retryableText?: string };
      setLastFailedPrompt(maybeRetryable.retryableText ?? null);
      setLastError(error instanceof Error ? error.message : "Errore sconosciuto");
      toast.error("Silvio Superadmin non ha risposto", {
        description: error instanceof Error ? error.message : "Errore sconosciuto",
      });
    },
  });

  const lastAssistantMessage = useMemo(
    () => [...messages].reverse().find((message) => message.sender_id === SILVIO_ADMIN_SENDER_ID),
    [messages],
  );

  const handleSend = useCallback(() => {
    const cleanText = prompt.trim();
    if (!cleanText || sendMutation.isPending) return;
    sendMutation.mutate({ text: cleanText });
  }, [prompt, sendMutation]);

  const handleRetry = useCallback(() => {
    if (!lastFailedPrompt || sendMutation.isPending) return;
    sendMutation.mutate({ text: lastFailedPrompt, retryAssistantOnly: true });
  }, [lastFailedPrompt, sendMutation]);

  if (!permissions.can_manage_companies) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 hidden h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-amber-400 text-white shadow-lg shadow-orange-500/25 ring-1 ring-white/40 transition hover:scale-[1.03] hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-orange-400 focus:ring-offset-2 md:flex"
        aria-label="Apri chat Silvio Superadmin"
      >
        <Sparkles className="h-6 w-6" />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-bold text-white ring-2 ring-background">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className={cn(
            "flex flex-col gap-0 overflow-hidden p-0 transition-[width,max-width] duration-200",
            panelSize === "wide"
              ? "w-[min(860px,calc(100vw-24px))] sm:max-w-[860px]"
              : "w-[min(620px,calc(100vw-24px))] sm:max-w-[620px]",
          )}
        >
          <SheetHeader className="border-b bg-gradient-to-br from-orange-50 via-white to-amber-50 px-5 py-4 text-left">
            <div className="flex items-start gap-3 pr-8">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-orange-500 text-white shadow-sm">
                <Bot className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <SheetTitle className="text-lg">Silvio Superadmin</SheetTitle>
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                    <ShieldCheck className="h-3 w-3" />
                    Superadmin
                  </span>
                </div>
                <SheetDescription>
                  Chat laterale collegata al canale superadmin, agli agenti cross-tenant e alla pagina corrente.
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>

          <div className="border-b px-5 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  if (channelId) {
                    navigate(`/admin/chat?channel=${channelId}`);
                  } else {
                    navigate("/admin/chat?channel=silvio-admin");
                  }
                  setOpen(false);
                }}
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                Apri pagina completa
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setPanelSize((size) => (size === "wide" ? "comfort" : "wide"))}
              >
                {panelSize === "wide" ? (
                  <Minimize2 className="mr-2 h-4 w-4" />
                ) : (
                  <Maximize2 className="mr-2 h-4 w-4" />
                )}
                {panelSize === "wide" ? "Compatta" : "Allarga"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={!channelId || messagesQuery.isFetching}
                onClick={() => messagesQuery.refetch()}
              >
                <RefreshCw className={cn("mr-2 h-4 w-4", messagesQuery.isFetching && "animate-spin")} />
                Aggiorna
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
                <PanelRightClose className="mr-2 h-4 w-4" />
                Riduci
              </Button>
              <div className="ml-auto inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
                {pageContext.label}
              </div>
            </div>
          </div>

          <ScrollArea className="min-h-0 flex-1 bg-muted/20">
            <div className="space-y-4 p-5">
              <div className="rounded-2xl border bg-background p-3 text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">Contesto incluso:</span>{" "}
                {pageContext.label} · <span className="font-mono">{pageContext.path}</span>
              </div>
              {metaQuery.isLoading ? (
                <div className="rounded-2xl border bg-background p-4 text-sm text-muted-foreground">
                  <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                  Connessione al canale Silvio Superadmin…
                </div>
              ) : metaQuery.isError ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  <div className="mb-1 flex items-center gap-2 font-semibold">
                    <AlertTriangle className="h-4 w-4" />
                    Chat laterale non configurata
                  </div>
                  <p>
                    {metaQuery.error instanceof Error
                      ? metaQuery.error.message
                      : "Impossibile preparare il canale superadmin."}
                  </p>
                </div>
              ) : messagesQuery.isLoading ? (
                <div className="rounded-2xl border bg-background p-4 text-sm text-muted-foreground">
                  <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                  Caricamento messaggi…
                </div>
              ) : messages.length === 0 ? (
                <div className="rounded-3xl border bg-background p-5">
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-100 text-orange-600">
                    <MessageCircle className="h-5 w-5" />
                  </div>
                  <h3 className="font-semibold">Pronto per lavorare sul sistema</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Chiedi a Silvio un'analisi operativa, un controllo revenue o un piano di priorità.
                  </p>
                </div>
              ) : (
                messages.map((message) => {
                  const isSilvio = message.sender_id === SILVIO_ADMIN_SENDER_ID;
                  return (
                    <div
                      key={message.id}
                      className={cn("flex", isSilvio ? "justify-start" : "justify-end")}
                    >
                      <div
                        className={cn(
                          "max-w-[88%] rounded-3xl px-4 py-3 text-sm shadow-sm",
                          isSilvio
                            ? "border bg-background text-foreground"
                            : "bg-orange-500 text-white",
                        )}
                      >
                        <div className="mb-1 flex items-center justify-between gap-3 text-[11px] opacity-80">
                          <span className="font-medium">{isSilvio ? "Silvio" : "Tu"}</span>
                          <span>{formatMessageTime(message.created_at)}</span>
                        </div>
                        <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
                        {isSilvio && message.last_model_id ? (
                          <div className="mt-2 text-[11px] text-muted-foreground">
                            {message.last_model_id}
                            {typeof message.last_latency_ms === "number"
                              ? ` · ${message.last_latency_ms} ms`
                              : ""}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })
              )}
              {sendMutation.isPending ? (
                <div className="flex justify-start">
                  <div className="rounded-3xl border bg-background px-4 py-3 text-sm text-muted-foreground shadow-sm">
                    <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                    Silvio sta ragionando…
                  </div>
                </div>
              ) : null}
              {lastError ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
                  <div className="mb-1 flex items-center gap-2 font-semibold">
                    <AlertTriangle className="h-4 w-4" />
                    Risposta non completata
                  </div>
                  <p className="text-red-800">{lastError}</p>
                  {lastFailedPrompt ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-3 border-red-200 bg-white text-red-700 hover:bg-red-50"
                      onClick={handleRetry}
                      disabled={sendMutation.isPending}
                    >
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Riprova risposta
                    </Button>
                  ) : null}
                </div>
              ) : null}
              <div ref={scrollAnchorRef} />
            </div>
          </ScrollArea>

          <div className="border-t bg-background p-4">
            <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
              {contextualQuickPrompts.map((quickPrompt) => (
                <button
                  key={quickPrompt}
                  type="button"
                  onClick={() => setPrompt(quickPrompt)}
                  className="shrink-0 rounded-full border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700"
                >
                  {quickPrompt.length > 44 ? `${quickPrompt.slice(0, 44)}…` : quickPrompt}
                </button>
              ))}
            </div>
            {lastAssistantMessage ? (
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>Ultima risposta Silvio: {formatMessageTime(lastAssistantMessage.created_at)}</span>
                <span>{sendMutation.isPending ? "In elaborazione" : "Pronto"}</span>
              </div>
            ) : null}
            <div className="flex items-end gap-2">
              <Textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                    event.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Scrivi a Silvio Superadmin…"
                className="min-h-[76px] resize-none text-sm"
                disabled={!metaQuery.data || sendMutation.isPending}
              />
              <Button
                type="button"
                size="icon"
                className="h-11 w-11 shrink-0 bg-orange-500 hover:bg-orange-600"
                disabled={!prompt.trim() || !metaQuery.data || sendMutation.isPending}
                onClick={handleSend}
              >
                {sendMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                <span className="sr-only">Invia messaggio</span>
              </Button>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Premi Cmd/Ctrl + Invio per inviare.
            </p>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
