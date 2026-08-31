import { useState, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCompanyCustomers } from "@/hooks/useCompanyCustomers";
import { useCompanyStaffUsers } from "@/hooks/useCompanyStaffUsers";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { TICKET_MOTIVI_GRATUITO } from "@/types/tickets";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Loader2, Paperclip, X, Wrench } from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import type { TicketPriority } from "@/types/tickets";
import { queryKeys } from "@/lib/queryKeys";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_FILES = 5;
const ACCEPTED_TYPES = ["image/jpeg","image/png","image/gif","image/webp","application/pdf","application/msword","application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
const ACCEPTED_FORMATS = ".jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx";

interface ImpiantoOption {
  id: string;
  tipo_impianto: string | null;
  marca: string | null;
  modello: string | null;
}

export default function CreateCompanyTicket() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, effectiveCompany } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [customerId, setCustomerId] = useState<string>("");
  // ?order=<id> arriva dal tab Assistenza della commessa: la commessa
  // è già decisa, non deve essere ricercata di nuovo a mano.
  const [orderId, setOrderId] = useState<string>(searchParams.get("order") ?? "");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [priority, setPriority] = useState<TicketPriority>("normale");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  // Chi paga l'intervento: è la prima domanda che si fa l'ufficio quando arriva
  // una chiamata, e finora non c'era posto dove annotarla.
  const [aPagamento, setAPagamento] = useState(false);
  const [motivoGratuito, setMotivoGratuito] = useState<string>("garanzia");
  const [importoPreventivato, setImportoPreventivato] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Intervento fields
  const rawTipo = searchParams.get("tipo") ?? "supporto";
  const [tipo, setTipo] = useState<string>(["intervento", "emergenza", "supporto"].includes(rawTipo) ? rawTipo : "supporto");
  const [indirizzoIntervento, setIndirizzoIntervento] = useState("");
  const [dataInterventoPrevista, setDataInterventoPrevista] = useState("");
  const [durataOre, setDurataOre] = useState("");
  const [tecnicoId, setTecnicoId] = useState("");
  const [impiantoId, setImpiantoId] = useState("__none__");

  const isIntervento = tipo === "intervento" || tipo === "emergenza";

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

  const { data: customers = [] } = useCompanyCustomers(effectiveCompany?.id);

  // Load orders for selected customer
  const { data: orders = [] } = useQuery({
    queryKey: ["customer-orders-for-ticket", customerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, description, order_code")
        .eq("customer_id", customerId)
        .eq("company_id", effectiveCompany?.id ?? "")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
    enabled: !!customerId && !!effectiveCompany?.id,
  });

  const { data: tecnici = [] } = useCompanyStaffUsers(effectiveCompany?.id, "all");

  // Impianti del cliente selezionato (per interventi)
  const { data: impianti = [] } = useQuery<ImpiantoOption[]>({
    queryKey: ["impianti-customer-ticket", customerId],
    queryFn: async () => {
      const { data } = await supabase
        .from("impianti_cliente")
        .select("id, tipo_impianto, marca, modello")
        .eq("customer_id", customerId)
        .order("tipo_impianto");
      return (data ?? []) as ImpiantoOption[];
    },
    enabled: !!customerId && isIntervento,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!effectiveCompany?.id) throw new Error("Azienda non disponibile");
      if (!user?.id) throw new Error("Utente non autenticato");
      const durataNum = durataOre ? parseFloat(durataOre) : null;
      if (durataOre && (!Number.isFinite(durataNum) || durataNum <= 0)) {
        throw new Error("Inserisci una durata intervento valida.");
      }
      // Create ticket
      const { data: ticket, error: ticketError } = await supabase
        .from("tickets")
        .insert({
          company_id: effectiveCompany.id,
          customer_id: customerId,
          order_id: (orderId && orderId !== "none") ? orderId : null,
          subject,
          priority,
          tipo,
          status: "aperto" as const,
          assigned_to: tecnicoId || null,
          a_pagamento: aPagamento,
          motivo_gratuito: aPagamento ? null : motivoGratuito,
          importo_preventivato: aPagamento && importoPreventivato ? Number(importoPreventivato) : null,
          ...(isIntervento && {
            indirizzo_intervento: indirizzoIntervento.trim() || null,
            data_intervento_prevista: dataInterventoPrevista ? new Date(dataInterventoPrevista).toISOString() : null,
            durata_ore: durataNum,
            impianto_id: impiantoId && impiantoId !== "__none__" ? impiantoId : null,
          }),
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
            sender_id: user.id,
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
            sender_id: user.id,
            message: `📎 ${file.name}`,
            attachment_url: signedData?.signedUrl || path,
          });
        if (msgErr) throw msgErr;
      }

      return ticket.id;
    },
    onSuccess: (ticketId) => {
      toast({ title: isIntervento ? "Intervento creato" : "Ticket creato", description: "Creato con successo." });
      queryClient.invalidateQueries({ queryKey: queryKeys.companyTickets.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.adminTicketMessages.byTicket(ticketId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.ticketAttachments.byTicket(ticketId) });
      // Unificato dentro Assistenza (era /interventi/:id per tipo=intervento)
      navigate(`/azienda/assistenza/${ticketId}`);
    },
    onError: (err: Error) => {
      toast({ title: "Errore", description: err.message || "Impossibile creare il ticket.", variant: "destructive" });
    },
  });

  const canSubmit = customerId && subject.trim();

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" className="hidden md:inline-flex" onClick={() => navigate(isIntervento ? "/azienda/assistenza?tipo=intervento" : "/azienda/assistenza")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-2">
          {isIntervento && <Wrench className="h-5 w-5 text-orange-500" />}
          <div>
            <h1 className="text-xl font-bold">{isIntervento ? "Crea Intervento" : "Crea Ticket"}</h1>
            <p className="text-sm text-muted-foreground">{isIntervento ? "Pianifica un intervento tecnico" : "Apri un ticket per conto di un cliente"}</p>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {isIntervento && <Wrench className="h-4 w-4 text-orange-500" />}
            {isIntervento ? "Nuovo Intervento" : "Nuovo Ticket"}
          </CardTitle>
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

          {/* Tipo */}
          <div className="space-y-2">
            <Label>Tipo</Label>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="supporto">Supporto</SelectItem>
                <SelectItem value="intervento">Intervento tecnico</SelectItem>
                <SelectItem value="emergenza">Emergenza</SelectItem>
              </SelectContent>
            </Select>
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

          {/* Chi paga */}
          <div className="space-y-3 rounded-xl border border-border bg-muted/40 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <Label className="text-sm font-semibold">Intervento a pagamento</Label>
                <p className="text-xs text-muted-foreground">
                  Se è in garanzia lascialo spento: resta scritto perché non si fattura.
                </p>
              </div>
              <Switch checked={aPagamento} onCheckedChange={setAPagamento} />
            </div>

            {aPagamento ? (
              <div className="space-y-2">
                <Label className="text-xs">Importo preventivato (€)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={importoPreventivato}
                  onChange={(e) => setImportoPreventivato(e.target.value)}
                  placeholder="Es. 150,00 — lascia vuoto se ancora da quantificare"
                />
              </div>
            ) : (
              <div className="space-y-2">
                <Label className="text-xs">Perché non si paga</Label>
                <Select value={motivoGratuito} onValueChange={setMotivoGratuito}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TICKET_MOTIVI_GRATUITO.map((m) => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Campi specifici intervento */}
          {isIntervento && (
            <>
              <div className="space-y-2">
                <Label>Tecnico assegnato</Label>
                <Select value={tecnicoId} onValueChange={setTecnicoId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleziona tecnico..." />
                  </SelectTrigger>
                  <SelectContent>
                    {tecnici.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.first_name} {t.last_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Indirizzo intervento</Label>
                <Input
                  value={indirizzoIntervento}
                  onChange={(e) => setIndirizzoIntervento(e.target.value)}
                  placeholder="Via, città..."
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Data e ora prevista</Label>
                  <Input
                    type="datetime-local"
                    value={dataInterventoPrevista}
                    onChange={(e) => setDataInterventoPrevista(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Durata stimata (ore)</Label>
                  <Input
                    type="number"
                    min="0.5"
                    step="0.5"
                    value={durataOre}
                    onChange={(e) => setDurataOre(e.target.value)}
                    placeholder="Es. 2"
                  />
                </div>
              </div>

              {customerId && impianti.length > 0 && (
                <div className="space-y-2">
                  <Label>Impianto collegato (opzionale)</Label>
                  <Select value={impiantoId} onValueChange={setImpiantoId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleziona impianto..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Nessun impianto</SelectItem>
                      {impianti.map((im) => (
                        <SelectItem key={im.id} value={im.id}>
                          {im.tipo_impianto?.replace("_", " ")}{im.marca ? ` — ${im.marca}` : ""}{im.modello ? ` ${im.modello}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </>
          )}

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
                    <Button type="button" variant="ghost" size="icon" className="h-9 w-9 md:h-6 md:w-6 text-destructive" onClick={() => setPendingFiles(prev => prev.filter((_, j) => j !== i))}><X className="h-3 w-3" /></Button>
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
              isIntervento ? "Crea Intervento" : "Crea Ticket"
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
