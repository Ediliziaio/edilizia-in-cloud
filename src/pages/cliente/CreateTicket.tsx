import { useState, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { logger } from "@/utils/logger";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Send, Loader2, Paperclip, X } from "lucide-react";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_FILES = 5;
const ACCEPTED_TYPES = ["image/jpeg","image/png","image/gif","image/webp","application/pdf","application/msword","application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
const ACCEPTED_FORMATS = ".jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx";
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

  const { user, profile, company } = useAuth();
  const companyId = profile?.company_id ?? company?.id ?? null;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [orderId, setOrderId] = useState<string>(preselectedOrderId || "__none__");
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

  // Fetch customer's orders
  const { data: orders = [], isLoading: ordersLoading } = useQuery({
    queryKey: ["customer-orders-for-ticket", companyId, user?.id],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("orders")
        .select("id, description")
        .eq("company_id", companyId)
        .eq("customer_id", user!.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!user?.id && !!companyId,
    staleTime: 5 * 60 * 1000,
  });

  const createTicketMutation = useMutation({
    mutationFn: async () => {
      if (!user || !companyId) {
        throw new Error("Dati utente non disponibili");
      }
      const selectedOrderId = orderId && orderId !== "__none__" ? orderId : null;
      if (selectedOrderId && !orders.some((order) => order.id === selectedOrderId)) {
        throw new Error("Ordine non disponibile per questo cliente");
      }

      // Create ticket
      const { data: ticket, error: ticketError } = await supabase
        .from("tickets")
        .insert({
          subject,
          customer_id: user.id,
          company_id: companyId,
          order_id: selectedOrderId,
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

      // Upload pending files — salviamo il PATH (non la signed URL che scade 24h).
      // La signed URL verrà creata on-demand al momento del download nel detail.
      for (const file of pendingFiles) {
        const path = `${ticket.id}/${crypto.randomUUID()}-${file.name}`;
        const { error: upErr } = await supabase.storage
          .from("ticket-attachments")
          .upload(path, file, { contentType: file.type });
        if (upErr) throw upErr;

        const { error: msgErr } = await supabase
          .from("ticket_messages")
          .insert({
            ticket_id: ticket.id,
            sender_id: user!.id,
            message: `📎 ${file.name}`,
            attachment_url: path,
          });
        if (msgErr) throw msgErr;
      }

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
      logger.error("Error creating ticket:", error);
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
    if (!user || !companyId) {
      toast({
        title: "Attendere",
        description: "Dati utente in caricamento. Riprova tra un momento.",
        variant: "destructive",
      });
      return;
    }
    createTicketMutation.mutate();
  };

  if (ordersLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate("/cliente/assistenza")}
          className="w-10 h-10 rounded-xl flex items-center justify-center hover:bg-muted transition-colors shrink-0"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-xl font-bold tracking-tight">Nuovo Ticket</h1>
          <p className="text-sm text-muted-foreground">
            Descrivi il problema e ti risponderemo al più presto
          </p>
        </div>
      </div>

      {/* Form */}
      <div className="bg-background border border-border/60 rounded-2xl p-4">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">
          Apri una richiesta di assistenza
        </p>
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Order Selection */}
          {orders.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="order">Ordine collegato (opzionale)</Label>
              <Select value={orderId || "__none__"} onValueChange={setOrderId}>
                <SelectTrigger className="rounded-xl h-11">
                  <SelectValue placeholder="Seleziona un ordine..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Nessun ordine</SelectItem>
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
              className="rounded-xl h-11"
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
              className="rounded-xl min-h-[140px]"
            />
          </div>

          {/* Allegati */}
          <div className="space-y-2">
            <Label>Allegati (opzionale)</Label>
            <input ref={fileInputRef} type="file" multiple onChange={handleFileSelect} className="hidden" accept={ACCEPTED_FORMATS} />
            <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={pendingFiles.length >= MAX_FILES} className="rounded-xl h-11">
              <Paperclip className="h-4 w-4 mr-2" /> Allega file
            </Button>
            {pendingFiles.length > 0 && (
              <div className="space-y-1.5 mt-2">
                {pendingFiles.map((f, i) => (
                  <div key={`${f.name}-${i}`} className="flex items-center gap-2 text-sm p-3 rounded-xl border bg-muted/30">
                    <span className="truncate flex-1">{f.name}</span>
                    <span className="text-xs text-muted-foreground">{(f.size / 1024).toFixed(0)} KB</span>
                    <button type="button" className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-destructive/10 text-destructive transition-colors" onClick={() => setPendingFiles(prev => prev.filter((_, j) => j !== i))}><X className="h-3.5 w-3.5" /></button>
                  </div>
                ))}
                <p className="text-xs text-muted-foreground">{pendingFiles.length}/{MAX_FILES} file — max 10MB ciascuno</p>
              </div>
            )}
          </div>

          {/* Submit */}
          <div className="flex flex-col gap-3 pt-2">
            <Button
              type="submit"
              disabled={!subject.trim() || !message.trim() || !companyId || createTicketMutation.isPending}
              className="w-full rounded-2xl py-3.5 h-auto text-base font-semibold"
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
            <Button
              type="button"
              variant="ghost"
              onClick={() => navigate("/cliente/assistenza")}
              className="w-full rounded-2xl py-3 h-auto text-muted-foreground"
            >
              Annulla
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
