import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Send } from "lucide-react";
import { CannedResponsesPicker } from "./CannedResponsesPicker";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { playNotificationSound } from "@/lib/notificationSound";
import { toast } from "sonner";
import { ConversationActions } from "./ConversationActions";

interface SupportMessage {
  id: string;
  company_id: string;
  sender_id: string;
  sender_role: string;
  message: string;
  created_at: string;
}

interface AdminSupportChatSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  companyName: string;
}

export function AdminSupportChatSheet({ open, onOpenChange, companyId, companyName }: AdminSupportChatSheetProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Fetch messages via useQuery
  const { data: messages = [], isLoading: loadingMessages } = useQuery({
    queryKey: ["admin-support-chat", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("support_messages")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as SupportMessage[];
    },
    enabled: open && !!companyId,
    staleTime: 30 * 1000,
  });

  // Fetch conversation metadata via useQuery
  const { data: convData, isLoading: convLoading } = useQuery({
    queryKey: ["admin-support-conv", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("support_conversations")
        .select("*")
        .eq("company_id", companyId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: open && !!companyId,
    staleTime: 30 * 1000,
  });

  const convStatus = convData?.status ?? "open";
  const convPriority = convData?.priority ?? "normal";
  const convNotes = convData?.internal_notes ?? null;

  // Realtime subscription
  useEffect(() => {
    if (!open || !companyId) return;
    const channel = supabase
      .channel("admin-support-" + companyId)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "support_messages",
        filter: `company_id=eq.${companyId}`,
      }, (payload) => {
        const newMsg = payload.new as SupportMessage;
        queryClient.setQueryData<SupportMessage[]>(
          ["admin-support-chat", companyId],
          (old) => {
            if (!old) return [newMsg];
            if (old.some((m) => m.id === newMsg.id)) return old;
            return [...old, newMsg];
          }
        );
        if (newMsg.sender_role === "company") {
          playNotificationSound();
          toast("Nuovo messaggio da " + companyName, {
            description: newMsg.message.slice(0, 80),
          });
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [open, companyId, companyName, queryClient]);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const updateConversation = async (updates: Record<string, unknown>) => {
    await supabase
      .from("support_conversations")
      .update(updates)
      .eq("company_id", companyId);
    queryClient.invalidateQueries({ queryKey: ["admin-support-conv", companyId] });
  };

  const handleStatusChange = async (status: string) => {
    const updates: Record<string, unknown> = { status };
    if (status === "resolved") {
      updates.resolved_at = new Date().toISOString();
    }
    await updateConversation(updates);

    if (status === "resolved" && user) {
      await supabase.from("support_messages").insert({
        company_id: companyId,
        sender_id: user.id,
        sender_role: "super_admin",
        message: "[Sistema] Conversazione contrassegnata come risolta",
      });
    }
  };

  const handlePriorityChange = async (priority: string) => {
    await updateConversation({ priority });
  };

  const handleNotesChange = async (notes: string) => {
    await updateConversation({ internal_notes: notes || null });
    toast.success("Note salvate");
  };

  const handleResolve = () => handleStatusChange("resolved");

  const handleSend = async () => {
    if (!newMessage.trim() || !user) return;
    setSending(true);
    const { error } = await supabase.from("support_messages").insert({
      company_id: companyId,
      sender_id: user.id,
      sender_role: "super_admin",
      message: newMessage.trim(),
    });
    if (error) {
      toast.error("Errore nell'invio del messaggio");
    } else {
      setNewMessage("");
    }
    setSending(false);
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
          <SheetTitle>{companyName}</SheetTitle>
          <SheetDescription>Chat di assistenza</SheetDescription>
        </SheetHeader>

        {!convLoading && (
          <ConversationActions
            status={convStatus}
            priority={convPriority}
            internalNotes={convNotes}
            onStatusChange={handleStatusChange}
            onPriorityChange={handlePriorityChange}
            onNotesChange={handleNotesChange}
            onResolve={handleResolve}
          />
        )}

        {loadingMessages ? (
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
                  Nessun messaggio in questa conversazione
                </p>
              ) : (
                messages.map((msg) => {
                  const isAdmin = msg.sender_role === "super_admin";
                  const isSystem = msg.message.startsWith("[Sistema]");
                  if (isSystem) {
                    return (
                      <div key={msg.id} className="flex justify-center">
                        <p className="text-xs text-muted-foreground bg-muted px-3 py-1 rounded-full">
                          {msg.message.replace("[Sistema] ", "")}
                        </p>
                      </div>
                    );
                  }
                  return (
                    <div key={msg.id} className={`flex ${isAdmin ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                        isAdmin ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
                      }`}>
                        <p className="whitespace-pre-wrap break-words">{msg.message}</p>
                        <p className={`text-xs mt-1 ${isAdmin ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
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
          <CannedResponsesPicker onSelect={(content) => setNewMessage(content)} />
          <Textarea
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Scrivi una risposta..."
            className="min-h-[44px] max-h-[120px] resize-none flex-1"
            rows={1}
          />
          <Button size="icon" onClick={handleSend} disabled={!newMessage.trim() || sending}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
