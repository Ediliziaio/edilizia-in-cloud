import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { MessageCircle, Loader2, Send } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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

export default function CustomerMessages() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [newMessage, setNewMessage] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);

  const queryKey = queryKeys.customerMessages.list(user?.id);

  const { data: messages = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_messages")
        .select("id, sender_role, sender_id, body, read_at, created_at")
        .eq("customer_id", user!.id)
        .order("created_at", { ascending: true })
        .limit(500);
      if (error) throw error;
      return (data || []) as Message[];
    },
    enabled: !!user?.id,
    staleTime: 15 * 1000,
  });

  // Mark staff messages as read
  useEffect(() => {
    if (!user?.id || messages.length === 0) return;
    const unreadIds = messages
      .filter((m) => m.sender_role === "staff" && !m.read_at)
      .map((m) => m.id);
    if (unreadIds.length === 0) return;

    supabase
      .from("customer_messages")
      .update({ read_at: new Date().toISOString() })
      .in("id", unreadIds)
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ["customer-messages-unread", user.id] });
      });
  }, [messages, user?.id, queryClient]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (messages.length > prevCountRef.current) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
    prevCountRef.current = messages.length;
  }, [messages.length]);

  // Realtime subscription
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel("customer-chat")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "customer_messages",
          filter: `customer_id=eq.${user.id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user?.id, queryClient]);

  const sendMutation = useMutation({
    mutationFn: async (body: string) => {
      // Get company_id from profile
      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("id", user!.id)
        .single();

      if (!profile?.company_id) throw new Error("Company not found");

      const { error } = await supabase.from("customer_messages").insert({
        company_id: profile.company_id,
        customer_id: user!.id,
        sender_role: "customer",
        sender_id: user!.id,
        body,
      });
      if (error) throw error;
    },
    onMutate: async (body) => {
      // Optimistic insert
      const optimistic: Message = {
        id: `temp-${Date.now()}`,
        sender_role: "customer",
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Messaggi</h1>

      <Card className="flex flex-col" style={{ height: "calc(100vh - 260px)", minHeight: "400px" }}>
        <CardHeader className="pb-2 shrink-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageCircle className="h-5 w-5 text-primary" />
            Chat con l'azienda
          </CardTitle>
        </CardHeader>

        {/* Messages area */}
        <CardContent className="flex-1 overflow-hidden flex flex-col p-0">
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.length === 0 && (
              <div className="flex items-center justify-center h-full">
                <p className="text-sm text-muted-foreground">Nessun messaggio. Scrivi per iniziare la conversazione.</p>
              </div>
            )}
            {messages.map((msg) => {
              const isMe = msg.sender_role === "customer";
              return (
                <div key={msg.id} className={cn("flex", isMe ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "max-w-[75%] rounded-2xl px-4 py-2.5 text-sm",
                      isMe
                        ? "bg-primary text-primary-foreground rounded-br-md"
                        : "bg-muted rounded-bl-md"
                    )}
                  >
                    <p className="whitespace-pre-wrap break-words">{msg.body}</p>
                    <p className={cn(
                      "text-[10px] mt-1",
                      isMe ? "text-primary-foreground/60" : "text-muted-foreground"
                    )}>
                      {format(new Date(msg.created_at), "HH:mm", { locale: it })}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Input area */}
          <div className="border-t p-3 shrink-0">
            <div className="flex gap-2">
              <Textarea
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Scrivi un messaggio..."
                className="resize-none min-h-[44px] max-h-[120px]"
                rows={1}
              />
              <Button
                size="icon"
                onClick={handleSend}
                disabled={!newMessage.trim() || sendMutation.isPending}
                className="shrink-0 h-11 w-11"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
