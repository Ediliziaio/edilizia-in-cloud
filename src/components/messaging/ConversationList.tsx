import { useState } from "react";
import { useConversations } from "@/hooks/useMessagingData";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { AlertTriangle, Inbox, Clock, Star } from "lucide-react";
import { format, isToday, isYesterday } from "date-fns";
import { it } from "date-fns/locale";

const FILTERS = [
  { key: "tutte", label: "Tutto" },
  { key: "non_letto", label: "Non letto" },
  { key: "recenti", label: "Recenti" },
] as const;

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

function formatMessageDate(dateStr: string): string {
  const date = new Date(dateStr);
  if (isToday(date)) return format(date, "HH:mm", { locale: it });
  if (isYesterday(date)) return "Ieri";
  return format(date, "dd MMM", { locale: it });
}

interface ConversationListProps {
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function ConversationList({ selectedId, onSelect }: ConversationListProps) {
  const [filter, setFilter] = useState("tutte");
  const { data: conversations, isLoading } = useConversations(
    filter === "tutte" ? undefined : filter === "non_letto" ? "non_assegnate" : undefined
  );

  // Sort recenti by last_message_at
  const sorted = filter === "recenti" && conversations
    ? [...conversations].sort((a: any, b: any) =>
        new Date(b.last_message_at || 0).getTime() - new Date(a.last_message_at || 0).getTime()
      ).slice(0, 20)
    : conversations;

  return (
    <div className="flex flex-col h-full border-r bg-background">
      {/* Header */}
      <div className="p-4 border-b">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Inbox className="h-4 w-4 text-primary" />
            <h3 className="font-semibold text-sm">Casella di posta del team</h3>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7">
            <Star className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="flex gap-1">
          {FILTERS.map((f) => (
            <Button
              key={f.key}
              variant={filter === f.key ? "default" : "ghost"}
              size="sm"
              className="h-7 text-xs px-3"
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </Button>
          ))}
        </div>
      </div>

      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="p-3 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3 p-2">
                <Skeleton className="h-10 w-10 rounded-full flex-shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-28" />
                  <Skeleton className="h-3 w-40" />
                </div>
              </div>
            ))}
          </div>
        ) : !sorted?.length ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            Nessuna conversazione
          </div>
        ) : (
          <div className="p-1">
            {sorted.map((conv: any) => (
              <button
                key={conv.id}
                className={cn(
                  "w-full text-left p-3 rounded-lg mb-0.5 transition-colors hover:bg-muted/50 flex items-start gap-3",
                  selectedId === conv.id && "bg-muted"
                )}
                onClick={() => onSelect(conv.id)}
              >
                {/* Avatar */}
                <div className={cn(
                  "h-10 w-10 rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0",
                  getAvatarColor(conv.contact_name)
                )}>
                  {getInitials(conv.contact_name)}
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="font-medium text-sm truncate">
                        {conv.contact_name || conv.phone_number || "Sconosciuto"}
                      </span>
                      {conv.is_urgent && (
                        <AlertTriangle className="h-3 w-3 text-destructive flex-shrink-0" />
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {conv.last_message_at && (
                        <span className="text-[11px] text-muted-foreground">
                          {formatMessageDate(conv.last_message_at)}
                        </span>
                      )}
                      {conv.status === "da_gestire" && (
                        <Badge className="h-5 w-5 rounded-full p-0 flex items-center justify-center text-[10px] bg-primary text-primary-foreground">
                          1
                        </Badge>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {conv.phone_number || conv.contact_type}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
