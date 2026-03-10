import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { MessageCircle, Send, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface Message {
  id: string;
  sender_role: "customer" | "staff";
  sender_id: string;
  body: string;
  read_at: string | null;
  created_at: string;
}

interface ClientMessagesPanelProps {
  customerId: string;
  customerName: string;
}

export function ClientMessagesPanel({ customerId, customerName }: ClientMessagesPanelProps) {
  const { user, effectiveCompany } = useAuth();
  const queryClient = useQueryClient();
  const companyId = effectiveCompany?.id;
  const [newMessage, setNewMessage] = useState("");
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

  // Count unread from customer
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

  // Realtime
  useEffect(() => {
    if (!customerId) return;
    const channel = supabase
      .channel(`staff-chat-${customerId}`)
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
        }
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <Card className="flex flex-col h-[400px]">
      <CardHeader className="pb-2 shrink-0">
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-primary" />
            Messaggi con {customerName}
          </span>
          {unreadCount > 0 && (
            <Badge variant="destructive" className="text-xs">{unreadCount} non letti</Badge>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent className="flex-1 overflow-hidden flex flex-col p-0">
        {isLoading ? (
          <div className="flex items-center justify-center flex-1">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
            {messages.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">Nessun messaggio. Inizia la conversazione.</p>
            )}
            {messages.map((msg) => {
              const isStaff = msg.sender_role === "staff";
              return (
                <div key={msg.id} className={cn("flex", isStaff ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "max-w-[75%] rounded-2xl px-3 py-2 text-sm",
                      isStaff
                        ? "bg-primary text-primary-foreground rounded-br-md"
                        : "bg-muted rounded-bl-md"
                    )}
                  >
                    <p className="whitespace-pre-wrap break-words">{msg.body}</p>
                    <p className={cn(
                      "text-[10px] mt-0.5",
                      isStaff ? "text-primary-foreground/60" : "text-muted-foreground"
                    )}>
                      {format(new Date(msg.created_at), "HH:mm", { locale: it })}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="border-t p-3 shrink-0">
          <div className="flex gap-2">
            <Textarea
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Scrivi un messaggio..."
              className="resize-none min-h-[40px] max-h-[100px]"
              rows={1}
            />
            <Button
              size="icon"
              onClick={handleSend}
              disabled={!newMessage.trim() || sendMutation.isPending}
              className="shrink-0 h-10 w-10"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
