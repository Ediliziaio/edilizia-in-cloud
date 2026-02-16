import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { 
  ArrowLeft, 
  Package, 
  User,
  Mail,
  Phone,
  AlertCircle,
  RefreshCw
} from "lucide-react";
import { 
  formatRelativeTime, 
  getTicketStatusColor, 
  getTicketStatusLabel 
} from "@/lib/formatters";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TicketChat } from "@/components/tickets/TicketChat";
import type { TicketDetail as TicketDetailType, TicketMessage, TicketStatus } from "@/types/tickets";

export default function TicketDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: ticket, isLoading: ticketLoading, isError: ticketError, refetch: refetchTicket } = useQuery({
    queryKey: ["admin-ticket", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tickets")
        .select(`
          id, subject, status, created_at, customer_id, order_id,
          customer:profiles!tickets_customer_id_fkey(first_name, last_name, email, phone),
          order:orders(id, description)
        `)
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data as unknown as TicketDetailType;
    },
    enabled: !!id,
    staleTime: 30 * 1000,
  });

  const { data: messages = [], isLoading: messagesLoading, isError: messagesError, refetch: refetchMessages } = useQuery({
    queryKey: ["admin-ticket-messages", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ticket_messages")
        .select(`
          id, message, sender_id, created_at,
          sender:profiles!ticket_messages_sender_id_fkey(first_name, last_name)
        `)
        .eq("ticket_id", id!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as unknown as TicketMessage[];
    },
    enabled: !!id,
    staleTime: 30 * 1000,
  });

  const updateStatusMutation = useMutation({
    mutationFn: async (newStatus: TicketStatus) => {
      const { error } = await supabase
        .from("tickets")
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Stato aggiornato", description: "Lo stato del ticket è stato modificato." });
      queryClient.invalidateQueries({ queryKey: ["admin-ticket", id] });
      queryClient.invalidateQueries({ queryKey: ["company-tickets"] });
    },
    onError: () => {
      toast({ title: "Errore", description: "Impossibile aggiornare lo stato.", variant: "destructive" });
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

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/azienda/assistenza")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">{ticket.subject}</h1>
          <p className="text-sm text-muted-foreground">
            Aperto {formatRelativeTime(ticket.created_at)}
          </p>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {/* Sidebar */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Stato</CardTitle>
            </CardHeader>
            <CardContent>
              <Select
                value={ticket.status}
                onValueChange={(value) => updateStatusMutation.mutate(value as TicketStatus)}
                disabled={updateStatusMutation.isPending}
              >
                <SelectTrigger>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" style={{ backgroundColor: statusColor.bg, color: statusColor.text, borderColor: statusColor.border }}>
                      {getTicketStatusLabel(ticket.status)}
                    </Badge>
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="aperto">Aperto</SelectItem>
                  <SelectItem value="in_lavorazione">In Lavorazione</SelectItem>
                  <SelectItem value="risolto">Risolto</SelectItem>
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Cliente</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">
                  {ticket.customer?.first_name} {ticket.customer?.last_name}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <a href={`mailto:${ticket.customer?.email}`} className="text-sm text-primary hover:underline">
                  {ticket.customer?.email}
                </a>
              </div>
              {ticket.customer?.phone && (
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <a href={`tel:${ticket.customer?.phone}`} className="text-sm text-primary hover:underline">
                    {ticket.customer?.phone}
                  </a>
                </div>
              )}
            </CardContent>
          </Card>

          {ticket.order && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Ordine Collegato</CardTitle>
              </CardHeader>
              <CardContent>
                <Link to={`/azienda/ordini/${ticket.order.id}`} className="flex items-start gap-2 text-primary hover:underline">
                  <Package className="h-4 w-4 mt-0.5" />
                  <span className="text-sm">
                    {ticket.order.description.length > 50
                      ? ticket.order.description.substring(0, 50) + "..."
                      : ticket.order.description}
                  </span>
                </Link>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Chat */}
        <div className="md:col-span-2">
          <TicketChat
            ticketId={ticket.id}
            messages={messages}
            customerId={ticket.customer_id}
            invalidateKeys={[
              ["admin-ticket-messages", id!],
              ["company-tickets"],
            ]}
            height="calc(100vh - 300px)"
          />
        </div>
      </div>
    </div>
  );
}
