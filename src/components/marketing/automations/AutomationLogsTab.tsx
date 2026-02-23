import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { CalendarIcon, RefreshCw, ScrollText } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface Props {
  flowId: string;
}

const STATUS_LABELS: Record<string, string> = {
  success: "Successo",
  failed: "Fallito",
  pending: "In attesa",
  skipped: "Saltato",
};

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  success: "default",
  failed: "destructive",
  pending: "outline",
  skipped: "secondary",
};

export function AutomationLogsTab({ flowId }: Props) {
  const [startDate, setStartDate] = useState<Date>();
  const [endDate, setEndDate] = useState<Date>();
  const [activityFilter, setActivityFilter] = useState("all_activity");
  const [statusFilter, setStatusFilter] = useState("all_status");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 25;

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["automation-logs", flowId, startDate, endDate, activityFilter, statusFilter, search, page],
    queryFn: async () => {
      let query = supabase
        .from("automation_execution_log")
        .select("*", { count: "exact" })
        .eq("flow_id", flowId)
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (statusFilter !== "all_status") query = query.eq("status", statusFilter);
      if (activityFilter !== "all_activity") query = query.eq("node_type", activityFilter);
      if (startDate) query = query.gte("created_at", startDate.toISOString());
      if (endDate) query = query.lte("created_at", endDate.toISOString());

      const { data: logs, error, count } = await query;
      if (error) throw error;
      return { logs: logs ?? [], total: count ?? 0 };
    },
    enabled: !!flowId,
  });

  const logs = data?.logs ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Registro di esecuzione</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Visualizza il registro di tutte le azioni eseguite da questo flusso di lavoro.
        </p>
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
              logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="font-mono text-xs">{log.node_id?.slice(0, 8) ?? "—"}...</TableCell>
                  <TableCell>{log.node_type ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANTS[log.status] ?? "outline"}>
                      {STATUS_LABELS[log.status] ?? log.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{format(new Date(log.created_at), "dd/MM/yyyy HH:mm", { locale: it })}</TableCell>
                  <TableCell className="text-xs text-destructive max-w-[200px] truncate">{log.error_message ?? "—"}</TableCell>
                </TableRow>
              ))
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
    </div>
  );
}
