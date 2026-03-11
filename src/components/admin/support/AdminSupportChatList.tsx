import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, MessageSquare, Search, Building, Clock, Flame, AlertTriangle, CheckCircle, RefreshCw } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { toast } from "sonner";
import { AdminSupportChatSheet } from "./AdminSupportChatSheet";
import { SupportStats } from "./SupportStats";
import { SupportFilters } from "./SupportFilters";

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

interface SupportConversation {
  id: string;
  company_id: string;
  status: string;
  priority: string;
  internal_notes: string | null;
  resolved_at: string | null;
  updated_at: string;
}

interface ConversationSummary {
  companyId: string;
  companyName: string;
  lastMessage: string;
  lastMessageDate: string;
  totalMessages: number;
  unansweredByAdmin: boolean;
  status: "open" | "in_progress" | "resolved" | "closed";
  priority: "low" | "normal" | "high" | "urgent";
  internalNotes: string | null;
  resolvedAt: string | null;
  agingHours: number;
}

const statusColors: Record<string, string> = {
  open: "bg-red-100 text-red-800 border-red-200",
  in_progress: "bg-yellow-100 text-yellow-800 border-yellow-200",
  resolved: "bg-green-100 text-green-800 border-green-200",
  closed: "bg-gray-100 text-gray-600 border-gray-200",
};

const statusLabels: Record<string, string> = {
  open: "Aperta",
  in_progress: "In lavorazione",
  resolved: "Risolta",
  closed: "Chiusa",
};

const priorityOrder: Record<string, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
};

export function AdminSupportChatList() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [sortBy, setSortBy] = useState("recent");
  const [selectedCompany, setSelectedCompany] = useState<{ id: string; name: string } | null>(null);
  const queryClient = useQueryClient();

  const handleInlineUpdate = async (
    companyId: string,
    field: "status" | "priority",
    value: string
  ) => {
    const updates: Record<string, unknown> = { [field]: value, updated_at: new Date().toISOString() };
    if (field === "status" && value === "resolved") {
      updates.resolved_at = new Date().toISOString();
    } else if (field === "status" && value !== "resolved") {
      updates.resolved_at = null;
    }

    const { error } = await supabase
      .from("support_conversations")
      .upsert({ company_id: companyId, ...updates }, { onConflict: "company_id" });

    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Aggiornato");
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.supportConversations });
    }
  };

  const { data: messages = [], isLoading: loadingMessages, isError: isErrorMessages, refetch: refetchMessages } = useQuery({
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

  const { data: companies = [], isError: isErrorCompanies } = useQuery({
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

  const { data: conversationsData = [], isError: isErrorConversations } = useQuery({
    queryKey: ["admin-support-conversations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("support_conversations")
        .select("*");
      if (error) throw error;
      return (data ?? []) as SupportConversation[];
    },
    staleTime: 30 * 1000,
    refetchInterval: 30 * 1000,
  });

  const conversations = useMemo(() => {
    const companyMap = new Map(companies.map((c) => [c.id, c.name]));
    const convMap = new Map(conversationsData.map((c) => [c.company_id, c]));
    const grouped = new Map<string, SupportMessage[]>();

    for (const msg of messages) {
      if (!grouped.has(msg.company_id)) {
        grouped.set(msg.company_id, []);
      }
      grouped.get(msg.company_id)!.push(msg);
    }

    const result: ConversationSummary[] = [];
    for (const [companyId, msgs] of grouped) {
      const lastMsg = msgs[0];
      const companyName = companyMap.get(companyId) || "Azienda sconosciuta";
      const conv = convMap.get(companyId);

      // Calculate aging: hours since last company message without admin reply
      let agingHours = 0;
      const lastCompanyMsg = msgs.find((m) => m.sender_role !== "super_admin");
      if (lastCompanyMsg && lastMsg.sender_role !== "super_admin") {
        agingHours = (Date.now() - new Date(lastCompanyMsg.created_at).getTime()) / (1000 * 60 * 60);
      }

      result.push({
        companyId,
        companyName,
        lastMessage: lastMsg.message,
        lastMessageDate: lastMsg.created_at,
        totalMessages: msgs.length,
        unansweredByAdmin: lastMsg.sender_role !== "super_admin",
        status: (conv?.status as ConversationSummary["status"]) || "open",
        priority: (conv?.priority as ConversationSummary["priority"]) || "normal",
        internalNotes: conv?.internal_notes || null,
        resolvedAt: conv?.resolved_at || null,
        agingHours,
      });
    }

    return result;
  }, [messages, companies, conversationsData]);

  const filtered = useMemo(() => {
    let result = conversations.filter(
      (c) =>
        (c.companyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.lastMessage.toLowerCase().includes(searchQuery.toLowerCase())) &&
        (statusFilter === "all" || c.status === statusFilter) &&
        (priorityFilter === "all" || c.priority === priorityFilter)
    );

    if (sortBy === "recent") {
      result.sort((a, b) => new Date(b.lastMessageDate).getTime() - new Date(a.lastMessageDate).getTime());
    } else if (sortBy === "oldest") {
      result.sort((a, b) => new Date(a.lastMessageDate).getTime() - new Date(b.lastMessageDate).getTime());
    } else if (sortBy === "priority") {
      result.sort((a, b) => (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2));
    }

    return result;
  }, [conversations, searchQuery, statusFilter, priorityFilter, sortBy]);

  const totalMessagesToday = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return messages.filter((m) => new Date(m.created_at) >= today).length;
  }, [messages]);

  const getAgingIndicator = (hours: number, unanswered: boolean) => {
    if (!unanswered) return null;
    if (hours > 48) return <span className="h-2.5 w-2.5 rounded-full bg-red-500 inline-block" title=">48h" />;
    if (hours > 24) return <span className="h-2.5 w-2.5 rounded-full bg-yellow-500 inline-block" title="24-48h" />;
    return <span className="h-2.5 w-2.5 rounded-full bg-green-500 inline-block" title="<24h" />;
  };

  return (
    <div className="space-y-4">
      <SupportStats
        conversations={conversations}
        totalMessagesToday={totalMessagesToday}
        messages={messages}
      />

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Cerca per azienda o messaggio..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      <SupportFilters
        statusFilter={statusFilter}
        onStatusChange={setStatusFilter}
        priorityFilter={priorityFilter}
        onPriorityChange={setPriorityFilter}
        sortBy={sortBy}
        onSortChange={setSortBy}
      />

      {(isErrorMessages || isErrorCompanies || isErrorConversations) ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            <span>Errore nel caricamento dei dati di assistenza.</span>
            <Button variant="outline" size="sm" onClick={() => refetchMessages()} className="ml-2 gap-1">
              <RefreshCw className="h-3 w-3" /> Riprova
            </Button>
          </AlertDescription>
        </Alert>
      ) : loadingMessages ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">Nessuna conversazione</h3>
            <p className="text-muted-foreground text-center mt-2">
              {searchQuery || statusFilter !== "all" || priorityFilter !== "all"
                ? "Prova a modificare i filtri"
                : "Non ci sono ancora chat di assistenza"}
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
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium truncate">{conv.companyName}</p>
                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${statusColors[conv.status]}`}>
                      {statusLabels[conv.status]}
                    </Badge>
                    {conv.priority === "urgent" && (
                      <Badge variant="destructive" className="text-[10px] px-1.5 py-0 gap-0.5">
                        <Flame className="h-3 w-3" /> Urgente
                      </Badge>
                    )}
                    {conv.priority === "high" && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-0.5 border-orange-300 text-orange-700 bg-orange-50">
                        <AlertTriangle className="h-3 w-3" /> Alta
                      </Badge>
                    )}
                    {conv.unansweredByAdmin && (
                      <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                        Da rispondere
                      </Badge>
                    )}
                    {getAgingIndicator(conv.agingHours, conv.unansweredByAdmin)}
                  </div>
                  <p className="text-sm text-muted-foreground truncate">{conv.lastMessage}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                  <Select
                    value={conv.status}
                    onValueChange={(v) => handleInlineUpdate(conv.companyId, "status", v)}
                  >
                    <SelectTrigger className="h-7 text-xs w-[130px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open">Aperta</SelectItem>
                      <SelectItem value="in_progress">In lavorazione</SelectItem>
                      <SelectItem value="resolved">Risolta</SelectItem>
                      <SelectItem value="closed">Chiusa</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select
                    value={conv.priority}
                    onValueChange={(v) => handleInlineUpdate(conv.companyId, "priority", v)}
                  >
                    <SelectTrigger className="h-7 text-xs w-[110px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Bassa</SelectItem>
                      <SelectItem value="normal">Normale</SelectItem>
                      <SelectItem value="high">Alta</SelectItem>
                      <SelectItem value="urgent">Urgente</SelectItem>
                    </SelectContent>
                  </Select>
                  <button
                    className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-green-600 transition-colors"
                    title="Segna come risolto"
                    onClick={() => handleInlineUpdate(conv.companyId, "status", "resolved")}
                  >
                    <CheckCircle className="h-4 w-4" />
                  </button>
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
          onOpenChange={(open) => {
            if (!open) {
              setSelectedCompany(null);
              queryClient.invalidateQueries({ queryKey: ["admin-support-messages"] });
              queryClient.invalidateQueries({ queryKey: ["admin-support-conversations"] });
            }
          }}
          companyId={selectedCompany.id}
          companyName={selectedCompany.name}
        />
      )}
    </div>
  );
}
