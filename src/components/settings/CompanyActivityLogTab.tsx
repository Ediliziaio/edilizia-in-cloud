import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, RefreshCw, ScrollText, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { DateRangeFilter } from "@/components/orders/DateRangeFilter";

const PAGE_SIZE = 20;

const actionLabels: Record<string, string> = {
  create_order: "Ordine Creato",
  update_order: "Ordine Modificato",
  delete_order: "Ordine Eliminato",
  update_order_status: "Cambio Stato",
  create_customer: "Cliente Creato",
  update_customer: "Cliente Modificato",
  create_supplier: "Fornitore Creato",
  update_supplier: "Fornitore Modificato",
  delete_supplier: "Fornitore Eliminato",
  create_employee: "Dipendente Creato",
  update_employee: "Dipendente Modificato",
  update_settings: "Modifica Impostazioni",
};

const actionColors: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  create_order: "default",
  update_order: "secondary",
  delete_order: "destructive",
  update_order_status: "outline",
  create_customer: "default",
  update_customer: "secondary",
  create_supplier: "default",
  update_supplier: "secondary",
  delete_supplier: "destructive",
  create_employee: "default",
  update_employee: "secondary",
  update_settings: "outline",
};

export default function CompanyActivityLogTab() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const [page, setPage] = useState(0);
  const [actionFilter, setActionFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({ from: undefined, to: undefined });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: queryKeys.activityLog.list(companyId, page, actionFilter, dateRange.from?.toISOString(), dateRange.to?.toISOString()),
    queryFn: async () => {
      if (!companyId) throw new Error("No company");
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let query = supabase
        .from("company_activity_log")
        .select("*", { count: "exact" })
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .range(from, to);

      if (actionFilter !== "all") {
        query = query.eq("action", actionFilter);
      }
      if (dateRange.from) {
        query = query.gte("created_at", dateRange.from.toISOString());
      }
      if (dateRange.to) {
        query = query.lte("created_at", dateRange.to.toISOString());
      }

      const { data, error, count } = await query;
      if (error) throw error;

      const userIds = [...new Set((data || []).map((l: any) => l.user_id))];
      let profiles: Record<string, string> = {};
      if (userIds.length > 0) {
        const { data: profileData } = await supabase
          .from("profiles")
          .select("id, first_name, last_name")
          .in("id", userIds);
        (profileData || []).forEach((p: any) => {
          profiles[p.id] = `${p.first_name} ${p.last_name}`;
        });
      }

      return { logs: data || [], total: count || 0, profiles };
    },
    enabled: !!companyId,
    staleTime: 30_000,
  });

  const filteredLogs = useMemo(() => {
    if (!data?.logs || !searchQuery.trim()) return data?.logs || [];
    const q = searchQuery.toLowerCase();
    return data.logs.filter((log: any) => {
      const userName = (data.profiles[log.user_id] || "").toLowerCase();
      const details = log.details as Record<string, any> | null;
      const detailStr = (details?.name || details?.description || details?.order_code || log.target_id || "").toLowerCase();
      return userName.includes(q) || detailStr.includes(q);
    });
  }, [data, searchQuery]);

  const totalPages = Math.ceil((data?.total || 0) / PAGE_SIZE);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <ScrollText className="h-5 w-5 text-primary" />
          <CardTitle>Registro Attività</CardTitle>
        </div>
        <Button variant="outline" size="icon" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Cerca utente o dettaglio..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <DateRangeFilter
            label="Periodo"
            range={dateRange}
            onRangeChange={(r) => { setDateRange(r); setPage(0); }}
          />
          <Select value={actionFilter} onValueChange={(v) => { setActionFilter(v); setPage(0); }}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Filtra azione" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutte le azioni</SelectItem>
              {Object.entries(actionLabels).map(([key, label]) => (
                <SelectItem key={key} value={key}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : isError ? (
          <div className="text-center py-8 text-muted-foreground">
            Errore nel caricamento.{" "}
            <Button variant="link" onClick={() => refetch()}>Riprova</Button>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <ScrollText className="h-10 w-10 mb-3 opacity-40" />
            <p className="font-medium">Nessuna attività registrata</p>
            <p className="text-sm mt-1">Le azioni svolte nell'azienda appariranno qui.</p>
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Utente</TableHead>
                  <TableHead>Azione</TableHead>
                  <TableHead>Dettaglio</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.map((log: any) => {
                  const details = log.details as Record<string, any> | null;
                  return (
                    <TableRow key={log.id}>
                      <TableCell className="text-sm whitespace-nowrap">
                        {format(new Date(log.created_at), "dd/MM/yyyy HH:mm", { locale: it })}
                      </TableCell>
                      <TableCell className="text-sm">
                        {data!.profiles[log.user_id] || "Sistema"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={actionColors[log.action] || "outline"}>
                          {actionLabels[log.action] || log.action}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[300px] truncate">
                        {details?.name || details?.description || details?.order_code || log.target_id || "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <p className="text-sm text-muted-foreground">
                  Pagina {page + 1} di {totalPages} ({data?.total} risultati)
                </p>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
