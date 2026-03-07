import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Bot, ChevronDown, Clock } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";

interface ContactAIConversationsProps {
  contactId: string;
}

interface TranscriptMessage {
  role?: string;
  message?: string;
}

interface Conversation {
  id: string;
  agent_id: string;
  duration_seconds: number;
  messages_count: number;
  status: string;
  appointment_created: boolean;
  started_at: string;
  summary: string | null;
  transcript: TranscriptMessage[] | null;
  metadata: { sentiment?: string; [key: string]: unknown } | null;
}

const sentimentConfig: Record<string, { label: string; className: string }> = {
  positive: { label: "Positivo", className: "bg-green-100 text-green-800 border-green-200" },
  neutral: { label: "Neutro", className: "bg-muted text-muted-foreground" },
  negative: { label: "Negativo", className: "bg-red-100 text-red-800 border-red-200" },
};

export function ContactAIConversations({ contactId }: ContactAIConversationsProps) {
  const [openId, setOpenId] = useState<string | null>(null);

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
      {conversations.map((conv) => {
        const sentiment = conv.metadata?.sentiment;
        const sentimentInfo = sentiment ? sentimentConfig[sentiment] : null;

        return (
          <Collapsible
            key={conv.id}
            open={openId === conv.id}
            onOpenChange={(open) => setOpenId(open ? conv.id : null)}
          >
            <div className="border rounded-lg p-2.5 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium truncate">
                  {agents?.get(conv.agent_id) || "Agente"}
                </span>
                <div className="flex items-center gap-1">
                  {sentimentInfo && (
                    <Badge variant="outline" className={`text-[9px] ${sentimentInfo.className}`}>
                      {sentimentInfo.label}
                    </Badge>
                  )}
                  <Badge variant={conv.status === "completed" ? "default" : "secondary"} className="text-[9px]">
                    {conv.status === "completed" ? "Completata" : conv.status}
                  </Badge>
                </div>
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

              {conv.summary && (
                <p className="text-[10px] text-muted-foreground line-clamp-2 italic">
                  {conv.summary}
                </p>
              )}

              <div className="flex items-center justify-between">
                <p className="text-[10px] text-muted-foreground">
                  {format(new Date(conv.started_at), "d MMM yyyy HH:mm", { locale: it })}
                </p>
                {conv.transcript && conv.transcript.length > 0 && (
                  <CollapsibleTrigger asChild>
                    <button className="text-[10px] text-primary hover:underline flex items-center gap-0.5">
                      Dettagli
                      <ChevronDown className={`h-3 w-3 transition-transform ${openId === conv.id ? "rotate-180" : ""}`} />
                    </button>
                  </CollapsibleTrigger>
                )}
              </div>

              <CollapsibleContent>
                <div className="mt-2 border-t pt-2 space-y-1.5 max-h-60 overflow-y-auto">
                  {conv.transcript?.map((msg, i) => (
                    <div key={i} className={`text-[10px] ${msg.role === "agent" ? "text-primary" : "text-foreground"}`}>
                      <span className="font-semibold capitalize">{msg.role === "agent" ? "Agente" : "Utente"}:</span>{" "}
                      {msg.message}
                    </div>
                  ))}
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>
        );
      })}
    </div>
  );
}
