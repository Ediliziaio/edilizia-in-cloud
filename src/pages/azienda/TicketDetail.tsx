import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Package, User, Mail, Phone,
  AlertCircle, RefreshCw, Save, ChevronDown,
} from "lucide-react";
import {
  formatRelativeTime,
  getTicketStatusColor,
  getTicketStatusLabel,
  getTicketPriorityColor,
  getTicketPriorityLabel,
} from "@/lib/formatters";
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { TicketChat } from "@/components/tickets/TicketChat";
import { LinkedTasks } from "@/components/tasks/LinkedTasks";
import { TicketAttachments } from "@/components/tickets/TicketAttachments";
import { useUnreadTicketCounts } from "@/hooks/useUnreadTicketCounts";
import type { TicketDetail as TicketDetailType, TicketMessage, TicketStatus, TicketPriority } from "@/types/tickets";

export default function TicketDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { effectiveCompany } = useAuth();
  const queryClient = useQueryClient();
  const [internalNotes, setInternalNotes] = useState<string>("");
  const [notesLoaded, setNotesLoaded] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const { markTicketAsRead } = useUnreadTicketCounts();

  // Mark ticket as read when opening
  useEffect(() => {
    if (id) {
      markTicketAsRead(id);
    }
  }, [id, markTicketAsRead]);

  const { data: ticket, isLoading: ticketLoading, isError: ticketError, refetch: refetchTicket } = useQuery({
    queryKey: ["admin-ticket", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tickets")
        .select(`
          id, subject, status, priority, created_at, customer_id, order_id,
          assigned_to, category, internal_notes,
          customer:profiles!tickets_customer_id_fkey(first_name, last_name, email, phone),
          order:orders(id, description)
        `)
        .eq("id", id!)
        .single();
      if (error) throw error;
      const t = data as unknown as TicketDetailType;
      if (!notesLoaded) {
        setInternalNotes(t.internal_notes || "");
        setNotesLoaded(true);
      }
      return t;
    },
    enabled: !!id,
    staleTime: 30 * 1000,
  });

  const { data: messages = [], isLoading: messagesLoading, isError: messagesError, refetch: refetchMessages } = useQuery({
    queryKey: ["admin-ticket-messages", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ticket_messages")
        .select("id, message, sender_id, created_at, attachment_url")
        .eq("ticket_id", id!)
        .order("created_at", { ascending: true });
      if (error) throw error;

      // Fetch sender profiles separately
      const senderIds = [...new Set((data || []).map((m) => m.sender_id).filter(Boolean))];
      let profilesMap: Record<string, { first_name: string; last_name: string }> = {};
      if (senderIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, first_name, last_name")
          .in("id", senderIds);
        for (const p of profiles || []) {
          profilesMap[p.id] = { first_name: p.first_name, last_name: p.last_name };
        }
      }

      return (data || []).map((m) => ({
        ...m,
        sender: profilesMap[m.sender_id] || null,
      })) as TicketMessage[];
    },
    enabled: !!id,
    staleTime: 30 * 1000,
  });

  // Staff members for assignment dropdown (only staff roles, not customers)
  const { data: staffMembers = [] } = useQuery({
    queryKey: ["company-staff-members", effectiveCompany?.id],
    queryFn: async () => {
      // Get user IDs with staff roles
      const { data: roleData, error: roleErr } = await supabase
        .from("user_roles")
        .select("user_id")
        .in("role", ["company_admin", "company_staff"]);
      if (roleErr) throw roleErr;
      const staffIds = (roleData || []).map((r) => r.user_id);
      if (staffIds.length === 0) return [];

      const { data, error } = await supabase
        .from("profiles")
        .select("id, first_name, last_name")
        .eq("company_id", effectiveCompany!.id)
        .in("id", staffIds);
      if (error) throw error;
      return data;
    },
    enabled: !!effectiveCompany?.id,
    staleTime: 5 * 60 * 1000,
  });

  const updateTicketMutation = useMutation({
    mutationFn: async (updates: Record<string, unknown>) => {
      const { error } = await supabase
        .from("tickets")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Aggiornato", description: "Ticket aggiornato con successo." });
      queryClient.invalidateQueries({ queryKey: ["admin-ticket", id] });
      queryClient.invalidateQueries({ queryKey: ["company-tickets"] });
    },
    onError: () => {
      toast({ title: "Errore", description: "Impossibile aggiornare il ticket.", variant: "destructive" });
    },
  });

  if (ticketLoading || messagesLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <div className="grid md:grid-cols-3 gap-6">
          <Skeleton className="h-48" />
          <Skeleton className="h-96 md:col-span-2" />
        </div>
      </div>
    );
  }

  if (ticketError || messagesError) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="icon" onClick={() => navigate("/azienda/assistenza")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            Errore nel caricamento del ticket.
            <Button variant="outline" size="sm" onClick={() => { refetchTicket(); refetchMessages(); }}>
              <RefreshCw className="h-4 w-4 mr-2" /> Riprova
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Ticket non trovato</p>
        <Button variant="link" onClick={() => navigate("/azienda/assistenza")}>
          Torna all'assistenza
        </Button>
      </div>
    );
  }

  const statusColor = getTicketStatusColor(ticket.status);
  const priorityColor = getTicketPriorityColor(ticket.priority);

  // Update notesOpen when ticket loads with notes
  if (ticket.internal_notes && !notesOpen && !notesLoaded) {
    setNotesOpen(true);
  }

  return (
    <div className="flex flex-col h-[calc(100vh-120px)]">
      {/* Header migliorato con badge */}
      <div className="flex items-start gap-4 pb-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/azienda/assistenza")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold truncate">{ticket.subject}</h1>
            <Badge variant="outline" style={{ backgroundColor: statusColor.bg, color: statusColor.text, borderColor: statusColor.border }}>
              {getTicketStatusLabel(ticket.status)}
            </Badge>
            <Badge variant="outline" style={{ backgroundColor: priorityColor.bg, color: priorityColor.text, borderColor: priorityColor.border }}>
              {getTicketPriorityLabel(ticket.priority)}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Aperto {formatRelativeTime(ticket.created_at)}
          </p>
        </div>
      </div>

      <Separator className="mb-4" />

      {/* Layout a colonne con scroll indipendente */}
      <div className="grid md:grid-cols-3 gap-6 flex-1 min-h-0">
        {/* Sidebar con scroll indipendente */}
        <div className="overflow-y-auto pr-1 space-y-4" style={{ maxHeight: 'calc(100vh - 220px)' }}>
          {/* Card unificata: Gestione + Contesto */}
          <Card>
            <CardContent className="p-4 space-y-3">
              {/* Stato */}
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs text-muted-foreground shrink-0">Stato</label>
                <Select
                  value={ticket.status}
                  onValueChange={(v) => updateTicketMutation.mutate({ status: v })}
                  disabled={updateTicketMutation.isPending}
                >
                  <SelectTrigger className="w-[160px] h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="aperto">Aperto</SelectItem>
                    <SelectItem value="in_lavorazione">In Lavorazione</SelectItem>
                    <SelectItem value="risolto">Risolto</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {/* Priorità */}
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs text-muted-foreground shrink-0">Priorità</label>
                <Select
                  value={ticket.priority}
                  onValueChange={(v) => updateTicketMutation.mutate({ priority: v })}
                  disabled={updateTicketMutation.isPending}
                >
                  <SelectTrigger className="w-[160px] h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bassa">Bassa</SelectItem>
                    <SelectItem value="normale">Normale</SelectItem>
                    <SelectItem value="alta">Alta</SelectItem>
                    <SelectItem value="urgente">Urgente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {/* Assegnato */}
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs text-muted-foreground shrink-0">Assegnato</label>
                <Select
                  value={ticket.assigned_to || "unassigned"}
                  onValueChange={(v) => updateTicketMutation.mutate({ assigned_to: v === "unassigned" ? null : v })}
                  disabled={updateTicketMutation.isPending}
                >
                  <SelectTrigger className="w-[160px] h-8 text-xs">
                    <SelectValue placeholder="Non assegnato" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Non assegnato</SelectItem>
                    {staffMembers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.first_name} {s.last_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Separator />

              {/* Cliente */}
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">Cliente</label>
                <div className="flex items-center gap-2">
                  <User className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-medium text-sm">
                    {ticket.customer?.first_name} {ticket.customer?.last_name}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                  <a href={`mailto:${ticket.customer?.email}`} className="text-xs text-primary hover:underline truncate">
                    {ticket.customer?.email}
                  </a>
                </div>
                {ticket.customer?.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                    <a href={`tel:${ticket.customer?.phone}`} className="text-xs text-primary hover:underline">
                      {ticket.customer?.phone}
                    </a>
                  </div>
                )}
              </div>

              {/* Ordine collegato */}
              {ticket.order && (
                <>
                  <Separator />
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Ordine</label>
                    <Link to={`/azienda/ordini/${ticket.order.id}`} className="flex items-start gap-2 text-primary hover:underline">
                      <Package className="h-3.5 w-3.5 mt-0.5" />
                      <span className="text-xs">
                        {ticket.order.description.length > 50
                          ? ticket.order.description.substring(0, 50) + "..."
                          : ticket.order.description}
                      </span>
                    </Link>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Note Interne collassabili */}
          <Collapsible open={notesOpen} onOpenChange={setNotesOpen}>
            <Card>
              <CollapsibleTrigger asChild>
                <button className="w-full flex items-center justify-between p-4 text-sm font-medium hover:bg-muted/50 rounded-t-lg transition-colors">
                  <span>Note Interne</span>
                  <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${notesOpen ? 'rotate-180' : ''}`} />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="pt-0 px-4 pb-4 space-y-2">
                  <Textarea
                    value={internalNotes}
                    onChange={(e) => setInternalNotes(e.target.value)}
                    placeholder="Note visibili solo allo staff..."
                    rows={3}
                    maxLength={1000}
                    className="resize-none text-sm"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full"
                    disabled={updateTicketMutation.isPending || internalNotes === (ticket.internal_notes || "")}
                    onClick={() => updateTicketMutation.mutate({ internal_notes: internalNotes || null })}
                  >
                    <Save className="h-3.5 w-3.5 mr-1.5" />
                    Salva Note
                  </Button>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>

          {/* Allegati */}
          <TicketAttachments ticketId={ticket.id} />

          {/* Linked Tasks */}
          <LinkedTasks
            ticketId={ticket.id}
            category="assistenza"
            companyId={effectiveCompany?.id}
          />
        </div>

        {/* Chat con scroll indipendente */}
        <div className="md:col-span-2 min-h-0">
          <TicketChat
            ticketId={ticket.id}
            messages={messages}
            customerId={ticket.customer_id}
            invalidateKeys={[
              ["admin-ticket-messages", id!],
              ["company-tickets"],
            ]}
            height="calc(100vh - 220px)"
          />
        </div>
      </div>
    </div>
  );
}
