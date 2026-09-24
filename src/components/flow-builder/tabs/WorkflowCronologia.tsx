import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { filtriRicercaContatti } from "@/lib/ricerca/ricercaContatti";
import {
  RefreshCw, Users, Search, ChevronDown, ChevronRight,
  CheckCircle, XCircle, Clock, Play, User, Activity,
  UserPlus, Trash2, PauseCircle, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";
import { statoRegistro } from "@/lib/automazioniRegistro";

interface Props {
  flowId?: string;
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  active:    { label: "Attivo",     color: "text-blue-600 bg-blue-50 dark:bg-blue-950/30" },
  completed: { label: "Completato", color: "text-green-600 bg-green-50 dark:bg-green-950/30" },
  removed:   { label: "Rimosso",    color: "text-red-600 bg-red-50 dark:bg-red-950/30" },
  canceled:  { label: "Fermato",    color: "text-slate-600 bg-slate-100 dark:bg-slate-800/40" },
  paused:    { label: "In pausa",   color: "text-yellow-600 bg-yellow-50 dark:bg-yellow-950/30" },
  failed:    { label: "Errore",     color: "text-red-600 bg-red-50 dark:bg-red-950/30" },
  waiting:   { label: "In attesa",  color: "text-purple-600 bg-purple-50 dark:bg-purple-950/30" },
};

const NODE_ICON: Record<string, React.ReactNode> = {
  trigger:   <Play className="h-3 w-3 text-emerald-500" />,
  action:    <Activity className="h-3 w-3 text-blue-500" />,
  condition: <ChevronRight className="h-3 w-3 text-amber-500" />,
  delay:     <Clock className="h-3 w-3 text-purple-500" />,
  goal:      <CheckCircle className="h-3 w-3 text-green-500" />,
  end:       <XCircle className="h-3 w-3 text-muted-foreground" />,
};

function ContactJourney({ enrollmentId }: { enrollmentId: string }) {
  const { data: steps = [], isLoading } = useQuery({
    queryKey: ["enrollment-journey", enrollmentId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("automation_execution_log")
        .select("*")
        .eq("enrollment_id", enrollmentId)
        .order("created_at", { ascending: true });
      return data ?? [];
    },
  });

  if (isLoading) {
    return (
      <div className="px-4 py-3 text-xs text-muted-foreground flex items-center gap-2">
        <RefreshCw className="h-3 w-3 animate-spin" /> Caricamento percorso...
      </div>
    );
  }

  if (steps.length === 0) {
    return (
      <div className="px-4 py-3 text-xs text-muted-foreground">
        Nessun passo eseguito ancora.
      </div>
    );
  }

  return (
    <div className="px-4 py-3 bg-muted/20">
      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
        Percorso esecuzione
      </p>
      <div className="relative">
        <div className="absolute left-[11px] top-0 bottom-0 w-px bg-border" />
        <div className="space-y-2">
          {steps.map((step: any) => (
            <div key={step.id} className="flex items-start gap-3 relative">
              <div className="h-6 w-6 rounded-full border bg-background flex items-center justify-center shrink-0 z-10">
                {step.status === "success"
                  ? <CheckCircle className="h-3 w-3 text-green-500" />
                  : step.status === "error"
                  ? <XCircle className="h-3 w-3 text-destructive" />
                  : NODE_ICON[step.node_type] ?? <Clock className="h-3 w-3 text-muted-foreground" />}
              </div>
              <div className="flex-1 min-w-0 pb-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-medium capitalize">{step.node_type}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                    step.status === "success"
                      ? "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400"
                      : step.status === "error"
                      ? "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400"
                      : "bg-muted text-muted-foreground"
                  }`}>
                    {statoRegistro(step.status).etichetta}
                  </span>
                  <span className="text-[10px] text-muted-foreground ml-auto">
                    {format(new Date(step.created_at), "dd/MM HH:mm")}
                  </span>
                </div>
                {step.error_message && (
                  // Il motivo di un rinvio non è un errore: niente rosso.
                  <p className={`text-[10px] mt-0.5 truncate ${statoRegistro(step.status).tono === "errore" ? "text-destructive" : "text-muted-foreground"}`}>
                    {step.error_message}
                  </p>
                )}
                {step.output_json?.action && (
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Azione: {step.output_json.action}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function EnrollContactDialog({
  open,
  onClose,
  flowId,
  companyId,
}: {
  open: boolean;
  onClose: () => void;
  flowId: string;
  companyId?: string;
}) {
  const [search, setSearch] = useState("");
  const [selectedContact, setSelectedContact] = useState<any>(null);
  const [enrolling, setEnrolling] = useState(false);
  const queryClient = useQueryClient();

  const { data: contacts = [], isLoading } = useQuery({
    queryKey: ["enroll-contact-search", companyId, search],
    queryFn: async () => {
      let q = (supabase as any)
        .from("marketing_contacts")
        .select("id, first_name, last_name, email, phone")
        .eq("company_id", companyId!)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(10);
      for (const filtro of filtriRicercaContatti(search)) q = q.or(filtro);
      const { data } = await q;
      return data ?? [];
    },
    enabled: !!companyId && open,
  });

  // Fetch trigger event for this flow
  const { data: triggerNode } = useQuery({
    queryKey: ["flow-trigger-node-enroll", flowId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("automation_nodes")
        .select("config_json")
        .eq("flow_id", flowId)
        .eq("node_type", "trigger")
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!flowId && open,
  });

  // item_id come fallback: il builder salva l'id catalogo lì, non in
  // trigger_event → il bottone Arruola era sempre disabilitato sui flussi
  // del builder. Il motore normalizza gli id italiani (TRIGGER_EVENT_MAP).
  const triggerEvent = triggerNode?.config_json?.trigger_event
    ?? triggerNode?.config_json?.item_id
    ?? triggerNode?.config_json?.trigger_type;

  const handleEnroll = async () => {
    if (!selectedContact || !triggerEvent) return;
    setEnrolling(true);
    try {
      const { data, error } = await supabase.functions.invoke("process-automation", {
        body: {
          action: "trigger",
          trigger_event: triggerEvent,
          company_id: companyId,
          entity_id: selectedContact.id,
          entity_type: "contact",
          payload: {
            first_name: selectedContact.first_name,
            last_name: selectedContact.last_name,
            email: selectedContact.email,
          },
        },
      });
      if (error) throw error;
      toast.success(`${selectedContact.first_name} ${selectedContact.last_name} iscritto al flusso`);
      queryClient.invalidateQueries({ queryKey: ["flow-enrollments", flowId] });
      queryClient.invalidateQueries({ queryKey: ["flow-enrollments-stats", flowId] });
      queryClient.invalidateQueries({ queryKey: ["flow-enrollment-count", flowId] });
      handleClose();
    } catch (e: any) {
      toast.error("Errore iscrizione: " + e.message);
    } finally {
      setEnrolling(false);
    }
  };

  const handleClose = () => {
    setSearch("");
    setSelectedContact(null);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            Iscrivi contatto
          </DialogTitle>
          <DialogDescription>
            Seleziona un contatto da iscrivere manualmente a questo flusso.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {!triggerEvent && (
            <div className="rounded-lg bg-yellow-500/10 px-3 py-2 text-xs text-yellow-700 dark:text-yellow-400">
              Nessun trigger configurato — il flusso deve avere un trigger per poter iscrivere contatti.
            </div>
          )}

          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Cerca per nome o email..."
                className="pl-8 h-9 text-sm"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setSelectedContact(null); }}
              />
            </div>

            <div className="border rounded-lg divide-y max-h-48 overflow-y-auto">
              {isLoading ? (
                <div className="flex items-center justify-center py-6 text-muted-foreground text-xs">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" /> Caricamento...
                </div>
              ) : contacts.length === 0 ? (
                <div className="flex items-center justify-center py-6 text-muted-foreground text-xs">
                  Nessun contatto trovato
                </div>
              ) : (
                contacts.map((c: any) => (
                  <button
                    key={c.id}
                    onClick={() => setSelectedContact(c)}
                    className={`w-full text-left px-3 py-2.5 flex items-center gap-3 text-sm hover:bg-muted/50 transition-colors ${
                      selectedContact?.id === c.id ? "bg-primary/10" : ""
                    }`}
                  >
                    <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <User className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{c.first_name} {c.last_name}</p>
                      <p className="text-xs text-muted-foreground truncate">{c.email || "—"}</p>
                    </div>
                    {selectedContact?.id === c.id && (
                      <CheckCircle className="h-4 w-4 text-primary shrink-0" />
                    )}
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="flex gap-2 justify-end pt-1">
            <Button variant="outline" size="sm" onClick={handleClose}>Annulla</Button>
            <Button
              size="sm"
              onClick={handleEnroll}
              disabled={!selectedContact || !triggerEvent || enrolling}
            >
              {enrolling ? (
                <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Iscrizione...</>
              ) : (
                <><UserPlus className="h-3.5 w-3.5 mr-1.5" /> Iscrivi</>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function WorkflowCronologia({ flowId }: Props) {
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [enrollDialogOpen, setEnrollDialogOpen] = useState(false);
  const PAGE_SIZE = 25;
  const queryClient = useQueryClient();

  // Fetch company_id from the flow
  const { data: flowData } = useQuery({
    queryKey: ["flow-company", flowId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("automation_flows")
        .select("company_id")
        .eq("id", flowId!)
        .maybeSingle();
      return data;
    },
    enabled: !!flowId,
  });
  const companyId = flowData?.company_id;

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["flow-enrollments", flowId, statusFilter, search, page],
    queryFn: async () => {
      let q = (supabase as any)
        .from("automation_enrollments")
        .select("*", { count: "exact" })
        .eq("flow_id", flowId!)
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      if (search.trim()) {
        // entity_id è UUID: ilike su uuid = errore Postgres 42883 e tabella
        // vuota. La ricerca "per contatto" passa da nome/email → id.
        let cercaContatti = (supabase as any)
          .from("marketing_contacts")
          .select("id")
          .eq("company_id", companyId!);
        for (const filtro of filtriRicercaContatti(search)) cercaContatti = cercaContatti.or(filtro);
        const { data: matches } = await cercaContatti.limit(100);
        const ids = (matches ?? []).map((m: any) => m.id);
        if (ids.length === 0) return { rows: [], total: 0 };
        q = q.in("entity_id", ids);
      }

      const { data: rows, error, count } = await q;
      if (error) throw error;

      const entityIds = (rows ?? []).map((r: any) => r.entity_id).filter(Boolean);
      const contactMap: Record<string, any> = {};
      if (entityIds.length > 0) {
        const { data: contacts } = await (supabase as any)
          .from("marketing_contacts")
          .select("id, first_name, last_name, email, phone")
          .in("id", entityIds);
        (contacts ?? []).forEach((c: any) => { contactMap[c.id] = c; });
      }

      return {
        rows: (rows ?? []).map((r: any) => ({ ...r, contact: contactMap[r.entity_id] ?? null })),
        total: count ?? 0,
      };
    },
    enabled: !!flowId,
  });

  const { data: statsData } = useQuery({
    queryKey: ["flow-enrollments-stats", flowId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("automation_enrollments")
        .select("status")
        .eq("flow_id", flowId!);
      const all = data ?? [];
      // Gli stati ammessi da automation_enrollments_status_check sono:
      // active | paused | completed | canceled | waiting | removed | failed.
      // "error" NON esiste: contarlo teneva il riquadro Errori fisso a 0 mentre
      // le righe sotto mostravano "failed" in rosso. Stessa storia per i
      // contatti in attesa su un nodo ritardo, che sparivano da ogni riquadro.
      const conta = (...stati: string[]) =>
        all.filter((r: any) => stati.includes(r.status)).length;
      return {
        total: all.length,
        active: conta("active", "waiting", "paused"),
        completed: conta("completed"),
        error: conta("failed"),
      };
    },
    enabled: !!flowId,
  });

  // Bulk remove mutation
  const bulkRemoveMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await (supabase as any)
        .from("automation_enrollments")
        .update({ status: "removed" })
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: (_, ids) => {
      toast.success(`${ids.length} iscrizioni rimosse`);
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ["flow-enrollments", flowId] });
      queryClient.invalidateQueries({ queryKey: ["flow-enrollments-stats", flowId] });
      queryClient.invalidateQueries({ queryKey: ["flow-enrollment-count", flowId] });
    },
    onError: (e: any) => toast.error("Errore: " + e.message),
  });

  // Bulk pause mutation
  const bulkPauseMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await (supabase as any)
        .from("automation_enrollments")
        .update({ status: "paused" })
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: (_, ids) => {
      toast.success(`${ids.length} iscrizioni messe in pausa`);
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ["flow-enrollments", flowId] });
      queryClient.invalidateQueries({ queryKey: ["flow-enrollments-stats", flowId] });
    },
    onError: (e: any) => toast.error("Errore: " + e.message),
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const toggleRow = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === rows.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(rows.map((r: any) => r.id)));
    }
  };

  if (!flowId) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground text-sm">
        Salva il flusso per visualizzare la cronologia.
      </div>
    );
  }

  const isBulkBusy = bulkRemoveMutation.isPending || bulkPauseMutation.isPending;

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold">Cronologia contatti</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Tutti i contatti che sono entrati in questo flusso e il loro percorso.
          </p>
        </div>
        <Button size="sm" className="h-8 text-xs gap-1.5" onClick={() => setEnrollDialogOpen(true)}>
          <UserPlus className="h-3.5 w-3.5" />
          Aggiungi contatto
        </Button>
      </div>

      {/* Stats cards */}
      {statsData && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatsCard label="Totale iscritti" value={statsData.total} color="text-foreground" />
          <StatsCard label="Attivi" value={statsData.active} color="text-blue-600" />
          <StatsCard
            label="Completati"
            value={statsData.completed}
            color="text-green-600"
            extra={statsData.total > 0 ? `${Math.round((statsData.completed / statsData.total) * 100)}%` : undefined}
          />
          <StatsCard label="Errori" value={statsData.error} color="text-destructive" />
        </div>
      )}

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
          <span className="text-xs font-medium text-muted-foreground">{selectedIds.size} selezionati</span>
          <div className="flex-1" />
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1.5"
            disabled={isBulkBusy}
            onClick={() => bulkPauseMutation.mutate(Array.from(selectedIds))}
          >
            {bulkPauseMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <PauseCircle className="h-3 w-3" />}
            Metti in pausa
          </Button>
          <Button
            variant="destructive"
            size="sm"
            className="h-7 text-xs gap-1.5"
            disabled={isBulkBusy}
            onClick={() => bulkRemoveMutation.mutate(Array.from(selectedIds))}
          >
            {bulkRemoveMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
            Rimuovi
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setSelectedIds(new Set())}
          >
            Deseleziona
          </Button>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[160px] h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Ogni stato</SelectItem>
            <SelectItem value="active">Attivo</SelectItem>
            <SelectItem value="completed">Completato</SelectItem>
            <SelectItem value="waiting">In attesa</SelectItem>
            <SelectItem value="paused">In pausa</SelectItem>
            <SelectItem value="removed">Rimosso</SelectItem>
            <SelectItem value="canceled">Fermato</SelectItem>
            <SelectItem value="failed">Errore</SelectItem>
          </SelectContent>
        </Select>

        <div className="relative">
          <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Cerca contatto..."
            className="w-[200px] h-8 text-sm pl-8"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          />
        </div>

        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => refetch()}>
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
        </Button>

        <span className="text-xs text-muted-foreground ml-auto">{total} risultati</span>
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8 pr-0">
                <Checkbox
                  checked={rows.length > 0 && selectedIds.size === rows.length}
                  onCheckedChange={toggleSelectAll}
                  aria-label="Seleziona tutto"
                />
              </TableHead>
              <TableHead className="w-6 pr-0" />
              <TableHead>Contatto</TableHead>
              <TableHead>Stato</TableHead>
              <TableHead>Iscritto</TableHead>
              <TableHead>Aggiornato</TableHead>
              <TableHead>Versione</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="h-48 text-center text-muted-foreground">
                  Caricamento...
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-48">
                  <div className="flex flex-col items-center justify-center text-muted-foreground">
                    <Users className="h-10 w-10 mb-3 opacity-30" />
                    <p className="text-sm font-medium">Nessuna iscrizione trovata</p>
                    <p className="text-xs mt-1">
                      La cronologia apparirà quando i contatti verranno iscritti.
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row: any) => {
                const isExpanded = expandedRows.has(row.id);
                const isChecked = selectedIds.has(row.id);
                const contact = row.contact;
                const statusInfo = STATUS_MAP[row.status];
                return (
                  <>
                    <TableRow
                      key={row.id}
                      className={`cursor-pointer hover:bg-muted/30 ${isChecked ? "bg-primary/5" : ""}`}
                      onClick={() => toggleRow(row.id)}
                    >
                      <TableCell className="w-8 pr-0" onClick={(e) => toggleSelect(row.id, e)}>
                        <Checkbox
                          checked={isChecked}
                          onCheckedChange={() => {}}
                          aria-label="Seleziona riga"
                        />
                      </TableCell>
                      <TableCell className="w-6 pr-0">
                        {isExpanded
                          ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                          : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                            <User className="h-3.5 w-3.5 text-primary" />
                          </div>
                          {contact ? (
                            <div>
                              <p className="text-sm font-medium leading-tight">
                                {contact.first_name} {contact.last_name}
                              </p>
                              <p className="text-xs text-muted-foreground">{contact.email || contact.phone || "—"}</p>
                            </div>
                          ) : (
                            <span className="font-mono text-xs text-muted-foreground">
                              {row.entity_id?.slice(0, 12)}...
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${statusInfo?.color ?? "bg-muted text-muted-foreground"}`}>
                          {statusInfo?.label ?? row.status}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        <div>{format(new Date(row.created_at), "dd/MM/yy HH:mm")}</div>
                        <div className="text-[10px] opacity-70">
                          {formatDistanceToNow(new Date(row.created_at), { locale: it, addSuffix: true })}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {format(new Date(row.updated_at), "dd/MM/yy HH:mm")}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        v{row.flow_version}
                      </TableCell>
                    </TableRow>
                    {isExpanded && (
                      <TableRow key={`${row.id}-journey`} className="bg-muted/10 hover:bg-muted/10">
                        <TableCell colSpan={7} className="p-0">
                          <ContactJourney enrollmentId={row.id} />
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{total} risultati totali</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              Precedente
            </Button>
            <span className="flex items-center px-2">
              Pagina {page + 1} di {totalPages}
            </span>
            <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
              Successiva
            </Button>
          </div>
        </div>
      )}

      <EnrollContactDialog
        open={enrollDialogOpen}
        onClose={() => setEnrollDialogOpen(false)}
        flowId={flowId}
        companyId={companyId}
      />
    </div>
  );
}

function StatsCard({
  label,
  value,
  color,
  extra,
}: {
  label: string;
  value: number;
  color: string;
  extra?: string;
}) {
  return (
    <div className="border rounded-lg p-3 bg-muted/20">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <div className="flex items-baseline gap-1.5">
        <p className={`text-xl font-bold ${color}`}>{value}</p>
        {extra && <span className="text-xs text-muted-foreground">{extra}</span>}
      </div>
    </div>
  );
}
