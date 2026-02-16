import { useState, useRef, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Send, Loader2, User } from "lucide-react";
import { formatDateTime } from "@/lib/formatters";
import type { TicketMessage } from "@/types/tickets";

interface TicketChatProps {
  ticketId: string;
  messages: TicketMessage[];
  /** The customer's user ID — used to distinguish customer vs admin bubbles */
  customerId?: string;
  /** If true, hides the reply form (e.g. resolved tickets) */
  disabled?: boolean;
  /** Message shown when disabled */
  disabledMessage?: string;
  /** Query keys to invalidate after sending */
  invalidateKeys?: string[][];
  /** Height style for the card */
  height?: string;
}

export function TicketChat({
  ticketId,
  messages,
  customerId,
  disabled = false,
  disabledMessage,
  invalidateKeys = [],
  height = "calc(100vh - 400px)",
}: TicketChatProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [newMessage, setNewMessage] = useState("");

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessageMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("ticket_messages")
        .insert({
          ticket_id: ticketId,
          sender_id: user!.id,
          message: newMessage.trim(),
        });
      if (error) throw error;

      await supabase
        .from("tickets")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", ticketId);
    },
    onSuccess: () => {
      setNewMessage("");
      invalidateKeys.forEach((key) =>
        queryClient.invalidateQueries({ queryKey: key })
      );
    },
    onError: () => {
      toast({
        title: "Errore",
        description: "Impossibile inviare il messaggio. Riprova.",
        variant: "destructive",
      });
    },
  });

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;
    sendMessageMutation.mutate();
  };

  const isCustomerMsg = (senderId: string) =>
    customerId ? senderId === customerId : senderId === user?.id;

  return (
    <Card
      className="flex flex-col"
      style={{ height, minHeight: "300px" }}
    >
      <CardHeader className="border-b flex-shrink-0">
        <CardTitle className="text-lg">Conversazione</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => {
          const isSelf = msg.sender_id === user?.id;
          const isCustomer = isCustomerMsg(msg.sender_id);
          const senderName = msg.sender
            ? `${msg.sender.first_name} ${msg.sender.last_name}`
            : "Utente";

          return (
            <div
              key={msg.id}
              className={`flex ${isSelf ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-lg p-3 ${
                  isSelf
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                }`}
              >
                {!isSelf && (
                  <div className="flex items-center gap-1 mb-1">
                    <User className="h-3 w-3" />
                    <span className="text-xs font-medium">{senderName}</span>
                  </div>
                )}
                <p className="text-sm whitespace-pre-wrap">{msg.message}</p>
                <p
                  className={`text-xs mt-1 ${
                    isSelf
                      ? "text-primary-foreground/70"
                      : "text-muted-foreground"
                  }`}
                >
                  {formatDateTime(msg.created_at)}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </CardContent>

      {disabled ? (
        disabledMessage && (
          <div className="border-t p-4 text-center text-sm text-muted-foreground">
            {disabledMessage}
          </div>
        )
      ) : (
        <div className="border-t p-4 flex-shrink-0">
          <form onSubmit={handleSend} className="flex gap-2">
            <Textarea
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Scrivi un messaggio..."
              rows={2}
              className="resize-none"
            />
            <Button
              type="submit"
              size="icon"
              disabled={!newMessage.trim() || sendMessageMutation.isPending}
              className="flex-shrink-0 h-auto"
            >
              {sendMessageMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </form>
        </div>
      )}
    </Card>
  );
}
