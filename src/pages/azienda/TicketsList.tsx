import React, { useState, useMemo } from "react";
import { TICKET_STATI, TICKET_STATI_CHIUSI, TICKET_FASI } from "@/types/tickets";
import { calcolaFermo, CLASSI_FERMO } from "@/lib/assistenzaSla";
import { AssistenzaPipeline } from "@/components/tickets/AssistenzaPipeline";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Enums } from "@/integrations/supabase/types";
import { queryKeys } from "@/lib/queryKeys";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { NavyStatCard } from "@/components/costi/KpiCard";
import { useIsMobile } from "@/hooks/use-mobile";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  MessageSquare,
  Search,
  Filter,
  ChevronRight,
  User,
  Package,
  AlertCircle,
  RefreshCw,
  Plus,
  LifeBuoy,
  Wrench,
  AlertTriangle,
  CalendarClock,
  UserX,
  ClipboardList,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  CheckSquare,
  Euro,
  BriefcaseBusiness,
  Hourglass,
  LayoutList,
  Columns3,
  PhoneCall,
  SlidersHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ExportButton } from "@/components/shared/ExportButton";
import {
  formatRelativeTime,
  getTicketStatusColor,
  getTicketStatusLabel,
  getTicketPriorityColor,
  getTicketPriorityLabel,
} from "@/lib/formatters";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue, SelectGroup, SelectLabel } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { TicketListItem } from "@/types/tickets";
import { useUnreadTicketCounts } from "@/hooks/useUnreadTicketCounts";
import { type StaffUser, useCompanyStaffUsers } from "@/hooks/useCompanyStaffUsers";
import { toast } from "sonner";

const TIPO_LABEL: Record<string, string> = {
  supporto: "Supporto",
  intervento: "Intervento",
  emergenza: "Emergenza",
};

const TIPO_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  supporto: LifeBuoy,
  intervento: Wrench,
  emergenza: AlertTriangle,
};

const TIPO_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  supporto:  { bg: "#eff6ff", text: "#1e40af", border: "#bfdbfe" },
  intervento:{ bg: "#fef3c7", text: "#92400e", border: "#fcd34d" },
  emergenza: { bg: "#fee2e2", text: "#991b1b", border: "#fca5a5" },
};

const TICKETS_FETCH_LIMIT = 500;
const TICKETS_QUERY_TIMEOUT_MS = 12_000;
const KEEP_VALUE = "__keep__";
const UNASSIGNED_VALUE = "__unassigned__";

// Unica fonte degli stati: src/types/tickets.ts (prima questa lista viveva qui
// e ne ometteva metà rispetto al database).
const TICKET_STATUS_OPTIONS = TICKET_STATI.map(({ value, label }) => ({ value, label }));

/** Le voci di stato raggruppate per fase: con 15 stati una lista piatta
 *  diventa illeggibile. */
function StatoOptionsRaggruppate() {
  return (
    <>
      {TICKET_FASI.map((fase) => {
        const stati = TICKET_STATI.filter((s) => s.fase === fase.key);
        if (stati.length === 0) return null;
        return (
          <SelectGroup key={fase.key}>
            <SelectLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {fase.label}
            </SelectLabel>
            {stati.map((s) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectGroup>
        );
      })}
    </>
  );
}


type TicketSortKey = "tipo" | "cliente" | "priority" | "scadenza" | "status" | "assigned" | "order" | "updated";
type SortDirection = "asc" | "desc";

function safeText(value: string | null | undefined): string {
  return value ?? "";
}

/** Categorizza la data_intervento_prevista in rispetto a oggi */
type ScadenzaBucket = "scaduto" | "oggi" | "settimana" | "futuro" | "nessuna";

function bucketScadenza(iso: string | null | undefined): ScadenzaBucket {
  if (!iso) return "nessuna";
  const now = new Date();
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "nessuna";
  const oggi0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const d0 = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const deltaDays = Math.round((d0.getTime() - oggi0.getTime()) / (86400 * 1000));
  if (deltaDays < 0) return "scaduto";
  if (deltaDays === 0) return "oggi";
  if (deltaDays <= 7) return "settimana";
  return "futuro";
}

function formatScadenza(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  // v8.6.75 (SCADENZA-BADGE-FIX-v2) — Formato numerico compatto dd/mm/yy
  // (es. "22/04/26") invece di "22 apr 26" che con tab stretta wrappava in
  // 3 righe. dd/mm/yy = 8 caratteri totali, sicuramente single-line nel pill.
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function compareSortValues(a: string | number, b: string | number): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "it", { numeric: true, sensitivity: "base" });
}

const TicketsList = React.forwardRef<HTMLDivElement>((_, ref) => {
  const { effectiveCompany, user } = useAuth();
  const permissions = usePermissions();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  // Filtri chiesti da Ke Bei: merce (da arrivare / arrivata / incompleta) e
  // assistenza a pagamento o gratuita.
  const [merceFilter, setMerceFilter] = useState<"tutte" | "in_arrivo" | "incompleta" | "arrivata">("tutte");
  const [pagamentoFilter, setPagamentoFilter] = useState<"tutti" | "pagamento" | "gratis">("tutti");
  /** Solo chi ha sollecitato almeno 3 volte: i clienti che stanno aspettando troppo. */
  const [soloRichiami, setSoloRichiami] = useState(false);
  const [fonteFilter, setFonteFilter] = useState<string>("tutti");
  const [scadenzaFilter, setScadenzaFilter] = useState<string>("tutte");
  const [assegnatoFilter, setAssegnatoFilter] = useState<string>("tutti");
  const [sort, setSort] = useState<{ key: TicketSortKey; direction: SortDirection }>({
    key: "updated",
    direction: "desc",
  });
  const [selectedTicketIds, setSelectedTicketIds] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkStatus, setBulkStatus] = useState(KEEP_VALUE);
  const [bulkAssignee, setBulkAssignee] = useState(KEEP_VALUE);
  const [fetchLimit, setFetchLimit] = useState(TICKETS_FETCH_LIMIT);
  // Filtro tipo da URL (?tipo=intervento) o default = all (retrocompatibilità redirect)
  const tipoFilter = searchParams.get("tipo") ?? "all";
  const setTipoFilter = (v: string) => {
    const next = new URLSearchParams(searchParams);
    if (v === "all") next.delete("tipo");
    else next.set("tipo", v);
    setSearchParams(next, { replace: true });
  };
  const { unreadByTicket, totalUnread } = useUnreadTicketCounts();

  const { data: queryResult, isLoading, isFetching, isError, refetch } = useQuery({
    queryKey: [...queryKeys.companyTickets.list(effectiveCompany?.id), tipoFilter, statusFilter, priorityFilter, permissions.onlyAssigned, user?.id, fetchLimit],
    queryFn: async () => {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), TICKETS_QUERY_TIMEOUT_MS);
      let query = supabase
        .from("tickets")
        .select(`
          id, subject, status, priority, fonte, tipo, created_at, updated_at, last_message_at,
          order_id, assigned_to, category,
          a_pagamento, merce_stato, merce_mancante, richiami_count, ultimo_richiamo_at,
          data_intervento_prevista, data_intervento_effettiva, indirizzo_intervento,
          customer:profiles!tickets_customer_id_fkey(first_name, last_name, email),
          order:orders(description),
          assignee:profiles!tickets_assigned_to_fkey(first_name, last_name)
        `, { count: "exact" })
        .eq("company_id", effectiveCompany?.id ?? "")
        .order("last_message_at", { ascending: false, nullsFirst: false });

      // NOTE: nessun filtro server-side su tipo — unificazione Assistenza.
      // Il filtro client-side permette di ri-raggruppare dinamicamente.
      if (tipoFilter !== "all") {
        query = query.eq("tipo", tipoFilter);
      }
      if (statusFilter !== "all") query = query.eq("status", statusFilter as Enums<"ticket_status">);
      if (priorityFilter !== "all") query = query.eq("priority", priorityFilter);

      // 2026-05-27 (Security audit): tecnico/sopralluoghista con
      // only_assigned=true deve vedere SOLO i suoi ticket. RLS già filtra a
      // monte (check_staff_visibility), ma applichiamo anche qui per ridurre
      // banda + caricamento (no count completo dell'azienda).
      if (permissions.onlyAssigned && user?.id) {
        query = query.eq("assigned_to", user.id);
      }

      try {
        const { data, error, count } = await query
          .abortSignal(controller.signal)
          .range(0, fetchLimit - 1);
        if (error) throw error;
        return { tickets: data as unknown as TicketListItem[], totalCount: count ?? 0 };
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          throw new Error("Il caricamento dei ticket sta impiegando troppo tempo. Riprova o restringi i filtri.", { cause: error });
        }
        throw error;
      } finally {
        window.clearTimeout(timeoutId);
      }
    },
    enabled: !!effectiveCompany?.id,
    staleTime: 2 * 60 * 1000,
  });

  const tickets = useMemo(() => queryResult?.tickets ?? [], [queryResult]);
  const totalTickets = queryResult?.totalCount ?? tickets.length;
  const hasMoreTickets = totalTickets > tickets.length;

  const { data: staffList = [] } = useCompanyStaffUsers(effectiveCompany?.id);

  // Filtro "ferme": non è uno stato, è una condizione di tempo — sta a parte.
  // Va dichiarato QUI, sopra filteredTickets che lo legge: dichiararlo più in
  // basso lo rende inaccessibile durante il render (temporal dead zone) e la
  // pagina esplode senza che TypeScript possa accorgersene.
  const [soloFerme, setSoloFerme] = useState(false);
  // Mobile: i sette menu dei filtri stanno chiusi dietro un bottone accanto
  // alla ricerca (prima erano quattro righe prima della lista).
  const [filtriMobileAperti, setFiltriMobileAperti] = useState(false);
  const nFiltriMobile = [
    tipoFilter !== "all", statusFilter !== "all", priorityFilter !== "all",
    scadenzaFilter !== "tutte", assegnatoFilter !== "tutti",
  ].filter(Boolean).length;
  const isMobile = useIsMobile();

  // Vista tabella o pipeline, come in Commesse. Su mobile il trascinamento non
  // è usabile: lì resta sempre la tabella.
  const [vista, setVista] = useState<"tabella" | "pipeline">(() => {
    try { return (localStorage.getItem("assistenza-vista") as "tabella" | "pipeline") || "tabella"; }
    catch { return "tabella"; }
  });
  const cambiaVista = (v: "tabella" | "pipeline") => {
    setVista(v);
    try { localStorage.setItem("assistenza-vista", v); } catch { /* private mode */ }
  };

  // Filtri client-side: fonte, scadenza, assegnato, ricerca testuale
  const filteredTickets = useMemo(() => tickets.filter((ticket) => {
    if (soloFerme) {
      const f = calcolaFermo(ticket as never);
      if (!f || f.livello === "ok") return false;
    }
    if (fonteFilter !== "tutti" && ticket.fonte !== fonteFilter) return false;

    // Merce: «da arrivare» include ordinata e arrivata incompleta.
    if (merceFilter !== "tutte") {
      const ms = (ticket as { merce_stato?: string | null }).merce_stato ?? null;
      if (merceFilter === "in_arrivo" && !(ms === "da_ordinare" || ms === "ordinata" || ms === "arrivata_parziale")) return false;
      if (merceFilter === "incompleta" && ms !== "arrivata_parziale") return false;
      if (merceFilter === "arrivata" && ms !== "arrivata") return false;
    }
    if (soloRichiami && ((ticket as { richiami_count?: number | null }).richiami_count ?? 0) < 3) return false;
    if (pagamentoFilter !== "tutti") {
      const pag = Boolean((ticket as { a_pagamento?: boolean | null }).a_pagamento);
      if (pagamentoFilter === "pagamento" && !pag) return false;
      if (pagamentoFilter === "gratis" && pag) return false;
    }
    if (assegnatoFilter === "unassigned" && ticket.assigned_to) return false;
    if (assegnatoFilter !== "tutti" && assegnatoFilter !== "unassigned" && ticket.assigned_to !== assegnatoFilter) return false;

    if (scadenzaFilter !== "tutte") {
      const bucket = bucketScadenza(ticket.data_intervento_prevista);
      if (scadenzaFilter === "scaduto_oggi" && !(bucket === "scaduto" || bucket === "oggi")) return false;
      if (scadenzaFilter === "settimana" && bucket !== "settimana") return false;
      if (scadenzaFilter === "futuro" && bucket !== "futuro") return false;
      if (scadenzaFilter === "senza" && bucket !== "nessuna") return false;
    }

    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      safeText(ticket.subject).toLowerCase().includes(q) ||
      ticket.customer?.first_name?.toLowerCase().includes(q) ||
      ticket.customer?.last_name?.toLowerCase().includes(q) ||
      ticket.customer?.email?.toLowerCase().includes(q) ||
      ticket.assignee?.first_name?.toLowerCase().includes(q) ||
      ticket.assignee?.last_name?.toLowerCase().includes(q) ||
      ticket.order?.description?.toLowerCase().includes(q)
    );
  }), [tickets, fonteFilter, assegnatoFilter, scadenzaFilter, searchQuery, soloFerme, merceFilter, pagamentoFilter, soloRichiami]);

  const sortedTickets = useMemo(() => {
    const priorityRank: Record<string, number> = { urgente: 4, alta: 3, normale: 2, media: 2, bassa: 1 };
    const statusRank: Record<string, number> = Object.fromEntries(TICKET_STATI.map((s, i) => [s.value, i + 1]));
    const getSortValue = (ticket: TicketListItem, key: TicketSortKey): string | number => {
      switch (key) {
        case "tipo":
          return safeText(ticket.tipo);
        case "cliente":
          return `${safeText(ticket.customer?.last_name)} ${safeText(ticket.customer?.first_name)} ${safeText(ticket.customer?.email)}`;
        case "priority":
          return priorityRank[ticket.priority] ?? 0;
        case "scadenza": {
          const raw = ticket.data_intervento_prevista;
          const date = raw ? new Date(raw).getTime() : Number.MAX_SAFE_INTEGER;
          return Number.isFinite(date) ? date : Number.MAX_SAFE_INTEGER;
        }
        case "status":
          return statusRank[ticket.status] ?? 0;
        case "assigned":
          return `${safeText(ticket.assignee?.last_name)} ${safeText(ticket.assignee?.first_name)}`;
        case "order":
          return safeText(ticket.order?.description);
        case "updated": {
          const date = new Date(ticket.last_message_at || ticket.updated_at || ticket.created_at).getTime();
          return Number.isFinite(date) ? date : 0;
        }
        default:
          return "";
      }
    };

    return [...filteredTickets].sort((a, b) => {
      const order = compareSortValues(getSortValue(a, sort.key), getSortValue(b, sort.key));
      return sort.direction === "asc" ? order : -order;
    });
  }, [filteredTickets, sort]);

  const selectedTickets = useMemo(
    () => sortedTickets.filter((ticket) => selectedTicketIds.has(ticket.id)),
    [selectedTicketIds, sortedTickets],
  );
  const selectedAllVisible = sortedTickets.length > 0 && sortedTickets.every((ticket) => selectedTicketIds.has(ticket.id));
  const selectedHasOrder = selectedTickets.filter((ticket) => ticket.order_id).length;
  const selectedOpen = selectedTickets.filter((ticket) => !TICKET_STATI_CHIUSI.includes(ticket.status as never)).length;

  const invalidateTickets = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.companyTickets.all });

  const updateTicketsMutation = useMutation({
    mutationFn: async ({ ids, updates }: { ids: string[]; updates: Record<string, unknown> }) => {
      if (!effectiveCompany?.id || ids.length === 0) return;
      const { error } = await supabase
        .from("tickets")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("company_id", effectiveCompany.id)
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: async (_data, variables) => {
      await invalidateTickets();
      toast.success(variables.ids.length === 1 ? "Ticket aggiornato" : `${variables.ids.length} ticket aggiornati`);
    },
    onError: (error: Error) => toast.error(error.message || "Aggiornamento non riuscito"),
  });

  const toggleTicketSelection = (ticketId: string) => {
    setSelectedTicketIds((current) => {
      const next = new Set(current);
      if (next.has(ticketId)) next.delete(ticketId);
      else next.add(ticketId);
      return next;
    });
  };

  const toggleAllVisible = () => {
    setSelectedTicketIds((current) => {
      const next = new Set(current);
      if (selectedAllVisible) {
        sortedTickets.forEach((ticket) => next.delete(ticket.id));
      } else {
        sortedTickets.forEach((ticket) => next.add(ticket.id));
      }
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedTicketIds(new Set());
    setBulkStatus(KEEP_VALUE);
    setBulkAssignee(KEEP_VALUE);
  };

  const updateTicketStatus = (ticketId: string, status: string) => {
    const updates: Record<string, unknown> = { status };
    if (TICKET_STATI_CHIUSI.includes(status as never)) {
      updates.data_intervento_effettiva = new Date().toISOString();
    }
    updateTicketsMutation.mutate({ ids: [ticketId], updates });
  };

  const updateTicketAssignee = (ticketId: string, assigneeId: string) => {
    updateTicketsMutation.mutate({
      ids: [ticketId],
      updates: { assigned_to: assigneeId === UNASSIGNED_VALUE ? null : assigneeId },
    });
  };

  const applyBulkUpdates = () => {
    const ids = Array.from(selectedTicketIds);
    const updates: Record<string, unknown> = {};
    if (bulkStatus !== KEEP_VALUE) {
      updates.status = bulkStatus;
      if (TICKET_STATI_CHIUSI.includes(bulkStatus as never)) {
        updates.data_intervento_effettiva = new Date().toISOString();
      }
    }
    if (bulkAssignee !== KEEP_VALUE) {
      updates.assigned_to = bulkAssignee === UNASSIGNED_VALUE ? null : bulkAssignee;
    }
    if (ids.length === 0 || Object.keys(updates).length === 0) {
      toast.info("Seleziona almeno una modifica da applicare");
      return;
    }
    updateTicketsMutation.mutate(
      { ids, updates },
      {
        onSuccess: () => {
          clearSelection();
          setBulkOpen(false);
        },
      },
    );
  };

  const handleSort = (key: TicketSortKey) => {
    setSort((current) => ({
      key,
      direction: current.key === key && current.direction === "asc" ? "desc" : "asc",
    }));
  };

  // Metriche aggregate (basate su TUTTI i ticket azienda, non filtrati)
  // Numeri per i filtri rapidi di merce e solleciti.
  const metricheMerce = useMemo(() => {
    let inArrivo = 0, incomplete = 0, solleciti = 0;
    for (const t of tickets as { merce_stato?: string | null; richiami_count?: number | null }[]) {
      const ms = t.merce_stato ?? null;
      if (ms === "da_ordinare" || ms === "ordinata" || ms === "arrivata_parziale") inArrivo++;
      if (ms === "arrivata_parziale") incomplete++;
      if ((t.richiami_count ?? 0) >= 3) solleciti++;
    }
    return { inArrivo, incomplete, solleciti };
  }, [tickets]);

  const metrics = useMemo(() => {
    const aperti = tickets.filter(t => t.status === "aperto" || t.status === "in_lavorazione").length;
    const urgenti = tickets.filter(t => (t.priority === "urgente" || t.priority === "alta") && !TICKET_STATI_CHIUSI.includes(t.status as never)).length;
    const inScadenza = tickets.filter(t => {
      if (TICKET_STATI_CHIUSI.includes(t.status as never)) return false;
      const b = bucketScadenza(t.data_intervento_prevista);
      return b === "scaduto" || b === "oggi" || b === "settimana";
    }).length;
    const nonAssegnati = tickets.filter(t => !t.assigned_to && !TICKET_STATI_CHIUSI.includes(t.status as never)).length;
    const risolti = tickets.filter(t => t.status === "risolto").length;
    // "aperti" da solo non dice niente quando sono 137: quello che serve sapere
    // è quante stanno ferme oltre il tempo che ci si è dati.
    const ferme = tickets.filter(t => {
      const f = calcolaFermo(t as never);
      return f !== null && f.livello !== "ok";
    }).length;
    // Soldi fermi: interventi a pagamento eseguiti e non ancora incassati.
    const daIncassare = tickets
      .filter(t => (t as never as { a_pagamento?: boolean; pagato?: boolean }).a_pagamento
                && !(t as never as { pagato?: boolean }).pagato)
      .reduce((sum, t) => {
        const x = t as never as { importo_finale?: number; importo_preventivato?: number };
        return sum + Number(x.importo_finale ?? x.importo_preventivato ?? 0);
      }, 0);
    return { totale: tickets.length, aperti, urgenti, inScadenza, nonAssegnati, risolti, ferme, daIncassare };
  }, [tickets]);

  // Conteggio per OGNI stato: il filtro ne elencava tre su quindici, quindi gli
  // altri erano di fatto irraggiungibili dalla tendina.
  const statusCounts = useMemo(() => {
    const c: Record<string, number> = { all: tickets.length };
    TICKET_STATI.forEach((st) => {
      c[st.value] = tickets.filter((t) => t.status === st.value).length;
    });
    return c;
  }, [tickets]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Assistenza</h1>
          <p className="text-muted-foreground">Caricamento ticket, interventi e richieste clienti...</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Assistenza</h1>
          <p className="text-muted-foreground">Gestisci ticket di supporto e interventi sul campo</p>
        </div>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            Errore nel caricamento dei ticket.
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" /> Riprova
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div ref={ref} className="space-y-6 max-sm:space-y-3">
      {/* Header */}
      <div className="testata-pagina rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-white to-orange-50/40 px-4 py-5 shadow-sm sm:px-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-amber-400 text-white shadow-[0_4px_12px_rgba(249,115,22,0.3)]">
              <LifeBuoy className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl font-bold tracking-tight">Assistenza</h1>
              <p className="text-sm text-muted-foreground">
                Ticket clienti, interventi collegati alle commesse, responsabilita e costi da tenere sotto controllo.
              </p>
            </div>
          </div>
        <div className="flex items-center gap-2">
          {selectedTicketIds.size > 0 && (
            <Button variant="outline" onClick={() => setBulkOpen(true)} className="gap-2 max-sm:hidden">
              <CheckSquare className="h-4 w-4" />
              {selectedTicketIds.size} selezionati
            </Button>
          )}
          {/* Mobile no: niente esportazioni da telefono. */}
          <div className="hidden sm:contents">
          <ExportButton
            getData={() => filteredTickets.map((t) => ({
              id: t.id?.slice(0, 8) || "",
              subject: t.subject || "",
              tipo: TIPO_LABEL[t.tipo ?? "supporto"] ?? t.tipo ?? "",
              status: getTicketStatusLabel(t.status) || t.status || "",
              priority: getTicketPriorityLabel(t.priority) || t.priority || "",
              customer: t.customer ? `${t.customer.first_name || ""} ${t.customer.last_name || ""}`.trim() : "",
              assigned: t.assignee ? `${t.assignee.first_name || ""} ${t.assignee.last_name || ""}`.trim() : "",
              order: t.order?.description || "",
              scadenza: t.data_intervento_prevista ?? "",
              created: t.created_at ? new Date(t.created_at).toLocaleDateString("it-IT") : "",
            }))}
            columns={[
              { key: "id", label: "ID" },
              { key: "subject", label: "Oggetto" },
              { key: "tipo", label: "Tipo" },
              { key: "status", label: "Stato" },
              { key: "priority", label: "Priorità" },
              { key: "customer", label: "Cliente" },
              { key: "assigned", label: "Assegnato" },
              { key: "order", label: "Ordine" },
              { key: "scadenza", label: "Scadenza" },
              { key: "created", label: "Creato il" },
            ]}
            filename="assistenza-interventi"
          />
          </div>
          <Button asChild className="bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-sm hover:from-orange-600 hover:to-amber-600 max-sm:h-9 max-sm:px-3 max-sm:text-xs">
            <Link to="/azienda/assistenza/nuovo">
              <Plus className="mr-2 h-4 w-4" />
              <span className="sm:hidden">Nuovo</span>
              <span className="hidden sm:inline">Nuovo Ticket</span>
            </Link>
          </Button>
        </div>
        </div>
      </div>

      {/* Tab tipo (supporto / intervento / emergenza / tutti) */}
      {/* Mobile: il tipo sta nel pannello dei filtri (una riga di pillole in meno). */}
      <div className="flex gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm max-sm:hidden">
        {[
          { value: "all",        label: "Tutti",         icon: ClipboardList },
          { value: "supporto",   label: "Supporto",      icon: LifeBuoy },
          { value: "intervento", label: "Interventi",    icon: Wrench },
          { value: "emergenza",  label: "Emergenze",     icon: AlertTriangle },
        ].map(tab => {
          const Icon = tab.icon;
          const active = tipoFilter === tab.value;
          return (
            <button
              key={tab.value}
              onClick={() => setTipoFilter(tab.value)}
              className={cn(
                "tap-compact flex shrink-0 items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium transition-all whitespace-nowrap max-sm:h-8 max-sm:rounded-full max-sm:border max-sm:px-3 max-sm:py-0 max-sm:text-xs",
                active
                  ? "bg-orange-50 text-orange-700 shadow-sm ring-1 ring-orange-100"
                  : "text-muted-foreground hover:bg-slate-50 hover:text-slate-900"
              )}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Testata navy famiglia (come Costi/Commesse/Personale): i cinque numeri
          dell'assistenza, ognuno un filtro veloce cliccabile. I segnali d'azione
          (urgenti, in scadenza, non assegnati) si accendono d'arancio se > 0. */}
      {/* Mobile: al posto dei nove riquadri blu (mezzo schermo di numeri con
          spiegazione) una riga di filtri con il conteggio, solo quelli > 0. */}
      <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] sm:hidden">
        {[
          { key: "aperti", label: "Aperti", n: metrics.aperti, attivo: statusFilter === "aperto", tono: "", onClick: () => setStatusFilter(statusFilter === "aperto" ? "all" : "aperto") },
          { key: "urgenti", label: "Urgenti", n: metrics.urgenti, attivo: priorityFilter === "urgente", tono: "text-red-600", onClick: () => setPriorityFilter(priorityFilter === "urgente" ? "all" : "urgente") },
          { key: "scadenza", label: "In scadenza", n: metrics.inScadenza, attivo: scadenzaFilter === "scaduto_oggi", tono: "text-orange-600", onClick: () => setScadenzaFilter(scadenzaFilter === "scaduto_oggi" ? "tutte" : "scaduto_oggi") },
          { key: "ferme", label: "Ferme", n: metrics.ferme, attivo: soloFerme, tono: "text-red-600", onClick: () => setSoloFerme((v) => !v) },
          { key: "nonassegnati", label: "Non assegnati", n: metrics.nonAssegnati, attivo: assegnatoFilter === "unassigned", tono: "text-orange-600", onClick: () => setAssegnatoFilter(assegnatoFilter === "unassigned" ? "tutti" : "unassigned") },
          { key: "merce", label: "Merce in arrivo", n: metricheMerce.inArrivo, attivo: merceFilter !== "tutte", tono: "", onClick: () => setMerceFilter(merceFilter === "tutte" ? "in_arrivo" : "tutte") },
          { key: "richiami", label: "Richiamano", n: metricheMerce.solleciti, attivo: soloRichiami, tono: "text-amber-600", onClick: () => setSoloRichiami((v) => !v) },
        ].filter((f) => f.n > 0 || f.attivo).map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={f.onClick}
            aria-pressed={f.attivo}
            className={cn(
              "tap-compact flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium",
              f.attivo ? "border-slate-900 bg-slate-900 text-white" : "bg-white text-slate-700",
            )}
          >
            {f.label}
            <span className={cn("font-bold tabular-nums", !f.attivo && f.tono)}>{f.n}</span>
          </button>
        ))}
      </div>

      <div className="hidden rounded-2xl bg-[#173b67] p-3 sm:block sm:p-4">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-orange-100">Assistenza</p>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5 sm:gap-3">
          <NavyStatCard
            label="Totale"
            value={metrics.totale}
            sub={totalUnread > 0 ? `${totalUnread} non lett${totalUnread === 1 ? "o" : "i"}` : "tutti letti"}
            icon={ClipboardList}
            tone={totalUnread > 0 ? "text-orange-300" : "text-blue-100"}
            active={statusFilter === "all"}
            onClick={() => setStatusFilter("all")}
          />
          <NavyStatCard
            label="Aperti"
            value={metrics.aperti}
            sub={metrics.aperti > 0 ? "da lavorare" : "nessuno aperto"}
            icon={MessageSquare}
            tone="text-blue-100"
            active={statusFilter === "aperto"}
            onClick={() => setStatusFilter(statusFilter === "aperto" ? "all" : "aperto")}
          />
          <NavyStatCard
            label="Urgenti / Alta"
            value={metrics.urgenti}
            sub={metrics.urgenti > 0 ? "priorità alta" : "niente urgenze"}
            icon={AlertTriangle}
            tone={metrics.urgenti > 0 ? "text-red-300" : "text-blue-100"}
            active={priorityFilter === "urgente" || priorityFilter === "alta"}
            onClick={() => setPriorityFilter(priorityFilter === "urgente" ? "all" : "urgente")}
          />
          <NavyStatCard
            label="In scadenza"
            value={metrics.inScadenza}
            sub={metrics.inScadenza > 0 ? "entro oggi/settimana" : "nessuna scadenza"}
            icon={CalendarClock}
            tone={metrics.inScadenza > 0 ? "text-orange-300" : "text-blue-100"}
            active={scadenzaFilter === "scaduto_oggi" || scadenzaFilter === "settimana"}
            onClick={() => setScadenzaFilter(scadenzaFilter === "scaduto_oggi" ? "tutte" : "scaduto_oggi")}
          />
          <NavyStatCard
            label="Ferme troppo"
            value={metrics.ferme}
            sub={metrics.ferme > 0 ? "oltre il tempo previsto" : "nessuna in ritardo"}
            icon={Hourglass}
            tone={metrics.ferme > 0 ? "text-red-300" : "text-blue-100"}
            active={soloFerme}
            onClick={() => setSoloFerme(v => !v)}
          />
          <NavyStatCard
            label="Merce da arrivare"
            value={metricheMerce.inArrivo}
            sub={metricheMerce.incomplete > 0
              ? `${metricheMerce.incomplete} bolla${metricheMerce.incomplete === 1 ? "" : "e"} incompleta`
              : "nessuna incompleta"}
            icon={Package}
            tone={metricheMerce.incomplete > 0 ? "text-red-300" : "text-blue-100"}
            active={merceFilter !== "tutte"}
            onClick={() => setMerceFilter(merceFilter === "tutte" ? "in_arrivo" : merceFilter === "in_arrivo" ? "incompleta" : "tutte")}
          />
          <NavyStatCard
            label="Richiamano"
            value={metricheMerce.solleciti}
            sub={metricheMerce.solleciti > 0 ? "3 o più solleciti" : "nessun insistente"}
            icon={PhoneCall}
            tone={metricheMerce.solleciti > 0 ? "text-amber-300" : "text-blue-100"}
            active={soloRichiami}
            onClick={() => setSoloRichiami((v) => !v)}
          />
          <NavyStatCard
            label="Da incassare"
            value={metrics.daIncassare > 0
              ? metrics.daIncassare.toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0, useGrouping: true })
              : "—"}
            sub={metrics.daIncassare > 0 ? "interventi a pagamento" : "niente in sospeso"}
            icon={Euro}
            tone={metrics.daIncassare > 0 ? "text-orange-300" : "text-blue-100"}
          />
          <NavyStatCard
            label="Non assegnati"
            value={metrics.nonAssegnati}
            sub={metrics.nonAssegnati > 0 ? "senza responsabile" : "tutti assegnati"}
            icon={UserX}
            tone={metrics.nonAssegnati > 0 ? "text-orange-300" : "text-blue-100"}
            active={assegnatoFilter === "unassigned"}
            onClick={() => setAssegnatoFilter(assegnatoFilter === "unassigned" ? "tutti" : "unassigned")}
          />
        </div>
      </div>

      {selectedTicketIds.size > 0 && (
        <div className="flex flex-col gap-3 rounded-xl border border-blue-200 bg-blue-50/80 p-3 text-sm text-blue-950 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="bg-blue-600">{selectedTicketIds.size} selezionati</Badge>
            <span>{selectedOpen} ancora aperti</span>
            <span className="hidden sm:inline">·</span>
            <span>{selectedHasOrder} collegati a commesse</span>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={clearSelection}>Annulla selezione</Button>
            <Button size="sm" onClick={() => setBulkOpen(true)}>Azioni massive</Button>
          </div>
        </div>
      )}

      {/* Filters row */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm max-sm:gap-2 max-sm:rounded-none max-sm:border-0 max-sm:bg-transparent max-sm:p-0 max-sm:shadow-none">
        <div className="flex items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={isMobile ? "Cerca" : "Cerca per cliente, oggetto o email…"}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 max-sm:h-9 max-sm:bg-white"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="tap-compact relative h-9 w-9 shrink-0 bg-white sm:hidden"
            onClick={() => setFiltriMobileAperti(true)}
            aria-label="Filtri"
          >
            <SlidersHorizontal className="h-4 w-4" />
            {nFiltriMobile > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-orange-500 text-[10px] font-bold text-white">
                {nFiltriMobile}
              </span>
            )}
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2 max-sm:hidden">
          <Filter className="h-4 w-4 text-muted-foreground shrink-0 hidden sm:block" />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="flex-1 sm:w-[170px] sm:flex-none"><SelectValue placeholder="Stato" /></SelectTrigger>
            <SelectContent className="max-h-[380px]">
              <SelectItem value="all">Tutti gli stati ({statusCounts.all})</SelectItem>
              {TICKET_FASI.map((fase) => {
                // Si mostrano solo gli stati che hanno almeno un'assistenza:
                // una tendina con quindici voci quasi tutte a zero è rumore.
                const stati = TICKET_STATI.filter((st) => st.fase === fase.key && (statusCounts[st.value] ?? 0) > 0);
                if (stati.length === 0) return null;
                return (
                  <SelectGroup key={fase.key}>
                    <SelectLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {fase.label}
                    </SelectLabel>
                    {stati.map((st) => (
                      <SelectItem key={st.value} value={st.value}>
                        {st.label} ({statusCounts[st.value]})
                      </SelectItem>
                    ))}
                  </SelectGroup>
                );
              })}
            </SelectContent>
          </Select>
          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className="flex-1 sm:w-[150px] sm:flex-none"><SelectValue placeholder="Priorità" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutte le priorità</SelectItem>
              <SelectItem value="urgente">🔴 Urgente</SelectItem>
              <SelectItem value="alta">🟠 Alta</SelectItem>
              <SelectItem value="normale">🟡 Normale</SelectItem>
              <SelectItem value="bassa">⚪️ Bassa</SelectItem>
            </SelectContent>
          </Select>
          {/* Tabella o pipeline — solo desktop, come in Commesse */}
          <ToggleGroup
            type="single"
            value={vista}
            onValueChange={(v) => v && cambiaVista(v as "tabella" | "pipeline")}
            className="ml-auto hidden rounded-md border sm:flex"
          >
            <ToggleGroupItem value="tabella" aria-label="Vista elenco" className="px-3">
              <LayoutList className="h-4 w-4" />
            </ToggleGroupItem>
            <ToggleGroupItem value="pipeline" aria-label="Vista pipeline" className="px-3">
              <Columns3 className="h-4 w-4" />
            </ToggleGroupItem>
          </ToggleGroup>
          <Select value={scadenzaFilter} onValueChange={setScadenzaFilter}>
            <SelectTrigger className="flex-1 sm:w-[170px] sm:flex-none"><SelectValue placeholder="Scadenza" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="tutte">Tutte le scadenze</SelectItem>
              <SelectItem value="scaduto_oggi">Scaduti / Oggi</SelectItem>
              <SelectItem value="settimana">Entro 7 giorni</SelectItem>
              <SelectItem value="futuro">Oltre 7 giorni</SelectItem>
              <SelectItem value="senza">Senza scadenza</SelectItem>
            </SelectContent>
          </Select>
          <Select value={assegnatoFilter} onValueChange={setAssegnatoFilter}>
            <SelectTrigger className="flex-1 sm:w-[180px] sm:flex-none"><SelectValue placeholder="Assegnato a" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="tutti">Tutti (assegnato o no)</SelectItem>
              <SelectItem value="unassigned">Non assegnato</SelectItem>
              {staffList.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {[s.first_name, s.last_name].filter(Boolean).join(" ") || "Senza nome"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={fonteFilter} onValueChange={setFonteFilter}>
            <SelectTrigger className="flex-1 sm:w-[150px] sm:flex-none"><SelectValue placeholder="Fonte" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="tutti">Tutte le fonti</SelectItem>
              <SelectItem value="ufficio">Da ufficio</SelectItem>
              <SelectItem value="campo">📍 Da campo</SelectItem>
              <SelectItem value="cliente">Da cliente</SelectItem>
            </SelectContent>
          </Select>
          <Select value={pagamentoFilter} onValueChange={(v) => setPagamentoFilter(v as typeof pagamentoFilter)}>
            <SelectTrigger className="flex-1 sm:w-[170px] sm:flex-none"><SelectValue placeholder="Pagamento" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="tutti">A pagamento e gratis</SelectItem>
              <SelectItem value="pagamento">Solo a pagamento</SelectItem>
              <SelectItem value="gratis">Solo gratuite</SelectItem>
            </SelectContent>
          </Select>
          <Select value={merceFilter} onValueChange={(v) => setMerceFilter(v as typeof merceFilter)}>
            <SelectTrigger className="flex-1 sm:w-[190px] sm:flex-none"><SelectValue placeholder="Merce" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="tutte">Merce: tutte</SelectItem>
              <SelectItem value="in_arrivo">Merce da arrivare</SelectItem>
              <SelectItem value="incompleta">Bolla incompleta</SelectItem>
              <SelectItem value="arrivata">Merce arrivata</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {hasMoreTickets && (
        <Alert className="border-amber-200 bg-amber-50 text-amber-900">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span>
              Vista limitata ai primi {tickets.length.toLocaleString("it-IT")} ticket su {totalTickets.toLocaleString("it-IT")}.
              Usa filtri e ricerca per lavorare con precisione su archivi molto grandi.
            </span>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 border-amber-300 bg-white"
              disabled={isFetching}
              onClick={() => setFetchLimit((n) => n + TICKETS_FETCH_LIMIT)}
            >
              {isFetching ? "Caricamento…" : "Carica altri"}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Pipeline: stessa lista filtrata, disposta per fase */}
      {vista === "pipeline" ? (
        <div className="hidden sm:block">
          <AssistenzaPipeline tickets={sortedTickets as never} onStatusChange={updateTicketStatus} />
          {sortedTickets.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nessuna assistenza con questi filtri.
            </p>
          )}
        </div>
      ) : null}

      {/* Tabella (sempre su mobile) */}
      <div className={vista === "pipeline" ? "sm:hidden" : undefined}>
      {sortedTickets.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">Nessun ticket trovato</h3>
            <p className="text-muted-foreground text-center mt-2">
              {searchQuery || statusFilter !== "all" || priorityFilter !== "all" || tipoFilter !== "all" || scadenzaFilter !== "tutte" || assegnatoFilter !== "tutti"
                ? "Prova a modificare i filtri di ricerca"
                : "Non ci sono ancora ticket di assistenza"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          {/* Mobile list */}
          <div className="sm:hidden divide-y">
            {sortedTickets.map((ticket) => (
              <MobileTicketRow
                key={ticket.id}
                ticket={ticket}
                unreadCount={unreadByTicket[ticket.id]}
              />
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox checked={selectedAllVisible} onCheckedChange={toggleAllVisible} aria-label="Seleziona ticket visibili" />
                  </TableHead>
                  <SortableTableHead className="w-24" active={sort.key === "tipo"} direction={sort.direction} onClick={() => handleSort("tipo")}>Tipo</SortableTableHead>
                  <SortableTableHead active={sort.key === "cliente"} direction={sort.direction} onClick={() => handleSort("cliente")}>Cliente · Oggetto</SortableTableHead>
                  <SortableTableHead active={sort.key === "priority"} direction={sort.direction} onClick={() => handleSort("priority")}>Priorità</SortableTableHead>
                  <SortableTableHead active={sort.key === "scadenza"} direction={sort.direction} onClick={() => handleSort("scadenza")}>Scadenza</SortableTableHead>
                  <SortableTableHead active={sort.key === "status"} direction={sort.direction} onClick={() => handleSort("status")}>Stato</SortableTableHead>
                  <SortableTableHead className="hidden lg:table-cell" active={sort.key === "assigned"} direction={sort.direction} onClick={() => handleSort("assigned")}>Assegnato</SortableTableHead>
                  <SortableTableHead className="hidden xl:table-cell" active={sort.key === "order"} direction={sort.direction} onClick={() => handleSort("order")}>Ordine</SortableTableHead>
                  <SortableTableHead className="hidden md:table-cell" active={sort.key === "updated"} direction={sort.direction} onClick={() => handleSort("updated")}>Aggiornato</SortableTableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedTickets.map((ticket) => (
                  <DesktopTicketRow
                    key={ticket.id}
                    ticket={ticket}
                    unreadCount={unreadByTicket[ticket.id]}
                    selected={selectedTicketIds.has(ticket.id)}
                    onToggleSelected={() => toggleTicketSelection(ticket.id)}
                    onStatusChange={updateTicketStatus}
                    onAssigneeChange={updateTicketAssignee}
                    staffList={staffList}
                    isUpdating={updateTicketsMutation.isPending}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
      </div>

      {/* Mobile: i filtri in un pannello dal basso. Tipo, priorità e scadenza a
          pillole; stato e assegnatario a menu. Fonte, pagamento e merce restano
          al desktop (la merce ha la sua pillola col conteggio). */}
      <Sheet open={filtriMobileAperti} onOpenChange={setFiltriMobileAperti}>
        <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto rounded-t-2xl px-4 pb-6">
          <SheetHeader className="text-left">
            <SheetTitle>Filtri</SheetTitle>
          </SheetHeader>
          <div className="mt-3 space-y-4">
            <PilloleFiltro
              titolo="Tipo"
              valore={tipoFilter}
              onScegli={setTipoFilter}
              scelte={[
                { value: "all", label: "Tutti" },
                { value: "supporto", label: "Supporto" },
                { value: "intervento", label: "Interventi" },
                { value: "emergenza", label: "Emergenze" },
              ]}
            />
            <PilloleFiltro
              titolo="Priorità"
              valore={priorityFilter}
              onScegli={setPriorityFilter}
              scelte={[
                { value: "all", label: "Tutte" },
                { value: "urgente", label: "Urgente" },
                { value: "alta", label: "Alta" },
                { value: "normale", label: "Normale" },
                { value: "bassa", label: "Bassa" },
              ]}
            />
            <PilloleFiltro
              titolo="Scadenza"
              valore={scadenzaFilter}
              onScegli={setScadenzaFilter}
              scelte={[
                { value: "tutte", label: "Tutte" },
                { value: "scaduto_oggi", label: "Scaduti / oggi" },
                { value: "settimana", label: "Entro 7 giorni" },
                { value: "senza", label: "Senza scadenza" },
              ]}
            />
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Stato</p>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="tap-compact h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-[320px]">
                    <SelectItem value="all">Tutti ({statusCounts.all})</SelectItem>
                    {TICKET_STATI.filter((st) => (statusCounts[st.value] ?? 0) > 0).map((st) => (
                      <SelectItem key={st.value} value={st.value}>{st.label} ({statusCounts[st.value]})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Assegnato a</p>
                <Select value={assegnatoFilter} onValueChange={setAssegnatoFilter}>
                  <SelectTrigger className="tap-compact h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tutti">Tutti</SelectItem>
                    <SelectItem value="unassigned">Non assegnato</SelectItem>
                    {staffList.map((st) => (
                      <SelectItem key={st.id} value={st.id}>
                        {[st.first_name, st.last_name].filter(Boolean).join(" ") || "Senza nome"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <div className="mt-5 flex gap-2">
            {nFiltriMobile > 0 && (
              <Button
                variant="outline"
                className="h-11"
                onClick={() => {
                  setTipoFilter("all");
                  setStatusFilter("all");
                  setPriorityFilter("all");
                  setScadenzaFilter("tutte");
                  setAssegnatoFilter("tutti");
                }}
              >
                Azzera
              </Button>
            )}
            <Button className="h-11 flex-1" onClick={() => setFiltriMobileAperti(false)}>
              Mostra {sortedTickets.length}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <TicketBulkActionsSheet
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        selectedTickets={selectedTickets}
        staffList={staffList}
        bulkStatus={bulkStatus}
        onBulkStatusChange={setBulkStatus}
        bulkAssignee={bulkAssignee}
        onBulkAssigneeChange={setBulkAssignee}
        onApply={applyBulkUpdates}
        onClear={clearSelection}
        isPending={updateTicketsMutation.isPending}
      />
    </div>
  );
});
TicketsList.displayName = "TicketsList";
export default TicketsList;

// =============================================================================
// Componenti atomici
// =============================================================================

function SortableTableHead({
  children,
  active,
  direction,
  onClick,
  className,
}: {
  children: React.ReactNode;
  active: boolean;
  direction: SortDirection;
  onClick: () => void;
  className?: string;
}) {
  const Icon = !active ? ArrowUpDown : direction === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={onClick}
        className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
      >
        {children}
        <Icon className="h-3.5 w-3.5" />
      </button>
    </TableHead>
  );
}

function TipoChip({ tipo }: { tipo: string | null | undefined }) {
  const key = (tipo ?? "supporto") as keyof typeof TIPO_LABEL;
  const Icon = TIPO_ICON[key] ?? LifeBuoy;
  const palette = TIPO_COLORS[key] ?? TIPO_COLORS.supporto;
  return (
    <Badge
      variant="outline"
      className="gap-1 text-[11px] font-medium"
      style={{ backgroundColor: palette.bg, color: palette.text, borderColor: palette.border }}
    >
      <Icon className="h-3 w-3" />
      {TIPO_LABEL[key] ?? tipo}
    </Badge>
  );
}

function ScadenzaCell({ iso }: { iso: string | null | undefined }) {
  const bucket = bucketScadenza(iso);
  if (bucket === "nessuna") return <span className="text-muted-foreground text-sm">—</span>;
  const styles: Record<ScadenzaBucket, string> = {
    scaduto: "bg-red-100 text-red-700 border-red-300 dark:bg-red-950 dark:text-red-300",
    oggi: "bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-950 dark:text-orange-300",
    settimana: "bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/50 dark:text-amber-300",
    futuro: "bg-muted text-muted-foreground border-transparent",
    nessuna: "",
  };
  const labelPrefix: Record<ScadenzaBucket, string> = {
    scaduto: "Scaduto",
    oggi: "Oggi",
    settimana: "",
    futuro: "",
    nessuna: "",
  };
  // v8.6.75 (SCADENZA-BADGE-FIX) — utente: "il bottone scaduto si vede male".
  // Causa: TableCell stretta + Badge senza whitespace-nowrap → testo wrappava
  // su 3 righe ("Scaduto"/"22 apr"/"26") e il padding del badge creava un
  // pseudo-cerchio rosso brutto. Fix:
  // - whitespace-nowrap forza tutto su 1 riga
  // - gap-1 al posto di mr-1 + bullet "·" per ridurre rumore visivo
  // - inline-flex per centrare verticalmente
  return (
    <Badge
      variant="outline"
      className={cn("text-[11px] font-medium inline-flex items-center gap-1 whitespace-nowrap", styles[bucket])}
      title={iso ? new Date(iso).toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: "numeric" }) : undefined}
    >
      {labelPrefix[bucket] ? <span>{labelPrefix[bucket]}</span> : null}
      <span className="tabular-nums">{formatScadenza(iso)}</span>
    </Badge>
  );
}

/**
 * Segnali che l'ufficio deve vedere senza aprire il ticket:
 * la bolla incompleta (in rosso, con cosa manca) e i solleciti del cliente.
 */
function BadgeMerceRichiami({ ticket }: { ticket: Record<string, unknown> }) {
  const merceStato = (ticket.merce_stato as string | null) ?? null;
  const mancante = (ticket.merce_mancante as string | null) ?? null;
  const richiami = (ticket.richiami_count as number | null) ?? 0;
  if (merceStato !== "arrivata_parziale" && merceStato !== "ordinata" && merceStato !== "da_ordinare" && richiami === 0) {
    return null;
  }
  return (
    <div className="flex flex-wrap items-center gap-1">
      {merceStato === "arrivata_parziale" && (
        <Badge
          className="bg-red-100 text-red-800 border border-red-200 text-[10px] px-1.5 py-0"
          title={mancante ? `Manca: ${mancante}` : "Merce arrivata incompleta"}
        >
          Bolla incompleta
        </Badge>
      )}
      {(merceStato === "ordinata" || merceStato === "da_ordinare") && (
        <Badge className="bg-purple-100 text-purple-800 border border-purple-200 text-[10px] px-1.5 py-0">
          Merce in arrivo
        </Badge>
      )}
      {richiami > 0 && (
        <Badge
          className={`text-[10px] px-1.5 py-0 border ${richiami >= 3 ? "bg-amber-100 text-amber-900 border-amber-300" : "bg-muted text-muted-foreground border-transparent"}`}
          title="Volte che il cliente ha sollecitato"
        >
          {richiami}× richiamo
        </Badge>
      )}
    </div>
  );
}

/**
 * Una riga da ~52px: pallino della priorità, oggetto (e messaggi non letti),
 * cliente · da quanto è ferma o aggiornata · scadenza, stato a destra. Prima:
 * casella di selezione, tipo, due badge impilati e tre righe di testo.
 */
function MobileTicketRow({
  ticket,
  unreadCount,
}: {
  ticket: TicketListItem;
  unreadCount: number | undefined;
}) {
  const statusColor = getTicketStatusColor(ticket.status);
  const priorityColor = getTicketPriorityColor(ticket.priority);
  const scadenza = ticket.data_intervento_prevista;
  const fermo = calcolaFermo(ticket as never);
  const cliente = `${ticket.customer?.first_name ?? ""} ${ticket.customer?.last_name ?? ""}`.trim();
  return (
    <Link
      to={`/azienda/assistenza/${ticket.id}`}
      className="tap-compact flex items-center gap-2.5 px-3 py-2 hover:bg-muted/50 active:bg-muted transition-colors"
    >
      <span
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: priorityColor.text }}
        title={getTicketPriorityLabel(ticket.priority)}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[13px] font-semibold leading-tight">{ticket.subject}</span>
          {unreadCount !== undefined && unreadCount > 0 && (
            <span className="inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
              {unreadCount}
            </span>
          )}
        </div>
        <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
          {cliente && <span className="truncate">{cliente}</span>}
          {cliente && <span aria-hidden>·</span>}
          {fermo
            ? <span className={cn("shrink-0", CLASSI_FERMO[fermo.livello])}>{fermo.etichetta}</span>
            : <span className="shrink-0">{formatRelativeTime(ticket.last_message_at || ticket.updated_at)}</span>}
          {scadenza && <span className="shrink-0"><ScadenzaCell iso={scadenza} /></span>}
        </div>
        {/* Bolla incompleta, merce in arrivo, richiami: una riga solo se c'è. */}
        <div className="mt-0.5 empty:hidden">
          <BadgeMerceRichiami ticket={ticket as unknown as Record<string, unknown>} />
        </div>
      </div>
      <span className="max-w-[4.5rem] shrink-0 text-right text-[11px] font-medium leading-tight" style={{ color: statusColor.text }}>
        {getTicketStatusLabel(ticket.status)}
      </span>
    </Link>
  );
}

function DesktopTicketRow({
  ticket,
  unreadCount,
  selected,
  onToggleSelected,
  onStatusChange,
  onAssigneeChange,
  staffList,
  isUpdating,
}: {
  ticket: TicketListItem;
  unreadCount: number | undefined;
  selected: boolean;
  onToggleSelected: () => void;
  onStatusChange: (ticketId: string, status: string) => void;
  onAssigneeChange: (ticketId: string, assigneeId: string) => void;
  staffList: StaffUser[];
  isUpdating: boolean;
}) {
  const priorityColor = getTicketPriorityColor(ticket.priority);
  const scadenza = ticket.data_intervento_prevista;
  const isUrgent = ticket.priority === "urgente";
  const bucketS = bucketScadenza(scadenza);
  const isOverdue = (bucketS === "scaduto" || bucketS === "oggi") && !TICKET_STATI_CHIUSI.includes(ticket.status as never);
  return (
    <TableRow className={cn(isUrgent && "bg-red-50/50 dark:bg-red-950/10", isOverdue && !isUrgent && "bg-orange-50/50 dark:bg-orange-950/10")}>
      <TableCell>
        <Checkbox checked={selected} onCheckedChange={onToggleSelected} aria-label={`Seleziona ${ticket.subject}`} />
      </TableCell>
      <TableCell><TipoChip tipo={ticket.tipo} /></TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <User className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="min-w-0">
            <p className="font-medium line-clamp-1">{ticket.subject}</p>
            <p className="text-xs text-muted-foreground">
              {ticket.customer?.first_name} {ticket.customer?.last_name}
              {ticket.fonte === "campo" && <span className="ml-2 text-amber-600">📍 campo</span>}
            </p>
          </div>
          {unreadCount !== undefined && unreadCount > 0 && (
            <span className="inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-primary text-primary-foreground text-xs font-bold shrink-0">
              {unreadCount}
            </span>
          )}
        </div>
      </TableCell>
      <TableCell>
        <Badge
          variant="outline"
          style={{ backgroundColor: priorityColor.bg, color: priorityColor.text, borderColor: priorityColor.border }}
        >
          {getTicketPriorityLabel(ticket.priority)}
        </Badge>
      </TableCell>
      <TableCell><ScadenzaCell iso={scadenza} /></TableCell>
      <TableCell>
        <TicketStatusSelect value={ticket.status} disabled={isUpdating} onChange={(value) => onStatusChange(ticket.id, value)} />
      </TableCell>
      <TableCell className="hidden lg:table-cell">
        <TicketAssigneeSelect
          value={ticket.assigned_to || UNASSIGNED_VALUE}
          staffList={staffList}
          disabled={isUpdating}
          onChange={(value) => onAssigneeChange(ticket.id, value)}
        />
      </TableCell>
      <TableCell className="hidden xl:table-cell">
        {ticket.order ? (
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <Package className="h-3.5 w-3.5" />
            <span className="line-clamp-1 max-w-[150px]">{ticket.order.description}</span>
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="hidden md:table-cell text-sm">
        {(() => {
          // Sulle lavorazioni aperte conta da quanto sono ferme, non la data in
          // sé: "5 mesi fa" non dice se qualcuno se ne sta occupando.
          const fermo = calcolaFermo(ticket as never);
          if (!fermo) {
            return (
              <span className="text-muted-foreground">
                {formatRelativeTime(ticket.last_message_at || ticket.updated_at)}
              </span>
            );
          }
          return (
            <span className={`text-xs ${CLASSI_FERMO[fermo.livello]}`} title={`Soglia ${fermo.soglia} giorni per priorità ${ticket.priority ?? "normale"}`}>
              {fermo.etichetta}
            </span>
          );
        })()}
      </TableCell>
      <TableCell>
        <Button variant="ghost" size="icon" asChild>
          <Link to={`/azienda/assistenza/${ticket.id}`}>
            <ChevronRight className="h-4 w-4" />
          </Link>
        </Button>
      </TableCell>
    </TableRow>
  );
}

function TicketStatusSelect({ value, disabled, onChange }: { value: string; disabled?: boolean; onChange: (value: string) => void }) {
  const statusColor = getTicketStatusColor(value);
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger
        className="h-8 w-[138px] border px-2 text-xs font-medium"
        style={{ backgroundColor: statusColor.bg, color: statusColor.text, borderColor: statusColor.border }}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="max-h-[380px]">
        <StatoOptionsRaggruppate />
      </SelectContent>
    </Select>
  );
}

function TicketAssigneeSelect({
  value,
  staffList,
  disabled,
  onChange,
}: {
  value: string;
  staffList: StaffUser[];
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className="h-8 w-[170px] px-2 text-xs">
        <SelectValue placeholder="Assegna" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={UNASSIGNED_VALUE}>Non assegnato</SelectItem>
        {staffList.map((staff) => (
          <SelectItem key={staff.id} value={staff.id}>
            {[staff.first_name, staff.last_name].filter(Boolean).join(" ") || "Senza nome"}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function TicketBulkActionsSheet({
  open,
  onOpenChange,
  selectedTickets,
  staffList,
  bulkStatus,
  onBulkStatusChange,
  bulkAssignee,
  onBulkAssigneeChange,
  onApply,
  onClear,
  isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedTickets: TicketListItem[];
  staffList: StaffUser[];
  bulkStatus: string;
  onBulkStatusChange: (value: string) => void;
  bulkAssignee: string;
  onBulkAssigneeChange: (value: string) => void;
  onApply: () => void;
  onClear: () => void;
  isPending: boolean;
}) {
  const selectedOpen = selectedTickets.filter((ticket) => !TICKET_STATI_CHIUSI.includes(ticket.status as never)).length;
  const selectedResolved = selectedTickets.length - selectedOpen;
  const linkedOrders = selectedTickets.filter((ticket) => ticket.order_id).length;
  const priorityCount = selectedTickets.filter((ticket) => ticket.priority === "urgente" || ticket.priority === "alta").length;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Azioni assistenza</SheetTitle>
          <SheetDescription>
            Cambia stato e responsabile dei ticket selezionati senza entrare uno per uno.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <BulkStat icon={<CheckSquare className="h-4 w-4" />} label="Selezionati" value={selectedTickets.length} />
            <BulkStat icon={<AlertCircle className="h-4 w-4" />} label="Aperti" value={selectedOpen} />
            <BulkStat icon={<BriefcaseBusiness className="h-4 w-4" />} label="Commesse" value={linkedOrders} />
            <BulkStat icon={<Euro className="h-4 w-4" />} label="Priorita alta" value={priorityCount} />
          </div>

          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              I costi assistenza si consolidano su commessa tramite rapportini, anomalie e consuntivi. Qui gestisci il flusso operativo: stato, responsabilita e chiusura.
            </AlertDescription>
          </Alert>

          <Separator />

          <div className="space-y-2">
            <label className="text-sm font-medium">Nuovo stato</label>
            <Select value={bulkStatus} onValueChange={onBulkStatusChange}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-[380px]">
                <SelectItem value={KEEP_VALUE}>Non cambiare stato</SelectItem>
                <StatoOptionsRaggruppate />
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Responsabile</label>
            <Select value={bulkAssignee} onValueChange={onBulkAssigneeChange}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={KEEP_VALUE}>Non cambiare responsabile</SelectItem>
                <SelectItem value={UNASSIGNED_VALUE}>Rimuovi assegnazione</SelectItem>
                {staffList.map((staff) => (
                  <SelectItem key={staff.id} value={staff.id}>
                    {[staff.first_name, staff.last_name].filter(Boolean).join(" ") || "Senza nome"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-lg border bg-muted/40 p-3 text-sm">
            <div className="font-medium">Riepilogo impatto</div>
            <p className="mt-1 text-muted-foreground">
              {selectedResolved} gia risolti/chiusi, {linkedOrders} con commessa collegata. La chiusura imposta anche la data effettiva intervento.
            </p>
          </div>
        </div>

        <SheetFooter className="mt-6 gap-2 sm:flex-col">
          <Button onClick={onApply} disabled={isPending || selectedTickets.length === 0}>
            {isPending ? "Aggiornamento..." : "Applica modifiche"}
          </Button>
          <Button variant="outline" onClick={onClear} disabled={isPending}>Svuota selezione</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function BulkStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <div className="mt-1 text-xl font-bold">{value}</div>
    </div>
  );
}

/** Una fila di pillole per il pannello filtri su telefono. */
function PilloleFiltro({ titolo, valore, onScegli, scelte }: {
  titolo: string;
  valore: string;
  onScegli: (v: string) => void;
  scelte: { value: string; label: string }[];
}) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{titolo}</p>
      <div className="flex flex-wrap gap-1.5">
        {scelte.map((c) => {
          const attiva = valore === c.value;
          return (
            <button
              key={c.value}
              type="button"
              onClick={() => onScegli(c.value)}
              aria-pressed={attiva}
              className={cn(
                "tap-compact h-8 rounded-full border px-3 text-xs font-medium transition-colors",
                attiva ? "border-slate-900 bg-slate-900 text-white" : "bg-background text-slate-700",
              )}
            >
              {c.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
