import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Bot, Clock, Phone } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";

interface ContactAIConversationsProps {
  contactId: string;
}

interface Conversation {
  id: string;
  agent_id: string;
  duration_seconds: number;
  messages_count: number;
  status: string;
  appointment_created: boolean;
  started_at: string;
}

export function ContactAIConversations({ contactId }: ContactAIConversationsProps) {
  const { data: conversations = [], isLoading } = useQuery({
    queryKey: ["ai-conversations-contact", contactId],
    queryFn: async (): Promise<Conversation[]> => {
      const { data, error } = await supabase
        .from("ai_agent_conversations" as never)
        .select("*")
        .eq("contact_id", contactId)
        .order("started_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data as unknown as Conversation[]) ?? [];
    },
  });

  const { data: agents } = useQuery({
    queryKey: ["ai-agents-map"],
    queryFn: async () => {
      const { data } = await supabase
        .from("ai_agents" as never)
        .select("id, name");
      return new Map(((data as { id: string; name: string }[]) ?? []).map(a => [a.id, a.name]));
    },
  });

  if (isLoading) return <p className="text-xs text-muted-foreground p-2">Caricamento...</p>;

  if (conversations.length === 0) {
    return (
      <div className="text-center py-6 space-y-2">
        <Bot className="h-8 w-8 text-muted-foreground/30 mx-auto" />
        <p className="text-xs text-muted-foreground">Nessuna conversazione AI</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {conversations.map((conv) => (
        <div key={conv.id} className="border rounded-lg p-2.5 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium truncate">
              {agents?.get(conv.agent_id) || "Agente"}
            </span>
            <Badge variant={conv.status === "completed" ? "default" : "secondary"} className="text-[9px]">
              {conv.status === "completed" ? "Completata" : conv.status}
            </Badge>
          </div>
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-0.5">
              <Clock className="h-3 w-3" />
              {Math.round(conv.duration_seconds / 60)} min
            </span>
            <span>{conv.messages_count} msg</span>
            {conv.appointment_created && (
              <Badge variant="outline" className="text-[9px] text-primary">📅 Appuntamento</Badge>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground">
            {format(new Date(conv.started_at), "d MMM yyyy HH:mm", { locale: it })}
          </p>
        </div>
      ))}
    </div>
  );
}
