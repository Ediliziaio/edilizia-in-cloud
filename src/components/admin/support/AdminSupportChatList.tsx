import { useState, useMemo, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, MessageSquare, Search, Building, Clock, Flame, AlertTriangle, CheckCircle, RefreshCw, AlertCircle, Inbox } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";
import { toast } from "sonner";
import { AdminSupportChatSheet } from "./AdminSupportChatSheet";
import { SupportStats } from "./SupportStats";
import { SupportFilters } from "./SupportFilters";
import { TicketFilterPresets } from "./TicketFilterPresets";

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

interface SLAConversation {
  created_at: string;
  status: string;
  first_response_at?: string | null;
}

function getSLAStatus(conversation: SLAConversation): {
  label: string;
  variant: 'default' | 'secondary' | 'destructive' | 'outline';
} {
  const ageHours = (Date.now() - new Date(conversation.created_at).getTime()) / 3600000;
  if (conversation.status === 'risolto' || conversation.status === 'resolved' || conversation.status === 'closed') {
    return { label: 'Risolto', variant: 'secondary' };
  }
  if (conversation.first_response_at) {
    const respHours =
      (new Date(conversation.first_response_at).getTime() -
        new Date(conversation.created_at).getTime()) /
      3600000;
    return respHours <= 4
      ? { label: 'SLA ✓', variant: 'default' }
      : { label: 'SLA ✗', variant: 'destructive' };
  }
  if (ageHours > 4) return { label: `${Math.round(ageHours)}h senza risposta`, variant: 'destructive' };
  if (ageHours > 2) return { label: 'SLA a rischio', variant: 'secondary' };
  return { label: `${Math.round(ageHours)}h`, variant: 'outline' };
}

const statusColors: Record<string, string> = {
  open: "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800",
  in_progress: "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-800",
  resolved: "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800",
  closed: "bg-muted text-muted-foreground border-border",
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
  const [activePreset, setActivePreset] = useState<string | null>(null);
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
    queryKey: queryKeys.admin.supportMessages,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("support_messages")
        .select("id, company_id, sender_role, message, created_at")
        .order("created_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as SupportMessage[];
    },
    staleTime: 30 * 1000,
    refetchInterval: 30 * 1000,
  });

  const { data: companies = [], isError: isErrorCompanies } = useQuery({
    queryKey: queryKeys.admin.companiesForSupport,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("id, name")
        .eq("is_platform_admin_company", false)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Company[];
    },
    staleTime: 10 * 60 * 1000,
  });

  const { data: conversationsData = [], isError: isErrorConversations } = useQuery({
    queryKey: queryKeys.admin.supportConversations,
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

  // Smart filter presets
  const clearFilters = useCallback(() => {
    setSearchQuery("");
    setStatusFilter("all");
    setPriorityFilter("all");
    setSortBy("recent");
  }, []);

  const filterPresets = useMemo(() => {
    const unanswered = conversations.filter((c) => c.unansweredByAdmin && c.status !== "resolved" && c.status !== "closed").length;
    const urgent = conversations.filter((c) => (c.priority === "urgent" || c.priority === "high") && c.status !== "resolved" && c.status !== "closed").length;
    const aging = conversations.filter((c) => c.agingHours > 24 && c.unansweredByAdmin).length;
    const open = conversations.filter((c) => c.status === "open").length;

    return [
      {
        key: "unanswered",
        label: "Da rispondere",
        icon: AlertCircle,
        count: unanswered,
        apply: () => { clearFilters(); setStatusFilter("all"); setSortBy("recent"); setActivePreset("unanswered"); },
      },
      {
        key: "urgent",
        label: "Urgenti / Alta",
        icon: Flame,
        count: urgent,
        apply: () => { clearFilters(); setPriorityFilter("urgent"); setActivePreset("urgent"); },
      },
      {
        key: "aging",
        label: "Aging >24h",
        icon: Clock,
        count: aging,
        apply: () => { clearFilters(); setSortBy("oldest"); setActivePreset("aging"); },
      },
      {
        key: "open",
        label: "Aperte",
        icon: Inbox,
        count: open,
        apply: () => { clearFilters(); setStatusFilter("open"); setActivePreset("open"); },
      },
    ];
  }, [conversations, clearFilters]);

  const filtered = useMemo(() => {
    let result = conversations.filter(
      (c) =>
        (c.companyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.lastMessage.toLowerCase().includes(searchQuery.toLowerCase())) &&
        (statusFilter === "all" || c.status === statusFilter) &&
        (priorityFilter === "all" || c.priority === priorityFilter)
    );

    // Apply preset-specific filters
    if (activePreset === "unanswered") {
      result = result.filter((c) => c.unansweredByAdmin && c.status !== "resolved" && c.status !== "closed");
    } else if (activePreset === "urgent") {
      result = result.filter((c) => (c.priority === "urgent" || c.priority === "high") && c.status !== "resolved" && c.status !== "closed");
    } else if (activePreset === "aging") {
      result = result.filter((c) => c.agingHours > 24 && c.unansweredByAdmin);
    }

    if (sortBy === "recent") {
      result.sort((a, b) => new Date(b.lastMessageDate).getTime() - new Date(a.lastMessageDate).getTime());
    } else if (sortBy === "oldest") {
      result.sort((a, b) => new Date(a.lastMessageDate).getTime() - new Date(b.lastMessageDate).getTime());
    } else if (sortBy === "priority") {
      result.sort((a, b) => (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2));
    }

    return result;
  }, [conversations, searchQuery, statusFilter, priorityFilter, sortBy, activePreset]);

  const totalMessagesToday = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return messages.filter((m) => new Date(m.created_at) >= today).length;
  }, [messages]);

  const getAgingBadge = (hours: number, unanswered: boolean) => {
    if (!unanswered) return null;
    if (hours > 48) return (
      <Badge variant="outline" className="text-xs px-1.5 py-0 bg-red-500/10 text-red-700 border-red-500/30 dark:text-red-300 gap-0.5">
        <Clock className="h-2.5 w-2.5" /> {Math.floor(hours)}h
      </Badge>
    );
    if (hours > 24) return (
      <Badge variant="outline" className="text-xs px-1.5 py-0 bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-300 gap-0.5">
        <Clock className="h-2.5 w-2.5" /> {Math.floor(hours)}h
      </Badge>
    );
    return null;
  };

  const hasActiveFilters = searchQuery || statusFilter !== "all" || priorityFilter !== "all" || activePreset;

  return (
    <div className="space-y-4">
      <SupportStats
        conversations={conversations}
        totalMessagesToday={totalMessagesToday}
        messages={messages}
      />

      {/* Smart Filter Presets */}
      <TicketFilterPresets
        activePreset={activePreset}
        onClearPreset={() => { clearFilters(); setActivePreset(null); }}
        presets={filterPresets}
      />

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Cerca per azienda o messaggio..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setActivePreset(null); }}
            className="pl-10"
          />
        </div>
        <SupportFilters
          statusFilter={statusFilter}
          onStatusChange={(v) => { setStatusFilter(v); setActivePreset(null); }}
          priorityFilter={priorityFilter}
          onPriorityChange={(v) => { setPriorityFilter(v); setActivePreset(null); }}
          sortBy={sortBy}
          onSortChange={(v) => { setSortBy(v); setActivePreset(null); }}
        />
      </div>

      {/* Active filter summary */}
      {hasActiveFilters && !loadingMessages && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{filtered.length} di {conversations.length} conversazioni</span>
          {activePreset && (
            <>
              <span className="text-muted-foreground/30">|</span>
              <Badge variant="secondary" className="text-xs font-normal gap-1">
                {filterPresets.find((p) => p.key === activePreset)?.label}
                <button onClick={() => { clearFilters(); setActivePreset(null); }} className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20">
                  <span className="sr-only">Rimuovi</span>×
                </button>
              </Badge>
            </>
          )}
        </div>
      )}

      {(isErrorMessages || isErrorCompanies || isErrorConversations) ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            <span>Errore nel caricamento dei dati di assistenza.</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                refetchMessages();
                queryClient.invalidateQueries({ queryKey: queryKeys.admin.companiesForSupport });
                queryClient.invalidateQueries({ queryKey: queryKeys.admin.supportConversations });
              }}
              className="ml-2 gap-1"
            >
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
              {hasActiveFilters
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
              className={`cursor-pointer hover:bg-accent/50 transition-colors ${conv.unansweredByAdmin && conv.status !== "resolved" && conv.status !== "closed" ? "border-l-2 border-l-destructive" : ""}`}
              onClick={() => setSelectedCompany({ id: conv.companyId, name: conv.companyName })}
            >
              <CardContent className="p-4 flex items-center gap-4">
                <div className={`p-2 rounded-lg ${conv.unansweredByAdmin ? "bg-destructive/10" : "bg-muted"}`}>
                  <Building className={`h-5 w-5 ${conv.unansweredByAdmin ? "text-destructive" : "text-muted-foreground"}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium truncate">{conv.companyName}</p>
                    <Badge variant="outline" className={`text-xs px-1.5 py-0 ${statusColors[conv.status]}`}>
                      {statusLabels[conv.status]}
                    </Badge>
                    {conv.priority === "urgent" && (
                      <Badge variant="destructive" className="text-xs px-1.5 py-0 gap-0.5">
                        <Flame className="h-3 w-3" /> Urgente
                      </Badge>
                    )}
                    {conv.priority === "high" && (
                      <Badge variant="outline" className="text-xs px-1.5 py-0 gap-0.5 border-orange-300 text-orange-700 bg-orange-50 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800">
                        <AlertTriangle className="h-3 w-3" /> Alta
                      </Badge>
                    )}
                    {conv.unansweredByAdmin && conv.status !== "resolved" && conv.status !== "closed" && (
                      <Badge variant="destructive" className="text-xs px-1.5 py-0">
                        Da rispondere
                      </Badge>
                    )}
                    {getAgingBadge(conv.agingHours, conv.unansweredByAdmin)}
                    {(() => {
                      const slaData: SLAConversation = {
                        created_at: new Date(
                          new Date(conv.lastMessageDate).getTime() - conv.agingHours * 3600000
                        ).toISOString(),
                        status: conv.status === 'resolved' || conv.status === 'closed' ? 'risolto' : conv.status,
                        first_response_at: conv.unansweredByAdmin ? null : conv.lastMessageDate,
                      };
                      const sla = getSLAStatus(slaData);
                      return (
                        <Badge variant={sla.variant} className="text-xs">
                          {sla.label}
                        </Badge>
                      );
                    })()}
                  </div>
                  <p className="text-sm text-muted-foreground truncate mt-0.5">{conv.lastMessage}</p>
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
                    className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-green-600 transition-colors"
                    title="Segna come risolto"
                    onClick={() => handleInlineUpdate(conv.companyId, "status", "resolved")}
                  >
                    <CheckCircle className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0 min-w-[90px]">
                  <span className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(conv.lastMessageDate), { addSuffix: true, locale: it })}
                  </span>
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
              queryClient.invalidateQueries({ queryKey: queryKeys.admin.supportMessages });
              queryClient.invalidateQueries({ queryKey: queryKeys.admin.supportConversations });
            }
          }}
          companyId={selectedCompany.id}
          companyName={selectedCompany.name}
        />
      )}
    </div>
  );
}
