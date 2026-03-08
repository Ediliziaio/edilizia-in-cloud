import { useEffect, useRef, useState } from "react";
import { useMessages, useMessagingRealtime, useAnalyzeMessage } from "@/hooks/useMessagingData";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { MessageBubble } from "./MessageBubble";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Bot, Loader2, MessageSquare, Phone, Star, MoreVertical } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const AVATAR_COLORS = [
  "bg-blue-500", "bg-emerald-500", "bg-violet-500", "bg-amber-500",
  "bg-rose-500", "bg-cyan-500", "bg-fuchsia-500", "bg-teal-500",
];

function getInitials(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function getAvatarColor(name: string | null): string {
  if (!name) return AVATAR_COLORS[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

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
  const scrollEndRef = useRef<HTMLDivElement>(null);

  useMessagingRealtime(conversationId);

  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const [isSending, setIsSending] = useState(false);

  const handleSendReply = async () => {
    if (!replyText.trim() || !conversationId || isSending) return;
    setIsSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-whatsapp-reply", {
        body: {
          conversation_id: conversationId,
          content: replyText.trim(),
        },
      });

      if (error || data?.error) {
        toast.error("Errore invio messaggio", {
          description: error?.message || data?.error,
        });
      } else {
        setReplyText("");
      }
    } catch (err: any) {
      toast.error("Errore invio", { description: err.message });
    } finally {
      setIsSending(false);
    }
  };

  const handleAnalyze = (msgId: string) => {
    if (!effectiveCompany?.id) return;
    analyzeMessage.mutate({ messageId: msgId, companyId: effectiveCompany.id });
  };

  if (!conversationId) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground bg-muted/20">
        <div className="text-center">
          <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">Seleziona una conversazione</p>
          <p className="text-xs mt-1 opacity-70">oppure usa "Simula Messaggio" per testare il flusso AI</p>
        </div>
      </div>
    );
  }

  const contactName = conversation?.contact_name || conversation?.phone_number || "Conversazione";

  return (
    <div className="flex-1 flex flex-col">
      {/* Header */}
      <div className="h-14 border-b flex items-center px-4 gap-3 bg-background">
        <div className={cn(
          "h-8 w-8 rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0",
          getAvatarColor(conversation?.contact_name)
        )}>
          {getInitials(conversation?.contact_name)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">{contactName}</p>
          <p className="text-xs text-muted-foreground">{conversation?.contact_type}</p>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <Phone className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <Star className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4">
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
        <div ref={scrollEndRef} />
      </ScrollArea>

      {/* Reply input */}
      <div className="p-3 border-t flex gap-2 bg-background">
        <Input
          placeholder="Digita un messaggio..."
          value={replyText}
          onChange={(e) => setReplyText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSendReply()}
          className="bg-muted/50"
        />
        <Button size="icon" onClick={handleSendReply} disabled={!replyText.trim() || isSending}>
          {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
