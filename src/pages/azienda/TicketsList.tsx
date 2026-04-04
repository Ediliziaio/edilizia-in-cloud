import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
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
} from "lucide-react";
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

const TicketsList = React.forwardRef<HTMLDivElement>((_, ref) => {
  const { effectiveCompany } = useAuth();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const { unreadByTicket, totalUnread } = useUnreadTicketCounts();

  const { data: queryResult, isLoading, isError, refetch } = useQuery({
    queryKey: [...queryKeys.companyTickets.list(effectiveCompany?.id), statusFilter, priorityFilter],
    queryFn: async () => {
      let query = supabase
        .from("tickets")
        .select(`
          id, subject, status, priority, created_at, updated_at, last_message_at,
          order_id, assigned_to, category,
          customer:profiles!tickets_customer_id_fkey(first_name, last_name, email),
          order:orders(description),
          assignee:profiles!tickets_assigned_to_fkey(first_name, last_name)
        `, { count: "exact" })
        .eq("company_id", effectiveCompany?.id ?? "")
        .order("last_message_at", { ascending: false, nullsFirst: false });

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }
      if (priorityFilter !== "all") {
        query = query.eq("priority", priorityFilter);
      }

      const { data, error, count } = await query.range(0, 199);

      if (error) throw error;
      return { tickets: data as unknown as TicketListItem[], totalCount: count ?? 0 };
    },
    enabled: !!effectiveCompany?.id,
    staleTime: 2 * 60 * 1000,
  });

  const tickets = queryResult?.tickets ?? [];

  const filteredTickets = tickets.filter((ticket) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      ticket.subject.toLowerCase().includes(query) ||
      ticket.customer?.first_name?.toLowerCase().includes(query) ||
      ticket.customer?.last_name?.toLowerCase().includes(query) ||
      ticket.customer?.email?.toLowerCase().includes(query)
    );
  });

  const statusCounts = {
    all: tickets.length,
    aperto: tickets.filter((t) => t.status === "aperto").length,
    in_lavorazione: tickets.filter((t) => t.status === "in_lavorazione").length,
    risolto: tickets.filter((t) => t.status === "risolto").length,
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
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
          <p className="text-muted-foreground">Gestisci i ticket di supporto dei clienti</p>
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
            Gestisci i ticket di supporto dei clienti
          </p>
        </div>
        <Button asChild>
          <Link to="/azienda/assistenza/nuovo">
            <Plus className="mr-2 h-4 w-4" />
            <span className="sm:hidden">Nuovo</span>
            <span className="hidden sm:inline">Crea Ticket</span>
          </Link>
        </Button>
      </div>

      {/* Tab switcher tipo */}
      <div className="flex gap-2 border-b pb-2">
        <button
          className="px-4 py-1.5 rounded-t text-sm font-medium border-b-2 border-primary text-primary bg-primary/5"
          aria-current="page"
        >
          Supporto
        </button>
        <button
          className="px-4 py-1.5 rounded-t text-sm font-medium text-gray-500 hover:text-gray-800 hover:bg-gray-100 border-b-2 border-transparent"
          onClick={() => navigate("/azienda/interventi?tipo=intervento")}
        >
          Interventi
        </button>
        <button
          className="px-4 py-1.5 rounded-t text-sm font-medium text-gray-500 hover:text-gray-800 hover:bg-gray-100 border-b-2 border-transparent"
          onClick={() => navigate("/azienda/interventi?tipo=emergenza")}
        >
          Emergenze
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="cursor-pointer hover:bg-muted/50" onClick={() => setStatusFilter("all")}>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Totale</p>
            <div className="flex items-center gap-2">
              <p className="text-2xl font-bold">{statusCounts.all}</p>
              {totalUnread > 0 && (
                <span className="inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-primary text-primary-foreground text-xs font-bold">
                  {totalUnread}
                </span>
              )}
            </div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:bg-muted/50" onClick={() => setStatusFilter("aperto")}>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Aperti</p>
            <p className="text-2xl font-bold text-primary">{statusCounts.aperto}</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:bg-muted/50" onClick={() => setStatusFilter("in_lavorazione")}>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">In Lavorazione</p>
            <p className="text-2xl font-bold" style={{ color: "hsl(45 93% 47%)" }}>{statusCounts.in_lavorazione}</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:bg-muted/50" onClick={() => setStatusFilter("risolto")}>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Risolti</p>
            <p className="text-2xl font-bold" style={{ color: "hsl(142 76% 36%)" }}>{statusCounts.risolto}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Cerca per cliente o oggetto..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground shrink-0 hidden sm:block" />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="flex-1 sm:w-[180px] sm:flex-none">
              <SelectValue placeholder="Stato" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti ({statusCounts.all})</SelectItem>
              <SelectItem value="aperto">Aperti ({statusCounts.aperto})</SelectItem>
              <SelectItem value="in_lavorazione">In Lavorazione ({statusCounts.in_lavorazione})</SelectItem>
              <SelectItem value="risolto">Risolti ({statusCounts.risolto})</SelectItem>
            </SelectContent>
          </Select>
          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className="flex-1 sm:w-[150px] sm:flex-none">
              <SelectValue placeholder="Priorità" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutte</SelectItem>
              <SelectItem value="bassa">Bassa</SelectItem>
              <SelectItem value="normale">Normale</SelectItem>
              <SelectItem value="alta">Alta</SelectItem>
              <SelectItem value="urgente">Urgente</SelectItem>
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
              {searchQuery || statusFilter !== "all" || priorityFilter !== "all"
                ? "Prova a modificare i filtri di ricerca"
                : "Non ci sono ancora ticket di assistenza"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          {/* Mobile card list */}
          <div className="sm:hidden divide-y">
            {filteredTickets.map((ticket) => {
              const statusColor = getTicketStatusColor(ticket.status);
              const priorityColor = getTicketPriorityColor(ticket.priority);
              return (
                <Link
                  key={ticket.id}
                  to={`/azienda/assistenza/${ticket.id}`}
                  className="flex items-start justify-between gap-3 px-4 py-3 hover:bg-muted/50 active:bg-muted transition-colors"
                >
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm line-clamp-1">{ticket.subject}</span>
                      {unreadByTicket[ticket.id] > 0 && (
                        <span className="inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold shrink-0">
                          {unreadByTicket[ticket.id]}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {ticket.customer?.first_name} {ticket.customer?.last_name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatRelativeTime(ticket.last_message_at || ticket.updated_at)}
                    </p>
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
            })}
          </div>

          {/* Desktop table */}
          <div className="hidden sm:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Oggetto</TableHead>
                <TableHead className="hidden sm:table-cell">Priorità</TableHead>
                <TableHead className="hidden lg:table-cell">Ordine</TableHead>
                <TableHead>Stato</TableHead>
                <TableHead className="hidden md:table-cell">Assegnato a</TableHead>
                <TableHead className="hidden md:table-cell">Aggiornato</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTickets.map((ticket) => {
                const statusColor = getTicketStatusColor(ticket.status);
                const priorityColor = getTicketPriorityColor(ticket.priority);
                return (
                  <TableRow key={ticket.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="font-medium">
                            {ticket.customer?.first_name} {ticket.customer?.last_name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {ticket.customer?.email}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <p className="font-medium line-clamp-1">{ticket.subject}</p>
                        {unreadByTicket[ticket.id] > 0 && (
                          <span className="inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-primary text-primary-foreground text-xs font-bold shrink-0">
                            {unreadByTicket[ticket.id]}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <Badge
                        variant="outline"
                        style={{
                          backgroundColor: priorityColor.bg,
                          color: priorityColor.text,
                          borderColor: priorityColor.border,
                        }}
                      >
                        {getTicketPriorityLabel(ticket.priority)}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {ticket.order ? (
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Package className="h-3.5 w-3.5" />
                          <span className="line-clamp-1 max-w-[150px]">
                            {ticket.order.description}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        style={{
                          backgroundColor: statusColor.bg,
                          color: statusColor.text,
                          borderColor: statusColor.border,
                        }}
                      >
                        {getTicketStatusLabel(ticket.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {ticket.assignee ? (
                        <span className="text-sm">
                          {ticket.assignee.first_name} {ticket.assignee.last_name}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
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
              })}
            </TableBody>
          </Table>
          </div>{/* end hidden sm:block */}
        </Card>
      )}
    </div>
  );
});
TicketsList.displayName = "TicketsList";
export default TicketsList;
