import { useState, useRef } from "react";
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
import { ArrowLeft, Loader2, Paperclip, X } from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import type { TicketPriority } from "@/types/tickets";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_FILES = 5;
const ACCEPTED_TYPES = ["image/jpeg","image/png","image/gif","image/webp","application/pdf","application/msword","application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
const ACCEPTED_FORMATS = ".jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx";

export default function CreateCompanyTicket() {
  const navigate = useNavigate();
  const { user, effectiveCompany } = useAuth();
  const { toast } = useToast();
  const [customerId, setCustomerId] = useState<string>("");
  const [orderId, setOrderId] = useState<string>("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [priority, setPriority] = useState<TicketPriority>("normale");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    const valid: File[] = [];
    for (const file of selected) {
      if (pendingFiles.length + valid.length >= MAX_FILES) { toast({ title: "Limite file", description: `Massimo ${MAX_FILES} file.`, variant: "destructive" }); break; }
      if (!ACCEPTED_TYPES.includes(file.type)) { toast({ title: "Tipo non valido", description: `"${file.name}" non è supportato.`, variant: "destructive" }); continue; }
      if (file.size > MAX_FILE_SIZE) { toast({ title: "File troppo grande", description: `"${file.name}" supera 10MB.`, variant: "destructive" }); continue; }
      valid.push(file);
    }
    if (valid.length) setPendingFiles(prev => [...prev, ...valid]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

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

      // Upload pending files
      for (const file of pendingFiles) {
        const path = `${ticket.id}/${crypto.randomUUID()}-${file.name}`;
        const { error: upErr } = await supabase.storage
          .from("ticket-attachments")
          .upload(path, file, { contentType: file.type });
        if (upErr) throw upErr;
        const { data: signedData } = await supabase.storage
          .from("ticket-attachments")
          .createSignedUrl(path, 60 * 60 * 24);
        const { error: msgErr } = await supabase
          .from("ticket_messages")
          .insert({
            ticket_id: ticket.id,
            sender_id: user!.id,
            message: `📎 ${file.name}`,
            attachment_url: signedData?.signedUrl || path,
          });
        if (msgErr) throw msgErr;
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

          {/* Allegati */}
          <div className="space-y-2">
            <Label>Allegati (opzionale)</Label>
            <input ref={fileInputRef} type="file" multiple onChange={handleFileSelect} className="hidden" accept={ACCEPTED_FORMATS} />
            <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={pendingFiles.length >= MAX_FILES}>
              <Paperclip className="h-4 w-4 mr-2" /> Allega file
            </Button>
            {pendingFiles.length > 0 && (
              <div className="space-y-1 mt-2">
                {pendingFiles.map((f, i) => (
                  <div key={`${f.name}-${i}`} className="flex items-center gap-2 text-sm p-2 rounded border bg-muted/30">
                    <span className="truncate flex-1">{f.name}</span>
                    <span className="text-xs text-muted-foreground">{(f.size / 1024).toFixed(0)} KB</span>
                    <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => setPendingFiles(prev => prev.filter((_, j) => j !== i))}><X className="h-3 w-3" /></Button>
                  </div>
                ))}
                <p className="text-xs text-muted-foreground">{pendingFiles.length}/{MAX_FILES} file — max 10MB ciascuno</p>
              </div>
            )}
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
