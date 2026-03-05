import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, Package, AlertCircle, RefreshCw } from "lucide-react";
import { 
  formatRelativeTime, 
  getTicketStatusColor, 
  getTicketStatusLabel,
  getTicketPriorityColor,
  getTicketPriorityLabel,
} from "@/lib/formatters";
import { TicketChat } from "@/components/tickets/TicketChat";
import type { CustomerTicketDetail as CustomerTicketDetailType, TicketMessage } from "@/types/tickets";
import { TicketAttachments } from "@/components/tickets/TicketAttachments";

export default function CustomerTicketDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: ticket, isLoading: ticketLoading, isError: ticketError, refetch: refetchTicket } = useQuery({
    queryKey: ["ticket", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tickets")
        .select(`id, subject, status, priority, created_at, order_id, order:orders(id, description)`)
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data as unknown as CustomerTicketDetailType;
    },
    enabled: !!id,
    staleTime: 30 * 1000,
  });

  const { data: messages = [], isLoading: messagesLoading, isError: messagesError, refetch: refetchMessages } = useQuery({
    queryKey: ["ticket-messages", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ticket_messages")
        .select("id, message, sender_id, created_at, attachment_url")
        .eq("ticket_id", id!)
        .order("created_at", { ascending: true });
      if (error) throw error;

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

  if (ticketLoading || messagesLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (ticketError || messagesError) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="icon" onClick={() => navigate("/cliente/assistenza")}>
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
        <Button variant="link" onClick={() => navigate("/cliente/assistenza")}>
          Torna all'assistenza
        </Button>
      </div>
    );
  }

  const statusColor = getTicketStatusColor(ticket.status);
  const priorityColor = getTicketPriorityColor(ticket.priority);
  const isResolved = ticket.status === "risolto";

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/cliente/assistenza")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <h1 className="text-xl font-bold text-foreground">{ticket.subject}</h1>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" style={{ backgroundColor: statusColor.bg, color: statusColor.text, borderColor: statusColor.border }}>
                {getTicketStatusLabel(ticket.status)}
              </Badge>
              <Badge variant="outline" style={{ backgroundColor: priorityColor.bg, color: priorityColor.text, borderColor: priorityColor.border }}>
                {getTicketPriorityLabel(ticket.priority)}
              </Badge>
            </div>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Aperto {formatRelativeTime(ticket.created_at)}
          </p>
        </div>
      </div>

      {ticket.order && (
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <Package className="h-5 w-5 text-primary" />
            <div className="flex-1">
              <p className="text-sm text-muted-foreground">Ordine collegato</p>
              <Link to={`/cliente/ordini/${ticket.order.id}`} className="font-medium text-primary hover:underline">
                {ticket.order.description.length > 60
                  ? ticket.order.description.substring(0, 60) + "..."
                  : ticket.order.description}
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      <TicketAttachments ticketId={ticket.id} />

      <TicketChat
        ticketId={ticket.id}
        messages={messages}
        disabled={isResolved}
        disabledMessage="Questo ticket è stato risolto. Per nuove richieste, apri un nuovo ticket."
        invalidateKeys={[
          ["ticket-messages", id!],
          ["customer-tickets"],
        ]}
      />
    </div>
  );
}
