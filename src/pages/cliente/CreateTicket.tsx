import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Send, Loader2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function CreateTicket() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectedOrderId = searchParams.get("ordine");
  
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [orderId, setOrderId] = useState<string>(preselectedOrderId || "");

  // Fetch customer's orders
  const { data: orders = [], isLoading: ordersLoading } = useQuery({
    queryKey: ["customer-orders-for-ticket", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, description")
        .eq("customer_id", user!.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const createTicketMutation = useMutation({
    mutationFn: async () => {
      if (!user || !profile?.company_id) {
        throw new Error("Dati utente non disponibili");
      }

      // Create ticket
      const { data: ticket, error: ticketError } = await supabase
        .from("tickets")
        .insert({
          subject,
          customer_id: user.id,
          company_id: profile.company_id,
          order_id: orderId || null,
          status: "aperto",
        })
        .select()
        .single();

      if (ticketError) throw ticketError;

      // Create initial message
      const { error: messageError } = await supabase
        .from("ticket_messages")
        .insert({
          ticket_id: ticket.id,
          sender_id: user.id,
          message,
        });

      if (messageError) throw messageError;

      return ticket;
    },
    onSuccess: (ticket) => {
      toast({
        title: "Ticket creato",
        description: "Il tuo ticket di assistenza è stato inviato.",
      });
      queryClient.invalidateQueries({ queryKey: ["customer-tickets"] });
      navigate(`/cliente/assistenza/${ticket.id}`);
    },
    onError: (error) => {
      console.error("Error creating ticket:", error);
      toast({
        title: "Errore",
        description: "Impossibile creare il ticket. Riprova.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) return;
    createTicketMutation.mutate();
  };

  if (ordersLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/cliente/assistenza")}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Nuovo Ticket</h1>
          <p className="text-sm text-muted-foreground">
            Descrivi il problema e ti risponderemo al più presto
          </p>
        </div>
      </div>

      {/* Form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Apri una richiesta di assistenza</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Order Selection */}
            {orders.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="order">Ordine collegato (opzionale)</Label>
                <Select value={orderId} onValueChange={setOrderId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleziona un ordine..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Nessun ordine</SelectItem>
                    {orders.map((order) => (
                      <SelectItem key={order.id} value={order.id}>
                        {order.description.length > 50 
                          ? order.description.substring(0, 50) + "..." 
                          : order.description}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Collega il ticket a un ordine specifico per un supporto più rapido
                </p>
              </div>
            )}

            {/* Subject */}
            <div className="space-y-2">
              <Label htmlFor="subject">Oggetto *</Label>
              <Input
                id="subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Riassumi brevemente il problema"
                required
              />
            </div>

            {/* Message */}
            <div className="space-y-2">
              <Label htmlFor="message">Messaggio *</Label>
              <Textarea
                id="message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Descrivi in dettaglio il problema o la tua richiesta..."
                rows={6}
                required
              />
            </div>

            {/* Submit */}
            <div className="flex justify-end gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate("/cliente/assistenza")}
              >
                Annulla
              </Button>
              <Button
                type="submit"
                disabled={!subject.trim() || !message.trim() || createTicketMutation.isPending}
              >
                {createTicketMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Invio...
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    Invia Ticket
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
