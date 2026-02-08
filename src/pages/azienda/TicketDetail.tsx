import { useState, useRef, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { 
  ArrowLeft, 
  Send, 
  Loader2, 
  Package, 
  User,
  Mail,
  Phone
} from "lucide-react";
import { 
  formatDateTime, 
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

type TicketStatus = "aperto" | "in_lavorazione" | "risolto";

interface Message {
  id: string;
  message: string;
  sender_id: string;
  created_at: string;
  sender?: {
    first_name: string;
    last_name: string;
  } | null;
}

interface Ticket {
  id: string;
  subject: string;
  status: TicketStatus;
  created_at: string;
  customer_id: string;
  order_id: string | null;
  customer: {
    first_name: string;
    last_name: string;
    email: string;
    phone: string | null;
  } | null;
  order?: {
    id: string;
    description: string;
  } | null;
}

export default function TicketDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [newMessage, setNewMessage] = useState("");

  // Fetch ticket details
  const { data: ticket, isLoading: ticketLoading } = useQuery({
    queryKey: ["admin-ticket", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tickets")
        .select(`
          id,
          subject,
          status,
          created_at,
          customer_id,
          order_id,
          customer:profiles!tickets_customer_id_fkey(first_name, last_name, email, phone),
          order:orders(id, description)
        `)
        .eq("id", id!)
        .single();

      if (error) throw error;
      return data as unknown as Ticket;
    },
    enabled: !!id,
    staleTime: 30 * 1000, // 30 secondi
  });

  // Fetch messages
  const { data: messages = [], isLoading: messagesLoading } = useQuery({
    queryKey: ["admin-ticket-messages", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ticket_messages")
        .select(`
          id,
          message,
          sender_id,
          created_at,
          sender:profiles!ticket_messages_sender_id_fkey(first_name, last_name)
        `)
        .eq("ticket_id", id!)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return data as unknown as Message[];
    },
    enabled: !!id,
    staleTime: 30 * 1000, // 30 secondi
  });

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Update status mutation
  const updateStatusMutation = useMutation({
    mutationFn: async (newStatus: TicketStatus) => {
      const { error } = await supabase
        .from("tickets")
        .update({ 
          status: newStatus,
          updated_at: new Date().toISOString()
        })
        .eq("id", id!);

      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: "Stato aggiornato",
        description: "Lo stato del ticket è stato modificato.",
      });
      queryClient.invalidateQueries({ queryKey: ["admin-ticket", id] });
      queryClient.invalidateQueries({ queryKey: ["company-tickets"] });
    },
    onError: (error) => {
      console.error("Error updating status:", error);
      toast({
        title: "Errore",
        description: "Impossibile aggiornare lo stato.",
        variant: "destructive",
      });
    },
  });

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("ticket_messages")
        .insert({
          ticket_id: id!,
          sender_id: user!.id,
          message: newMessage.trim(),
        });

      if (error) throw error;

      // Update ticket's updated_at
      await supabase
        .from("tickets")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", id!);
    },
    onSuccess: () => {
      setNewMessage("");
      queryClient.invalidateQueries({ queryKey: ["admin-ticket-messages", id] });
      queryClient.invalidateQueries({ queryKey: ["company-tickets"] });
    },
    onError: (error) => {
      console.error("Error sending message:", error);
      toast({
        title: "Errore",
        description: "Impossibile inviare il messaggio. Riprova.",
        variant: "destructive",
      });
    },
  });

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;
    sendMessageMutation.mutate();
  };

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
      {/* Header */}
      <div className="flex items-start gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/azienda/assistenza")}
        >
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
          {/* Status */}
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
                    <Badge
                      variant="outline"
                      style={{
                        backgroundColor: statusColor.bg,
                        color: statusColor.text,
                        borderColor: statusColor.border,
                      }}
                    >
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

          {/* Customer Info */}
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
                <a 
                  href={`mailto:${ticket.customer?.email}`}
                  className="text-sm text-primary hover:underline"
                >
                  {ticket.customer?.email}
                </a>
              </div>
              {ticket.customer?.phone && (
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <a 
                    href={`tel:${ticket.customer?.phone}`}
                    className="text-sm text-primary hover:underline"
                  >
                    {ticket.customer?.phone}
                  </a>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Linked Order */}
          {ticket.order && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Ordine Collegato</CardTitle>
              </CardHeader>
              <CardContent>
                <Link 
                  to={`/azienda/ordini/${ticket.order.id}`}
                  className="flex items-start gap-2 text-primary hover:underline"
                >
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

        {/* Messages */}
        <Card className="md:col-span-2 flex flex-col" style={{ height: "calc(100vh - 300px)", minHeight: "400px" }}>
          <CardHeader className="border-b flex-shrink-0">
            <CardTitle className="text-lg">Conversazione</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((msg) => {
              const isCustomer = msg.sender_id === ticket.customer_id;
              const senderName = msg.sender 
                ? `${msg.sender.first_name} ${msg.sender.last_name}`
                : "Utente";

              return (
                <div
                  key={msg.id}
                  className={`flex ${isCustomer ? "justify-start" : "justify-end"}`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg p-3 ${
                      isCustomer
                        ? "bg-muted"
                        : "bg-primary text-primary-foreground"
                    }`}
                  >
                    <div className="flex items-center gap-1 mb-1">
                      <User className="h-3 w-3" />
                      <span className="text-xs font-medium">
                        {isCustomer ? senderName : "Tu"}
                      </span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{msg.message}</p>
                    <p 
                      className={`text-xs mt-1 ${
                        isCustomer ? "text-muted-foreground" : "text-primary-foreground/70"
                      }`}
                    >
                      {formatDateTime(msg.created_at)}
                    </p>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </CardContent>

          {/* Reply Form */}
          <div className="border-t p-4 flex-shrink-0">
            <form onSubmit={handleSendMessage} className="flex gap-2">
              <Textarea
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Scrivi una risposta..."
                rows={2}
                className="resize-none"
              />
              <Button
                type="submit"
                size="icon"
                disabled={!newMessage.trim() || sendMessageMutation.isPending}
                className="flex-shrink-0 h-auto"
              >
                {sendMessageMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </form>
          </div>
        </Card>
      </div>
    </div>
  );
}
