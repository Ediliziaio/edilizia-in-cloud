import { useState } from "react";
import { fetchWithTimeout } from "@/lib/utils/fetchWithTimeout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertTriangle,
  RefreshCw,
  Webhook,
  CheckCircle2,
  XCircle,
  Clock,
  RotateCcw,
  Ban,
  Play,
} from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useWebhookLogs, useWebhookStats, useRetryWebhook, type WebhookLog } from "@/hooks/useWebhookAlerts";
import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";

const STATUS_CONFIG: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ComponentType<{ className?: string }> }
> = {
  received:  { label: "Ricevuto",   variant: "secondary",    icon: Clock },
  processed: { label: "Processato", variant: "default",      icon: CheckCircle2 },
  failed:    { label: "Fallito",    variant: "destructive",  icon: XCircle },
  retried:   { label: "Ritentato",  variant: "outline",      icon: RotateCcw },
  exhausted: { label: "Esaurito",   variant: "destructive",  icon: Ban },
};

function KpiCard({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string | number;
  sub?: string;
  highlight?: "red" | "green";
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p
          className={`text-2xl font-bold mt-1 ${
            highlight === "red"
              ? "text-destructive"
              : highlight === "green"
              ? "text-green-600"
              : ""
          }`}
        >
          {value}
        </p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function WebhookRow({
  log,
  onRetry,
  isRetrying,
}: {
  log: WebhookLog;
  onRetry: (id: string) => void;
  isRetrying: boolean;
}) {
  const cfg = STATUS_CONFIG[log.status] ?? STATUS_CONFIG.received;
  const Icon = cfg.icon;
  const timeAgo = formatDistanceToNow(new Date(log.received_at), {
    addSuffix: true,
    locale: it,
  });

  return (
    <div className="flex items-center gap-3 py-2.5 px-3 rounded-lg border text-sm hover:bg-accent/20 min-w-[600px]">
      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0 grid grid-cols-4 gap-2 items-center">
        <span className="text-xs text-muted-foreground truncate">{timeAgo}</span>
        <Badge variant="outline" className="text-xs w-fit">
          {log.provider}
        </Badge>
        <span className="text-xs truncate font-mono">{log.event_type}</span>
        <div className="flex items-center gap-2">
          <Badge variant={cfg.variant} className="text-xs">
            {cfg.label}
          </Badge>
          {log.fail_count > 1 && (
            <span className="text-xs text-muted-foreground">#{log.fail_count}</span>
          )}
        </div>
      </div>
      {log.last_fail_reason && (
        <span
          className="text-xs text-destructive truncate max-w-[180px]"
          title={log.last_fail_reason}
        >
          {log.last_fail_reason.slice(0, 80)}
        </span>
      )}
      {log.status === "failed" && (
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs shrink-0"
          onClick={() => onRetry(log.id)}
          disabled={isRetrying}
        >
          {isRetrying ? (
            <RefreshCw className="h-3 w-3 animate-spin" />
          ) : (
            <RotateCcw className="h-3 w-3 mr-1" />
          )}
          Retry
        </Button>
      )}
    </div>
  );
}

function useAutoRetryBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetchWithTimeout(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/retry-failed-webhooks`,
        {
          method: "POST",
          timeoutMs: 30_000,
          context: "webhook.retry-batch",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token ?? ""}`,
          },
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      return res.json() as Promise<{ processed: number; retried_ok: number; failed_again: number; exhausted: number }>;
    },
    onSuccess: (r) => {
      toast.success(`Auto-retry completato: ${r.retried_ok} ok, ${r.failed_again} ancora falliti, ${r.exhausted} esauriti`);
      void qc.invalidateQueries({ queryKey: ["admin", "webhook-logs"] });
      void qc.invalidateQueries({ queryKey: ["admin", "webhook-stats"] });
    },
    onError: (err: Error) => toast.error(`Auto-retry fallito: ${err.message}`),
  });
}

export function WebhookAlertsPanel() {
  const [providerFilter, setProviderFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: logs = [], isLoading, refetch } = useWebhookLogs({
    provider: providerFilter,
    status: statusFilter,
  });
  const { data: stats } = useWebhookStats();
  const retryMutation = useRetryWebhook();
  const autoRetryMutation = useAutoRetryBatch();
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const handleRetry = (id: string) => {
    setRetryingId(id);
    retryMutation.mutate(id, { onSettled: () => setRetryingId(null) });
  };

  const hasFailed = (stats?.failed_today ?? 0) > 0;

  return (
    <div className="space-y-4">
      {/* Alert se ci sono webhook falliti */}
      {hasFailed && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>{stats!.failed_today} webhook falliti</strong> nelle ultime 24 ore.
            Controlla i log e ritenta manualmente se necessario.
          </AlertDescription>
        </Alert>
      )}

      {/* KPI */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Webhook oggi" value={stats?.total_today ?? 0} />
        <KpiCard
          label="Falliti oggi"
          value={stats?.failed_today ?? 0}
          highlight={hasFailed ? "red" : undefined}
        />
        <KpiCard
          label="In attesa retry"
          value={stats?.pending_retry ?? 0}
        />
        <KpiCard
          label="Tasso successo"
          value={`${stats?.success_rate ?? 100}%`}
          highlight={
            (stats?.success_rate ?? 100) >= 95
              ? "green"
              : (stats?.success_rate ?? 100) < 80
              ? "red"
              : undefined
          }
        />
      </div>

      {/* Filters + Refresh */}
      <div className="flex items-center gap-2 flex-wrap">
        <Select value={providerFilter} onValueChange={setProviderFilter}>
          <SelectTrigger className="h-8 text-xs w-36">
            <SelectValue placeholder="Provider" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti i provider</SelectItem>
            <SelectItem value="gocardless">GoCardless</SelectItem>
            <SelectItem value="stripe">Stripe</SelectItem>
            <SelectItem value="telnyx">Telnyx</SelectItem>
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-8 text-xs w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti gli status</SelectItem>
            <SelectItem value="failed">Solo falliti</SelectItem>
            <SelectItem value="exhausted">Esauriti</SelectItem>
            <SelectItem value="received">In attesa</SelectItem>
            <SelectItem value="processed">Processati</SelectItem>
            <SelectItem value="retried">Ritentati</SelectItem>
          </SelectContent>
        </Select>

        <Button
          variant="outline"
          size="sm"
          className="h-8"
          onClick={() => autoRetryMutation.mutate()}
          disabled={autoRetryMutation.isPending || (stats?.pending_retry ?? 0) === 0}
          title="Ritenta automaticamente tutti i webhook falliti in coda"
        >
          {autoRetryMutation.isPending ? (
            <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
          ) : (
            <Play className="h-3.5 w-3.5 mr-1.5" />
          )}
          Lancia Auto-Retry
        </Button>

        <Button
          variant="outline"
          size="sm"
          className="ml-auto h-8"
          onClick={() => void refetch()}
          disabled={isLoading}
        >
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isLoading ? "animate-spin" : ""}`} />
          Aggiorna
        </Button>
      </div>

      {/* Log table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Webhook className="h-4 w-4" />
            Log Webhook
            <Badge variant="secondary" className="text-xs ml-auto">
              {logs.length} eventi
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {/* Header — 4 cols ≥600px (su mobile scroll orizzontale) */}
          <div className="grid grid-cols-4 gap-2 px-3 py-1.5 text-xs font-medium text-muted-foreground border-b mb-1 min-w-[600px]">
            <span>Quando</span>
            <span>Provider</span>
            <span>Evento</span>
            <span>Status</span>
          </div>

          {isLoading ? (
            <div className="space-y-2 mt-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : logs.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">
              <Webhook className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Nessun webhook trovato</p>
            </div>
          ) : (
            <div className="space-y-1 mt-1">
              {logs.map((log) => (
                <WebhookRow
                  key={log.id}
                  log={log}
                  onRetry={handleRetry}
                  isRetrying={retryingId === log.id}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
