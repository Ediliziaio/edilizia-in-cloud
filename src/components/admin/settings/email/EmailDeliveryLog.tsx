import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, RefreshCw, Mail, AlertTriangle, X } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { formatError } from "@/lib/errors";
import { cn } from "@/lib/utils";

const STATUS_COLORS: Record<string, string> = {
  sent: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  delivered: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  failed: "bg-destructive/10 text-destructive",
  bounced: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  opened: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  clicked: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  dropped: "bg-destructive/10 text-destructive",
  deferred: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  spam: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  unsubscribed: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200",
};

const STATUS_LABEL_IT: Record<string, string> = {
  sent: "Inviato",
  delivered: "Consegnato",
  failed: "Fallito",
  bounced: "Rimbalzato",
  opened: "Aperto",
  clicked: "Click",
  dropped: "Scartato",
  deferred: "Ritardato",
  spam: "Spam",
  unsubscribed: "Disiscritto",
};

interface DeliveryLogRow {
  id: string;
  recipient: string | null;
  subject: string | null;
  template_type: string | null;
  provider: string | null;
  status: string;
  sent_at: string;
  error_message: string | null;
  opened_at: string | null;
  clicked_at: string | null;
}

/**
 * Parse error_message: alcuni provider salvano JSON ({statusCode, message, ...}).
 * Se è un JSON con `message`, usa quello; altrimenti restituisce il raw text.
 */
function parseErrorMessage(raw: string | null | undefined): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return trimmed;
  try {
    const obj = JSON.parse(trimmed);
    if (obj && typeof obj === "object") {
      if (typeof obj.message === "string") return obj.message;
      if (typeof obj.error === "string") return obj.error;
      if (typeof obj.detail === "string") return obj.detail;
    }
    return trimmed;
  } catch {
    return trimmed;
  }
}

export function EmailDeliveryLog() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: logs = [], isLoading, error, refetch, isFetching } = useQuery<DeliveryLogRow[]>({
    queryKey: ["email-delivery-log", statusFilter],
    queryFn: async () => {
      let query = supabase
        .from("email_delivery_log")
        .select("id, recipient, subject, template_type, provider, status, sent_at, error_message, opened_at, clicked_at")
        .order("sent_at", { ascending: false })
        .limit(200);

      // Nessun writer scrive status "opened"/"clicked": il webhook setta solo
      // opened_at/clicked_at, quindi questi filtri usano i timestamp.
      if (statusFilter === "opened") {
        query = query.not("opened_at", "is", null);
      } else if (statusFilter === "clicked") {
        query = query.not("clicked_at", "is", null);
      } else if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as DeliveryLogRow[];
    },
    staleTime: 30_000,
    retry: 2,
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return logs;
    return logs.filter((l) => {
      return (
        (l.recipient ?? "").toLowerCase().includes(q) ||
        (l.subject ?? "").toLowerCase().includes(q) ||
        (l.template_type ?? "").toLowerCase().includes(q)
      );
    });
  }, [logs, search]);

  // Status counters per badge guida (es. "Falliti: 3").
  // Aperti/click contati dai timestamp, non dallo status (mai scritto così).
  const statusCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const l of logs) {
      c[l.status] = (c[l.status] ?? 0) + 1;
      if (l.opened_at) c.opened = (c.opened ?? 0) + 1;
      if (l.clicked_at) c.clicked = (c.clicked ?? 0) + 1;
    }
    return c;
  }, [logs]);

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription className="flex items-center justify-between gap-3 flex-wrap">
          <span>Errore caricamento log: {formatError(error)}</span>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="h-7 gap-1 text-xs">
            <RefreshCw className="h-3 w-3" /> Riprova
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" /> Log Invii Email
            </CardTitle>
            <CardDescription>
              Ultimi 200 invii della piattaforma — la ricerca agisce solo su queste righe
              {logs.length > 0 && (
                <span className="ml-1">
                  · <strong>{filtered.length}</strong>
                  {filtered.length !== logs.length && ` di ${logs.length}`}
                </span>
              )}
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="gap-2"
          >
            <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
            Aggiorna
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Cerca destinatario, oggetto, template…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-8"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-muted text-muted-foreground"
                aria-label="Pulisci ricerca"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Stato" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti gli stati</SelectItem>
              {(["sent", "delivered", "failed", "bounced", "opened", "clicked", "deferred", "dropped", "spam", "unsubscribed"] as const).map((s) => (
                <SelectItem key={s} value={s}>
                  <span className="flex items-center gap-2">
                    {STATUS_LABEL_IT[s]}
                    {statusCounts[s] > 0 && (
                      <Badge variant="secondary" className="text-[10px] h-4 px-1">
                        {statusCounts[s]}
                      </Badge>
                    )}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Mail className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="font-medium">
              {logs.length === 0
                ? "Nessun log di invio email trovato"
                : `Nessun risultato per ${search ? `"${search}"` : `stato "${STATUS_LABEL_IT[statusFilter] ?? statusFilter}"`}`}
            </p>
            <p className="text-xs mt-1">
              {logs.length === 0
                ? "I log appariranno quando la piattaforma invierà email."
                : "Prova a modificare i filtri o pulire la ricerca."}
            </p>
            {(search || statusFilter !== "all") && logs.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="mt-3 h-7 text-xs"
                onClick={() => { setSearch(""); setStatusFilter("all"); }}
              >
                Pulisci filtri
              </Button>
            )}
          </div>
        ) : (
          <div className="rounded-md border overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Destinatario</TableHead>
                  <TableHead>Oggetto</TableHead>
                  <TableHead>Template</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Stato</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((log) => {
                  const errMsg = parseErrorMessage(log.error_message);
                  return (
                    <TableRow key={log.id}>
                      <TableCell className="whitespace-nowrap text-sm">
                        {format(new Date(log.sent_at), "dd MMM yy HH:mm", { locale: it })}
                      </TableCell>
                      <TableCell className="font-mono text-sm max-w-[220px] truncate" title={log.recipient ?? ""}>
                        {log.recipient || "—"}
                      </TableCell>
                      <TableCell className="max-w-[240px] truncate text-sm" title={log.subject ?? ""}>
                        {log.subject || "—"}
                      </TableCell>
                      <TableCell>
                        {log.template_type ? (
                          <Badge variant="outline" className="text-xs">
                            {log.template_type}
                          </Badge>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {log.provider || "—"}
                      </TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
                            STATUS_COLORS[log.status] || "bg-muted text-muted-foreground"
                          )}
                        >
                          {STATUS_LABEL_IT[log.status] ?? log.status}
                        </span>
                        {errMsg && (
                          <p
                            className="text-xs text-destructive mt-1 max-w-[260px] truncate"
                            title={errMsg}
                          >
                            {errMsg}
                          </p>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
