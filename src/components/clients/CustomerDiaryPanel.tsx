import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  MessageCircle, Send, Loader2, Mail, Smartphone, MessageSquare, StickyNote,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
}

interface CustomerDiaryPanelProps {
  customerId: string;
  customerName: string;
}

type Channel = "chat" | "internal" | "email" | "sms" | "whatsapp";

interface ChannelDef {
  id: Channel;
  label: string;
  icon: LucideIcon;
  available: boolean;
}

const CHANNELS: ChannelDef[] = [
  { id: "chat", label: "Chat", icon: MessageCircle, available: true },
  { id: "internal", label: "Nota", icon: StickyNote, available: true },
  { id: "email", label: "Email", icon: Mail, available: false },
  { id: "sms", label: "SMS", icon: Smartphone, available: false },
  { id: "whatsapp", label: "WhatsApp", icon: MessageSquare, available: false },
];

function MessageBubble({ message }: { message: Message }) {
  const isStaff = message.sender_role === "staff";
  return (
    <div className={cn("flex", isStaff ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[75%] rounded-2xl px-3 py-2 text-sm",
          isStaff
            ? "bg-primary text-primary-foreground rounded-br-md"
            : "bg-muted rounded-bl-md",
        )}
      >
        <p className="whitespace-pre-wrap break-words">{message.body}</p>
        <p className={cn(
          "text-[10px] mt-0.5",
          isStaff ? "text-primary-foreground/60" : "text-muted-foreground",
        )}>
          {format(new Date(message.created_at), "HH:mm", { locale: it })}
        </p>
      </div>
    </div>
  );
}

export function CustomerDiaryPanel({ customerId, customerName: _customerName }: CustomerDiaryPanelProps) {
  const { user, effectiveCompany } = useAuth();
  const queryClient = useQueryClient();
  const companyId = effectiveCompany?.id;

  const [newMessage, setNewMessage] = useState("");
  const [selectedChannel, setSelectedChannel] = useState<Channel>("chat");
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);

  const queryKey = ["staff-customer-messages", customerId];

  const { data: messages = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_messages")
        .select("id, sender_role, sender_id, body, read_at, created_at")
        .eq("customer_id", customerId)
        .eq("company_id", companyId!)
        .order("created_at", { ascending: true })
        .limit(500);
      if (error) throw error;
      return (data || []) as Message[];
    },
    enabled: !!customerId && !!companyId,
    staleTime: 15 * 1000,
  });

  const unreadCount = messages.filter((m) => m.sender_role === "customer" && !m.read_at).length;

  // Mark customer messages as read
  useEffect(() => {
    if (!customerId || !companyId || messages.length === 0) return;
    const unreadIds = messages
      .filter((m) => m.sender_role === "customer" && !m.read_at)
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

  // Realtime subscription
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
        () => {
          queryClient.invalidateQueries({ queryKey });
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [customerId, queryClient]);

  const sendMutation = useMutation({
    mutationFn: async (body: string) => {
      const { error } = await supabase.from("customer_messages").insert({
        company_id: companyId!,
        customer_id: customerId,
        sender_role: "staff",
        sender_id: user!.id,
        body,
      });
      if (error) throw error;
    },
    onMutate: async (body) => {
      const optimistic: Message = {
        id: `temp-${Date.now()}`,
        sender_role: "staff",
        sender_id: user!.id,
        body,
        read_at: null,
        created_at: new Date().toISOString(),
      };
      queryClient.setQueryData<Message[]>(queryKey, (old = []) => [...old, optimistic]);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const handleSend = useCallback(() => {
    const trimmed = newMessage.trim();
    if (!trimmed) return;
    setNewMessage("");
    sendMutation.mutate(trimmed);
  }, [newMessage, sendMutation]);

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
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {/* Area messaggi scrollabile */}
        <div ref={scrollRef} className="max-h-[360px] min-h-[120px] overflow-y-auto px-4 py-2 space-y-3">
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
            {CHANNELS.map((ch) => (
              <Button
                key={ch.id}
                variant={selectedChannel === ch.id ? "default" : "outline"}
                size="sm"
                className="h-7 px-2 text-[11px]"
                disabled={!ch.available}
                onClick={() => setSelectedChannel(ch.id)}
              >
                <ch.icon className="h-3 w-3 mr-1" />
                {ch.label}
                {!ch.available && <span className="ml-1 text-[9px] opacity-60">presto</span>}
              </Button>
            ))}
          </div>

          {/* Input messaggio */}
          <div className="flex gap-2">
            <Textarea
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={selectedChannel === "internal" ? "Nota interna..." : "Messaggio..."}
              rows={2}
              className="flex-1 resize-none text-sm"
            />
            <Button
              size="sm"
              className="self-end h-9"
              onClick={handleSend}
              disabled={!newMessage.trim() || sendMutation.isPending}
            >
              {sendMutation.isPending
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
