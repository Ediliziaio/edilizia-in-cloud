import { useMemo, useState } from "react";
import {
  Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui/card";
import { escapeCsvCell } from "@/lib/csvExport";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Landmark, CheckCircle2, XCircle, Clock, AlertTriangle, RefreshCw,
  WifiOff, Download, Search, Info,
} from "lucide-react";
import {
  useBankingOverview, useBankingOverviewStats,
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
  label, value, highlight,
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

function StatusBadge({
  row,
}: {
  row: BankingOverviewRow;
}) {
  const cfg = STATUS_CONFIG[row.connection_status];

  const isExpiringSoon =
    row.connection_status === "connected" &&
    row.expires_at &&
    differenceInDays(new Date(row.expires_at), new Date()) < 7;

  if (isExpiringSoon) {
    return (
      <Badge variant="outline" className="border-amber-500 text-amber-600 text-xs">
        <Clock className="h-3 w-3 mr-1" />
        In scadenza
      </Badge>
    );
  }

  // FIX: se stato è "error" e c'è un message, mostra tooltip per debug veloce
  const badge = (
    <Badge variant={cfg.variant} className="text-xs">
      <cfg.icon className="h-3 w-3 mr-1" />
      {cfg.label}
    </Badge>
  );

  if (row.connection_status === "error" && row.error_message) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="cursor-help inline-flex items-center gap-1">
              {badge}
              <Info className="h-3 w-3 text-destructive" />
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <p className="text-xs font-mono break-all">{row.error_message}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return badge;
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
    <div className="grid grid-cols-7 gap-2 items-center px-3 py-2.5 text-sm border-b last:border-0 hover:bg-accent/20 min-w-[720px]">
      <span className="font-medium truncate col-span-1">{row.company_name}</span>
      <span className="text-xs truncate text-muted-foreground">
        {row.bank_name ?? "-"}
      </span>
      <span>
        <StatusBadge row={row} />
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

/** Escapa un valore per un campo CSV (standard RFC 4180). */
function csvEscape(v: string | number | null | undefined): string {
  return escapeCsvCell(v, ",");
}

export function BankingOverviewPanel() {
  const { data = [], isLoading, refetch, isRefetching } = useBankingOverview();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [bankFilter, setBankFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const stats = useBankingOverviewStats(data);
  const expiredCount = stats.expired + stats.error;

  // Lista uniche banche per il filtro
  const bankOptions = useMemo(() => {
    const banks = new Set<string>();
    for (const r of data) {
      if (r.bank_name) banks.add(r.bank_name);
    }
    return Array.from(banks).sort((a, b) => a.localeCompare(b, "it"));
  }, [data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = data;
    if (statusFilter !== "all") {
      rows = rows.filter((r) => r.connection_status === statusFilter);
    }
    if (bankFilter !== "all") {
      rows = rows.filter((r) => r.bank_name === bankFilter);
    }
    if (q) {
      rows = rows.filter(
        (r) =>
          r.company_name.toLowerCase().includes(q) ||
          (r.bank_name ?? "").toLowerCase().includes(q),
      );
    }
    return rows;
  }, [data, statusFilter, bankFilter, search]);

  // Sort: prima gli errori, poi scaduti, poi connessi, poi non connessi
  const sorted = useMemo(
    () =>
      [...filtered].sort((a, b) => {
        const priority = { error: 0, expired: 1, connected: 2, not_connected: 3 };
        const ap = priority[a.connection_status] ?? 9;
        const bp = priority[b.connection_status] ?? 9;
        if (ap !== bp) return ap - bp;
        return a.company_name.localeCompare(b.company_name, "it");
      }),
    [filtered],
  );

  const handleExport = () => {
    if (sorted.length === 0) return;
    const headers = [
      "Azienda",
      "Banca",
      "Stato",
      "Connessa il",
      "Scade il",
      "Ultimo sync",
      "Conti",
      "Errore",
    ];
    const rows = sorted.map((r) => [
      csvEscape(r.company_name),
      csvEscape(r.bank_name ?? ""),
      csvEscape(STATUS_CONFIG[r.connection_status].label),
      csvEscape(
        r.connected_at ? format(new Date(r.connected_at), "yyyy-MM-dd HH:mm") : "",
      ),
      csvEscape(r.expires_at ? format(new Date(r.expires_at), "yyyy-MM-dd") : ""),
      csvEscape(r.last_sync ? format(new Date(r.last_sync), "yyyy-MM-dd HH:mm") : ""),
      csvEscape(r.accounts_count),
      csvEscape(r.error_message ?? ""),
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `banking-overview-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {expiredCount > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>{expiredCount} aziende</strong> hanno la connessione bancaria{" "}
            {stats.expired > 0 ? "scaduta" : ""}
            {stats.error > 0 && stats.expired > 0 ? " o" : ""}
            {stats.error > 0 ? " in errore" : ""}.
          </AlertDescription>
        </Alert>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Connesse" value={stats.connected} highlight="green" />
        <KpiCard label="Non connesse" value={stats.not_connected} />
        <KpiCard
          label="Scadute"
          value={stats.expired}
          highlight={stats.expired > 0 ? "red" : undefined}
        />
        <KpiCard
          label="Errore"
          value={stats.error}
          highlight={stats.error > 0 ? "red" : undefined}
        />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-[320px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Cerca azienda o banca..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-xs"
          />
        </div>

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

        {bankOptions.length > 1 && (
          <Select value={bankFilter} onValueChange={setBankFilter}>
            <SelectTrigger className="h-8 text-xs w-44">
              <SelectValue placeholder="Tutte le banche" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutte le banche</SelectItem>
              {bankOptions.map((b) => (
                <SelectItem key={b} value={b}>
                  {b}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Button
          variant="outline"
          size="sm"
          className="h-8"
          onClick={handleExport}
          disabled={sorted.length === 0}
        >
          <Download className="h-3.5 w-3.5 mr-1.5" />
          Esporta CSV
        </Button>

        <Button
          variant="outline"
          size="sm"
          className="ml-auto h-8"
          onClick={() => void refetch()}
          disabled={isLoading || isRefetching}
        >
          <RefreshCw
            className={`h-3.5 w-3.5 mr-1.5 ${
              isLoading || isRefetching ? "animate-spin" : ""
            }`}
          />
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
              {sorted.length} di {data.length} aziende
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {/* Header — 7 colonne illeggibili su mobile, scroll orizzontale con min-width */}
          <div className="grid grid-cols-7 gap-2 px-3 py-2 text-xs font-medium text-muted-foreground bg-muted/40 border-b min-w-[720px]">
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
              {(search || statusFilter !== "all" || bankFilter !== "all") && (
                <Button
                  variant="link"
                  size="sm"
                  onClick={() => {
                    setSearch("");
                    setStatusFilter("all");
                    setBankFilter("all");
                  }}
                  className="text-xs mt-1"
                >
                  Reset filtri
                </Button>
              )}
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
