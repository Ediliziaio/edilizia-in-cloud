import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { TicketPagamentoCard } from "@/components/tickets/TicketPagamentoCard";
import { TicketMerceCard } from "@/components/tickets/TicketMerceCard";
import { TicketRichiamiCard } from "@/components/tickets/TicketRichiamiCard";
import { TicketCostiCard } from "@/components/tickets/TicketCostiCard";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  ArrowLeft, Package, User, Mail, Phone, MapPin, Clock, CalendarPlus,
  AlertCircle, RefreshCw, Save, ChevronDown, Wrench, Loader2, CheckCircle2,
  LifeBuoy, AlertTriangle, Sparkles, ListChecks,
} from "lucide-react";
import { AppointmentDialog } from "@/components/appointments/AppointmentDialog";
import {
  formatRelativeTime,
  getTicketStatusColor,
  getTicketStatusLabel,
  getTicketPriorityColor,
  getTicketPriorityLabel,
} from "@/lib/formatters";
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue, SelectGroup, SelectLabel } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { TicketChat } from "@/components/tickets/TicketChat";
import { LinkedTasks } from "@/components/tasks/LinkedTasks";
import { PlaybookEditorDialog } from "@/components/orders/PlaybookEditorDialog";
import { applyPlaybookToTicket } from "@/lib/ticketPlaybook";
import { TicketAttachments } from "@/components/tickets/TicketAttachments";
import { useUnreadTicketCounts } from "@/hooks/useUnreadTicketCounts";
import type { TicketDetail as TicketDetailType, TicketMessage } from "@/types/tickets";
import { SUPPORT_PRIORITIES, TICKET_STATI, TICKET_FASI } from "@/types/tickets";
import { calcolaFermo, CLASSI_FERMO } from "@/lib/assistenzaSla";

export default function TicketDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  const { effectiveCompany } = useAuth();
  // Flusso di lavoro dell'assistenza: stesso motore delle commesse
  // (src/lib/flussoLavoro.ts), agganciato al ticket invece che alla commessa.
  const [flussoInCorso, setFlussoInCorso] = useState(false);
  const [editorFlussoAperto, setEditorFlussoAperto] = useState(false);

  const queryClient = useQueryClient();
  const [internalNotes, setInternalNotes] = useState<string>("");
  const [notesLoaded, setNotesLoaded] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  // Escalation a intervento (disponibile per tipo=supporto)
  const [aiTriaging, setAiTriaging] = useState(false);
  const [escalationOpen, setEscalationOpen] = useState(false);
  const [escalationIndirizzo, setEscalationIndirizzo] = useState("");
  const [escalationData, setEscalationData] = useState("");
  const [escalationTecnicoId, setEscalationTecnicoId] = useState("__unassign__");
  const [escalationNote, setEscalationNote] = useState("");
  // Dialog appuntamento
  const [appointmentOpen, setAppointmentOpen] = useState(false);
  // Editing "dettagli intervento" inline
  const [interventoIndirizzo, setInterventoIndirizzo] = useState("");
  const [interventoData, setInterventoData] = useState("");
  const [interventoDurata, setInterventoDurata] = useState("");
  const [interventoNoteTecnico, setInterventoNoteTecnico] = useState("");
  const [interventoLoaded, setInterventoLoaded] = useState(false);
  const { markTicketAsRead } = useUnreadTicketCounts();

  // Mark ticket as read when opening
  useEffect(() => {
    if (id) {
      markTicketAsRead(id);
    }
  }, [id, markTicketAsRead]);

  useEffect(() => {
    setNotesLoaded(false);
    setInterventoLoaded(false);
  }, [id]);

  const { data: ticket, isLoading: ticketLoading, isError: ticketError, refetch: refetchTicket } = useQuery({
    queryKey: queryKeys.adminTicket.detail(id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tickets")
        .select(`
          id, subject, status, priority, tipo, fonte, created_at, customer_id, order_id,
          assigned_to, category, internal_notes,
          a_pagamento, motivo_gratuito, importo_preventivato, importo_finale,
          pagato, data_pagamento, metodo_pagamento, note_pagamento, merce_richiesta,
          ore_effettive, costo_orario_applicato, costo_trasferta, costo_materiale, scadenza_id,
          richiami_count, ultimo_richiamo_at, note_richiami,
          merce_stato, merce_mancante, merce_arrivata_at,
          updated_at, last_message_at,
          data_intervento_prevista, data_intervento_effettiva, indirizzo_intervento, durata_ore, note_tecnico,
          customer:profiles!tickets_customer_id_fkey(first_name, last_name, email, phone),
          order:orders(id, description)
        `)
        .eq("id", id!)
        .eq("company_id", effectiveCompany!.id)
        .single();
      if (error) throw error;
      return data as unknown as TicketDetailType;
    },
    enabled: !!id && !!effectiveCompany?.id,
    staleTime: 30 * 1000,
  });

  // Inizializza i dettagli dal primo caricamento (una sola volta per navigazione).
  useEffect(() => {
    if (ticket && !notesLoaded) {
      setInternalNotes(ticket.internal_notes || "");
      if (ticket.internal_notes) setNotesOpen(true);
      setNotesLoaded(true);
    }
  }, [ticket, notesLoaded]);
  useEffect(() => {
    if (ticket && !interventoLoaded) {
      setInterventoIndirizzo(ticket.indirizzo_intervento ?? "");
      // Converti ISO datetime → formato input datetime-local (YYYY-MM-DDTHH:mm)
      const iso = ticket.data_intervento_prevista;
      if (iso) {
        const d = new Date(iso);
        if (!isNaN(d.getTime())) {
          const pad = (n: number) => String(n).padStart(2, "0");
          setInterventoData(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`);
        }
      } else {
        setInterventoData("");
      }
      setInterventoDurata(ticket.durata_ore != null ? String(ticket.durata_ore) : "");
      setInterventoNoteTecnico(ticket.note_tecnico ?? "");
      setInterventoLoaded(true);
    }
  }, [ticket, interventoLoaded]);

  const { data: messages = [], isLoading: messagesLoading, isError: messagesError, refetch: refetchMessages } = useQuery({
    queryKey: queryKeys.adminTicketMessages.byTicket(id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ticket_messages")
        .select("id, message, sender_id, created_at, attachment_url")
        .eq("ticket_id", id!)
        .order("created_at", { ascending: true })
        .limit(500);
      if (error) throw error;

      // Fetch sender profiles separately
      const senderIds = [...new Set((data || []).map((m) => m.sender_id).filter(Boolean))];
      const profilesMap: Record<string, { first_name: string; last_name: string }> = {};
      if (senderIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, first_name, last_name")
          .in("id", senderIds);
        for (const p of profiles || []) {
          profilesMap[p.id] = { first_name: p.first_name, last_name: p.last_name };
        }
      }

      return (data || []).map((m) => ({
        ...m,
        sender: profilesMap[m.sender_id] || null,
      })) as TicketMessage[];
    },
    enabled: !!id,
    staleTime: 30 * 1000,
  });

  // Staff members for assignment dropdown — use staff_permissions (company-level RLS)
  const { data: staffMembers = [] } = useQuery({
    queryKey: queryKeys.companyStaffMembers.list(effectiveCompany?.id),
    queryFn: async () => {
      const { data: perms, error: permsErr } = await supabase
        .from("staff_permissions")
        .select("user_id")
        .eq("company_id", effectiveCompany!.id);
      if (permsErr) throw permsErr;
      const validIds = (perms || []).map((p) => p.user_id);
      if (!validIds.length) return [];

      const { data, error } = await supabase
        .from("profiles")
        .select("id, first_name, last_name")
        .in("id", validIds)
        .limit(200);
      if (error) throw error;
      return (data || []).filter((p) => p.first_name || p.last_name);
    },
    enabled: !!effectiveCompany?.id,
    staleTime: 10 * 60 * 1000,
  });

  const chatInvalidateKeys = useMemo(
    () => [
      queryKeys.adminTicketMessages.byTicket(id),
      queryKeys.ticketAttachments.byTicket(id),
      queryKeys.companyTickets.all,
    ],
    [id]
  );

  const { data: tecnici = [] } = useQuery({
    queryKey: ["tecnici-escalation", effectiveCompany?.id],
    queryFn: async () => {
      if (!effectiveCompany?.id) return [];
      const { data, error } = await supabase
        .from("profiles")
        .select("id, first_name, last_name")
        .eq("company_id", effectiveCompany.id)
        .order("first_name")
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!effectiveCompany?.id,
    staleTime: 10 * 60 * 1000,
  });

  const escalationMutation = useMutation({
    mutationFn: async () => {
      if (!id || !effectiveCompany?.id) throw new Error("Dati mancanti");
      const { error } = await supabase
        .from("tickets")
        .update({
          tipo: "intervento" as const,
          indirizzo_intervento: escalationIndirizzo.trim() || null,
          data_intervento_prevista: escalationData
            ? new Date(escalationData).toISOString()
            : null,
          assigned_to: escalationTecnicoId && escalationTecnicoId !== "__unassign__" ? escalationTecnicoId : null,
          note_tecnico: escalationNote.trim() || null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Ticket convertito in Intervento");
      setEscalationOpen(false);
      // Dopo unificazione restiamo sulla stessa pagina — la vista mostra già
      // i campi intervento aggiornati dopo invalidate.
      queryClient.invalidateQueries({ queryKey: queryKeys.adminTicket.detail(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.companyTickets.all });
    },
    onError: () => toast.error("Errore nella conversione"),
  });

  // Salva modifiche "Dettagli Intervento"
  const saveInterventoMutation = useMutation({
    mutationFn: async () => {
      if (!id || !effectiveCompany?.id) throw new Error("Dati mancanti");
      const durataNum = interventoDurata ? parseFloat(interventoDurata) : null;
      const { error } = await supabase
        .from("tickets")
        .update({
          indirizzo_intervento: interventoIndirizzo.trim() || null,
          data_intervento_prevista: interventoData ? new Date(interventoData).toISOString() : null,
          durata_ore: durataNum && !isNaN(durataNum) ? durataNum : null,
          note_tecnico: interventoNoteTecnico.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("company_id", effectiveCompany.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Dettagli intervento salvati");
      queryClient.invalidateQueries({ queryKey: queryKeys.adminTicket.detail(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.companyTickets.all });
    },
    onError: (err: Error) => toast.error(err.message || "Errore salvataggio"),
  });

  // Chiudi intervento: set status=risolto + data_intervento_effettiva=now
  const chiudiMutation = useMutation({
    mutationFn: async () => {
      if (!id || !effectiveCompany?.id) throw new Error("Dati mancanti");
      const { error } = await supabase
        .from("tickets")
        .update({
          status: "risolto" as const,
          data_intervento_effettiva: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("company_id", effectiveCompany.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Intervento chiuso");
      queryClient.invalidateQueries({ queryKey: queryKeys.adminTicket.detail(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.companyTickets.all });
    },
    onError: () => toast.error("Errore chiusura intervento"),
  });

  const updateTicketMutation = useMutation({
    mutationFn: async (updates: Record<string, unknown>) => {
      if (!id || !effectiveCompany?.id) throw new Error("Dati mancanti");
      const { error } = await supabase
        .from("tickets")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("company_id", effectiveCompany.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Ticket aggiornato con successo.");
      queryClient.invalidateQueries({ queryKey: queryKeys.adminTicket.detail(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.companyTickets.all });
    },
    onError: () => {
      toast.error("Impossibile aggiornare il ticket.");
    },
  });

  // Triage AI: l'AI analizza oggetto + thread e suggerisce la priorità.
  const handleAiTriage = async () => {
    if (aiTriaging || !ticket) return;
    setAiTriaging(true);
    try {
      const content = [ticket.subject, ...messages.map((m) => m.message)]
        .filter(Boolean)
        .join("\n");
      const { data, error } = await supabase.functions.invoke("support-ai-chat", {
        body: { action: "chat", conversation: [{ role: "user", content }] },
      });
      if (error) throw error;
      const sp = String(data?.suggested_priority ?? "");
      if ((SUPPORT_PRIORITIES as readonly string[]).includes(sp)) {
        if (sp !== ticket.priority) {
          updateTicketMutation.mutate({ priority: sp });
          toast.success(`Priorità suggerita dall'AI: ${sp}`);
        } else {
          toast.info(`L'AI conferma la priorità attuale (${sp}).`);
        }
      } else {
        toast.info("Analisi AI completata: nessun cambio di priorità suggerito.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Triage AI non riuscito.");
    } finally {
      setAiTriaging(false);
    }
  };

  // Escalation azienda→piattaforma: inoltra il ticket al supporto della piattaforma
  // riusando support-ai-chat (action escalate → inbox support_messages superadmin).
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
        <Button variant="ghost" size="icon" className="hidden md:inline-flex" onClick={() => navigate("/azienda/assistenza")}>
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
  const priorityColor = getTicketPriorityColor(ticket.priority);
  const isIntervento = (ticket.tipo ?? "supporto") === "intervento" || (ticket.tipo ?? "") === "emergenza";
  const isEmergenza = ticket.tipo === "emergenza";
  const isClosed = ticket.status === "risolto" || ticket.status === "chiuso";
  const TipoIcon = isEmergenza ? AlertTriangle : isIntervento ? Wrench : LifeBuoy;
  const tipoLabel = isEmergenza ? "Emergenza" : isIntervento ? "Intervento" : "Supporto";

  const interventoDirty =
    (ticket.indirizzo_intervento ?? "") !== interventoIndirizzo ||
    (ticket.durata_ore != null ? String(ticket.durata_ore) : "") !== interventoDurata ||
    (ticket.note_tecnico ?? "") !== interventoNoteTecnico ||
    (() => {
      // data_intervento_prevista diff check via ISO string
      const cur = ticket.data_intervento_prevista ? new Date(ticket.data_intervento_prevista).toISOString() : "";
      const newIso = interventoData ? new Date(interventoData).toISOString() : "";
      return cur !== newIso;
    })();

  return (
    // Mobile: altezza libera, la pagina scorre (chat, poi dettagli). Con
    // l'altezza fissa chat (60vh) e dettagli (50vh) non ci stavano e i
    // dettagli finivano disegnati sopra la chat (le frecce a metà messaggi).
    <div className="flex flex-col h-[calc(100vh-200px)] md:h-[calc(100vh-120px)] max-md:h-auto">
      {/* Header migliorato con badge */}
      <div className="flex items-start gap-4 pb-4 max-md:relative max-md:flex-wrap max-md:gap-2 max-md:pb-3">
        <Button variant="ghost" size="icon" className="hidden md:inline-flex" onClick={() => navigate("/azienda/assistenza")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0 max-md:order-2 max-md:basis-full">
          <div className="flex items-center gap-2 flex-wrap max-md:gap-1.5 max-md:min-h-9 max-md:pr-[122px]">
            <Badge
              variant="outline"
              className="gap-1 text-[11px]"
              style={{
                backgroundColor: isEmergenza ? "#fee2e2" : isIntervento ? "#fef3c7" : "#eff6ff",
                color: isEmergenza ? "#991b1b" : isIntervento ? "#92400e" : "#1e40af",
                borderColor: isEmergenza ? "#fca5a5" : isIntervento ? "#fcd34d" : "#bfdbfe",
              }}
            >
              <TipoIcon className="h-3 w-3" />
              {tipoLabel}
            </Badge>
            {/* Mobile: il titolo a capo su due righe (troncato si leggeva «Manca il silico…»). */}
            <h1 className="text-xl font-bold truncate max-md:order-last max-md:basis-full max-md:whitespace-normal max-md:text-base max-md:leading-snug max-md:line-clamp-2">{ticket.subject}</h1>
            <Badge variant="outline" style={{ backgroundColor: statusColor.bg, color: statusColor.text, borderColor: statusColor.border }}>
              {getTicketStatusLabel(ticket.status)}
            </Badge>
            <Badge variant="outline" style={{ backgroundColor: priorityColor.bg, color: priorityColor.text, borderColor: priorityColor.border }}>
              {getTicketPriorityLabel(ticket.priority)}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5 max-md:text-xs">
            Aperto {formatRelativeTime(ticket.created_at)}
            {ticket.data_intervento_effettiva && (
              <> · Chiuso il {new Date(ticket.data_intervento_effettiva).toLocaleDateString("it-IT")}</>
            )}
          </p>
        </div>
        {/* Mobile: i tre bottoni sulla riga dei badge, in alto a destra (prima
            avevano una riga loro, vuota a sinistra). */}
        <div className="flex items-center gap-2 shrink-0 max-md:absolute max-md:right-0 max-md:top-0 max-md:gap-1.5 [&>button]:max-md:h-9 [&>button]:max-md:w-9 [&>button]:max-md:p-0">
          {/* Escalation — solo per tipo=supporto */}
          {!isIntervento && (
            <Button
              variant="outline"
              className="tap-compact gap-2 text-orange-700 border-orange-300 hover:bg-orange-50"
              onClick={() => setEscalationOpen(true)}
            >
              <Wrench className="h-4 w-4" />
              <span className="hidden sm:inline">Converti in Intervento</span>
            </Button>
          )}
          {/* Crea appuntamento calendario */}
          <Button
            variant="outline"
            className="tap-compact gap-2"
            onClick={() => setAppointmentOpen(true)}
          >
            <CalendarPlus className="h-4 w-4" />
            <span className="hidden sm:inline">Appuntamento</span>
          </Button>
          {/* Chiudi intervento — visibile per tutti i tipi se non già chiuso */}
          {!isClosed && (
            <Button
              variant="outline"
              className="tap-compact gap-2 text-green-700 border-green-300 hover:bg-green-50"
              onClick={() => chiudiMutation.mutate()}
              disabled={chiudiMutation.isPending}
            >
              {chiudiMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              <span className="hidden sm:inline">Chiudi</span>
            </Button>
          )}
        </div>
      </div>

      <Separator className="mb-4" />

      {/* Layout: mobile stacked, desktop columns with independent scroll */}
      <div className="flex flex-col md:grid md:grid-cols-3 gap-6 flex-1 min-h-0 max-md:flex-none max-md:gap-3">
        {/* Sidebar: on mobile scrolls naturally, on desktop has fixed scroll */}
        <div className="order-2 md:order-1 overflow-y-auto pr-1 space-y-4 max-h-[50vh] md:max-h-[calc(100vh-220px)] max-md:max-h-none max-md:overflow-visible max-md:space-y-3 max-md:pr-0">
          {/* Card unificata: Gestione + Contesto */}
          <Card>
            <CardContent className="p-4 space-y-3">
              {/* Stato */}
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs text-muted-foreground shrink-0">Stato</label>
                <Select
                  value={ticket.status}
                  onValueChange={(v) => updateTicketMutation.mutate({ status: v })}
                  disabled={updateTicketMutation.isPending}
                >
                  <SelectTrigger className="tap-compact w-[160px] h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-[380px]">
                    {TICKET_FASI.map((fase) => {
                      const stati = TICKET_STATI.filter((st) => st.fase === fase.key);
                      if (stati.length === 0) return null;
                      return (
                        <SelectGroup key={fase.key}>
                          <SelectLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            {fase.label}
                          </SelectLabel>
                          {stati.map((st) => (
                            <SelectItem key={st.value} value={st.value} className="text-xs">
                              {st.label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              {/* Da quanto è ferma: la prima cosa da sapere aprendo un'assistenza */}
              {(() => {
                const fermo = calcolaFermo(ticket as never);
                return fermo ? (
                  <p className={`text-right text-[11px] ${CLASSI_FERMO[fermo.livello]}`}>
                    {fermo.etichetta}
                    {fermo.livello !== "ok" ? ` — oltre i ${fermo.soglia} giorni previsti` : ""}
                  </p>
                ) : null;
              })()}
              {/* Cosa vuol dire lo stato scelto: 15 stati sono troppi da tenere a mente */}
              {TICKET_STATI.find((st) => st.value === ticket.status)?.desc && (
                <p className="-mt-1 text-right text-[11px] leading-tight text-muted-foreground">
                  {TICKET_STATI.find((st) => st.value === ticket.status)?.desc}
                </p>
              )}
              {/* Priorità */}
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs text-muted-foreground shrink-0">Priorità</label>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-violet-600 hover:text-violet-700 dark:text-violet-400"
                    onClick={handleAiTriage}
                    disabled={aiTriaging || updateTicketMutation.isPending}
                    title="Triage AI: suggerisci priorità"
                  >
                    {aiTriaging ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                  </Button>
                  <Select
                    value={ticket.priority}
                    onValueChange={(v) => updateTicketMutation.mutate({ priority: v })}
                    disabled={updateTicketMutation.isPending}
                  >
                    <SelectTrigger className="tap-compact w-[160px] h-8 text-xs">
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
              </div>
              {/* Assegnato */}
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs text-muted-foreground shrink-0">Assegnato</label>
                <Select
                  value={ticket.assigned_to || "unassigned"}
                  onValueChange={(v) => updateTicketMutation.mutate({ assigned_to: v === "unassigned" ? null : v })}
                  disabled={updateTicketMutation.isPending}
                >
                  <SelectTrigger className="tap-compact w-[160px] h-8 text-xs">
                    <SelectValue placeholder="Non assegnato" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Non assegnato</SelectItem>
                    {staffMembers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.first_name} {s.last_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Separator />

              {/* Cliente */}
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">Cliente</label>
                {/* Senza cliente comparivano due icone sole e un link «mailto:undefined». */}
                {!ticket.customer ? (
                  <p className="text-xs text-muted-foreground">Nessun cliente collegato</p>
                ) : (
                  <div className="flex items-center gap-2">
                    <User className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-medium text-sm">
                      {ticket.customer.first_name} {ticket.customer.last_name}
                    </span>
                  </div>
                )}
                {ticket.customer?.email && (
                  <div className="flex items-center gap-2">
                    <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                    <a href={`mailto:${ticket.customer.email}`} className="text-xs text-primary hover:underline truncate">
                      {ticket.customer.email}
                    </a>
                  </div>
                )}
                {ticket.customer?.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                    <a href={`tel:${ticket.customer?.phone}`} className="text-xs text-primary hover:underline">
                      {ticket.customer?.phone}
                    </a>
                  </div>
                )}
              </div>

              {/* Ordine collegato */}
              {ticket.order && (
                <>
                  <Separator />
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Ordine</label>
                    <Link to={`/azienda/ordini/${ticket.order.id}`} className="flex items-start gap-2 text-primary hover:underline">
                      <Package className="h-3.5 w-3.5 mt-0.5" />
                      <span className="text-xs">
                        {ticket.order.description.length > 50
                          ? ticket.order.description.substring(0, 50) + "..."
                          : ticket.order.description}
                      </span>
                    </Link>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Pagamento e merce: le due domande che l'ufficio si fa su ogni
              assistenza — chi paga, e quando arriva il pezzo. */}
          <TicketPagamentoCard ticketId={ticket.id} ticket={ticket as never} companyId={effectiveCompany?.id ?? ""} />
          {effectiveCompany?.id && (
            <TicketCostiCard ticketId={ticket.id} ticket={ticket as never} companyId={effectiveCompany.id} />
          )}
          {effectiveCompany?.id && (
            <TicketMerceCard
              ticketId={ticket.id}
              orderId={ticket.order_id ?? null}
              companyId={effectiveCompany.id}
              ticket={ticket as never}
            />
          )}

          <TicketRichiamiCard ticketId={ticket.id} ticket={ticket as never} />

          {/* Dettagli Intervento — sempre visibile se tipo è intervento/emergenza,
              altrimenti rimane collassato finché non si schedula */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Wrench className="h-4 w-4 text-muted-foreground" />
                  <h3 className="font-semibold text-sm">Dettagli Intervento</h3>
                </div>
                {interventoDirty && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => saveInterventoMutation.mutate()}
                    disabled={saveInterventoMutation.isPending}
                  >
                    {saveInterventoMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
                    Salva
                  </Button>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  Indirizzo intervento
                </Label>
                <Input
                  value={interventoIndirizzo}
                  onChange={(e) => setInterventoIndirizzo(e.target.value)}
                  placeholder="Via, n°, città…"
                  className="h-8 text-xs"
                  disabled={isClosed}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Data prevista</Label>
                  <Input
                    type="datetime-local"
                    value={interventoData}
                    onChange={(e) => setInterventoData(e.target.value)}
                    className="h-8 text-xs"
                    disabled={isClosed}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Durata (h)
                  </Label>
                  <Input
                    type="number"
                    step="0.5"
                    min="0"
                    value={interventoDurata}
                    onChange={(e) => setInterventoDurata(e.target.value)}
                    placeholder="2"
                    className="h-8 text-xs"
                    disabled={isClosed}
                  />
                </div>
              </div>

              {ticket.data_intervento_effettiva && (
                <div className="text-xs bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded px-2 py-1.5 text-green-800 dark:text-green-300 flex items-center gap-1.5">
                  <CheckCircle2 className="h-3 w-3" />
                  Eseguito il {new Date(ticket.data_intervento_effettiva).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" })}
                </div>
              )}

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Note per il tecnico</Label>
                <Textarea
                  value={interventoNoteTecnico}
                  onChange={(e) => setInterventoNoteTecnico(e.target.value)}
                  placeholder="Istruzioni, materiali, accessi…"
                  rows={2}
                  className="text-xs resize-none"
                  disabled={isClosed}
                />
              </div>
            </CardContent>
          </Card>

          {/* Note Interne collassabili */}
          <Collapsible open={notesOpen} onOpenChange={setNotesOpen}>
            <Card>
              <CollapsibleTrigger asChild>
                <button className="w-full flex items-center justify-between p-4 text-sm font-medium hover:bg-muted/50 rounded-t-lg transition-colors">
                  <span>Note Interne</span>
                  <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${notesOpen ? 'rotate-180' : ''}`} />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="pt-0 px-4 pb-4 space-y-2">
                  <Textarea
                    value={internalNotes}
                    onChange={(e) => setInternalNotes(e.target.value)}
                    placeholder="Note visibili solo allo staff..."
                    rows={3}
                    maxLength={1000}
                    className="resize-none text-sm"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full"
                    disabled={updateTicketMutation.isPending || internalNotes === (ticket.internal_notes || "")}
                    onClick={() => updateTicketMutation.mutate({ internal_notes: internalNotes || null })}
                  >
                    <Save className="h-3.5 w-3.5 mr-1.5" />
                    Salva Note
                  </Button>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>

          {/* Allegati */}
          <TicketAttachments ticketId={ticket.id} />

          {/* Flusso di lavoro: crea in blocco le attività dell'assistenza,
              già incatenate e assegnate come configurato in "Gestisci". */}
          <div className="flex items-center gap-2 flex-wrap rounded-lg border bg-muted/20 px-3 py-2">
            <ListChecks className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Flusso</span>
            <span className="text-xs text-muted-foreground max-md:hidden">Crea le attività standard dell'assistenza.</span>
            <div className="ml-auto flex items-center gap-2">
              <Button
                size="sm"
                className="h-7 text-xs"
                disabled={flussoInCorso || !effectiveCompany?.id}
                onClick={async () => {
                  if (!effectiveCompany?.id) return;
                  setFlussoInCorso(true);
                  try {
                    const { created } = await applyPlaybookToTicket({
                      companyId: effectiveCompany.id,
                      ticketId: ticket.id,
                      category: ticket.category,
                      baseDate: new Date(ticket.created_at ?? Date.now()),
                      assignedTo: ticket.assigned_to,
                    });
                    // "0 create" non è un errore: vuol dire che il flusso c'è già.
                    toast.success(created > 0
                      ? `${created} attività create dal flusso assistenza.`
                      : "Il flusso è già applicato a questo ticket.");
                    queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
                  } catch (e) {
                    toast.error("Non riesco ad applicare il flusso: " + (e instanceof Error ? e.message : "riprova"));
                  } finally {
                    setFlussoInCorso(false);
                  }
                }}
              >
                <Sparkles className="h-3.5 w-3.5 mr-1" />
                {flussoInCorso ? "Applico…" : "Applica flusso"}
              </Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground max-md:hidden" onClick={() => setEditorFlussoAperto(true)}>
                Gestisci
              </Button>
            </div>
          </div>

          {/* Linked Tasks */}
          <LinkedTasks
            ticketId={ticket.id}
            category="assistenza"
            companyId={effectiveCompany?.id}
          />

          {effectiveCompany?.id && (
            <PlaybookEditorDialog
              open={editorFlussoAperto}
              onOpenChange={setEditorFlussoAperto}
              companyId={effectiveCompany.id}
              ambito="ticket"
              vertical={ticket.category ?? null}
            />
          )}
        </div>

        {/* Chat: on mobile first, on desktop second */}
        <div className="order-1 md:order-2 md:col-span-2 min-h-0">
          <TicketChat
            ticketId={ticket.id}
            messages={messages}
            customerId={ticket.customer_id}
            invalidateKeys={chatInvalidateKeys}
            height="min(60vh, calc(100vh - 220px))"
          />
        </div>
      </div>

      {/* Dialog Escalation Ticket → Intervento */}
      <Dialog open={escalationOpen} onOpenChange={setEscalationOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wrench className="h-5 w-5 text-orange-500" />
              Converti in Intervento
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Indirizzo intervento</Label>
              <Input
                placeholder="Via Roma 1, Milano..."
                value={escalationIndirizzo}
                onChange={(e) => setEscalationIndirizzo(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Data/ora prevista</Label>
              <Input
                type="datetime-local"
                value={escalationData}
                onChange={(e) => setEscalationData(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Assegna tecnico</Label>
              <Select value={escalationTecnicoId} onValueChange={setEscalationTecnicoId}>
                <SelectTrigger><SelectValue placeholder="Seleziona tecnico..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__unassign__">Nessuno</SelectItem>
                  {tecnici.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{[t.first_name, t.last_name].filter(Boolean).join(" ") || t.id}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Note per il tecnico</Label>
              <Textarea
                placeholder="Istruzioni specifiche per il tecnico..."
                value={escalationNote}
                onChange={(e) => setEscalationNote(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEscalationOpen(false)}>Annulla</Button>
            <Button
              onClick={() => escalationMutation.mutate()}
              disabled={escalationMutation.isPending}
              className="bg-orange-600 hover:bg-orange-700 text-white"
            >
              {escalationMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Converti in Intervento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Appuntamento in calendario, pre-compilato dai dati ticket */}
      <AppointmentDialog
        open={appointmentOpen}
        onOpenChange={setAppointmentOpen}
        defaultOrderId={ticket.order_id ?? undefined}
        defaultDate={
          ticket.data_intervento_prevista
            ? new Date(ticket.data_intervento_prevista).toISOString().slice(0, 10)
            : undefined
        }
        defaultTime={
          ticket.data_intervento_prevista
            ? (() => {
                const d = new Date(ticket.data_intervento_prevista!);
                return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
              })()
            : undefined
        }
        showOrderSelect
        hideMarketingFields
        requireTime
        defaultAppointmentType="assistenza"
        defaultTitle={ticket.subject ? `Assistenza · ${ticket.subject}` : "Assistenza cliente"}
        defaultAddress={ticket.indirizzo_intervento}
        defaultAssignedTo={ticket.assigned_to}
        onSaved={() => {
          setAppointmentOpen(false);
          queryClient.invalidateQueries({ queryKey: ["appointments"] });
          toast.success("Appuntamento creato in calendario");
        }}
      />
    </div>
  );
}
