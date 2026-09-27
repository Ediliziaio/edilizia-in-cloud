/**
 * Form completo di apertura assistenza/intervento, condiviso tra la pagina
 * «Crea Ticket» e il popup «Nuovo Ticket» (così sono identici).
 *
 * Tutto ciò che serve è qui e opzionale: a chi assegnarlo (operaio o squadra),
 * quando, dove, l'impianto, le note per chi va, il pagamento, la merce da
 * ordinare. Niente è obbligatorio tranne cliente e oggetto: l'ufficio riempie
 * quel che sa al momento della chiamata e completa dopo.
 */
import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCompanyCustomers } from "@/hooks/useCompanyCustomers";
import { CreateCustomerDialog } from "@/components/orders/CreateCustomerDialog";
import { useCompanyStaffUsers } from "@/hooks/useCompanyStaffUsers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { TICKET_MOTIVI_GRATUITO, TICKET_MERCE_STATI, type TicketMerceStato } from "@/types/tickets";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Paperclip, X, UserPlus, Users, CalendarClock, Package } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { TicketPriority } from "@/types/tickets";
import { queryKeys } from "@/lib/queryKeys";
import { applyPlaybookToTicket } from "@/lib/ticketPlaybook";
import { OrdinaMerceDialog } from "@/components/tickets/OrdinaMerceDialog";

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

export interface NuovoTicketInitial {
  customerId?: string;
  orderId?: string;
  tipo?: string;
  impiantoId?: string;
}

interface NuovoTicketFormProps {
  initial?: NuovoTicketInitial;
  /** "dialog" mette il pulsante di invio nel footer sticky del popup. */
  variant?: "page" | "dialog";
  /** Creato il ticket: la pagina naviga, il popup chiude e naviga. */
  onCreated?: (ticketId: string) => void;
}

export function NuovoTicketForm({ initial, variant = "page", onCreated }: NuovoTicketFormProps) {
  const navigate = useNavigate();
  const { user, effectiveCompany } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [customerId, setCustomerId] = useState<string>(initial?.customerId ?? "");
  const [nuovoClienteOpen, setNuovoClienteOpen] = useState(false);
  const [orderId, setOrderId] = useState<string>(initial?.orderId ?? "");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [priority, setPriority] = useState<TicketPriority>("normale");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [aPagamento, setAPagamento] = useState(false);
  const [serveMerce, setServeMerce] = useState(false);
  const [merceStato, setMerceStato] = useState<TicketMerceStato>("da_ordinare");
  const [merceMancante, setMerceMancante] = useState("");
  const [motivoGratuito, setMotivoGratuito] = useState<string>("garanzia");
  const [importoPreventivato, setImportoPreventivato] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const rawTipo = initial?.tipo ?? "supporto";
  const [tipo, setTipo] = useState<string>(["intervento", "emergenza", "supporto"].includes(rawTipo) ? rawTipo : "supporto");
  const [indirizzoIntervento, setIndirizzoIntervento] = useState("");
  const [dataInterventoPrevista, setDataInterventoPrevista] = useState("");
  const [durataOre, setDurataOre] = useState("");
  const [tecnicoId, setTecnicoId] = useState("");
  const [squadraId, setSquadraId] = useState("");
  const [noteTecnico, setNoteTecnico] = useState("");
  const [impiantoId, setImpiantoId] = useState(initial?.impiantoId ?? "__none__");
  // Ticket appena creato per cui aprire subito l'ordine d'acquisto della merce.
  const [merceOdaTicketId, setMerceOdaTicketId] = useState<string | null>(null);

  // Conclude la creazione: apre il ticket (o lascia decidere a chi ospita).
  const finish = (ticketId: string) => {
    if (onCreated) onCreated(ticketId);
    else navigate(`/azienda/assistenza/${ticketId}`);
  };

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

  // Le squadre interne: si può mandarne una intera invece di una persona sola.
  const { data: squadre = [] } = useQuery({
    queryKey: ["squadre-interne", effectiveCompany?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("external_teams")
        .select("id, name")
        .eq("company_id", effectiveCompany!.id)
        .eq("kind", "interna")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
    enabled: !!effectiveCompany?.id,
    staleTime: 10 * 60 * 1000,
  });

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
    enabled: !!customerId,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!effectiveCompany?.id) throw new Error("Azienda non disponibile");
      if (!user?.id) throw new Error("Utente non autenticato");
      const durataNum = durataOre ? parseFloat(durataOre) : null;
      if (durataOre && (!Number.isFinite(durataNum) || (durataNum ?? 0) <= 0)) {
        throw new Error("Inserisci una durata intervento valida.");
      }
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
          squadra_id: squadraId || null,
          a_pagamento: aPagamento,
          motivo_gratuito: aPagamento ? null : motivoGratuito,
          merce_stato: serveMerce ? merceStato : null,
          merce_mancante:
            serveMerce && merceStato === "arrivata_parziale" && merceMancante.trim()
              ? merceMancante.trim()
              : null,
          merce_richiesta: serveMerce,
          importo_preventivato: aPagamento && importoPreventivato ? Number(importoPreventivato) : null,
          indirizzo_intervento: indirizzoIntervento.trim() || null,
          data_intervento_prevista: dataInterventoPrevista ? new Date(dataInterventoPrevista).toISOString() : null,
          durata_ore: durataNum,
          note_tecnico: noteTecnico.trim() || null,
          impianto_id: impiantoId && impiantoId !== "__none__" ? impiantoId : null,
        } as never)
        .select("id")
        .single();
      if (ticketError) throw ticketError;

      if (message.trim()) {
        const { error: msgError } = await supabase
          .from("ticket_messages")
          .insert({ ticket_id: ticket.id, sender_id: user.id, message: message.trim() });
        if (msgError) throw msgError;
      }

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

      try {
        const { data: az } = await supabase
          .from("companies")
          .select("ticket_playbook_auto_apply")
          .eq("id", effectiveCompany.id)
          .maybeSingle();
        if ((az as { ticket_playbook_auto_apply?: boolean } | null)?.ticket_playbook_auto_apply) {
          await applyPlaybookToTicket({
            companyId: effectiveCompany.id,
            ticketId: ticket.id,
            category: null,
            baseDate: new Date(),
            assignedTo: tecnicoId || null,
          });
        }
      } catch (e) {
        console.error("Flusso assistenza non applicato:", e);
      }

      return ticket.id as string;
    },
    onSuccess: (ticketId) => {
      toast({ title: "Ticket creato", description: "Creato con successo." });
      queryClient.invalidateQueries({ queryKey: queryKeys.companyTickets.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.adminTicketMessages.byTicket(ticketId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.ticketAttachments.byTicket(ticketId) });
      // Merce ancora da ordinare: apro subito l'ordine d'acquisto (fornitore +
      // cosa serve). Alla chiusura di quella finestra concludo aprendo il ticket.
      if (serveMerce && merceStato === "da_ordinare" && effectiveCompany?.id) {
        setMerceOdaTicketId(ticketId);
        return;
      }
      finish(ticketId);
    },
    onError: (err: Error) => {
      toast({ title: "Errore", description: err.message || "Impossibile creare il ticket.", variant: "destructive" });
    },
  });

  const canSubmit = customerId && subject.trim();
  const submitLabel = createMutation.isPending
    ? undefined
    : "Crea ticket";

  return (
    <div className="space-y-4">
      {/* Cliente */}
      <div className="space-y-2">
        <Label>Cliente *</Label>
        <div className="flex gap-2">
          <Select value={customerId} onValueChange={(v) => { setCustomerId(v); setOrderId(""); }}>
            <SelectTrigger className="flex-1"><SelectValue placeholder="Seleziona cliente..." /></SelectTrigger>
            <SelectContent>
              {customers.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.first_name} {c.last_name}{c.email ? ` — ${c.email}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="button" variant="outline" className="shrink-0 gap-1.5" onClick={() => setNuovoClienteOpen(true)}>
            <UserPlus className="h-4 w-4" /><span className="max-sm:hidden">Nuovo cliente</span>
          </Button>
        </div>
      </div>

      {/* Ordine collegato */}
      {customerId && (
        <div className="space-y-2">
          <Label>Commessa collegata (opzionale)</Label>
          <Select value={orderId} onValueChange={setOrderId}>
            <SelectTrigger><SelectValue placeholder="Nessuna commessa" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Nessuna commessa</SelectItem>
              {orders.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.order_code ? `${o.order_code} — ` : ""}{o.description?.substring(0, 60)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Oggetto */}
      <div className="space-y-2">
        <Label>Oggetto *</Label>
        <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Es. Caldaia che non parte" />
      </div>

      {/* Tipo + Priorità affiancati */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Tipo</Label>
          <Select value={tipo} onValueChange={setTipo}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="supporto">Supporto</SelectItem>
              <SelectItem value="intervento">Intervento tecnico</SelectItem>
              <SelectItem value="emergenza">Emergenza</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Priorità</Label>
          <Select value={priority} onValueChange={(v) => setPriority(v as TicketPriority)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="bassa">Bassa</SelectItem>
              <SelectItem value="normale">Normale</SelectItem>
              <SelectItem value="alta">Alta</SelectItem>
              <SelectItem value="urgente">Urgente</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Assegnazione e pianificazione — sempre disponibili, tutte opzionali */}
      <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-3">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-muted-foreground" />
          <Label className="text-sm font-semibold">Assegnazione e pianificazione (opzionale)</Label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Assegna a un operaio</Label>
            <Select value={tecnicoId || "__none__"} onValueChange={(v) => setTecnicoId(v === "__none__" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Nessuno" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Nessuno</SelectItem>
                {tecnici.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.first_name} {t.last_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1 text-xs"><Users className="h-3 w-3" /> Oppure a una squadra</Label>
            <Select value={squadraId || "__none__"} onValueChange={(v) => setSquadraId(v === "__none__" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Nessuna squadra" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Nessuna squadra</SelectItem>
                {squadre.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Data e ora prevista</Label>
            <Input type="datetime-local" value={dataInterventoPrevista} onChange={(e) => setDataInterventoPrevista(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Durata stimata (ore)</Label>
            <Input type="number" min="0.5" step="0.5" value={durataOre} onChange={(e) => setDurataOre(e.target.value)} placeholder="Es. 2" />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Indirizzo intervento</Label>
          <Input value={indirizzoIntervento} onChange={(e) => setIndirizzoIntervento(e.target.value)} placeholder="Via, città…" />
        </div>

        {customerId && impianti.length > 0 && (
          <div className="space-y-1.5">
            <Label className="text-xs">Impianto collegato</Label>
            <Select value={impiantoId} onValueChange={setImpiantoId}>
              <SelectTrigger><SelectValue placeholder="Nessun impianto" /></SelectTrigger>
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

        <div className="space-y-1.5">
          <Label className="text-xs">Note per chi interviene</Label>
          <Textarea value={noteTecnico} onChange={(e) => setNoteTecnico(e.target.value)} rows={2} placeholder="Istruzioni, accessi, materiali…" />
        </div>
      </div>

      {/* Chi paga */}
      <div className="space-y-3 rounded-xl border border-border bg-muted/40 p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <Label className="text-sm font-semibold">Intervento a pagamento</Label>
            <p className="text-xs text-muted-foreground">Se è in garanzia lascialo spento: resta scritto perché non si fattura.</p>
          </div>
          <Switch checked={aPagamento} onCheckedChange={setAPagamento} />
        </div>
        {aPagamento ? (
          <div className="space-y-2">
            <Label className="text-xs">Importo preventivato (€)</Label>
            <Input type="number" min="0" step="0.01" inputMode="decimal" value={importoPreventivato}
                   onChange={(e) => setImportoPreventivato(e.target.value)}
                   placeholder="Es. 150,00 — lascia vuoto se ancora da quantificare" />
          </div>
        ) : (
          <div className="space-y-2">
            <Label className="text-xs">Perché non si paga</Label>
            <Select value={motivoGratuito} onValueChange={setMotivoGratuito}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TICKET_MOTIVI_GRATUITO.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Merce */}
      <div className="space-y-3 rounded-xl border border-border bg-muted/40 p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <Label className="text-sm font-semibold">Serve della merce</Label>
            <p className="text-xs text-muted-foreground">Accendilo se l'intervento aspetta materiale: potrai filtrare i ticket per merce.</p>
          </div>
          <Switch checked={serveMerce} onCheckedChange={setServeMerce} />
        </div>
        {serveMerce && (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label className="text-xs">A che punto è</Label>
              <Select value={merceStato} onValueChange={(v) => setMerceStato(v as TicketMerceStato)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TICKET_MERCE_STATI.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {merceStato === "da_ordinare" && (
              <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 p-2 text-xs text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
                <Package className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Appena creato il ticket ti chiedo fornitore e cosa serve: parte un ordine d'acquisto collegato e tracciato in magazzino.
              </p>
            )}
            {merceStato === "arrivata_parziale" && (
              <div className="space-y-2">
                <Label className="text-xs text-red-600">Che cosa manca *</Label>
                <Textarea value={merceMancante} onChange={(e) => setMerceMancante(e.target.value)}
                          placeholder="Es. mancano 2 maniglie e la guarnizione inferiore" rows={2}
                          className="border-red-200 focus-visible:ring-red-400" />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Messaggio */}
      <div className="space-y-2">
        <Label>Messaggio iniziale (opzionale)</Label>
        <Textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Descrivi il problema o la richiesta..." rows={3} />
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
        className={variant === "dialog" ? "w-full" : "w-full"}
        disabled={!canSubmit || createMutation.isPending}
        onClick={() => createMutation.mutate()}
      >
        {createMutation.isPending ? (<><Loader2 className="h-4 w-4 animate-spin mr-2" /> Creazione...</>) : submitLabel}
      </Button>

      <CreateCustomerDialog
        open={nuovoClienteOpen}
        onOpenChange={setNuovoClienteOpen}
        onCustomerCreated={(id) => { setCustomerId(id); setOrderId(""); setNuovoClienteOpen(false); }}
      />

      {/* Ticket creato con «merce da ordinare»: l'ordine d'acquisto parte da qui,
          collegato al ticket. Chiusa la finestra, apro il ticket. */}
      {merceOdaTicketId && effectiveCompany?.id && (
        <OrdinaMerceDialog
          open
          onOpenChange={(o) => {
            if (!o) {
              const id = merceOdaTicketId;
              setMerceOdaTicketId(null);
              finish(id);
            }
          }}
          ticketId={merceOdaTicketId}
          orderId={(orderId && orderId !== "none") ? orderId : null}
          companyId={effectiveCompany.id}
        />
      )}
    </div>
  );
}
