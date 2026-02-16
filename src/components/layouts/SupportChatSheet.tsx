import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Send } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { playNotificationSound } from "@/lib/notificationSound";
import { toast } from "sonner";

interface SupportMessage {
  id: string;
  company_id: string;
  sender_id: string;
  sender_role: string;
  message: string;
  created_at: string;
}

interface SupportChatSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SupportChatSheet({ open, onOpenChange }: SupportChatSheetProps) {
  const { user, effectiveCompany } = useAuth();
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const companyId = effectiveCompany?.id;

  // Load messages
  useEffect(() => {
    if (!open || !companyId) return;

    const fetchMessages = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("support_messages")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: true });
      setMessages((data as SupportMessage[]) || []);
      setLoading(false);
    };

    fetchMessages();
  }, [open, companyId]);

  // Realtime subscription
  useEffect(() => {
    if (!open || !companyId) return;

    const channel = supabase
      .channel("support-messages-" + companyId)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "support_messages",
          filter: `company_id=eq.${companyId}`,
        },
        (payload) => {
          const newMsg = payload.new as SupportMessage;
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
          if (newMsg.sender_role === "super_admin") {
            playNotificationSound();
            toast("Nuovo messaggio dal supporto", {
              description: newMsg.message.slice(0, 80),
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [open, companyId]);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!newMessage.trim() || !user || !companyId) return;

    setSending(true);
    try {
      const { error } = await supabase.from("support_messages").insert({
        company_id: companyId,
        sender_id: user.id,
        sender_role: "company",
        message: newMessage.trim(),
      });
      if (error) {
        console.error("Error sending message:", error);
        toast.error("Errore nell'invio del messaggio");
        return;
      }
      setNewMessage("");
    } catch (err) {
      console.error("Error sending message:", err);
      toast.error("Errore nell'invio del messaggio");
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col p-0 sm:max-w-md">
        <SheetHeader className="px-6 pt-6 pb-4 border-b">
          <SheetTitle>Assistenza</SheetTitle>
          <SheetDescription>Chat con il supporto</SheetDescription>
        </SheetHeader>

        {loading ? (
          <div className="flex-1 p-6 space-y-4">
            <Skeleton className="h-12 w-3/4" />
            <Skeleton className="h-12 w-1/2 ml-auto" />
            <Skeleton className="h-12 w-2/3" />
          </div>
        ) : (
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-3">
              {messages.length === 0 ? (
                <p className="text-center text-muted-foreground text-sm py-8">
                  Scrivi un messaggio per iniziare la conversazione
                </p>
              ) : (
                messages.map((msg) => {
                  const isCompany = msg.sender_role === "company";
                  return (
                    <div
                      key={msg.id}
                      className={`flex ${isCompany ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                          isCompany
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-foreground"
                        }`}
                      >
                        <p className="whitespace-pre-wrap break-words">{msg.message}</p>
                        <p
                          className={`text-xs mt-1 ${
                            isCompany ? "text-primary-foreground/70" : "text-muted-foreground"
                          }`}
                        >
                          {format(new Date(msg.created_at), "HH:mm", { locale: it })}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={bottomRef} />
            </div>
          </ScrollArea>
        )}

        <div className="border-t p-4 flex gap-2">
          <Textarea
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Scrivi un messaggio..."
            className="min-h-[44px] max-h-[120px] resize-none"
            rows={1}
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!newMessage.trim() || sending}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
