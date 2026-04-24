import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { CalendarIcon, RefreshCw, ScrollText, AlertCircle, Copy, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Props {
  flowId: string;
  companyId: string;
}

interface LogRow {
  id: string;
  node_id: string | null;
  node_type: string | null;
  status: string;
  created_at: string;
  error_message: string | null;
  context_json?: Record<string, unknown> | null;
  enrollment_id?: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  success: "Successo",
  failed: "Fallito",
  pending: "In attesa",
  skipped: "Saltato",
};

const STATUS_STYLES: Record<string, string> = {
  success: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300",
  failed: "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300",
  pending: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300",
  skipped: "bg-muted text-muted-foreground border-transparent",
};

export function AutomationLogsTab({ flowId, companyId }: Props) {
  const [startDate, setStartDate] = useState<Date>();
  const [endDate, setEndDate] = useState<Date>();
  const [activityFilter, setActivityFilter] = useState("all_activity");
  const [statusFilter, setStatusFilter] = useState("all_status");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [errorDialog, setErrorDialog] = useState<LogRow | null>(null);
  const PAGE_SIZE = 25;

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["automation-logs", flowId, companyId, startDate, endDate, activityFilter, statusFilter, search, page],
    queryFn: async () => {
      let query = supabase
        .from("automation_execution_log")
        .select("*", { count: "exact" })
        .eq("company_id", companyId)
        .eq("flow_id", flowId)
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (statusFilter !== "all_status") query = query.eq("status", statusFilter);
      if (activityFilter !== "all_activity") query = query.eq("node_type", activityFilter);
      if (startDate) query = query.gte("created_at", startDate.toISOString());
      if (endDate) query = query.lte("created_at", endDate.toISOString());
      if (search.trim()) query = query.ilike("node_id", `%${search.trim()}%`);

      const { data: logs, error, count } = await query;
      if (error) throw error;
      return { logs: (logs ?? []) as LogRow[], total: count ?? 0 };
    },
    enabled: !!flowId,
  });

  const logs = data?.logs ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  // Metriche mini per info veloce
  const failedOnPage = logs.filter(l => l.status === "failed").length;
  const successOnPage = logs.filter(l => l.status === "success").length;

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copiato");
    } catch {
      toast.error("Copia non riuscita");
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Registro di esecuzione</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Visualizza il registro di tutte le azioni eseguite da questo flusso di lavoro.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {successOnPage > 0 && (
            <Badge variant="outline" className={STATUS_STYLES.success}>
              {successOnPage} riuscite
            </Badge>
          )}
          {failedOnPage > 0 && (
            <Badge
              variant="outline"
              className={cn(STATUS_STYLES.failed, "cursor-pointer")}
              onClick={() => { setStatusFilter("failed"); setPage(0); }}
              title="Filtra solo gli errori"
            >
              <AlertCircle className="h-3 w-3 mr-1" />
              {failedOnPage} fallite
            </Badge>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className={cn("justify-start text-left font-normal min-w-[140px]", !startDate && "text-muted-foreground")}>
              <CalendarIcon className="h-3.5 w-3.5 mr-1.5" />
              {startDate ? format(startDate, "dd/MM/yyyy", { locale: it }) : "Data di inizio"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={startDate} onSelect={(d) => { setStartDate(d); setPage(0); }} className="p-3 pointer-events-auto" />
          </PopoverContent>
        </Popover>

        <span className="text-muted-foreground text-sm">→</span>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className={cn("justify-start text-left font-normal min-w-[140px]", !endDate && "text-muted-foreground")}>
              <CalendarIcon className="h-3.5 w-3.5 mr-1.5" />
              {endDate ? format(endDate, "dd/MM/yyyy", { locale: it }) : "Data di fine"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={endDate} onSelect={(d) => { setEndDate(d); setPage(0); }} className="p-3 pointer-events-auto" />
          </PopoverContent>
        </Popover>

        <Select value={activityFilter} onValueChange={(v) => { setActivityFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[160px] h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all_activity">Ogni attività</SelectItem>
            <SelectItem value="email">Email</SelectItem>
            <SelectItem value="sms">SMS</SelectItem>
            <SelectItem value="whatsapp">WhatsApp</SelectItem>
            <SelectItem value="webhook">Webhook</SelectItem>
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[140px] h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all_status">Ogni stato</SelectItem>
            <SelectItem value="success">Successo</SelectItem>
            <SelectItem value="failed">Fallito</SelectItem>
            <SelectItem value="pending">In attesa</SelectItem>
            <SelectItem value="skipped">Saltato</SelectItem>
          </SelectContent>
        </Select>

        <Input
          placeholder="Cerca per nodo..."
          className="w-[200px] h-8 text-sm"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
        />

        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => refetch()}>
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nodo</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Stato</TableHead>
              <TableHead>Eseguito (CET)</TableHead>
              <TableHead>Errore</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="h-48 text-center text-muted-foreground">Caricamento...</TableCell>
              </TableRow>
            ) : logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-48">
                  <div className="flex flex-col items-center justify-center text-muted-foreground">
                    <ScrollText className="h-10 w-10 mb-3 opacity-30" />
                    <p className="text-sm font-medium">Nessun registro trovato</p>
                    <p className="text-xs mt-1">I registri di esecuzione appariranno qui quando il flusso verrà eseguito.</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              logs.map((log) => {
                const isFailed = log.status === "failed";
                return (
                  <TableRow
                    key={log.id}
                    className={cn(isFailed && "bg-rose-50/30 dark:bg-rose-950/10")}
                  >
                    <TableCell className="font-mono text-xs">{log.node_id?.slice(0, 8) ?? "—"}...</TableCell>
                    <TableCell>{log.node_type ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn("text-xs", STATUS_STYLES[log.status] ?? "")}>
                        {STATUS_LABELS[log.status] ?? log.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{format(new Date(log.created_at), "dd/MM/yyyy HH:mm:ss", { locale: it })}</TableCell>
                    <TableCell className="max-w-[280px]">
                      {log.error_message ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-destructive truncate flex-1">{log.error_message}</span>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 shrink-0"
                            onClick={() => setErrorDialog(log)}
                            title="Visualizza errore completo"
                          >
                            <ExternalLink className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{total} risultati totali</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Precedente</Button>
            <span className="flex items-center px-2">Pagina {page + 1} di {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Successiva</Button>
          </div>
        </div>
      )}

      {/* Error detail dialog — include context_json se disponibile */}
      <Dialog open={!!errorDialog} onOpenChange={(o) => !o && setErrorDialog(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              Dettaglio errore
            </DialogTitle>
          </DialogHeader>
          {errorDialog && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">Nodo</p>
                  <p className="font-mono text-xs">{errorDialog.node_id ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Tipo</p>
                  <p>{errorDialog.node_type ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Eseguito</p>
                  <p>{format(new Date(errorDialog.created_at), "dd/MM/yyyy HH:mm:ss", { locale: it })}</p>
                </div>
                {errorDialog.enrollment_id && (
                  <div>
                    <p className="text-xs text-muted-foreground">Iscrizione</p>
                    <p className="font-mono text-xs">{errorDialog.enrollment_id.slice(0, 8)}...</p>
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs text-muted-foreground">Messaggio errore</p>
                  {errorDialog.error_message && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-xs gap-1"
                      onClick={() => copyToClipboard(errorDialog.error_message!)}
                    >
                      <Copy className="h-3 w-3" />
                      Copia
                    </Button>
                  )}
                </div>
                <pre className="bg-muted rounded p-3 text-xs overflow-x-auto whitespace-pre-wrap break-all">
                  {errorDialog.error_message ?? "—"}
                </pre>
              </div>

              {errorDialog.context_json && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs text-muted-foreground">Contesto esecuzione</p>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-xs gap-1"
                      onClick={() => copyToClipboard(JSON.stringify(errorDialog.context_json, null, 2))}
                    >
                      <Copy className="h-3 w-3" />
                      Copia JSON
                    </Button>
                  </div>
                  <pre className="bg-muted rounded p-3 text-xs overflow-x-auto max-h-64">
                    {JSON.stringify(errorDialog.context_json, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
