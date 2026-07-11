import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Inbox, Play, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatError } from "@/lib/errors";

type OutboxStatus = "all" | "queued" | "processing" | "sent" | "failed" | "dead" | "suppressed";

interface OutboxRow {
  id: string;
  company_id: string | null;
  stream: string;
  recipient: string;
  subject: string;
  status: string;
  attempts: number;
  max_attempts: number;
  provider: string | null;
  last_error: string | null;
  scheduled_at: string;
  created_at: string;
}

const STATUS_LABELS: Record<string, string> = {
  queued: "In coda",
  processing: "In lavorazione",
  sent: "Inviata",
  failed: "Fallita",
  dead: "Dead-letter",
  suppressed: "Soppressa",
};

const STATUS_STYLES: Record<string, string> = {
  queued: "bg-blue-100 text-blue-800",
  processing: "bg-amber-100 text-amber-800",
  sent: "bg-green-100 text-green-800",
  failed: "bg-destructive/10 text-destructive",
  dead: "bg-red-100 text-red-800",
  suppressed: "bg-slate-100 text-slate-800",
};

const COUNT_STATUSES = ["queued", "processing", "sent", "failed", "dead", "suppressed"] as const;

export function EmailOutboxPanel() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<OutboxStatus>("all");

  // Conteggi per stato via head-count exact, indipendenti dal filtro
  // corrente (prima erano calcolati sulle sole 200 righe filtrate).
  const { data: counts = {} } = useQuery({
    queryKey: ["admin-email-outbox", "counts"],
    queryFn: async () => {
      const results = await Promise.all(
        COUNT_STATUSES.map((s) =>
          supabase
            .from("email_outbox" as never)
            .select("id", { count: "exact", head: true })
            .eq("status" as never, s as never)
        )
      );
      const next: Record<string, number> = {};
      COUNT_STATUSES.forEach((s, i) => {
        if (results[i].error) throw results[i].error;
        next[s] = results[i].count ?? 0;
      });
      return next;
    },
    staleTime: 20_000,
    refetchInterval: (query) => {
      const data = query.state.data as Record<string, number> | undefined;
      return data && (data.queued ?? 0) + (data.processing ?? 0) > 0 ? 15_000 : false;
    },
  });

  const hasActiveJobs = (counts.queued ?? 0) + (counts.processing ?? 0) > 0;

  const { data: rows = [], isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["admin-email-outbox", status],
    queryFn: async () => {
      let query = supabase
        .from("email_outbox" as never)
        .select("id, company_id, stream, recipient, subject, status, attempts, max_attempts, provider, last_error, scheduled_at, created_at")
        .order("created_at" as never, { ascending: false })
        .limit(200);
      if (status !== "all") query = query.eq("status" as never, status as never);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as OutboxRow[];
    },
    staleTime: 20_000,
    refetchInterval: hasActiveJobs ? 15_000 : false,
  });

  const processQueue = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("process-email-outbox", {
        body: { limit: 50, workerId: "superadmin-manual-run" },
      });
      if (error) throw error;
      return data as { claimed?: number; sent?: number; failed?: number; dead?: number; suppressed?: number };
    },
    onSuccess: (data) => {
      toast.success(`Coda processata: ${data.sent ?? 0} inviate, ${data.failed ?? 0} fallite`);
      qc.invalidateQueries({ queryKey: ["admin-email-outbox"] });
    },
    onError: (err: Error) => {
      toast.error(`Errore processamento coda: ${err.message}`);
    },
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Inbox className="h-5 w-5" />
              Email Outbox
            </CardTitle>
            <CardDescription>
              Coda persistente con retry, lease worker e dead-letter
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={cn("h-4 w-4 mr-2", isFetching && "animate-spin")} />
              Aggiorna
            </Button>
            <Button size="sm" onClick={() => processQueue.mutate()} disabled={processQueue.isPending}>
              <Play className="h-4 w-4 mr-2" />
              Processa 50
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <Select value={status} onValueChange={(value) => setStatus(value as OutboxStatus)}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Stato" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti</SelectItem>
              {(["queued", "processing", "sent", "failed", "dead", "suppressed"] as const).map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_LABELS[s]} {counts[s] ? `(${counts[s]})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {counts.dead > 0 && (
            <Badge variant="destructive" className="gap-1">
              <AlertTriangle className="h-3 w-3" />
              {counts.dead} in dead-letter
            </Badge>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : error ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between gap-3 flex-wrap">
              <span>Errore caricamento coda email: {formatError(error)}</span>
              <Button variant="outline" size="sm" onClick={() => refetch()} className="h-7 gap-1 text-xs">
                <RefreshCw className="h-3 w-3" /> Riprova
              </Button>
            </AlertDescription>
          </Alert>
        ) : rows.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            Nessun job email trovato per questo filtro.
          </div>
        ) : (
          <div className="rounded-md border overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Stato</TableHead>
                  <TableHead>Stream</TableHead>
                  <TableHead>Destinatario</TableHead>
                  <TableHead>Oggetto</TableHead>
                  <TableHead>Tentativi</TableHead>
                  <TableHead>Provider</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell
                      className="whitespace-nowrap text-xs"
                      title={`Creata: ${format(new Date(row.created_at), "dd MMM yy HH:mm", { locale: it })}`}
                    >
                      {format(new Date(row.scheduled_at || row.created_at), "dd MMM yy HH:mm", { locale: it })}
                    </TableCell>
                    <TableCell>
                      <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", STATUS_STYLES[row.status] ?? "bg-muted text-muted-foreground")}>
                        {STATUS_LABELS[row.status] ?? row.status}
                      </span>
                      {row.last_error && (
                        <p className="mt-1 max-w-[260px] truncate text-xs text-destructive" title={row.last_error}>
                          {row.last_error}
                        </p>
                      )}
                    </TableCell>
                    <TableCell>{row.stream}</TableCell>
                    <TableCell className="font-mono text-xs">{row.recipient}</TableCell>
                    <TableCell className="max-w-[280px] truncate" title={row.subject}>{row.subject}</TableCell>
                    <TableCell>{row.attempts}/{row.max_attempts}</TableCell>
                    <TableCell>{row.provider || "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
