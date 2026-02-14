import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { MessageSquare, Search, LogIn, Building, Loader2, Calendar } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";

type TicketStatus = "aperto" | "in_lavorazione" | "risolto";

interface Ticket {
  id: string;
  subject: string;
  status: TicketStatus;
  created_at: string;
  updated_at: string;
  company: {
    id: string;
    name: string;
  };
  customer: {
    first_name: string;
    last_name: string;
    email: string;
  };
}

interface Company {
  id: string;
  name: string;
}

const statusConfig: Record<TicketStatus, { label: string; variant: "default" | "secondary" | "outline" }> = {
  aperto: { label: "Aperto", variant: "default" },
  in_lavorazione: { label: "In Lavorazione", variant: "secondary" },
  risolto: { label: "Risolto", variant: "outline" },
};

export default function GlobalTickets() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCompany, setSelectedCompany] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const { impersonateCompany } = useAuth();
  const navigate = useNavigate();

  const { data: tickets = [], isLoading: isLoadingTickets } = useQuery({
    queryKey: ["admin-global-tickets"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tickets")
        .select(`
          id,
          subject,
          status,
          created_at,
          updated_at,
          company:companies!tickets_company_id_fkey(id, name),
          customer:profiles!tickets_customer_id_fkey(first_name, last_name, email)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data ?? []) as unknown as Ticket[];
    },
    staleTime: 3 * 60 * 1000,
  });

  const { data: companies = [] } = useQuery({
    queryKey: ["admin-companies-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("id, name")
        .order("name");

      if (error) throw error;
      return (data ?? []) as Company[];
    },
    staleTime: 10 * 60 * 1000,
  });

  const isLoading = isLoadingTickets;

  const filteredTickets = useMemo(() => 
    tickets.filter((ticket) => {
      const matchesSearch =
        ticket.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
        `${ticket.customer.first_name} ${ticket.customer.last_name}`
          .toLowerCase()
          .includes(searchQuery.toLowerCase()) ||
        ticket.customer.email.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCompany = selectedCompany === "all" || ticket.company.id === selectedCompany;
      const matchesStatus = selectedStatus === "all" || ticket.status === selectedStatus;
      return matchesSearch && matchesCompany && matchesStatus;
    }),
    [tickets, searchQuery, selectedCompany, selectedStatus]
  );

  const handleImpersonate = async (companyId: string, ticketId: string) => {
    await impersonateCompany(companyId);
    navigate(`/azienda/assistenza/${ticketId}`);
  };

  const openTicketsCount = useMemo(
    () => tickets.filter((t) => t.status !== "risolto").length,
    [tickets]
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Ticket Globali</h1>
          <p className="text-muted-foreground">
            Gestisci tutte le richieste di assistenza della piattaforma
          </p>
        </div>
        {openTicketsCount > 0 && (
          <Badge variant="destructive" className="text-sm px-3 py-1">
            {openTicketsCount} ticket aperti
          </Badge>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Cerca per oggetto, cliente o email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={selectedCompany} onValueChange={setSelectedCompany}>
          <SelectTrigger className="w-full sm:w-[200px]">
            <Building className="h-4 w-4 mr-2 text-muted-foreground" />
            <SelectValue placeholder="Azienda" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutte le aziende</SelectItem>
            {companies.map((company) => (
              <SelectItem key={company.id} value={company.id}>
                {company.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={selectedStatus} onValueChange={setSelectedStatus}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Stato" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti gli stati</SelectItem>
            <SelectItem value="aperto">Aperto</SelectItem>
            <SelectItem value="in_lavorazione">In Lavorazione</SelectItem>
            <SelectItem value="risolto">Risolto</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Tickets Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : filteredTickets.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">Nessun ticket trovato</h3>
            <p className="text-muted-foreground text-center mt-2">
              {searchQuery || selectedCompany !== "all" || selectedStatus !== "all"
                ? "Prova a modificare i filtri di ricerca"
                : "Non ci sono ancora ticket di supporto"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Oggetto</TableHead>
                  <TableHead>Azienda</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Stato</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead className="text-right">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTickets.map((ticket) => (
                  <TableRow key={ticket.id}>
                    <TableCell>
                      <div className="max-w-[250px]">
                        <p className="font-medium truncate">{ticket.subject}</p>
                        <p className="text-xs text-muted-foreground">
                          {ticket.id.substring(0, 8)}...
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{ticket.company.name}</Badge>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium text-sm">
                          {ticket.customer.first_name} {ticket.customer.last_name}
                        </p>
                        <p className="text-xs text-muted-foreground">{ticket.customer.email}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusConfig[ticket.status].variant}>
                        {statusConfig[ticket.status].label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        {format(new Date(ticket.created_at), "dd MMM yyyy", { locale: it })}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleImpersonate(ticket.company.id, ticket.id)}
                      >
                        <LogIn className="h-4 w-4 mr-1" />
                        Gestisci
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Summary */}
      {!isLoading && filteredTickets.length > 0 && (
        <div className="text-sm text-muted-foreground">
          Mostrando {filteredTickets.length} ticket
          {selectedCompany !== "all" && ` per l'azienda selezionata`}
          {selectedStatus !== "all" && ` con stato "${statusConfig[selectedStatus as TicketStatus]?.label}"`}
        </div>
      )}
    </div>
  );
}