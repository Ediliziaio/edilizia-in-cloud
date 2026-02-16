import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { formatRelativeTime, getTicketStatusColor, getTicketStatusLabel } from "@/lib/formatters";
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
    queryKey: ["customer-tickets", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tickets")
        .select(`id, subject, status, created_at, updated_at, order_id, order:orders(description)`)
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
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Assistenza</h1>
          <p className="text-muted-foreground">I tuoi ticket di supporto</p>
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
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Assistenza</h1>
          <p className="text-muted-foreground">I tuoi ticket di supporto</p>
        </div>
        <Button asChild>
          <Link to="/cliente/assistenza/nuovo">
            <Plus className="mr-2 h-4 w-4" />
            Nuovo Ticket
          </Link>
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
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
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <MessageSquare className="h-16 w-16 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium mb-2">
              {statusFilter === "all" 
                ? "Nessun ticket di assistenza" 
                : `Nessun ticket ${getTicketStatusLabel(statusFilter as TicketStatus).toLowerCase()}`}
            </h3>
            <p className="text-muted-foreground text-center max-w-md mb-4">
              {statusFilter === "all"
                ? "Hai bisogno di aiuto? Apri un nuovo ticket di assistenza."
                : "Prova a cambiare il filtro per vedere altri ticket."}
            </p>
            {statusFilter === "all" && (
              <Button asChild>
                <Link to="/cliente/assistenza/nuovo">
                  <Plus className="mr-2 h-4 w-4" />
                  Nuovo Ticket
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredTickets.map((ticket) => {
            const statusColor = getTicketStatusColor(ticket.status);
            return (
              <Card key={ticket.id} className="overflow-hidden hover:shadow-md transition-shadow">
                <Link to={`/cliente/assistenza/${ticket.id}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 space-y-2">
                        <div className="flex items-start gap-3">
                          <MessageSquare className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
                          <div className="flex-1">
                            <h3 className="font-medium line-clamp-1">{ticket.subject}</h3>
                            {ticket.order && (
                              <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                                <Package className="h-3.5 w-3.5" />
                                <span className="line-clamp-1">{ticket.order.description}</span>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 ml-8">
                          <Badge variant="outline" style={{ backgroundColor: statusColor.bg, color: statusColor.text, borderColor: statusColor.border }}>
                            {getTicketStatusLabel(ticket.status)}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            Aggiornato {formatRelativeTime(ticket.updated_at)}
                          </span>
                        </div>
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                    </div>
                  </CardContent>
                </Link>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
