import { useEffect, useRef, useState } from "react";
import { useMessages, useMessagingRealtime, useAnalyzeMessage } from "@/hooks/useMessagingData";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { MessageBubble } from "./MessageBubble";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Bot, Loader2, MessageSquare } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";

interface ChatViewProps {
  conversationId: string | null;
  selectedMessageId: string | null;
  onSelectMessage: (id: string) => void;
  conversation: any;
}

export function ChatView({ conversationId, selectedMessageId, onSelectMessage, conversation }: ChatViewProps) {
  const { data: messages, isLoading } = useMessages(conversationId);
  const analyzeMessage = useAnalyzeMessage();
  const { effectiveCompany } = useAuth();
  const [replyText, setReplyText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useMessagingRealtime(conversationId);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSendReply = async () => {
    if (!replyText.trim() || !conversationId) return;
    const { error } = await supabase.from("messaging_messages").insert({
      conversation_id: conversationId,
      sender_type: "operator",
      sender_name: "Operatore",
      message_type: "text",
      content: replyText.trim(),
    });
    if (error) {
      toast({ title: "Errore invio", description: error.message, variant: "destructive" });
    } else {
      setReplyText("");
    }
  };

  const handleAnalyze = (msgId: string) => {
    if (!effectiveCompany?.id) return;
    analyzeMessage.mutate({ messageId: msgId, companyId: effectiveCompany.id });
  };

  if (!conversationId) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Seleziona una conversazione</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col">
      {/* Header */}
      <div className="h-14 border-b flex items-center px-4 gap-3 bg-background">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">
            {conversation?.contact_name || conversation?.phone_number || "Conversazione"}
          </p>
          <p className="text-xs text-muted-foreground">{conversation?.contact_type}</p>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-2/3" />
            ))}
          </div>
        ) : !messages?.length ? (
          <div className="text-center text-sm text-muted-foreground py-8">
            Nessun messaggio
          </div>
        ) : (
          messages.map((msg: any) => (
            <div key={msg.id}>
              <MessageBubble
                message={msg}
                isSelected={selectedMessageId === msg.id}
                onSelect={onSelectMessage}
              />
              {msg.sender_type === "contact" && !msg.ai_processed && (
                <div className="flex justify-start mb-3 ml-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 text-xs gap-1"
                    onClick={() => handleAnalyze(msg.id)}
                    disabled={analyzeMessage.isPending}
                  >
                    {analyzeMessage.isPending ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Bot className="h-3 w-3" />
                    )}
                    Analizza con AI
                  </Button>
                </div>
              )}
            </div>
          ))
        )}
      </ScrollArea>

      {/* Reply input */}
      <div className="p-3 border-t flex gap-2">
        <Input
          placeholder="Scrivi una risposta..."
          value={replyText}
          onChange={(e) => setReplyText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSendReply()}
        />
        <Button size="icon" onClick={handleSendReply} disabled={!replyText.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
