import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Loader2 } from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import type { TicketPriority } from "@/types/tickets";

export default function CreateCompanyTicket() {
  const navigate = useNavigate();
  const { user, effectiveCompany } = useAuth();
  const { toast } = useToast();
  const [customerId, setCustomerId] = useState<string>("");
  const [orderId, setOrderId] = useState<string>("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [priority, setPriority] = useState<TicketPriority>("normale");

  // Load customers
  const { data: customers = [] } = useQuery({
    queryKey: ["company-customers-list", effectiveCompany?.id],
    queryFn: async () => {
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "customer");
      const customerIds = (roleData || []).map((r) => r.user_id);
      if (customerIds.length === 0) return [];
      const { data, error } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, email")
        .eq("company_id", effectiveCompany!.id)
        .in("id", customerIds)
        .order("last_name");
      if (error) throw error;
      return data || [];
    },
    enabled: !!effectiveCompany?.id,
  });

  // Load orders for selected customer
  const { data: orders = [] } = useQuery({
    queryKey: ["customer-orders-for-ticket", customerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, description, order_code")
        .eq("customer_id", customerId)
        .eq("company_id", effectiveCompany!.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
    enabled: !!customerId && !!effectiveCompany?.id,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      // Create ticket
      const { data: ticket, error: ticketError } = await supabase
        .from("tickets")
        .insert({
          company_id: effectiveCompany!.id,
          customer_id: customerId,
          order_id: orderId || null,
          subject,
          priority,
          status: "aperto" as const,
          assigned_to: user!.id,
        })
        .select("id")
        .single();
      if (ticketError) throw ticketError;

      // Create initial message
      if (message.trim()) {
        const { error: msgError } = await supabase
          .from("ticket_messages")
          .insert({
            ticket_id: ticket.id,
            sender_id: user!.id,
            message: message.trim(),
          });
        if (msgError) throw msgError;
      }

      return ticket.id;
    },
    onSuccess: (ticketId) => {
      toast({ title: "Ticket creato", description: "Il ticket è stato creato con successo." });
      navigate(`/azienda/assistenza/${ticketId}`);
    },
    onError: () => {
      toast({ title: "Errore", description: "Impossibile creare il ticket.", variant: "destructive" });
    },
  });

  const canSubmit = customerId && subject.trim();

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/azienda/assistenza")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">Crea Ticket</h1>
          <p className="text-sm text-muted-foreground">Apri un ticket per conto di un cliente</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Nuovo Ticket</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Customer */}
          <div className="space-y-2">
            <Label>Cliente *</Label>
            <Select value={customerId} onValueChange={(v) => { setCustomerId(v); setOrderId(""); }}>
              <SelectTrigger>
                <SelectValue placeholder="Seleziona cliente..." />
              </SelectTrigger>
              <SelectContent>
                {customers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.first_name} {c.last_name} — {c.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Order (optional) */}
          {customerId && (
            <div className="space-y-2">
              <Label>Ordine collegato (opzionale)</Label>
              <Select value={orderId} onValueChange={setOrderId}>
                <SelectTrigger>
                  <SelectValue placeholder="Nessun ordine" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nessun ordine</SelectItem>
                  {orders.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.order_code ? `${o.order_code} — ` : ""}{o.description?.substring(0, 60)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Subject */}
          <div className="space-y-2">
            <Label>Oggetto *</Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Oggetto del ticket..."
            />
          </div>

          {/* Priority */}
          <div className="space-y-2">
            <Label>Priorità</Label>
            <Select value={priority} onValueChange={(v) => setPriority(v as TicketPriority)}>
              <SelectTrigger>
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

          {/* Message */}
          <div className="space-y-2">
            <Label>Messaggio iniziale (opzionale)</Label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Descrivi il problema o la richiesta..."
              rows={4}
            />
          </div>

          <Button
            className="w-full"
            disabled={!canSubmit || createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            {createMutation.isPending ? (
              <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Creazione...</>
            ) : (
              "Crea Ticket"
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
