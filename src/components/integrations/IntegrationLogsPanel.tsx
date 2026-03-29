import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RefreshCw, RotateCcw, CheckCircle2, XCircle, Clock, AlertTriangle, ScrollText } from "lucide-react";
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

const ACTION_LABEL: Record<string, string> = {
  integration_connected: "Connessione",
  integration_disconnected: "Disconnessione",
  token_refreshed: "Token rinnovato",
  health_check: "Health check",
  webhook_subscribed: "Webhook sottoscritto",
  lead_imported: "Lead importato",
  test_lead_sent: "Lead di test",
  backfill_started: "Backfill avviato",
};

const ACTION_BADGE_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  integration_connected: "default",
  integration_disconnected: "destructive",
  token_refreshed: "default",
  health_check: "secondary",
  webhook_subscribed: "default",
  lead_imported: "default",
  test_lead_sent: "outline",
  backfill_started: "secondary",
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

  // Fetch audit log: eventi integration-level + lead activity
  const { data: auditLogs = [], isLoading: auditLoading, refetch: refetchAudit } = useQuery({
    queryKey: ["integration-audit-log", companyId, integration.id],
    queryFn: async () => {
      if (!companyId) return [];

      // Fetch eventi legati direttamente all'integrazione
      const { data: integrationLogs } = await supabase
        .from("integration_audit_log")
        .select("*")
        .eq("company_id", companyId)
        .eq("entity_type", "integration")
        .eq("entity_id", integration.id)
        .order("created_at", { ascending: false })
        .limit(50);

      // Fetch lead activity (lead_imported, test_lead_sent)
      const { data: leadLogs } = await supabase
        .from("integration_audit_log")
        .select("*")
        .eq("company_id", companyId)
        .in("action", ["lead_imported", "test_lead_sent"])
        .order("created_at", { ascending: false })
        .limit(50);

      // Merge + dedup + sort
      const all = [...(integrationLogs || []), ...(leadLogs || [])];
      const seen = new Set<string>();
      const deduped = all.filter((e) => {
        if (seen.has(e.id)) return false;
        seen.add(e.id);
        return true;
      });
      return deduped.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ).slice(0, 100);
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
              <p className="text-xs text-muted-foreground">Tasso successo (ultimi 100)</p>
              <p className="text-lg font-bold">
                {stats.total > 0 ? Math.round((stats.processed / stats.total) * 100) : 0}%
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="events">
        <TabsList>
          <TabsTrigger value="events">Lead in coda</TabsTrigger>
          <TabsTrigger value="audit">
            <ScrollText className="h-3.5 w-3.5 mr-1.5" />
            Log attività
          </TabsTrigger>
        </TabsList>

        {/* ── Tab 1: Webhook events ── */}
        <TabsContent value="events" className="space-y-3 mt-3">
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
                          {event.status === "failed" && event.last_fail_reason && (
                            <span className="text-[10px] text-destructive block max-w-[200px] truncate">
                              {event.last_fail_reason}
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ── Tab 2: Audit log ── */}
        <TabsContent value="audit" className="space-y-3 mt-3">
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={() => refetchAudit()}>
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Aggiorna
            </Button>
          </div>

          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Azione</TableHead>
                  <TableHead>Dettagli</TableHead>
                  <TableHead>Speed-to-lead</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {auditLoading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                      Caricamento...
                    </TableCell>
                  </TableRow>
                ) : auditLogs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                      Nessun log disponibile
                    </TableCell>
                  </TableRow>
                ) : (
                  auditLogs.map((log: any) => {
                    const meta = (log.metadata as Record<string, any>) || {};
                    const variant = ACTION_BADGE_VARIANT[log.action] ?? "secondary";
                    const label = ACTION_LABEL[log.action] ?? log.action;
                    const speedSec = meta.speed_to_lead_seconds;
                    const speedLabel = speedSec != null
                      ? speedSec < 60
                        ? `${speedSec}s`
                        : `${Math.round(speedSec / 60)}m`
                      : null;

                    let detail = "";
                    if (log.action === "lead_imported") {
                      detail = [
                        meta.campaign_name && `Campagna: ${meta.campaign_name}`,
                        meta.dedupe && (meta.dedupe === "created" ? "Nuovo contatto" : "Aggiornato"),
                        meta.is_test && "TEST",
                      ].filter(Boolean).join(" · ");
                    } else if (log.action === "health_check") {
                      detail = meta.reason || (meta.new_health === "ok" ? "OK" : meta.new_health);
                    } else if (log.action === "token_refreshed") {
                      detail = meta.new_expiry
                        ? `Nuovo expiry: ${format(new Date(meta.new_expiry), "dd MMM yyyy", { locale: it })}`
                        : "";
                    } else if (log.action === "webhook_subscribed") {
                      detail = meta.page_id ? `Pagina: ${meta.page_id}` : "";
                    } else if (log.action === "backfill_started") {
                      detail = `${meta.imported ?? 0} lead importati`;
                    } else if (log.action === "test_lead_sent") {
                      detail = `Form: ${meta.form_id ?? "—"}`;
                    }

                    return (
                      <TableRow key={log.id}>
                        <TableCell className="text-xs whitespace-nowrap">
                          {format(new Date(log.created_at), "dd MMM HH:mm", { locale: it })}
                        </TableCell>
                        <TableCell>
                          <Badge variant={variant} className="text-[10px] whitespace-nowrap">
                            {label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[220px] truncate">
                          {detail || "—"}
                        </TableCell>
                        <TableCell className="text-xs">
                          {speedLabel ? (
                            <span className={speedLabel.endsWith("s") && speedSec < 120 ? "text-emerald-600" : "text-muted-foreground"}>
                              {speedLabel}
                            </span>
                          ) : "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      {integration.last_sync_at && (
        <p className="text-xs text-muted-foreground">
          Ultimo sync: {format(new Date(integration.last_sync_at), "dd MMM yyyy HH:mm", { locale: it })}
        </p>
      )}
    </div>
  );
}
