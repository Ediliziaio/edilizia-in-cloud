import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { RefreshCw, Users, Search } from "lucide-react";
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

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  active: { label: "Attivo", variant: "default" },
  completed: { label: "Completato", variant: "secondary" },
  removed: { label: "Rimosso", variant: "destructive" },
  paused: { label: "In pausa", variant: "outline" },
  error: { label: "Errore", variant: "destructive" },
};

export function WorkflowCronologia({ flowId }: Props) {
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 25;

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["flow-enrollments", flowId, statusFilter, search, page],
    queryFn: async () => {
      let q = (supabase as any)
        .from("automation_enrollments")
        .select("*", { count: "exact" })
        .eq("flow_id", flowId!)
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      if (search.trim()) q = q.ilike("entity_id", `%${search.trim()}%`);

      const { data: rows, error, count } = await q;
      if (error) throw error;
      return { rows: rows ?? [], total: count ?? 0 };
    },
    enabled: !!flowId,
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  if (!flowId) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground text-sm">
        Salva il flusso per visualizzare la cronologia.
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Cronologia delle iscrizioni</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Storico di tutti i contatti entrati in questo flusso.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[160px] h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Ogni stato</SelectItem>
            <SelectItem value="active">Attivo</SelectItem>
            <SelectItem value="completed">Completato</SelectItem>
            <SelectItem value="removed">Rimosso</SelectItem>
            <SelectItem value="paused">In pausa</SelectItem>
          </SelectContent>
        </Select>

        <div className="relative">
          <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Cerca per entity ID..."
            className="w-[200px] h-8 text-sm pl-8"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
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
              <TableHead>Entità</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Versione</TableHead>
              <TableHead>Data iscrizione</TableHead>
              <TableHead>Stato</TableHead>
              <TableHead>Ultimo aggiornamento</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-48 text-center text-muted-foreground">
                  Caricamento...
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-48">
                  <div className="flex flex-col items-center justify-center text-muted-foreground">
                    <Users className="h-10 w-10 mb-3 opacity-30" />
                    <p className="text-sm font-medium">Nessuna iscrizione trovata</p>
                    <p className="text-xs mt-1">
                      La cronologia apparirà quando i contatti verranno iscritti.
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row: any) => (
                <TableRow key={row.id}>
                  <TableCell className="font-mono text-xs">
                    {row.entity_id?.slice(0, 8)}...
                  </TableCell>
                  <TableCell>{row.entity_type}</TableCell>
                  <TableCell>v{row.flow_version}</TableCell>
                  <TableCell>
                    {format(new Date(row.created_at), "dd/MM/yyyy HH:mm", { locale: it })}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_MAP[row.status]?.variant ?? "outline"}>
                      {STATUS_MAP[row.status]?.label ?? row.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {format(new Date(row.updated_at), "dd/MM/yyyy HH:mm", { locale: it })}
                  </TableCell>
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
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              Precedente
            </Button>
            <span className="flex items-center px-2">
              Pagina {page + 1} di {totalPages}
            </span>
            <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
              Successiva
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
