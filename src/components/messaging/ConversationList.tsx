import { useState } from "react";
import { useConversations } from "@/hooks/useMessagingData";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { AlertTriangle, Users, HardHat, Handshake, MessageSquare, HelpCircle } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";

const FILTERS = [
  { key: "tutte", label: "Tutte", icon: MessageSquare },
  { key: "clienti", label: "Clienti", icon: Users },
  { key: "operai", label: "Operai", icon: HardHat },
  { key: "collaboratori", label: "Collaboratori", icon: Handshake },
  { key: "non_assegnate", label: "Non assegnate", icon: HelpCircle },
  { key: "urgenti", label: "Urgenti", icon: AlertTriangle },
] as const;

const statusColors: Record<string, string> = {
  da_gestire: "bg-warning text-warning-foreground",
  in_lavorazione: "bg-primary/10 text-primary",
  risolto: "bg-muted text-muted-foreground",
};

interface ConversationListProps {
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function ConversationList({ selectedId, onSelect }: ConversationListProps) {
  const [filter, setFilter] = useState("tutte");
  const { data: conversations, isLoading } = useConversations(filter === "tutte" ? undefined : filter);

  return (
    <div className="flex flex-col h-full border-r">
      <div className="p-3 border-b">
        <h3 className="font-semibold text-sm mb-2">Conversazioni</h3>
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <Button
              key={f.key}
              variant={filter === f.key ? "default" : "ghost"}
              size="sm"
              className="h-7 text-xs px-2"
              onClick={() => setFilter(f.key)}
            >
              <f.icon className="h-3 w-3 mr-1" />
              {f.label}
            </Button>
          ))}
        </div>
      </div>

      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="p-3 space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : !conversations?.length ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            Nessuna conversazione
          </div>
        ) : (
          <div className="p-1">
            {conversations.map((conv: any) => (
              <button
                key={conv.id}
                className={cn(
                  "w-full text-left p-3 rounded-lg mb-1 transition-colors hover:bg-muted/50",
                  selectedId === conv.id && "bg-muted"
                )}
                onClick={() => onSelect(conv.id)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">
                        {conv.contact_name || conv.phone_number || "Sconosciuto"}
                      </span>
                      {conv.is_urgent && (
                        <AlertTriangle className="h-3 w-3 text-destructive flex-shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {conv.phone_number}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", statusColors[conv.status])}>
                      {conv.status.replace("_", " ")}
                    </Badge>
                    {conv.last_message_at && (
                      <span className="text-[10px] text-muted-foreground">
                        {format(new Date(conv.last_message_at), "dd/MM HH:mm", { locale: it })}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
