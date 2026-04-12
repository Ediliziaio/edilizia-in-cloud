import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  MessageSquare,
  Plus,
  ChevronRight,
  Filter,
  Package,
  AlertCircle,
  RefreshCw
} from "lucide-react";
import { formatRelativeTime, getTicketStatusColor, getTicketStatusLabel, getTicketPriorityColor, getTicketPriorityLabel } from "@/lib/formatters";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CustomerTicketListItem, TicketStatus } from "@/types/tickets";

export default function CustomerSupport() {
  const { user } = useAuth();
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: tickets = [], isLoading, isError, refetch } = useQuery({
    queryKey: queryKeys.customerSupport.list(user?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tickets")
        .select(`id, subject, status, priority, created_at, updated_at, order_id, order:orders(description)`)
        .eq("customer_id", user!.id)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data as unknown as CustomerTicketListItem[];
    },
    enabled: !!user,
    staleTime: 2 * 60 * 1000,
  });

  const filteredTickets = tickets.filter((ticket) => {
    if (statusFilter === "all") return true;
    return ticket.status === statusFilter;
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <div className="space-y-4">
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-24 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Assistenza</h1>
          <p className="text-sm text-muted-foreground mt-0.5">I tuoi ticket di supporto</p>
        </div>
        <Alert variant="destructive" className="rounded-2xl">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            Errore nel caricamento dei ticket.
            <Button variant="outline" size="sm" onClick={() => refetch()} className="rounded-xl">
              <RefreshCw className="h-4 w-4 mr-2" /> Riprova
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const statusBorderColor: Record<string, string> = {
    aperto: "border-l-blue-500",
    in_lavorazione: "border-l-amber-500",
    risolto: "border-l-emerald-500",
    chiuso: "border-l-slate-400",
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold tracking-tight">Assistenza</h1>
        <p className="text-sm text-muted-foreground mt-0.5">I tuoi ticket di supporto</p>
      </div>

      {/* New Ticket Button */}
      <Button asChild className="w-full rounded-2xl py-3.5 h-auto text-base font-semibold">
        <Link to="/cliente/assistenza/nuovo">
          <Plus className="mr-2 h-5 w-5" />
          Nuovo Ticket
        </Link>
      </Button>

      {/* Filter */}
      <div className="flex items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px] rounded-xl">
            <SelectValue placeholder="Filtra per stato" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti</SelectItem>
            <SelectItem value="aperto">Aperti</SelectItem>
            <SelectItem value="in_lavorazione">In Lavorazione</SelectItem>
            <SelectItem value="risolto">Risolti</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filteredTickets.length === 0 ? (
        <div className="bg-background border border-border/60 rounded-2xl p-8 flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
            <MessageSquare className="h-8 w-8 text-muted-foreground/40" />
          </div>
          <h3 className="text-base font-semibold mb-1">
            {statusFilter === "all"
              ? "Nessun ticket di assistenza"
              : `Nessun ticket ${getTicketStatusLabel(statusFilter as TicketStatus).toLowerCase()}`}
          </h3>
          <p className="text-sm text-muted-foreground max-w-xs mb-4">
            {statusFilter === "all"
              ? "Hai bisogno di aiuto? Apri un nuovo ticket di assistenza."
              : "Prova a cambiare il filtro per vedere altri ticket."}
          </p>
          {statusFilter === "all" && (
            <Button asChild className="rounded-2xl">
              <Link to="/cliente/assistenza/nuovo">
                <Plus className="mr-2 h-4 w-4" />
                Nuovo Ticket
              </Link>
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
            {filteredTickets.length} {filteredTickets.length === 1 ? "ticket" : "ticket"}
          </p>
          {filteredTickets.map((ticket) => {
            const statusColor = getTicketStatusColor(ticket.status);
            const priorityColor = getTicketPriorityColor(ticket.priority);
            const borderColor = statusBorderColor[ticket.status] || "border-l-slate-300";
            return (
              <Link key={ticket.id} to={`/cliente/assistenza/${ticket.id}`} className="block">
                <div className={`bg-background border border-border/60 rounded-2xl border-l-4 ${borderColor} p-4 active:scale-[0.98] transition-all`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0 space-y-2">
                      <h3 className="font-medium text-sm line-clamp-2">{ticket.subject}</h3>
                      {ticket.order && (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Package className="h-3.5 w-3.5 shrink-0" />
                          <span className="line-clamp-1">{ticket.order.description}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                          style={{ backgroundColor: statusColor.bg, color: statusColor.text, border: `1px solid ${statusColor.border}` }}
                        >
                          {getTicketStatusLabel(ticket.status)}
                        </span>
                        <span
                          className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                          style={{ backgroundColor: priorityColor.bg, color: priorityColor.text, border: `1px solid ${priorityColor.border}` }}
                        >
                          {getTicketPriorityLabel(ticket.priority)}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          Aggiornato {formatRelativeTime(ticket.updated_at)}
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground/50 shrink-0 mt-0.5" />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
