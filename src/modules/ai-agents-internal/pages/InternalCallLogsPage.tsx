import { useState, useMemo } from "react";
import { useInternalCallLogs } from "../hooks/useInternalCallLogs";
import { CallDetailDrawer } from "../components/CallDetailDrawer";
import { useCompanyId } from "@/hooks/useCompanyId";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, Search, Phone, PhoneOutgoing } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";

export default function InternalCallLogsPage() {
  const companyId = useCompanyId();
  const { data: logs = [], isLoading } = useInternalCallLogs(companyId);

  const [search, setSearch] = useState("");
  const [directionFilter, setDirectionFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return logs.filter((log) => {
      if (directionFilter !== "all" && log.call_direction !== directionFilter) return false;
      if (statusFilter !== "all" && log.status !== statusFilter) return false;
      if (search) {
        const s = search.toLowerCase();
        const match =
          (log.contact_name?.toLowerCase().includes(s)) ||
          (log.caller_phone?.includes(s)) ||
          (log.agent?.name?.toLowerCase().includes(s)) ||
          (log.summary?.toLowerCase().includes(s));
        if (!match) return false;
      }
      return true;
    });
  }, [logs, search, directionFilter, statusFilter]);

  const handleExportCSV = () => {
    const headers = ["Data", "Contatto", "Telefono", "Agente", "Direzione", "Stato", "Esito", "Durata (s)", "Messaggi", "Riepilogo"];
    const rows = filtered.map((l) => [
      format(new Date(l.started_at), "dd/MM/yyyy HH:mm"),
      l.contact_name ?? "",
      l.caller_phone ?? "",
      l.agent?.name ?? "",
      l.call_direction,
      l.status,
      l.outcome ?? "",
      String(l.duration_seconds),
      String(l.messages_count),
      (l.summary ?? "").replace(/"/g, '""'),
    ]);

    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chiamate-interne-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Registro Chiamate</h2>
        <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={!filtered.length}>
          <Download className="h-4 w-4 mr-1" /> Esporta CSV
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cerca contatto, telefono, agente..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={directionFilter} onValueChange={setDirectionFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Direzione" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutte</SelectItem>
            <SelectItem value="inbound">In entrata</SelectItem>
            <SelectItem value="outbound">In uscita</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Stato" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti</SelectItem>
            <SelectItem value="completed">Completata</SelectItem>
            <SelectItem value="in_progress">In corso</SelectItem>
            <SelectItem value="failed">Fallita</SelectItem>
            <SelectItem value="no_answer">Non risposta</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Phone className="h-10 w-10 mx-auto mb-2 opacity-40" />
          <p>Nessuna chiamata registrata</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[140px]">Data</TableHead>
                <TableHead>Contatto</TableHead>
                <TableHead>Agente</TableHead>
                <TableHead className="w-[80px]">Dir.</TableHead>
                <TableHead className="w-[100px]">Stato</TableHead>
                <TableHead className="w-[80px]">Durata</TableHead>
                <TableHead className="w-[60px]">Msg</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((log) => (
                <TableRow
                  key={log.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => setSelectedCallId(log.id)}
                >
                  <TableCell className="text-xs">
                    {format(new Date(log.started_at), "dd/MM/yy HH:mm", { locale: it })}
                  </TableCell>
                  <TableCell>
                    <div className="text-sm font-medium">{log.contact_name ?? "Sconosciuto"}</div>
                    {log.caller_phone && (
                      <div className="text-xs text-muted-foreground">{log.caller_phone}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{log.agent?.name ?? "—"}</TableCell>
                  <TableCell>
                    {log.call_direction === "inbound" ? (
                      <Phone className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <PhoneOutgoing className="h-4 w-4 text-blue-600" />
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        log.status === "completed"
                          ? "default"
                          : log.status === "failed"
                          ? "destructive"
                          : "secondary"
                      }
                      className="text-[10px]"
                    >
                      {log.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm tabular-nums">
                    {formatDuration(log.duration_seconds)}
                  </TableCell>
                  <TableCell className="text-sm tabular-nums">{log.messages_count}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <CallDetailDrawer
        callId={selectedCallId}
        open={!!selectedCallId}
        onOpenChange={(open) => !open && setSelectedCallId(null)}
      />
    </div>
  );
}
