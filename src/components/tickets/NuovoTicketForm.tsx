/**
 * Form completo di apertura assistenza/intervento, condiviso tra la pagina
 * «Crea Ticket» e il popup «Nuovo Ticket» (così sono identici).
 *
 * Tutto ciò che serve è qui e opzionale: a chi assegnarlo (operaio o squadra),
 * quando, dove, l'impianto, le note per chi va, il pagamento, la merce da
 * ordinare. Niente è obbligatorio tranne cliente e oggetto: l'ufficio riempie
 * quel che sa al momento della chiamata e completa dopo.
 */
import { useState, useRef, useId } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { completaAllegato, preparaAllegato, type AllegatoDaCaricare } from "@/lib/tickets/caricaAllegato";
import { useAuth } from "@/contexts/AuthContext";
import { useCompanyCustomers } from "@/hooks/useCompanyCustomers";
import { CreateCustomerDialog } from "@/components/orders/CreateCustomerDialog";
import { useCompanyStaffUsers } from "@/hooks/useCompanyStaffUsers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CampoIndirizzo } from "@/components/shared/CampoIndirizzo";
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
import { useT } from "@/lib/campo/lingua/LinguaCampo";

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
  onPendingChange?: (pending: boolean) => void;
}

export function NuovoTicketForm({ initial, variant = "page", onCreated, onPendingChange }: NuovoTicketFormProps) {
  const tr = useT();
  const fieldId = useId();
  const pendingRef = useRef(false);
  const createdTicketRef = useRef<string | null>(null);
  const messageSentRef = useRef(false);
  const filesProgressRef = useRef(new Map<File, { allegato: AllegatoDaCaricare; completato: boolean }>());
  const [createdTicketId, setCreatedTicketId] = useState<string | null>(null);
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
      if (pendingFiles.length + valid.length >= MAX_FILES) { toast({ title: tr("Limite file"), description: tr("Massimo {MAX_FILES} file.", { MAX_FILES: String(MAX_FILES ?? "") }), variant: "destructive" }); break; }
      if (!ACCEPTED_TYPES.includes(file.type)) { toast({ title: tr("Tipo non valido"), description: tr("\"{name}\" non è supportato.", { name: String(file.name ?? "") }), variant: "destructive" }); continue; }
      if (file.size > MAX_FILE_SIZE) { toast({ title: tr("File troppo grande"), description: tr("\"{name}\" supera 10MB.", { name: String(file.name ?? "") }), variant: "destructive" }); continue; }
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
        throw new Error(tr("Inserisci una durata intervento valida."));
      }
      let ticketId = createdTicketRef.current;
      if (!ticketId) {
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
        if (!ticket?.id) throw new Error("Il server non ha restituito l’ID del ticket.");
        ticketId = ticket.id;
        createdTicketRef.current = ticketId;
        setCreatedTicketId(ticketId);
      }

      if (message.trim() && !messageSentRef.current) {
        const { error: msgError } = await supabase
          .from("ticket_messages")
          .insert({ ticket_id: ticketId, sender_id: user.id, message: message.trim() });
        if (msgError) throw msgError;
        messageSentRef.current = true;
      }

      for (const file of pendingFiles) {
        const progress = filesProgressRef.current.get(file) ?? { allegato: preparaAllegato(ticketId, file), completato: false };
        if (progress.completato) continue;
        filesProgressRef.current.set(file, progress);
        await completaAllegato(progress.allegato, ticketId, user.id);
        progress.completato = true;
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
            ticketId,
            category: null,
            baseDate: new Date(),
            assignedTo: tecnicoId || null,
          });
        }
      } catch (e) {
        console.error("Flusso assistenza non applicato:", e);
      }

      return ticketId;
    },
    onSuccess: (ticketId) => {
      toast({ title: tr("Ticket creato"), description: tr("Creato con successo.") });
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
      toast({ title: createdTicketRef.current ? tr("Ticket creato, completamento non riuscito") : tr("Errore"), description: err.message || tr("Impossibile creare il ticket."), variant: "destructive" });
    },
    onSettled: () => {
      pendingRef.current = false;
      onPendingChange?.(false);
    },
  });

  const canSubmit = customerId && subject.trim();
  const submitLabel = createMutation.isPending
    ? undefined
    : createdTicketId && pendingFiles.length > 0 ? tr("Riprova mancanti")
    : createdTicketId ? tr("Completa ticket") : tr("Crea ticket");

  return (
    <div className="space-y-4" aria-busy={createMutation.isPending}>
      {createdTicketId && createMutation.isError && (
        <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {tr("Il ticket è già stato creato. Riprova per completare messaggio e allegati senza crearne un altro. I contenuti ancora da inviare restano in questo modulo finché non lo chiudi.")}
        </div>
      )}
      <fieldset disabled={createMutation.isPending || Boolean(createdTicketId)} className="space-y-4">
      {/* Cliente */}
      <div className="space-y-2">
        <Label htmlFor={`${fieldId}-customerId`}>{tr("Cliente *")}</Label>
        <div className="flex gap-2">
          <Select value={customerId} onValueChange={(v) => { setCustomerId(v); setOrderId(""); }}>
            <SelectTrigger id={`${fieldId}-customerId`} className="flex-1"><SelectValue placeholder={tr("Seleziona cliente...")} /></SelectTrigger>
            <SelectContent>
              {customers.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.first_name} {c.last_name}{c.email ? ` — ${c.email}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="button" variant="outline" className="shrink-0 gap-1.5" onClick={() => setNuovoClienteOpen(true)}>
            <UserPlus className="h-4 w-4" /><span className="max-sm:hidden">{tr("Nuovo cliente")}</span>
          </Button>
        </div>
      </div>

      {/* Ordine collegato */}
      {customerId && (
        <div className="space-y-2">
          <Label htmlFor={`${fieldId}-orderId`}>{tr("Commessa collegata (opzionale)")}</Label>
          <Select value={orderId} onValueChange={setOrderId}>
            <SelectTrigger id={`${fieldId}-orderId`}><SelectValue placeholder={tr("Nessuna commessa")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{tr("Nessuna commessa")}</SelectItem>
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
        <Label htmlFor={`${fieldId}-subject`}>{tr("Oggetto *")}</Label>
        <Input id={`${fieldId}-subject`} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={tr("Es. Caldaia che non parte")} />
      </div>

      {/* Tipo + Priorità affiancati */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor={`${fieldId}-tipo`}>{tr("Tipo")}</Label>
          <Select value={tipo} onValueChange={setTipo}>
            <SelectTrigger id={`${fieldId}-tipo`}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="supporto">{tr("Supporto")}</SelectItem>
              <SelectItem value="intervento">{tr("Intervento tecnico")}</SelectItem>
              <SelectItem value="emergenza">{tr("Emergenza")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${fieldId}-priority`}>{tr("Priorità")}</Label>
          <Select value={priority} onValueChange={(v) => setPriority(v as TicketPriority)}>
            <SelectTrigger id={`${fieldId}-priority`}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="bassa">{tr("Bassa")}</SelectItem>
              <SelectItem value="normale">{tr("Normale")}</SelectItem>
              <SelectItem value="alta">{tr("Alta")}</SelectItem>
              <SelectItem value="urgente">{tr("Urgente")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Assegnazione e pianificazione — sempre disponibili, tutte opzionali */}
      <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-3">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-muted-foreground" />
          <Label className="text-sm font-semibold">{tr("Assegnazione e pianificazione (opzionale)")}</Label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor={`${fieldId}-tecnicoId`} className="text-xs">{tr("Assegna a un operaio")}</Label>
            <Select value={tecnicoId || "__none__"} onValueChange={(v) => setTecnicoId(v === "__none__" ? "" : v)}>
              <SelectTrigger id={`${fieldId}-tecnicoId`}><SelectValue placeholder={tr("Nessuno")} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">{tr("Nessuno")}</SelectItem>
                {tecnici.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.first_name} {t.last_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${fieldId}-squadraId`} className="flex items-center gap-1 text-xs"><Users className="h-3 w-3" /> {tr("Oppure a una squadra")}</Label>
            <Select value={squadraId || "__none__"} onValueChange={(v) => setSquadraId(v === "__none__" ? "" : v)}>
              <SelectTrigger id={`${fieldId}-squadraId`}><SelectValue placeholder={tr("Nessuna squadra")} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">{tr("Nessuna squadra")}</SelectItem>
                {squadre.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor={`${fieldId}-dataInterventoPrevista`} className="text-xs">{tr("Data e ora prevista")}</Label>
            <Input id={`${fieldId}-dataInterventoPrevista`} type="datetime-local" value={dataInterventoPrevista} onChange={(e) => setDataInterventoPrevista(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${fieldId}-durataOre`} className="text-xs">{tr("Durata stimata (ore)")}</Label>
            <Input id={`${fieldId}-durataOre`} type="number" min="0.5" step="0.5" value={durataOre} onChange={(e) => setDurataOre(e.target.value)} placeholder={tr("Es. 2")} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="nuovo-ticket-indirizzo" className="text-xs">{tr("Indirizzo intervento")}</Label>
          <CampoIndirizzo id="nuovo-ticket-indirizzo" value={indirizzoIntervento} onChange={setIndirizzoIntervento} placeholder={tr("Via, città…")} />
        </div>

        {customerId && impianti.length > 0 && (
          <div className="space-y-1.5">
            <Label htmlFor={`${fieldId}-impiantoId`} className="text-xs">{tr("Manutenzione collegata")}</Label>
            <Select value={impiantoId} onValueChange={setImpiantoId}>
              <SelectTrigger id={`${fieldId}-impiantoId`}><SelectValue placeholder={tr("Nessuna manutenzione")} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">{tr("Nessuna manutenzione")}</SelectItem>
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
          <Label htmlFor={`${fieldId}-noteTecnico`} className="text-xs">{tr("Note per chi interviene")}</Label>
          <Textarea id={`${fieldId}-noteTecnico`} value={noteTecnico} onChange={(e) => setNoteTecnico(e.target.value)} rows={2} placeholder={tr("Istruzioni, accessi, materiali…")} />
        </div>
      </div>

      {/* Chi paga */}
      <div className="space-y-3 rounded-xl border border-border bg-muted/40 p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <Label htmlFor={`${fieldId}-aPagamento`} className="text-sm font-semibold">{tr("Intervento a pagamento")}</Label>
            <p className="text-xs text-muted-foreground">{tr("Se è in garanzia lascialo spento: resta scritto perché non si fattura.")}</p>
          </div>
          <Switch id={`${fieldId}-aPagamento`} checked={aPagamento} onCheckedChange={setAPagamento} />
        </div>
        {aPagamento ? (
          <div className="space-y-2">
            <Label htmlFor={`${fieldId}-importoPreventivato`} className="text-xs">{tr("Importo preventivato (€)")}</Label>
            <Input id={`${fieldId}-importoPreventivato`} type="number" min="0" step="0.01" inputMode="decimal" value={importoPreventivato}
                   onChange={(e) => setImportoPreventivato(e.target.value)}
                   placeholder={tr("Es. 150,00 — lascia vuoto se ancora da quantificare")} />
          </div>
        ) : (
          <div className="space-y-2">
            <Label htmlFor={`${fieldId}-motivoGratuito`} className="text-xs">{tr("Perché non si paga")}</Label>
            <Select value={motivoGratuito} onValueChange={setMotivoGratuito}>
              <SelectTrigger id={`${fieldId}-motivoGratuito`}><SelectValue /></SelectTrigger>
              <SelectContent>
                {TICKET_MOTIVI_GRATUITO.map((m) => <SelectItem key={m.value} value={m.value}>{tr(m.label)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Merce */}
      <div className="space-y-3 rounded-xl border border-border bg-muted/40 p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <Label htmlFor={`${fieldId}-serveMerce`} className="text-sm font-semibold">{tr("Serve della merce")}</Label>
            <p className="text-xs text-muted-foreground">{tr("Accendilo se l'intervento aspetta materiale: potrai filtrare i ticket per merce.")}</p>
          </div>
          <Switch id={`${fieldId}-serveMerce`} checked={serveMerce} onCheckedChange={setServeMerce} />
        </div>
        {serveMerce && (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor={`${fieldId}-merceStato`} className="text-xs">{tr("A che punto è")}</Label>
              <Select value={merceStato} onValueChange={(v) => setMerceStato(v as TicketMerceStato)}>
                <SelectTrigger id={`${fieldId}-merceStato`}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TICKET_MERCE_STATI.map((m) => <SelectItem key={m.value} value={m.value}>{tr(m.label)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {merceStato === "da_ordinare" && (
              <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 p-2 text-xs text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
                <Package className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {tr("Appena creato il ticket ti chiedo fornitore e cosa serve: parte un ordine d'acquisto collegato e tracciato in magazzino.")}
              </p>
            )}
            {merceStato === "arrivata_parziale" && (
              <div className="space-y-2">
                <Label htmlFor={`${fieldId}-merceMancante`} className="text-xs text-red-600">{tr("Che cosa manca *")}</Label>
                <Textarea id={`${fieldId}-merceMancante`} value={merceMancante} onChange={(e) => setMerceMancante(e.target.value)}
                          placeholder={tr("Es. mancano 2 maniglie e la guarnizione inferiore")} rows={2}
                          className="border-red-200 focus-visible:ring-red-400" />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Messaggio */}
      <div className="space-y-2">
        <Label htmlFor={`${fieldId}-message`}>{tr("Messaggio iniziale (opzionale)")}</Label>
        <Textarea id={`${fieldId}-message`} value={message} onChange={(e) => setMessage(e.target.value)} placeholder={tr("Descrivi il problema o la richiesta...")} rows={3} />
      </div>

      {/* Allegati */}
      <div className="space-y-2">
        <Label htmlFor={`${fieldId}-attachments`}>{tr("Allegati (opzionale)")}</Label>
        <input id={`${fieldId}-attachments`} ref={fileInputRef} type="file" multiple onChange={handleFileSelect} className="hidden" accept={ACCEPTED_FORMATS} />
        <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={pendingFiles.length >= MAX_FILES}>
          <Paperclip className="h-4 w-4 mr-2" /> {tr("Allega file")}
        </Button>
        {pendingFiles.length > 0 && (
          <div className="space-y-1 mt-2">
            {pendingFiles.map((f, i) => (
              <div key={`${f.name}-${i}`} className="flex items-center gap-2 text-sm p-2 rounded border bg-muted/30">
                <span className="truncate flex-1">{f.name}</span>
                <span className="text-xs text-muted-foreground">{(f.size / 1024).toFixed(0)} KB</span>
                <Button type="button" variant="ghost" size="icon" className="h-9 w-9 md:h-6 md:w-6 text-destructive" aria-label={tr("Rimuovi allegato {name}", { name: String(f.name ?? "") })} onClick={() => setPendingFiles(prev => prev.filter((_, j) => j !== i))}><X className="h-3 w-3" /></Button>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">{tr("{n}/{MAX_FILES} file — max 10MB ciascuno", { n: pendingFiles.length, MAX_FILES: String(MAX_FILES ?? "") })}</p>
          </div>
        )}
      </div>

      </fieldset>
      <Button
        className={variant === "dialog" ? "w-full" : "w-full"}
        disabled={!canSubmit || createMutation.isPending}
        onClick={() => {
          if (!canSubmit || pendingRef.current) return;
          pendingRef.current = true;
          onPendingChange?.(true);
          createMutation.mutate();
        }}
      >
        {createMutation.isPending ? (<><Loader2 className="h-4 w-4 animate-spin mr-2" /> {tr("Creazione...")}</>) : submitLabel}
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
