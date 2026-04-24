import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  MessageCircle, Send, Loader2, Mail, Smartphone, MessageSquare, StickyNote,
  AlertCircle, CheckCircle2, XCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface Message {
  id: string;
  sender_role: "customer" | "staff";
  sender_id: string;
  body: string;
  read_at: string | null;
  created_at: string;
  channel: "chat" | "internal" | "email" | "sms" | "whatsapp";
  subject: string | null;
  delivery_status: "sent" | "delivered" | "failed" | "queued" | "opened" | "bounced";
  delivery_metadata: Record<string, unknown>;
}

interface CustomerDiaryPanelProps {
  customerId: string;
  customerName: string;
  customerEmail?: string | null;
}

type Channel = "chat" | "internal" | "email" | "sms" | "whatsapp";

interface ChannelDef {
  id: Channel;
  label: string;
  icon: LucideIcon;
  available: boolean;
  requires?: "email" | "phone";
}

/* ─── Channel config ────────────────────────────────────────────── */
function getChannels(hasEmail: boolean): ChannelDef[] {
  return [
    { id: "chat",      label: "Chat",      icon: MessageCircle,   available: true },
    { id: "internal",  label: "Nota",      icon: StickyNote,      available: true },
    { id: "email",     label: "Email",     icon: Mail,            available: hasEmail, requires: "email" },
    { id: "sms",       label: "SMS",       icon: Smartphone,      available: false,    requires: "phone" },
    { id: "whatsapp",  label: "WhatsApp",  icon: MessageSquare,   available: false,    requires: "phone" },
  ];
}

/* ─── Bubble ────────────────────────────────────────────────────── */
function MessageBubble({ message }: { message: Message }) {
  const isStaff = message.sender_role === "staff";
  const isInternal = message.channel === "internal";
  const isEmail = message.channel === "email";
  const isFailed = message.delivery_status === "failed";

  // Colore speciale per email / nota / failed
  const bubbleClass = isFailed
    ? "bg-red-100 border border-red-300 text-red-900 dark:bg-red-900/20 dark:border-red-500/40 dark:text-red-200"
    : isInternal
    ? "bg-amber-100 border border-amber-300 text-amber-900 dark:bg-amber-900/20 dark:border-amber-500/40 dark:text-amber-100"
    : isEmail
    ? (isStaff ? "bg-blue-100 border border-blue-300 text-blue-900 dark:bg-blue-900/20 dark:border-blue-500/40 dark:text-blue-100 rounded-br-md" : "bg-blue-50 border border-blue-200 rounded-bl-md")
    : (isStaff ? "bg-primary text-primary-foreground rounded-br-md" : "bg-muted rounded-bl-md");

  const channelIcon = isInternal ? StickyNote : isEmail ? Mail : MessageCircle;
  const ChannelIcon = channelIcon;

  return (
    <div className={cn("flex", isStaff ? "justify-end" : "justify-start")}>
      <div className={cn("max-w-[85%] rounded-2xl px-3 py-2 text-sm", bubbleClass)}>
        {(isEmail || isInternal) && (
          <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide opacity-70 mb-1">
            <ChannelIcon className="h-2.5 w-2.5" />
            {isEmail ? "Email" : "Nota interna"}
            {isFailed && (
              <Badge variant="destructive" className="ml-1 h-3 px-1 text-[9px] bg-red-500 text-white">
                <XCircle className="h-2 w-2 mr-0.5" />
                Non inviata
              </Badge>
            )}
            {isEmail && !isFailed && (
              <Badge variant="outline" className="ml-1 h-3 px-1 text-[9px] border-current">
                <CheckCircle2 className="h-2 w-2 mr-0.5" />
                {message.delivery_status === "opened" ? "Aperta" : "Inviata"}
              </Badge>
            )}
          </div>
        )}
        {isEmail && message.subject && (
          <p className="font-semibold text-xs mb-1 opacity-90">Oggetto: {message.subject}</p>
        )}
        {/* body: se email è HTML → strippa; altrimenti pre-wrap */}
        {isEmail ? (
          <div
            className="text-xs prose-sm max-w-none [&>*]:my-1"
            dangerouslySetInnerHTML={{ __html: message.body }}
          />
        ) : (
          <p className="whitespace-pre-wrap break-words">{message.body}</p>
        )}
        <p className={cn(
          "text-[10px] mt-1",
          isFailed ? "text-red-700/70" : isInternal ? "text-amber-700/70" : isEmail ? "opacity-70" : isStaff ? "text-primary-foreground/60" : "text-muted-foreground",
        )}>
          {format(new Date(message.created_at), "dd MMM HH:mm", { locale: it })}
        </p>
      </div>
    </div>
  );
}

/* ─── Main component ────────────────────────────────────────────── */
export function CustomerDiaryPanel({ customerId, customerName, customerEmail }: CustomerDiaryPanelProps) {
  const { user, effectiveCompany } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const companyId = effectiveCompany?.id;

  const [newMessage, setNewMessage] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [selectedChannel, setSelectedChannel] = useState<Channel>("chat");
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);

  const hasEmail = !!customerEmail && customerEmail.includes("@");
  const channels = useMemo(() => getChannels(hasEmail), [hasEmail]);

  const queryKey = ["staff-customer-messages", customerId];

  const { data: messages = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_messages")
        .select("id, sender_role, sender_id, body, read_at, created_at, channel, subject, delivery_status, delivery_metadata")
        .eq("customer_id", customerId)
        .eq("company_id", companyId!)
        .order("created_at", { ascending: true })
        .limit(500);
      if (error) throw error;
      return (data || []) as unknown as Message[];
    },
    enabled: !!customerId && !!companyId,
    staleTime: 15 * 1000,
  });

  const unreadCount = messages.filter((m) => m.sender_role === "customer" && !m.read_at && m.channel === "chat").length;

  // Mark customer chat messages as read
  useEffect(() => {
    if (!customerId || !companyId || messages.length === 0) return;
    const unreadIds = messages
      .filter((m) => m.sender_role === "customer" && !m.read_at && m.channel === "chat")
      .map((m) => m.id);
    if (unreadIds.length === 0) return;
    supabase
      .from("customer_messages")
      .update({ read_at: new Date().toISOString() })
      .in("id", unreadIds)
      .then();
  }, [messages, customerId, companyId]);

  // Auto-scroll
  useEffect(() => {
    if (messages.length > prevCountRef.current) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
    prevCountRef.current = messages.length;
  }, [messages.length]);

  // Realtime
  useEffect(() => {
    if (!customerId) return;
    const channel = supabase
      .channel(`diary-chat-${customerId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "customer_messages",
          filter: `customer_id=eq.${customerId}`,
        },
        () => { queryClient.invalidateQueries({ queryKey }); },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [customerId, queryClient]);

  /* ─── Send chat/internal ──────────────────────────────── */
  const sendMutation = useMutation({
    mutationFn: async ({ body, channel }: { body: string; channel: "chat" | "internal" }) => {
      const { error } = await supabase.from("customer_messages").insert({
        company_id: companyId!,
        customer_id: customerId,
        sender_role: "staff",
        sender_id: user!.id,
        channel,
        body,
        delivery_status: "sent",
      });
      if (error) throw error;
    },
    onMutate: async ({ body, channel }) => {
      const optimistic: Message = {
        id: `temp-${Date.now()}`,
        sender_role: "staff",
        sender_id: user!.id,
        body,
        read_at: null,
        created_at: new Date().toISOString(),
        channel,
        subject: null,
        delivery_status: "sent",
        delivery_metadata: {},
      };
      queryClient.setQueryData<Message[]>(queryKey, (old = []) => [...old, optimistic]);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (e) => {
      toast({
        title: "Errore invio",
        description: e instanceof Error ? e.message : "Impossibile inviare il messaggio",
        variant: "destructive",
      });
    },
  });

  /* ─── Send email ──────────────────────────────────────── */
  const sendEmailMutation = useMutation({
    mutationFn: async ({ subject, body }: { subject: string; body: string }) => {
      // Wrap plain text body in minimal HTML
      const safeSubject = subject.slice(0, 200);
      const bodyEscaped = body
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      const html = `<!DOCTYPE html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #222;">
  <div style="white-space: pre-wrap; line-height: 1.6;">${bodyEscaped}</div>
  <hr style="margin: 32px 0 16px; border: 0; border-top: 1px solid #eee;" />
  <p style="font-size: 11px; color: #888;">Inviato tramite ${effectiveCompany?.name ?? "EdiliziaInCloud"}</p>
</body></html>`;

      const { data, error } = await supabase.functions.invoke("send-customer-email", {
        body: {
          customer_id: customerId,
          subject: safeSubject,
          body_html: html,
          body_text: body,
        },
      });
      if (error) {
        let body: { error?: string } | null = null;
        try {
          const ctx = (error as { context?: unknown }).context;
          if (ctx instanceof Response) body = await ctx.json();
        } catch { /* ignore */ }
        throw new Error(body?.error ?? error.message ?? "Invio email fallito");
      }
      if (data?.error) throw new Error(data.error);
      return data as { success: boolean; charged_eur?: number };
    },
    onSuccess: (data) => {
      const cost = data?.charged_eur ?? 0;
      toast({
        title: "Email inviata",
        description: cost > 0 ? `Costo: € ${cost.toFixed(4)}. Consegna in corso.` : "Consegna in corso.",
      });
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (e) => {
      toast({
        title: "Errore invio email",
        description: e instanceof Error ? e.message : "Impossibile inviare l'email",
        variant: "destructive",
      });
    },
  });

  /* ─── Handle send ─────────────────────────────────────── */
  const handleSend = useCallback(() => {
    const trimmed = newMessage.trim();
    if (!trimmed) return;

    if (selectedChannel === "email") {
      const subj = emailSubject.trim();
      if (!subj) {
        toast({
          title: "Oggetto mancante",
          description: "L'email richiede un oggetto.",
          variant: "destructive",
        });
        return;
      }
      if (!hasEmail) {
        toast({
          title: "Email cliente mancante",
          description: "Aggiungi un indirizzo email al profilo cliente prima di inviare.",
          variant: "destructive",
        });
        return;
      }
      sendEmailMutation.mutate({ subject: subj, body: trimmed });
      setNewMessage("");
      setEmailSubject("");
      return;
    }

    setNewMessage("");
    sendMutation.mutate({ body: trimmed, channel: selectedChannel === "internal" ? "internal" : "chat" });
  }, [newMessage, emailSubject, selectedChannel, hasEmail, sendMutation, sendEmailMutation, toast]);

  const isSending = sendMutation.isPending || sendEmailMutation.isPending;

  const placeholders: Record<Channel, string> = {
    chat: `Messaggio per ${customerName}…`,
    internal: "Nota interna — visibile solo al tuo team",
    email: `Scrivi l'email a ${customerEmail ?? "cliente"}…`,
    sms: "SMS non ancora disponibile",
    whatsapp: "WhatsApp non ancora disponibile",
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <MessageCircle className="h-4 w-4" />
          Diario
          {unreadCount > 0 && (
            <Badge variant="destructive" className="text-[10px] h-4 px-1.5">
              {unreadCount}
            </Badge>
          )}
          <span className="ml-auto text-[10px] text-muted-foreground font-normal normal-case">
            {messages.length} messaggi
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {/* Area messaggi scrollabile */}
        <div ref={scrollRef} className="max-h-[420px] min-h-[120px] overflow-y-auto px-4 py-2 space-y-3">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : messages.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Nessun messaggio. Inizia la conversazione.
            </p>
          ) : (
            messages.map((msg) => <MessageBubble key={msg.id} message={msg} />)
          )}
        </div>

        <Separator />

        {/* Toolbar invio */}
        <div className="p-3 space-y-2">
          {/* Selezione canale */}
          <div className="flex gap-1.5 flex-wrap">
            {channels.map((ch) => {
              const isSelected = selectedChannel === ch.id;
              const disabledReason = !ch.available
                ? (ch.requires === "email" && !hasEmail
                    ? "Email cliente mancante"
                    : "Disponibile a breve")
                : null;
              return (
                <Button
                  key={ch.id}
                  variant={isSelected ? "default" : "outline"}
                  size="sm"
                  className="h-7 px-2 text-[11px]"
                  disabled={!ch.available}
                  onClick={() => setSelectedChannel(ch.id)}
                  title={disabledReason ?? undefined}
                >
                  <ch.icon className="h-3 w-3 mr-1" />
                  {ch.label}
                  {!ch.available && <span className="ml-1 text-[9px] opacity-60">{disabledReason ?? "presto"}</span>}
                </Button>
              );
            })}
          </div>

          {/* Email-specific subject field */}
          {selectedChannel === "email" && (
            <div className="space-y-1">
              <Label htmlFor="email-subject" className="text-[11px]">Oggetto</Label>
              <Input
                id="email-subject"
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                placeholder="Oggetto dell'email…"
                maxLength={200}
                className="h-8 text-sm"
              />
            </div>
          )}

          {/* Warning box per internal/email */}
          {selectedChannel === "internal" && (
            <div className="flex items-start gap-1.5 text-[11px] text-amber-700 dark:text-amber-400 bg-amber-50/50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-500/30 rounded p-1.5">
              <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
              <span>Le note interne sono visibili solo al tuo team. Il cliente non le riceverà.</span>
            </div>
          )}
          {selectedChannel === "email" && (
            <div className="flex items-start gap-1.5 text-[11px] text-blue-700 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-500/30 rounded p-1.5">
              <Mail className="h-3 w-3 mt-0.5 shrink-0" />
              <span>L'email sarà inviata a <strong>{customerEmail}</strong> e consumerà un credito email.</span>
            </div>
          )}

          {/* Input messaggio */}
          <div className="flex gap-2">
            <Textarea
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  handleSend();
                } else if (e.key === "Enter" && !e.shiftKey && selectedChannel !== "email") {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={placeholders[selectedChannel]}
              rows={selectedChannel === "email" ? 4 : 2}
              className="flex-1 resize-none text-sm"
              disabled={isSending}
            />
            <Button
              size="sm"
              className="self-end h-9"
              onClick={handleSend}
              disabled={!newMessage.trim() || isSending || (selectedChannel === "email" && !hasEmail)}
            >
              {isSending
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Send className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground">
            {selectedChannel === "email"
              ? "Cmd/Ctrl + Enter per inviare"
              : "Enter per inviare, Shift+Enter per nuova riga"}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
