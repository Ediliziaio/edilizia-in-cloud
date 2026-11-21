import { useParams, useNavigate, Link } from "react-router-dom";
import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { useAuth } from "@/contexts/AuthContext";
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
import type { CustomerTicketDetail as CustomerTicketDetailType } from "@/types/tickets";
import { useTicketMessages } from "@/hooks/useTicketMessages";
import { TicketAttachments } from "@/components/tickets/TicketAttachments";

export default function CustomerTicketDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, profile, company } = useAuth();
  const companyId = profile?.company_id ?? company?.id ?? null;
  const queryClient = useQueryClient();

  const { data: ticket, isLoading: ticketLoading, isError: ticketError, refetch: refetchTicket } = useQuery({
    queryKey: [...queryKeys.customerTickets.detail(id), companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const { data, error } = await supabase
        .from("tickets")
        .select(`id, subject, status, priority, created_at, order_id, company_id, order:orders(id, description)`)
        .eq("id", id!)
        .eq("company_id", companyId)
        .eq("customer_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as CustomerTicketDetailType | null;
    },
    enabled: !!id && !!user?.id && !!companyId,
    staleTime: 30 * 1000,
  });

  // Mark ticket as read via ticket_read_status upsert
  useEffect(() => {
    if (!ticket?.id || !user?.id) return;
    (async () => {
      try {
        await supabase
          .from("ticket_read_status")
          .upsert(
            { ticket_id: ticket.id, user_id: user.id, last_read_at: new Date().toISOString() },
            { onConflict: "ticket_id,user_id" }
          );
        // Refresh unread badge count
        queryClient.invalidateQueries({ queryKey: queryKeys.customerUnread.messages(user.id) });
      } catch {
        // non-critical, ignore
      }
    })();
  }, [ticket?.id, user?.id, queryClient]);

  const {
    messages, isLoading: messagesLoading, isError: messagesError, refetch: refetchMessages, olderMessages,
  } = useTicketMessages(
    user?.id ? ticket?.id : undefined,
    queryKeys.customerTickets.messages(ticket?.id),
    companyId ?? undefined,
  );
  const chatInvalidateKeys = useMemo(() => [
    queryKeys.customerTickets.messages(id),
    ["customer-tickets"],
  ], [id]);

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
                {(ticket.order.description?.length ?? 0) > 60
                  ? ticket.order.description!.substring(0, 60) + "..."
                  : ticket.order.description ?? "Ordine"}
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      <TicketAttachments ticketId={ticket.id} />

      <TicketChat
        ticketId={ticket.id}
        messages={messages}
        olderMessages={olderMessages}
        disabled={isResolved}
        disabledMessage="Questo ticket è stato risolto. Per nuove richieste, apri un nuovo ticket."
        invalidateKeys={chatInvalidateKeys}
      />
    </div>
  );
}
