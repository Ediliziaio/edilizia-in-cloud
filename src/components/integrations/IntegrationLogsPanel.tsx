import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { RefreshCw, RotateCcw, CheckCircle2, XCircle, Clock, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import type { Integration } from "@/types/integrations";

interface IntegrationLogsPanelProps {
  integration: Integration;
}

type StatusFilter = "all" | "pending" | "processed" | "failed";

const STATUS_BADGE: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "In coda", variant: "secondary" },
  processed: { label: "Elaborato", variant: "default" },
  failed: { label: "Fallito", variant: "destructive" },
};

export function IntegrationLogsPanel({ integration }: IntegrationLogsPanelProps) {
  const { effectiveCompany } = useAuth();
  const companyId = (effectiveCompany as any)?.id;
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  // Fetch webhook events
  const { data: events = [], isLoading, refetch } = useQuery({
    queryKey: ["integration-events", companyId, integration.id, statusFilter],
    queryFn: async () => {
      if (!companyId) return [];
      let query = supabase
        .from("integration_webhook_events")
        .select("*")
        .eq("company_id", companyId)
        .eq("integration_id", integration.id)
        .order("received_at", { ascending: false })
        .limit(100);

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId,
  });

  // Stats
  const stats = {
    total: events.length,
    processed: events.filter((e: any) => e.status === "processed").length,
    failed: events.filter((e: any) => e.status === "failed").length,
    pending: events.filter((e: any) => e.status === "pending").length,
  };

  // Retry mutation
  const retryMutation = useMutation({
    mutationFn: async (eventId: string) => {
      const { error } = await supabase
        .from("integration_webhook_events")
        .update({ status: "pending", fail_count: 0, last_fail_reason: null })
        .eq("id", eventId)
        .eq("company_id", companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["integration-events"] });
      toast.success("Evento rimesso in coda");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Sync jobs
  const { data: syncJobs = [] } = useQuery({
    queryKey: ["integration-sync-jobs", companyId, integration.id],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("integration_sync_jobs")
        .select("*")
        .eq("company_id", companyId)
        .eq("integration_id", integration.id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId,
  });

  return (
    <div className="space-y-4">
      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3 flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">In coda</p>
              <p className="text-lg font-bold">{stats.pending}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            <div>
              <p className="text-xs text-muted-foreground">Elaborati</p>
              <p className="text-lg font-bold">{stats.processed}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-2">
            <XCircle className="h-4 w-4 text-destructive" />
            <div>
              <p className="text-xs text-muted-foreground">Falliti</p>
              <p className="text-lg font-bold">{stats.failed}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <div>
              <p className="text-xs text-muted-foreground">Tasso successo</p>
              <p className="text-lg font-bold">
                {stats.total > 0 ? Math.round((stats.processed / stats.total) * 100) : 0}%
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex items-center justify-between gap-2">
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filtra stato" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti gli stati</SelectItem>
            <SelectItem value="pending">In coda</SelectItem>
            <SelectItem value="processed">Elaborati</SelectItem>
            <SelectItem value="failed">Falliti</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
          Aggiorna
        </Button>
      </div>

      {/* Events table */}
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>ID Evento</TableHead>
              <TableHead>Stato</TableHead>
              <TableHead>Tentativi</TableHead>
              <TableHead className="text-right">Azioni</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  Caricamento...
                </TableCell>
              </TableRow>
            ) : events.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  Nessun evento registrato
                </TableCell>
              </TableRow>
            ) : (
              events.map((event: any) => {
                const badge = STATUS_BADGE[event.status] || STATUS_BADGE.pending;
                return (
                  <TableRow key={event.id}>
                    <TableCell className="text-xs">
                      {format(new Date(event.received_at), "dd MMM yyyy HH:mm", { locale: it })}
                    </TableCell>
                    <TableCell className="text-xs font-mono">{event.event_type}</TableCell>
                    <TableCell className="text-xs font-mono max-w-[120px] truncate">
                      {event.event_id || "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={badge.variant} className="text-[10px]">
                        {badge.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">{event.fail_count}</TableCell>
                    <TableCell className="text-right">
                      {event.status === "failed" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => retryMutation.mutate(event.id)}
                          disabled={retryMutation.isPending}
                        >
                          <RotateCcw className="h-3.5 w-3.5 mr-1" />
                          Riprova
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Last sync info */}
      {integration.last_sync_at && (
        <p className="text-xs text-muted-foreground">
          Ultimo sync: {format(new Date(integration.last_sync_at), "dd MMM yyyy HH:mm", { locale: it })}
        </p>
      )}
    </div>
  );
}
