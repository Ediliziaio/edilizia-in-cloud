import React, { useState, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
  SelectValue,
} from "@/components/ui/select";
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
import { useCompanyStaffUsers } from "@/hooks/useCompanyStaffUsers";

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
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "2-digit" });
}

const TicketsList = React.forwardRef<HTMLDivElement>((_, ref) => {
  const { effectiveCompany } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [fonteFilter, setFonteFilter] = useState<string>("tutti");
  const [scadenzaFilter, setScadenzaFilter] = useState<string>("tutte");
  const [assegnatoFilter, setAssegnatoFilter] = useState<string>("tutti");
  // Filtro tipo da URL (?tipo=intervento) o default = all (retrocompatibilità redirect)
  const tipoFilter = searchParams.get("tipo") ?? "all";
  const setTipoFilter = (v: string) => {
    const next = new URLSearchParams(searchParams);
    if (v === "all") next.delete("tipo");
    else next.set("tipo", v);
    setSearchParams(next, { replace: true });
  };
  const { unreadByTicket, totalUnread } = useUnreadTicketCounts();

  const { data: queryResult, isLoading, isError, refetch } = useQuery({
    queryKey: [...queryKeys.companyTickets.list(effectiveCompany?.id), tipoFilter, statusFilter, priorityFilter],
    queryFn: async () => {
      let query = supabase
        .from("tickets")
        .select(`
          id, subject, status, priority, fonte, tipo, created_at, updated_at, last_message_at,
          order_id, assigned_to, category,
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
      if (statusFilter !== "all") query = query.eq("status", statusFilter);
      if (priorityFilter !== "all") query = query.eq("priority", priorityFilter);

      const { data, error, count } = await query.range(0, 499);
      if (error) throw error;
      return { tickets: data as unknown as TicketListItem[], totalCount: count ?? 0 };
    },
    enabled: !!effectiveCompany?.id,
    staleTime: 2 * 60 * 1000,
  });

  const tickets = queryResult?.tickets ?? [];

  const { data: staffList = [] } = useCompanyStaffUsers(effectiveCompany?.id);

  // Filtri client-side: fonte, scadenza, assegnato, ricerca testuale
  const filteredTickets = useMemo(() => tickets.filter((ticket) => {
    if (fonteFilter !== "tutti" && ticket.fonte !== fonteFilter) return false;
    if (assegnatoFilter === "unassigned" && ticket.assigned_to) return false;
    if (assegnatoFilter !== "tutti" && assegnatoFilter !== "unassigned" && ticket.assigned_to !== assegnatoFilter) return false;

    if (scadenzaFilter !== "tutte") {
      const bucket = bucketScadenza((ticket as unknown as { data_intervento_prevista?: string }).data_intervento_prevista);
      if (scadenzaFilter === "scaduto_oggi" && !(bucket === "scaduto" || bucket === "oggi")) return false;
      if (scadenzaFilter === "settimana" && bucket !== "settimana") return false;
      if (scadenzaFilter === "futuro" && bucket !== "futuro") return false;
      if (scadenzaFilter === "senza" && bucket !== "nessuna") return false;
    }

    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      ticket.subject.toLowerCase().includes(q) ||
      ticket.customer?.first_name?.toLowerCase().includes(q) ||
      ticket.customer?.last_name?.toLowerCase().includes(q) ||
      ticket.customer?.email?.toLowerCase().includes(q)
    );
  }), [tickets, fonteFilter, assegnatoFilter, scadenzaFilter, searchQuery]);

  // Metriche aggregate (basate su TUTTI i ticket azienda, non filtrati)
  const metrics = useMemo(() => {
    const aperti = tickets.filter(t => t.status === "aperto" || t.status === "in_lavorazione").length;
    const urgenti = tickets.filter(t => (t.priority === "urgente" || t.priority === "alta") && t.status !== "risolto" && t.status !== "chiuso").length;
    const inScadenza = tickets.filter(t => {
      if (t.status === "risolto" || t.status === "chiuso") return false;
      const b = bucketScadenza((t as unknown as { data_intervento_prevista?: string }).data_intervento_prevista);
      return b === "scaduto" || b === "oggi" || b === "settimana";
    }).length;
    const nonAssegnati = tickets.filter(t => !t.assigned_to && t.status !== "risolto" && t.status !== "chiuso").length;
    const risolti = tickets.filter(t => t.status === "risolto").length;
    return { totale: tickets.length, aperti, urgenti, inScadenza, nonAssegnati, risolti };
  }, [tickets]);

  const statusCounts = useMemo(() => ({
    all: tickets.length,
    aperto: tickets.filter(t => t.status === "aperto").length,
    in_lavorazione: tickets.filter(t => t.status === "in_lavorazione").length,
    risolto: tickets.filter(t => t.status === "risolto").length,
  }), [tickets]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-32 w-full" />
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
    <div ref={ref} className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Assistenza</h1>
          <p className="text-muted-foreground">
            Supporto clienti, interventi sul campo e chiamate di emergenza — in un'unica vista.
          </p>
        </div>
        <div className="flex items-center gap-2">
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
              scadenza: (t as unknown as { data_intervento_prevista?: string }).data_intervento_prevista ?? "",
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
          <Button asChild>
            <Link to="/azienda/assistenza/nuovo">
              <Plus className="mr-2 h-4 w-4" />
              <span className="sm:hidden">Nuovo</span>
              <span className="hidden sm:inline">Nuovo Ticket</span>
            </Link>
          </Button>
        </div>
      </div>

      {/* Tab tipo (supporto / intervento / emergenza / tutti) */}
      <div className="flex gap-1 border-b overflow-x-auto">
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
                "flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap",
                active
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
              )}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* KPI metrics — 5 card sempre visibili, clickable come filtri veloci */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard
          icon={<ClipboardList className="h-4 w-4" />}
          label="Totale"
          value={metrics.totale}
          accent="bg-primary/10 text-primary"
          badge={totalUnread > 0 ? totalUnread : undefined}
          active={statusFilter === "all"}
          onClick={() => setStatusFilter("all")}
        />
        <KpiCard
          icon={<MessageSquare className="h-4 w-4" />}
          label="Aperti"
          value={metrics.aperti}
          accent="bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
          active={statusFilter === "aperto"}
          onClick={() => setStatusFilter(statusFilter === "aperto" ? "all" : "aperto")}
        />
        <KpiCard
          icon={<AlertTriangle className="h-4 w-4" />}
          label="Urgenti / Alta"
          value={metrics.urgenti}
          accent="bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
          active={priorityFilter === "urgente" || priorityFilter === "alta"}
          onClick={() => setPriorityFilter(priorityFilter === "urgente" ? "all" : "urgente")}
        />
        <KpiCard
          icon={<CalendarClock className="h-4 w-4" />}
          label="In scadenza"
          value={metrics.inScadenza}
          accent="bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
          active={scadenzaFilter === "scaduto_oggi" || scadenzaFilter === "settimana"}
          onClick={() => setScadenzaFilter(scadenzaFilter === "scaduto_oggi" ? "tutte" : "scaduto_oggi")}
        />
        <KpiCard
          icon={<UserX className="h-4 w-4" />}
          label="Non assegnati"
          value={metrics.nonAssegnati}
          accent="bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300"
          active={assegnatoFilter === "unassigned"}
          onClick={() => setAssegnatoFilter(assegnatoFilter === "unassigned" ? "tutti" : "unassigned")}
        />
      </div>

      {/* Filters row */}
      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Cerca per cliente, oggetto o email…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground shrink-0 hidden sm:block" />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="flex-1 sm:w-[170px] sm:flex-none"><SelectValue placeholder="Stato" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti gli stati ({statusCounts.all})</SelectItem>
              <SelectItem value="aperto">Aperti ({statusCounts.aperto})</SelectItem>
              <SelectItem value="in_lavorazione">In Lavorazione ({statusCounts.in_lavorazione})</SelectItem>
              <SelectItem value="risolto">Risolti ({statusCounts.risolto})</SelectItem>
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
        </div>
      </div>

      {/* Tickets Table */}
      {filteredTickets.length === 0 ? (
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
            {filteredTickets.map((ticket) => <MobileTicketRow key={ticket.id} ticket={ticket} unreadCount={unreadByTicket[ticket.id]} />)}
          </div>

          {/* Desktop table */}
          <div className="hidden sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">Tipo</TableHead>
                  <TableHead>Cliente · Oggetto</TableHead>
                  <TableHead>Priorità</TableHead>
                  <TableHead>Scadenza</TableHead>
                  <TableHead>Stato</TableHead>
                  <TableHead className="hidden lg:table-cell">Assegnato</TableHead>
                  <TableHead className="hidden xl:table-cell">Ordine</TableHead>
                  <TableHead className="hidden md:table-cell">Aggiornato</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTickets.map((ticket) => <DesktopTicketRow key={ticket.id} ticket={ticket} unreadCount={unreadByTicket[ticket.id]} />)}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </div>
  );
});
TicketsList.displayName = "TicketsList";
export default TicketsList;

// =============================================================================
// Componenti atomici
// =============================================================================

function KpiCard({ icon, label, value, accent, badge, active, onClick }: {
  icon: React.ReactNode;
  label: string;
  value: number;
  accent: string;
  badge?: number;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <Card
      className={cn(
        "transition-all",
        onClick && "cursor-pointer hover:shadow-md",
        active && "ring-2 ring-primary/50"
      )}
      onClick={onClick}
    >
      <CardContent className="p-3 sm:p-4 flex items-center gap-3">
        <div className={cn("p-2 rounded-lg shrink-0", accent)}>{icon}</div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] sm:text-xs text-muted-foreground truncate">{label}</p>
          <div className="flex items-center gap-1.5">
            <p className="text-lg sm:text-2xl font-bold">{value}</p>
            {badge !== undefined && badge > 0 && (
              <span className="inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-primary text-primary-foreground text-xs font-bold">
                {badge}
              </span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
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
  return (
    <Badge variant="outline" className={cn("text-[11px] font-medium", styles[bucket])}>
      {labelPrefix[bucket] ? <span className="mr-1">{labelPrefix[bucket]} ·</span> : null}
      {formatScadenza(iso)}
    </Badge>
  );
}

function MobileTicketRow({ ticket, unreadCount }: { ticket: TicketListItem; unreadCount: number | undefined }) {
  const statusColor = getTicketStatusColor(ticket.status);
  const priorityColor = getTicketPriorityColor(ticket.priority);
  const scadenza = (ticket as unknown as { data_intervento_prevista?: string }).data_intervento_prevista;
  return (
    <Link
      to={`/azienda/assistenza/${ticket.id}`}
      className="flex items-start justify-between gap-3 px-4 py-3 hover:bg-muted/50 active:bg-muted transition-colors"
    >
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <TipoChip tipo={ticket.tipo} />
          <span className="font-semibold text-sm line-clamp-1">{ticket.subject}</span>
          {unreadCount !== undefined && unreadCount > 0 && (
            <span className="inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold shrink-0">
              {unreadCount}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {ticket.customer?.first_name} {ticket.customer?.last_name}
        </p>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <span>{formatRelativeTime(ticket.last_message_at || ticket.updated_at)}</span>
          {scadenza && <ScadenzaCell iso={scadenza} />}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <Badge
          variant="outline"
          className="text-[10px] px-1.5 py-0"
          style={{ backgroundColor: statusColor.bg, color: statusColor.text, borderColor: statusColor.border }}
        >
          {getTicketStatusLabel(ticket.status)}
        </Badge>
        <Badge
          variant="outline"
          className="text-[10px] px-1.5 py-0"
          style={{ backgroundColor: priorityColor.bg, color: priorityColor.text, borderColor: priorityColor.border }}
        >
          {getTicketPriorityLabel(ticket.priority)}
        </Badge>
      </div>
    </Link>
  );
}

function DesktopTicketRow({ ticket, unreadCount }: { ticket: TicketListItem; unreadCount: number | undefined }) {
  const statusColor = getTicketStatusColor(ticket.status);
  const priorityColor = getTicketPriorityColor(ticket.priority);
  const scadenza = (ticket as unknown as { data_intervento_prevista?: string }).data_intervento_prevista;
  const isUrgent = ticket.priority === "urgente";
  const bucketS = bucketScadenza(scadenza);
  const isOverdue = (bucketS === "scaduto" || bucketS === "oggi") && ticket.status !== "risolto" && ticket.status !== "chiuso";
  return (
    <TableRow className={cn(isUrgent && "bg-red-50/50 dark:bg-red-950/10", isOverdue && !isUrgent && "bg-orange-50/50 dark:bg-orange-950/10")}>
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
        <Badge
          variant="outline"
          style={{ backgroundColor: statusColor.bg, color: statusColor.text, borderColor: statusColor.border }}
        >
          {getTicketStatusLabel(ticket.status)}
        </Badge>
      </TableCell>
      <TableCell className="hidden lg:table-cell">
        {ticket.assignee ? (
          <span className="text-sm">
            {ticket.assignee.first_name} {ticket.assignee.last_name}
          </span>
        ) : (
          <Badge variant="outline" className="text-[10px] text-muted-foreground">Non assegnato</Badge>
        )}
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
      <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
        {formatRelativeTime(ticket.last_message_at || ticket.updated_at)}
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
