import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, MessageSquare, Search, Building, Clock } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { AdminSupportChatSheet } from "./AdminSupportChatSheet";

interface SupportMessage {
  id: string;
  company_id: string;
  sender_role: string;
  message: string;
  created_at: string;
}

interface Company {
  id: string;
  name: string;
}

interface ConversationSummary {
  companyId: string;
  companyName: string;
  lastMessage: string;
  lastMessageDate: string;
  totalMessages: number;
  unansweredByAdmin: boolean;
}

export function AdminSupportChatList() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCompany, setSelectedCompany] = useState<{ id: string; name: string } | null>(null);

  const { data: messages = [], isLoading: loadingMessages } = useQuery({
    queryKey: ["admin-support-messages"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("support_messages")
        .select("id, company_id, sender_role, message, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as SupportMessage[];
    },
    staleTime: 30 * 1000,
    refetchInterval: 30 * 1000,
  });

  const { data: companies = [] } = useQuery({
    queryKey: ["admin-companies-for-support"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("id, name")
        .order("name");
      if (error) throw error;
      return (data ?? []) as Company[];
    },
    staleTime: 10 * 60 * 1000,
  });

  const conversations = useMemo(() => {
    const companyMap = new Map(companies.map((c) => [c.id, c.name]));
    const grouped = new Map<string, SupportMessage[]>();

    for (const msg of messages) {
      if (!grouped.has(msg.company_id)) {
        grouped.set(msg.company_id, []);
      }
      grouped.get(msg.company_id)!.push(msg);
    }

    const result: ConversationSummary[] = [];
    for (const [companyId, msgs] of grouped) {
      const lastMsg = msgs[0]; // already sorted desc
      const companyName = companyMap.get(companyId) || "Azienda sconosciuta";
      result.push({
        companyId,
        companyName,
        lastMessage: lastMsg.message,
        lastMessageDate: lastMsg.created_at,
        totalMessages: msgs.length,
        unansweredByAdmin: lastMsg.sender_role !== "super_admin",
      });
    }

    return result.sort((a, b) => new Date(b.lastMessageDate).getTime() - new Date(a.lastMessageDate).getTime());
  }, [messages, companies]);

  const filtered = useMemo(
    () =>
      conversations.filter((c) =>
        c.companyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.lastMessage.toLowerCase().includes(searchQuery.toLowerCase())
      ),
    [conversations, searchQuery]
  );

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Cerca per azienda o messaggio..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {loadingMessages ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">Nessuna conversazione</h3>
            <p className="text-muted-foreground text-center mt-2">
              {searchQuery ? "Prova a modificare la ricerca" : "Non ci sono ancora chat di assistenza"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((conv) => (
            <Card
              key={conv.companyId}
              className="cursor-pointer hover:bg-accent/50 transition-colors"
              onClick={() => setSelectedCompany({ id: conv.companyId, name: conv.companyName })}
            >
              <CardContent className="p-4 flex items-center gap-4">
                <div className="p-2 rounded-lg bg-muted">
                  <Building className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium truncate">{conv.companyName}</p>
                    {conv.unansweredByAdmin && (
                      <Badge variant="destructive" className="text-xs">
                        Da rispondere
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground truncate">{conv.lastMessage}</p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {format(new Date(conv.lastMessageDate), "dd MMM HH:mm", { locale: it })}
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {conv.totalMessages} msg
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {selectedCompany && (
        <AdminSupportChatSheet
          open={!!selectedCompany}
          onOpenChange={(open) => !open && setSelectedCompany(null)}
          companyId={selectedCompany.id}
          companyName={selectedCompany.name}
        />
      )}
    </div>
  );
}
