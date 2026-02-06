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
import { ArrowLeft, Send, Loader2, Package, User } from "lucide-react";
import { 
  formatDateTime, 
  formatRelativeTime, 
  getTicketStatusColor, 
  getTicketStatusLabel 
} from "@/lib/formatters";

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
  order_id: string | null;
  order?: {
    id: string;
    description: string;
  } | null;
}

export default function CustomerTicketDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [newMessage, setNewMessage] = useState("");

  // Fetch ticket details
  const { data: ticket, isLoading: ticketLoading } = useQuery({
    queryKey: ["ticket", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tickets")
        .select(`
          id,
          subject,
          status,
          created_at,
          order_id,
          order:orders(id, description)
        `)
        .eq("id", id!)
        .single();

      if (error) throw error;
      return data as Ticket;
    },
    enabled: !!id,
  });

  // Fetch messages
  const { data: messages = [], isLoading: messagesLoading } = useQuery({
    queryKey: ["ticket-messages", id],
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
  });

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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
      queryClient.invalidateQueries({ queryKey: ["ticket-messages", id] });
      queryClient.invalidateQueries({ queryKey: ["customer-tickets"] });
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
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
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
  const isResolved = ticket.status === "risolto";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/cliente/assistenza")}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <h1 className="text-xl font-bold text-foreground">
              {ticket.subject}
            </h1>
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
          <p className="text-sm text-muted-foreground mt-1">
            Aperto {formatRelativeTime(ticket.created_at)}
          </p>
        </div>
      </div>

      {/* Linked Order */}
      {ticket.order && (
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <Package className="h-5 w-5 text-primary" />
            <div className="flex-1">
              <p className="text-sm text-muted-foreground">Ordine collegato</p>
              <Link 
                to={`/cliente/ordini/${ticket.order.id}`}
                className="font-medium text-primary hover:underline"
              >
                {ticket.order.description.length > 60
                  ? ticket.order.description.substring(0, 60) + "..."
                  : ticket.order.description}
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Messages */}
      <Card className="flex flex-col" style={{ height: "calc(100vh - 400px)", minHeight: "300px" }}>
        <CardHeader className="border-b flex-shrink-0">
          <CardTitle className="text-lg">Conversazione</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg) => {
            const isMe = msg.sender_id === user?.id;
            const senderName = msg.sender 
              ? `${msg.sender.first_name} ${msg.sender.last_name}`
              : "Utente";

            return (
              <div
                key={msg.id}
                className={`flex ${isMe ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg p-3 ${
                    isMe
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  }`}
                >
                  {!isMe && (
                    <div className="flex items-center gap-1 mb-1">
                      <User className="h-3 w-3" />
                      <span className="text-xs font-medium">{senderName}</span>
                    </div>
                  )}
                  <p className="text-sm whitespace-pre-wrap">{msg.message}</p>
                  <p 
                    className={`text-xs mt-1 ${
                      isMe ? "text-primary-foreground/70" : "text-muted-foreground"
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
        {!isResolved && (
          <div className="border-t p-4 flex-shrink-0">
            <form onSubmit={handleSendMessage} className="flex gap-2">
              <Textarea
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Scrivi un messaggio..."
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
        )}

        {isResolved && (
          <div className="border-t p-4 text-center text-sm text-muted-foreground">
            Questo ticket è stato risolto. Per nuove richieste, apri un nuovo ticket.
          </div>
        )}
      </Card>
    </div>
  );
}
