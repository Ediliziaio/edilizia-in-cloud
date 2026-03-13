import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { RefreshCw, FileText, CheckCircle, XCircle, Clock, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { it } from "date-fns/locale";

interface Props {
  flowId?: string;
}

const STATO_ICON: Record<string, React.ReactNode> = {
  success: <CheckCircle className="h-3.5 w-3.5 text-green-500" />,
  error: <XCircle className="h-3.5 w-3.5 text-destructive" />,
  running: <Clock className="h-3.5 w-3.5 text-primary" />,
  pending: <Clock className="h-3.5 w-3.5 text-muted-foreground" />,
  skipped: <Clock className="h-3.5 w-3.5 text-muted-foreground" />,
};

export function WorkflowRegistro({ flowId }: Props) {
  const [filtroStato, setFiltroStato] = useState("all");
  const [search, setSearch] = useState("");

  const { data: logs = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ["flow-execution-logs", flowId, filtroStato, search],
    queryFn: async () => {
      let q = (supabase as any)
        .from("automation_execution_log")
        .select("*")
        .eq("flow_id", flowId!)
        .order("created_at", { ascending: false })
        .limit(200);

      if (filtroStato !== "all") q = q.eq("status", filtroStato);

      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!flowId,
  });

  // Also fetch execution runs for summary
  const { data: runs = [] } = useQuery({
    queryKey: ["flow-execution-runs", flowId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("flow_execution_runs")
        .select("*")
        .eq("flow_id", flowId!)
        .order("started_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!flowId,
  });

  if (!flowId) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground text-sm">
        Salva il flusso per visualizzare il registro.
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Registro di esecuzione</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Tutte le esecuzioni effettuate da questo flusso.
        </p>
      </div>

      {/* Summary cards */}
      {runs.length > 0 && (
        <div className="grid grid-cols-4 gap-3">
          <SummaryCard label="Totale esecuzioni" value={runs.length} />
          <SummaryCard label="Completate" value={runs.filter((r: any) => r.status === "completed").length} />
          <SummaryCard label="Errori" value={runs.filter((r: any) => r.status === "error").length} />
          <SummaryCard
            label="Durata media"
            value={
              runs.filter((r: any) => r.duration_ms).length > 0
                ? `${Math.round(runs.filter((r: any) => r.duration_ms).reduce((s: number, r: any) => s + r.duration_ms, 0) / runs.filter((r: any) => r.duration_ms).length)}ms`
                : "—"
            }
          />
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={filtroStato} onValueChange={setFiltroStato}>
          <SelectTrigger className="w-[160px] h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Ogni stato</SelectItem>
            <SelectItem value="success">Completato</SelectItem>
            <SelectItem value="error">Errore</SelectItem>
            <SelectItem value="running">In corso</SelectItem>
            <SelectItem value="skipped">Saltato</SelectItem>
          </SelectContent>
        </Select>

        <div className="relative">
          <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Cerca per nodo..."
            className="w-[200px] h-8 text-sm pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => refetch()}>
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Table */}
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nodo</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Stato</TableHead>
              <TableHead>Eseguito il</TableHead>
              <TableHead>Errore</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="h-48 text-center text-muted-foreground">
                  Caricamento...
                </TableCell>
              </TableRow>
            ) : logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-48">
                  <div className="flex flex-col items-center justify-center text-muted-foreground">
                    <FileText className="h-10 w-10 mb-3 opacity-30" />
                    <p className="text-sm font-medium">Nessun registro trovato</p>
                    <p className="text-xs mt-1">
                      I registri sono disponibili dopo la prima esecuzione.
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              logs
                .filter((log: any) =>
                  !search.trim() ||
                  (log.node_type || "").toLowerCase().includes(search.toLowerCase()) ||
                  (log.node_id || "").toLowerCase().includes(search.toLowerCase())
                )
                .map((log: any) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-mono text-xs">
                      {log.node_id?.slice(0, 8)}...
                    </TableCell>
                    <TableCell>{log.node_type}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        {STATO_ICON[log.status] ?? null}
                        <span className="text-xs">{log.status}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {format(new Date(log.created_at), "dd/MM/yyyy HH:mm", { locale: it })}
                    </TableCell>
                    <TableCell className="text-xs text-destructive max-w-[200px] truncate">
                      {log.error_message || "—"}
                    </TableCell>
                  </TableRow>
                ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border rounded-lg p-3 bg-muted/20">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-lg font-bold">{value}</p>
    </div>
  );
}
