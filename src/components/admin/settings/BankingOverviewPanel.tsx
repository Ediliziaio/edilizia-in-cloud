import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Landmark,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  RefreshCw,
  WifiOff,
} from "lucide-react";
import {
  useBankingOverview,
  useBankingOverviewStats,
  type BankingOverviewRow,
} from "@/hooks/useBankingOverview";
import { formatDistanceToNow, format, differenceInDays } from "date-fns";
import { it } from "date-fns/locale";

type StatusFilter = "all" | "connected" | "expired" | "error" | "not_connected";

const STATUS_CONFIG: Record<
  BankingOverviewRow["connection_status"],
  {
    label: string;
    variant: "default" | "secondary" | "destructive" | "outline";
    icon: React.ComponentType<{ className?: string }>;
    className: string;
  }
> = {
  connected: {
    label: "Connessa",
    variant: "default",
    icon: CheckCircle2,
    className: "text-green-600",
  },
  expired: {
    label: "Scaduta",
    variant: "destructive",
    icon: XCircle,
    className: "text-destructive",
  },
  error: {
    label: "Errore",
    variant: "destructive",
    icon: AlertTriangle,
    className: "text-destructive",
  },
  not_connected: {
    label: "Non connessa",
    variant: "outline",
    icon: WifiOff,
    className: "text-muted-foreground",
  },
};

function KpiCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: "green" | "red" | "yellow";
}) {
  const colorClass =
    highlight === "green"
      ? "text-green-600"
      : highlight === "red"
      ? "text-destructive"
      : highlight === "yellow"
      ? "text-amber-600"
      : "";
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-2xl font-bold mt-1 ${colorClass}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status, expiresAt }: { status: BankingOverviewRow["connection_status"]; expiresAt: string | null }) {
  const cfg = STATUS_CONFIG[status];

  // Check if expiring soon (< 7 days)
  const isExpiringSoon =
    status === "connected" &&
    expiresAt &&
    differenceInDays(new Date(expiresAt), new Date()) < 7;

  if (isExpiringSoon) {
    return (
      <Badge variant="outline" className="border-amber-500 text-amber-600 text-xs">
        <Clock className="h-3 w-3 mr-1" />
        In scadenza
      </Badge>
    );
  }

  return (
    <Badge variant={cfg.variant} className="text-xs">
      <cfg.icon className="h-3 w-3 mr-1" />
      {cfg.label}
    </Badge>
  );
}

function BankingRow({ row }: { row: BankingOverviewRow }) {
  const connectedAgo = row.connected_at
    ? formatDistanceToNow(new Date(row.connected_at), { addSuffix: true, locale: it })
    : "-";
  const expiresFormatted = row.expires_at
    ? format(new Date(row.expires_at), "dd/MM/yyyy", { locale: it })
    : "-";
  const lastSyncFormatted = row.last_sync
    ? formatDistanceToNow(new Date(row.last_sync), { addSuffix: true, locale: it })
    : "-";

  return (
    <div className="grid grid-cols-7 gap-2 items-center px-3 py-2.5 text-sm border-b last:border-0 hover:bg-accent/20">
      <span className="font-medium truncate col-span-1">{row.company_name}</span>
      <span className="text-xs truncate text-muted-foreground">
        {row.bank_name ?? "-"}
      </span>
      <span>
        <StatusBadge status={row.connection_status} expiresAt={row.expires_at} />
      </span>
      <span className="text-xs text-muted-foreground">{connectedAgo}</span>
      <span className="text-xs text-muted-foreground">{expiresFormatted}</span>
      <span className="text-xs text-muted-foreground">{lastSyncFormatted}</span>
      <span className="text-xs text-center">
        {row.accounts_count > 0 ? (
          <Badge variant="secondary" className="text-xs">
            {row.accounts_count}
          </Badge>
        ) : (
          <span className="text-muted-foreground">-</span>
        )}
      </span>
    </div>
  );
}

export function BankingOverviewPanel() {
  const { data = [], isLoading, refetch } = useBankingOverview();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const stats = useBankingOverviewStats(data);
  const expiredCount = stats.expired + stats.error;

  const filtered =
    statusFilter === "all" ? data : data.filter((r) => r.connection_status === statusFilter);

  // Sort: expiring soon first, then by company name
  const sorted = [...filtered].sort((a, b) => {
    const priority = { error: 0, expired: 1, connected: 2, not_connected: 3 };
    const ap = priority[a.connection_status] ?? 9;
    const bp = priority[b.connection_status] ?? 9;
    if (ap !== bp) return ap - bp;
    return a.company_name.localeCompare(b.company_name, "it");
  });

  return (
    <div className="space-y-4">
      {expiredCount > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>{expiredCount} aziende</strong> hanno la connessione bancaria{" "}
            {stats.expired > 0 ? "scaduta" : ""}{stats.error > 0 && stats.expired > 0 ? " o" : ""}{stats.error > 0 ? " in errore" : ""}.
          </AlertDescription>
        </Alert>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Connesse" value={stats.connected} highlight="green" />
        <KpiCard label="Non connesse" value={stats.not_connected} />
        <KpiCard label="Scadute" value={stats.expired} highlight={stats.expired > 0 ? "red" : undefined} />
        <KpiCard label="Errore" value={stats.error} highlight={stats.error > 0 ? "red" : undefined} />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2">
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as StatusFilter)}
        >
          <SelectTrigger className="h-8 text-xs w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti gli stati</SelectItem>
            <SelectItem value="connected">Connesse</SelectItem>
            <SelectItem value="expired">Scadute</SelectItem>
            <SelectItem value="error">Errore</SelectItem>
            <SelectItem value="not_connected">Non connesse</SelectItem>
          </SelectContent>
        </Select>

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

      {/* Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Landmark className="h-4 w-4" />
            Stato Connessioni Bancarie
            <Badge variant="secondary" className="text-xs ml-auto">
              {filtered.length} aziende
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {/* Header */}
          <div className="grid grid-cols-7 gap-2 px-3 py-2 text-xs font-medium text-muted-foreground bg-muted/40 border-b">
            <span>Azienda</span>
            <span>Banca</span>
            <span>Stato</span>
            <span>Connessa il</span>
            <span>Scade il</span>
            <span>Ultimo sync</span>
            <span className="text-center">Conti</span>
          </div>

          {isLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : sorted.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <Landmark className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Nessun risultato</p>
            </div>
          ) : (
            <div>
              {sorted.map((row) => (
                <BankingRow key={row.company_id} row={row} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
