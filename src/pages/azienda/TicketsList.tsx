import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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

const TicketsList = React.forwardRef<HTMLDivElement>((_, ref) => {
  const { effectiveCompany } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");

  const { data: tickets = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["company-tickets", effectiveCompany?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tickets")
        .select(`
          id, subject, status, priority, created_at, updated_at, last_message_at,
          order_id, assigned_to, category,
          customer:profiles!tickets_customer_id_fkey(first_name, last_name, email),
          order:orders(description),
          assignee:profiles!tickets_assigned_to_fkey(first_name, last_name)
        `)
        .eq("company_id", effectiveCompany!.id)
        .order("last_message_at", { ascending: false, nullsFirst: false });

      if (error) throw error;
      return data as unknown as TicketListItem[];
    },
    enabled: !!effectiveCompany?.id,
    staleTime: 2 * 60 * 1000,
  });

  const filteredTickets = tickets.filter((ticket) => {
    const query = searchQuery.toLowerCase();
    const matchesSearch =
      ticket.subject.toLowerCase().includes(query) ||
      ticket.customer?.first_name?.toLowerCase().includes(query) ||
      ticket.customer?.last_name?.toLowerCase().includes(query) ||
      ticket.customer?.email?.toLowerCase().includes(query);
    const matchesStatus = statusFilter === "all" || ticket.status === statusFilter;
    const matchesPriority = priorityFilter === "all" || ticket.priority === priorityFilter;
    return matchesSearch && matchesStatus && matchesPriority;
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
            Crea Ticket
          </Link>
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="cursor-pointer hover:bg-muted/50" onClick={() => setStatusFilter("all")}>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Totale</p>
            <p className="text-2xl font-bold">{statusCounts.all}</p>
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
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Cerca per cliente o oggetto..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
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
            <SelectTrigger className="w-[150px]">
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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Oggetto</TableHead>
                <TableHead>Priorità</TableHead>
                <TableHead>Ordine</TableHead>
                <TableHead>Stato</TableHead>
                <TableHead>Assegnato a</TableHead>
                <TableHead>Aggiornato</TableHead>
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
                      <p className="font-medium line-clamp-1">{ticket.subject}</p>
                    </TableCell>
                    <TableCell>
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
                    <TableCell>
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
                    <TableCell>
                      {ticket.assignee ? (
                        <span className="text-sm">
                          {ticket.assignee.first_name} {ticket.assignee.last_name}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
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
        </Card>
      )}
    </div>
  );
});
TicketsList.displayName = "TicketsList";
export default TicketsList;
