import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Loader2, RefreshCw, ScrollText, ChevronLeft, ChevronRight, Search, Download, ChevronDown } from "lucide-react";
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
  const [adminFilter, setAdminFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({ from: undefined, to: undefined });
  const debouncedSearch = useDebounce(searchQuery, 350);

  // Fetch admin list for filter dropdown
  const { data: adminList = [] } = useQuery({
    queryKey: ["audit-admin-list"],
    queryFn: async () => {
      const { data } = await supabase
        .from("admin_audit_log")
        .select("user_id");
      const uniqueIds = [...new Set((data || []).map((r) => r.user_id))];
      if (uniqueIds.length === 0) return [];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, first_name, last_name")
        .in("id", uniqueIds);
      return (profiles || []).map((p) => ({
        id: p.id,
        name: `${p.first_name} ${p.last_name}`,
      }));
    },
    staleTime: 60_000,
  });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin-audit-log", page, actionFilter, adminFilter, dateRange.from?.toISOString(), dateRange.to?.toISOString(), debouncedSearch],
    queryFn: async () => {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      // If searching, first resolve matching user IDs from profiles
      let matchingUserIds: string[] | null = null;
      if (debouncedSearch.trim()) {
        const q = `%${debouncedSearch.trim()}%`;
        const { data: profileMatches } = await supabase
          .from("profiles")
          .select("id")
          .or(`first_name.ilike.${q},last_name.ilike.${q},email.ilike.${q}`);
        matchingUserIds = (profileMatches || []).map((p) => p.id);
      }

      let query = supabase
        .from("admin_audit_log")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false });

      if (actionFilter !== "all") {
        query = query.eq("action", actionFilter);
      }
      if (adminFilter !== "all") {
        query = query.eq("user_id", adminFilter);
      }
      if (dateRange.from) {
        query = query.gte("created_at", dateRange.from.toISOString());
      }
      if (dateRange.to) {
        query = query.lte("created_at", dateRange.to.toISOString());
      }

      // Server-side search: match on user_id (from profile lookup) or target_id
      if (debouncedSearch.trim()) {
        const conditions: string[] = [];
        if (matchingUserIds && matchingUserIds.length > 0) {
          conditions.push(`user_id.in.(${matchingUserIds.join(",")})`);
        }
        conditions.push(`target_id.ilike.%${debouncedSearch.trim()}%`);
        query = query.or(conditions.join(","));
      }

      query = query.range(from, to);

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

  const totalPages = Math.ceil((data?.total || 0) / PAGE_SIZE);
  const [isExporting, setIsExporting] = useState(false);

  const exportFullCsv = useCallback(async () => {
    setIsExporting(true);
    try {
      // Fetch ALL logs matching current filters (no pagination)
      let query = supabase
        .from("admin_audit_log")
        .select("*")
        .order("created_at", { ascending: false });

      if (actionFilter !== "all") query = query.eq("action", actionFilter);
      if (adminFilter !== "all") query = query.eq("user_id", adminFilter);
      if (dateRange.from) query = query.gte("created_at", dateRange.from.toISOString());
      if (dateRange.to) query = query.lte("created_at", dateRange.to.toISOString());

      const { data: allLogs, error } = await query;
      if (error) throw error;
      if (!allLogs?.length) return;

      // Resolve profiles
      const userIds = [...new Set(allLogs.map((l) => l.user_id))];
      const profiles: Record<string, string> = {};
      if (userIds.length > 0) {
        const { data: profileData } = await supabase
          .from("profiles")
          .select("id, first_name, last_name")
          .in("id", userIds);
        (profileData || []).forEach((p) => {
          profiles[p.id] = `${p.first_name} ${p.last_name}`;
        });
      }

      const headers = ["Data", "Admin", "Azione", "Dettaglio", "IP", "Target ID"];
      const rows = allLogs.map((log) => {
        const details = log.details as Record<string, unknown> | null;
        return [
          format(new Date(log.created_at), "dd/MM/yyyy HH:mm", { locale: it }),
          `"${profiles[log.user_id] || "—"}"`,
          `"${actionLabels[log.action] || log.action}"`,
          `"${details?.target_name || details?.company_name || "—"}"`,
          `"${log.ip_address || "—"}"`,
          `"${log.target_id || "—"}"`,
        ].join(",");
      });
      const csv = [headers.join(","), ...rows].join("\n");
      const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-log-completo-${format(new Date(), "yyyy-MM-dd")}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Esportati ${allLogs.length} record`);
    } catch {
      toast.error("Errore nell'esportazione");
    } finally {
      setIsExporting(false);
    }
  }, [actionFilter, adminFilter, dateRange]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <ScrollText className="h-5 w-5 text-primary" />
          <CardTitle>Registro Attività</CardTitle>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!data?.total || isExporting}
            onClick={exportFullCsv}
          >
            {isExporting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Download className="h-4 w-4 mr-1" />}
            CSV {data?.total ? `(${data.total})` : ""}
          </Button>
          <Button variant="outline" size="icon" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Cerca admin o dettaglio..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(0); }}
              className="pl-9"
            />
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
          <Select value={adminFilter} onValueChange={(v) => { setAdminFilter(v); setPage(0); }}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filtra admin" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti gli admin</SelectItem>
              {adminList.map((admin) => (
                <SelectItem key={admin.id} value={admin.id}>{admin.name}</SelectItem>
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
        ) : (data?.logs || []).length === 0 ? (
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
                {(data?.logs || []).map((log) => {
                  const details = log.details as Record<string, any> | null;
                  const hasDetails = details && Object.keys(details).length > 0;
                  return (
                    <Collapsible key={log.id} asChild>
                      <>
                        <CollapsibleTrigger asChild>
                          <TableRow className={hasDetails ? "cursor-pointer hover:bg-muted/50 group" : ""}>
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
                            <TableCell className="text-sm text-muted-foreground">
                              <div className="flex items-center gap-2">
                                <span className="truncate max-w-[250px]">
                                  {details?.target_name || details?.company_name || log.target_id || "—"}
                                </span>
                                {hasDetails && (
                                  <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60 transition-transform group-data-[state=open]:rotate-180" />
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        </CollapsibleTrigger>
                        {hasDetails && (
                          <CollapsibleContent asChild>
                            <tr>
                              <td colSpan={4} className="p-0">
                                <div className="bg-muted/30 border-t px-6 py-3">
                                  <p className="text-xs font-medium text-muted-foreground mb-1.5">Dettagli completi</p>
                                  <pre className="text-xs bg-background rounded-md border p-3 overflow-x-auto max-h-48 whitespace-pre-wrap break-all">
                                    {JSON.stringify(details, null, 2)}
                                  </pre>
                                </div>
                              </td>
                            </tr>
                          </CollapsibleContent>
                        )}
                      </>
                    </Collapsible>
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
