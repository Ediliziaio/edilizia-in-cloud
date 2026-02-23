import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Zap, Plus, ExternalLink, MoreHorizontal, Pencil, Copy, Archive, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import { useState, useMemo } from "react";
import type { AutomationFlow } from "@/types/automationBuilder";

interface Props {
  statusFilter: string;
  searchQuery?: string;
}

export function AutomationFlowsList({ statusFilter, searchQuery = "" }: Props) {
  const { effectiveCompany, user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const { data: flows, isLoading } = useQuery({
    queryKey: ["automation-flows", effectiveCompany?.id, statusFilter],
    queryFn: async () => {
      let query = supabase
        .from("automation_flows")
        .select("*")
        .eq("company_id", effectiveCompany!.id)
        .order("updated_at", { ascending: false });

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as AutomationFlow[];
    },
    enabled: !!effectiveCompany?.id,
  });

  // Enrollment counts
  const { data: enrollmentCounts } = useQuery({
    queryKey: ["automation-enrollment-counts", effectiveCompany?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("automation_enrollments")
        .select("flow_id, status")
        .eq("company_id", effectiveCompany!.id);
      if (error) throw error;

      const counts: Record<string, { total: number; active: number }> = {};
      for (const e of data || []) {
        if (!counts[e.flow_id]) counts[e.flow_id] = { total: 0, active: 0 };
        counts[e.flow_id].total++;
        if (e.status === "active") counts[e.flow_id].active++;
      }
      return counts;
    },
    enabled: !!effectiveCompany?.id,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("automation_flows").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automation-flows"] });
      toast({ title: "Automazione eliminata" });
      setDeleteId(null);
    },
    onError: (err: any) => toast({ title: "Errore", description: err.message, variant: "destructive" }),
  });

  const duplicateMutation = useMutation({
    mutationFn: async (flow: AutomationFlow) => {
      const { data, error } = await supabase
        .from("automation_flows")
        .insert({
          company_id: flow.company_id,
          name: `${flow.name} (copia)`,
          description: flow.description,
          status: "draft",
          created_by: user!.id,
        })
        .select()
        .single();
      if (error) throw error;

      const { data: nodes } = await supabase.from("automation_nodes").select("*").eq("flow_id", flow.id);
      if (nodes && nodes.length > 0) {
        const idMap: Record<string, string> = {};
        const newNodes = nodes.map(n => {
          const newId = crypto.randomUUID();
          idMap[n.id] = newId;
          return { id: newId, flow_id: data.id, company_id: n.company_id, node_type: n.node_type, position_x: n.position_x, position_y: n.position_y, config_json: n.config_json, label: n.label };
        });
        await supabase.from("automation_nodes").insert(newNodes);

        const { data: conns } = await supabase.from("automation_connections").select("*").eq("flow_id", flow.id);
        if (conns && conns.length > 0) {
          const newConns = conns.map(c => ({
            flow_id: data.id,
            company_id: c.company_id,
            from_node_id: idMap[c.from_node_id],
            to_node_id: idMap[c.to_node_id],
            label: c.label,
          })).filter(c => c.from_node_id && c.to_node_id);
          if (newConns.length > 0) await supabase.from("automation_connections").insert(newConns);
        }
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automation-flows"] });
      toast({ title: "Automazione duplicata" });
    },
    onError: (err: any) => toast({ title: "Errore", description: err.message, variant: "destructive" }),
  });

  const toggleStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("automation_flows").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["automation-flows"] }),
    onError: (err: any) => toast({ title: "Errore", description: err.message, variant: "destructive" }),
  });

  // Filter + paginate
  const filtered = useMemo(() => {
    if (!flows) return [];
    if (!searchQuery.trim()) return flows;
    const q = searchQuery.toLowerCase();
    return flows.filter(f => f.name.toLowerCase().includes(q));
  }, [flows, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  const allSelected = paginated.length > 0 && paginated.every(f => selectedIds.has(f.id));
  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(paginated.map(f => f.id)));
    }
  };
  const toggleOne = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIds(next);
  };

  const formatDate = (d: string) => {
    const date = new Date(d);
    return date.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" }) +
      ", " + date.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  };

  if (isLoading) {
    return <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>;
  }

  if (!flows || flows.length === 0) {
    return (
      <div className="text-center py-16">
        <Zap className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
        <h3 className="text-lg font-medium mb-1">Nessuna automazione</h3>
        <p className="text-sm text-muted-foreground mb-4">Crea la tua prima automazione visuale.</p>
        <Button onClick={() => navigate("/azienda/marketing/automazioni/nuova")}>
          <Plus className="h-4 w-4 mr-2" /> Crea Automazione
        </Button>
      </div>
    );
  }

  const STATUS_BADGE: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
    draft: { label: "Draft", variant: "secondary" },
    published: { label: "Published", variant: "default" },
    archived: { label: "Archived", variant: "outline" },
  };

  return (
    <>
      <div className="border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="w-10">
                  <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                </TableHead>
                <TableHead>Nome</TableHead>
                <TableHead className="w-28">Stato</TableHead>
                <TableHead className="w-32 text-right">Totale Iscritto</TableHead>
                <TableHead className="w-36 text-right">Dinamico Iscritto</TableHead>
                <TableHead className="w-44">Aggiornato il</TableHead>
                <TableHead className="w-44">Creato il</TableHead>
                <TableHead className="w-24 text-center">Statistiche</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginated.map(flow => {
                const badge = STATUS_BADGE[flow.status] || STATUS_BADGE.draft;
                const counts = enrollmentCounts?.[flow.id] || { total: 0, active: 0 };
                return (
                  <TableRow
                    key={flow.id}
                    className="cursor-pointer hover:bg-muted/40 transition-colors"
                    onClick={() => navigate(`/azienda/marketing/automazioni/${flow.id}`)}
                  >
                    <TableCell onClick={e => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedIds.has(flow.id)}
                        onCheckedChange={() => toggleOne(flow.id)}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{flow.name}</span>
                        <ExternalLink className="h-3.5 w-3.5 text-muted-foreground/50" />
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={badge.variant} className="text-xs">{badge.label}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{counts.total}</TableCell>
                    <TableCell className="text-right tabular-nums">{counts.active}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{formatDate(flow.updated_at)}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{formatDate(flow.created_at)}</TableCell>
                    <TableCell className="text-center">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={e => { e.stopPropagation(); navigate(`/azienda/marketing/automazioni/${flow.id}`); }}>
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </TableCell>
                    <TableCell onClick={e => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => navigate(`/azienda/marketing/automazioni/${flow.id}`)}>
                            <Pencil className="h-3.5 w-3.5 mr-2" /> Modifica
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => duplicateMutation.mutate(flow)}>
                            <Copy className="h-3.5 w-3.5 mr-2" /> Duplica
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => toggleStatusMutation.mutate({
                            id: flow.id,
                            status: flow.status === "published" ? "draft" : "published"
                          })}>
                            <Zap className="h-3.5 w-3.5 mr-2" />
                            {flow.status === "published" ? "Metti in Bozza" : "Pubblica"}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => toggleStatusMutation.mutate({ id: flow.id, status: "archived" })}>
                            <Archive className="h-3.5 w-3.5 mr-2" /> Archivia
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive" onClick={() => setDeleteId(flow.id)}>
                            <Trash2 className="h-3.5 w-3.5 mr-2" /> Elimina
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between border-t px-4 py-2 bg-muted/20">
          <div className="text-xs text-muted-foreground">
            {filtered.length} risultat{filtered.length === 1 ? "o" : "i"}
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" className="h-7 text-xs" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                <ChevronLeft className="h-3.5 w-3.5 mr-1" /> Previous
              </Button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).slice(0, 5).map(p => (
                <Button
                  key={p}
                  variant={page === p ? "default" : "outline"}
                  size="sm"
                  className="h-7 w-7 text-xs p-0"
                  onClick={() => setPage(p)}
                >
                  {p}
                </Button>
              ))}
              <Button variant="outline" size="sm" className="h-7 text-xs" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                Next <ChevronRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </div>
            <Select value={String(pageSize)} onValueChange={v => { setPageSize(Number(v)); setPage(1); }}>
              <SelectTrigger className="h-7 w-24 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10 / page</SelectItem>
                <SelectItem value="25">25 / page</SelectItem>
                <SelectItem value="50">50 / page</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <AlertDialog open={!!deleteId} onOpenChange={o => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina automazione</AlertDialogTitle>
            <AlertDialogDescription>Questa azione è irreversibile. Tutti i nodi e le connessioni verranno eliminati.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteMutation.mutate(deleteId)}>Elimina</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
