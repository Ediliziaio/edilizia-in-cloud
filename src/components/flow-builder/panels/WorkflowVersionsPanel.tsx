import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Clock, RotateCcw } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";
import { toast } from "sonner";

interface Props {
  flowId: string;
}

export function WorkflowVersionsPanel({ flowId }: Props) {
  const qc = useQueryClient();

  const { data: versioni = [] } = useQuery({
    queryKey: ["flow-versions", flowId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("automation_flow_versions")
        .select("*")
        .eq("flow_id", flowId)
        .order("version", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!flowId,
  });

  const restoreMutation = useMutation({
    mutationFn: async (version: any) => {
      const nodes = version.nodes_snapshot ?? [];
      const connections = version.connections_snapshot ?? [];

      // Delete current nodes and connections, then re-insert from snapshot
      const { error: delNodes } = await (supabase as any)
        .from("automation_nodes")
        .delete()
        .eq("flow_id", flowId);
      if (delNodes) throw delNodes;

      const { error: delConns } = await (supabase as any)
        .from("automation_connections")
        .delete()
        .eq("flow_id", flowId);
      if (delConns) throw delConns;

      if (nodes.length > 0) {
        const { error: insNodes } = await (supabase as any)
          .from("automation_nodes")
          .insert(nodes.map((n: any) => ({ ...n, flow_id: flowId })));
        if (insNodes) throw insNodes;
      }

      if (connections.length > 0) {
        const { error: insConns } = await (supabase as any)
          .from("automation_connections")
          .insert(connections.map((c: any) => ({ ...c, flow_id: flowId })));
        if (insConns) throw insConns;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["automation-nodes"] });
      qc.invalidateQueries({ queryKey: ["automation-connections"] });
      qc.invalidateQueries({ queryKey: ["flow-versions", flowId] });
      toast.success("Versione ripristinata con successo");
    },
    onError: () => {
      toast.error("Errore nel ripristino della versione");
    },
  });

  const corrente = versioni[0] ?? null;
  const precedenti = versioni.slice(1);

  return (
    <ScrollArea className="flex-1">
      <div className="p-4 space-y-4">
        <p className="text-[11px] text-muted-foreground">
          La cronologia è disponibile per le ultime 10 versioni.
        </p>

        {/* Current version */}
        {corrente && (
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Versione attuale
            </p>
            <div className="border border-border rounded-xl p-3 bg-muted/30">
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="secondary" className="text-[10px]">
                  v{corrente.version}
                </Badge>
                <Badge
                  variant={corrente.status === "published" ? "default" : "outline"}
                  className="text-[10px]"
                >
                  {corrente.status === "published" ? "Pubblicato" : "Bozza"}
                </Badge>
              </div>
              {corrente.created_by_name && (
                <p className="text-xs text-foreground">{corrente.created_by_name}</p>
              )}
              <p className="text-[11px] text-muted-foreground">
                {formatDistanceToNow(new Date(corrente.created_at), {
                  addSuffix: true,
                  locale: it,
                })}
              </p>
            </div>
          </div>
        )}

        {/* Previous versions */}
        {precedenti.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Versioni precedenti
            </p>
            <div className="space-y-2">
              {precedenti.map((v: any) => (
                <div
                  key={v.id}
                  className="border border-border rounded-xl p-3 bg-background hover:bg-muted/20 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <Badge variant="outline" className="text-[10px]">
                        v{v.version}
                      </Badge>
                      {v.created_by_name && (
                        <p className="text-xs text-foreground mt-1">{v.created_by_name}</p>
                      )}
                      <p className="text-[11px] text-muted-foreground">
                        {formatDistanceToNow(new Date(v.created_at), {
                          addSuffix: true,
                          locale: it,
                        })}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        if (
                          confirm(
                            `Ripristinare la versione ${v.version}? Le modifiche non salvate andranno perse.`
                          )
                        ) {
                          restoreMutation.mutate(v);
                        }
                      }}
                      disabled={restoreMutation.isPending}
                      className="text-xs text-primary hover:text-primary/80 font-medium flex items-center gap-1 disabled:opacity-50"
                    >
                      <RotateCcw className="h-3 w-3" /> Ripristina
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {versioni.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
            <Clock className="h-8 w-8 opacity-30 mb-2" />
            <p className="text-xs">Nessuna versione salvata</p>
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
