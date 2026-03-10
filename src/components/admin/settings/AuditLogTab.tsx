import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
import { useDebounce } from "@/hooks/useDebounce";

const PAGE_SIZE = 20;

const actionLabels: Record<string, string> = {
  create_admin: "Creazione Admin",
  delete_admin: "Eliminazione Admin",
  reset_password: "Reset Password",
  update_permissions: "Modifica Permessi",
  impersonate_company: "Impersonazione Azienda",
  sign_in_as_user: "Accesso come Utente",
  return_from_impersonation: "Ritorno da Impersonazione",
  update_platform_settings: "Modifica Impostazioni Piattaforma",
  update_settings: "Modifica Impostazioni",
  change_plan: "Cambio Piano",
  extend_trial: "Estensione Trial",
  suspend_company: "Sospensione Azienda",
  reactivate_company: "Riattivazione Azienda",
};

const actionColors: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  create_admin: "default",
  delete_admin: "destructive",
  reset_password: "secondary",
  update_permissions: "outline",
  impersonate_company: "secondary",
  sign_in_as_user: "secondary",
  return_from_impersonation: "outline",
  update_platform_settings: "outline",
  update_settings: "outline",
  change_plan: "default",
  extend_trial: "default",
  suspend_company: "destructive",
  reactivate_company: "default",
};

export default function AuditLogTab() {
  const [page, setPage] = useState(0);
  const [actionFilter, setActionFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({ from: undefined, to: undefined });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin-audit-log", page, actionFilter, dateRange.from?.toISOString(), dateRange.to?.toISOString()],
    queryFn: async () => {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let query = supabase
        .from("admin_audit_log")
        .select("*", { count: "exact" })
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

      const userIds = [...new Set((data || []).map((l) => l.user_id))];
      let profiles: Record<string, string> = {};
      if (userIds.length > 0) {
        const { data: profileData } = await supabase
          .from("profiles")
          .select("id, first_name, last_name, email")
          .in("id", userIds);
        (profileData || []).forEach((p) => {
          profiles[p.id] = `${p.first_name} ${p.last_name}`;
        });
      }

      return { logs: data || [], total: count || 0, profiles };
    },
    staleTime: 30_000,
  });

  const filteredLogs = useMemo(() => {
    if (!data?.logs || !searchQuery.trim()) return data?.logs || [];
    const q = searchQuery.toLowerCase();
    return data.logs.filter((log) => {
      const adminName = (data.profiles[log.user_id] || "").toLowerCase();
      const details = log.details as Record<string, any> | null;
      const detailStr = (details?.target_name || details?.company_name || log.target_id || "").toLowerCase();
      return adminName.includes(q) || detailStr.includes(q);
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
              placeholder="Cerca admin o dettaglio..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
            {searchQuery.trim() && (
              <p className="absolute -bottom-5 left-0 text-[10px] text-muted-foreground">Ricerca limitata alla pagina corrente</p>
            )}
          </div>
          <DateRangeFilter
            label="Periodo"
            range={dateRange}
            onRangeChange={(r) => { setDateRange(r); setPage(0); }}
          />
          <Select value={actionFilter} onValueChange={(v) => { setActionFilter(v); setPage(0); }}>
            <SelectTrigger className="w-[180px]">
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
            <p className="text-sm mt-1">Le azioni dei Super Admin appariranno qui.</p>
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Admin</TableHead>
                  <TableHead>Azione</TableHead>
                  <TableHead>Dettaglio</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.map((log) => {
                  const details = log.details as Record<string, any> | null;
                  return (
                    <TableRow key={log.id}>
                      <TableCell className="text-sm whitespace-nowrap">
                        {format(new Date(log.created_at), "dd/MM/yyyy HH:mm", { locale: it })}
                      </TableCell>
                      <TableCell className="text-sm">
                        {data!.profiles[log.user_id] || "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={actionColors[log.action] || "outline"}>
                          {actionLabels[log.action] || log.action}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[300px] truncate">
                        {details?.target_name || details?.company_name || log.target_id || "—"}
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
