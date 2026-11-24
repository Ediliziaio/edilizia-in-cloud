import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Clock, RotateCcw } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { queryKeys } from "@/lib/queryKeys";
import type { RestoredAutomationGraph } from "@/types/automationBuilder";
import { useT, dateFnsCampo } from "@/lib/campo/lingua/LinguaCampo";

interface Props {
  flowId: string;
  onRestored?: (snapshot: RestoredAutomationGraph) => void;
  isSaving?: boolean;
}

export function WorkflowVersionsPanel({ flowId, onRestored, isSaving }: Props) {
  const t = useT();
  const [ripristinoPrima, ripristinoDopo = ""] = t("Stai per ripristinare la versione {versione}. Le modifiche non salvate andranno perse. Vuoi continuare?").split("{versione}");
  const qc = useQueryClient();
  const [restoreTarget, setRestoreTarget] = useState<any | null>(null);

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

      const { data: flow, error: flowError } = await supabase.from("automation_flows")
        .select("company_id, updated_at").eq("id", flowId).single();
      if (flowError) throw flowError;
      if (isSaving) throw new Error("Attendi la fine del salvataggio prima di ripristinare.");
      const { data: saved, error } = await (supabase as any).rpc("save_automation_graph", {
        p_flow_id: flowId, p_company_id: flow.company_id, p_expected_updated_at: flow.updated_at,
        p_nodes: nodes, p_connections: connections,
      });
      if (error) throw error;
      return {
        ...saved,
        nodes: nodes.map((n: any) => ({ ...n, flow_id: flowId, company_id: flow.company_id, created_at: n.created_at ?? saved.updated_at, updated_at: saved.updated_at })),
        connections: connections.map((c: any) => ({ ...c, flow_id: flowId, company_id: flow.company_id, created_at: c.created_at ?? saved.updated_at })),
      } as RestoredAutomationGraph;
    },
    onSuccess: (snapshot) => {
      onRestored?.(snapshot);
      qc.invalidateQueries({ queryKey: queryKeys.automations.nodes(flowId) });
      qc.invalidateQueries({ queryKey: queryKeys.automations.connections(flowId) });
      qc.invalidateQueries({ queryKey: queryKeys.automations.flow(flowId) });
      qc.invalidateQueries({ queryKey: ["flow-versions", flowId] });
      qc.invalidateQueries({ queryKey: ["automation-flows"] });
      toast.success(t("Versione ripristinata con successo"));
      setRestoreTarget(null);
    },
    onError: (error: any) => {
      toast.error(t("Versione non ripristinata"), { description: error.message });
      setRestoreTarget(null);
    },
  });

  const corrente = versioni[0] ?? null;
  const precedenti = versioni.slice(1);

  return (
    <>
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          <p className="text-[11px] text-muted-foreground">
            {t("La cronologia è disponibile per le ultime 10 versioni.")}
          </p>

          {/* Current version */}
          {corrente && (
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                {t("Versione attuale")}
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
                    {corrente.status === "published" ? t("Pubblicato") : t("Bozza")}
                  </Badge>
                </div>
                {corrente.created_by_name && (
                  <p className="text-xs text-foreground">{corrente.created_by_name}</p>
                )}
                <p className="text-[11px] text-muted-foreground">
                  {formatDistanceToNow(new Date(corrente.created_at), {
                    addSuffix: true,
                    locale: dateFnsCampo(),
                  })}
                </p>
              </div>
            </div>
          )}

          {/* Previous versions */}
          {precedenti.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                {t("Versioni precedenti")}
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
                            locale: dateFnsCampo(),
                          })}
                        </p>
                      </div>
                      <button
                        onClick={() => setRestoreTarget(v)}
                        disabled={restoreMutation.isPending || isSaving}
                        className="text-xs text-primary hover:text-primary/80 font-medium flex items-center gap-1 disabled:opacity-50"
                      >
                        <RotateCcw className="h-3 w-3" aria-hidden="true" /> {t("Ripristina")}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {versioni.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
              <Clock className="h-8 w-8 opacity-30 mb-2" aria-hidden="true" />
              <p className="text-xs">{t("Nessuna versione salvata")}</p>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Restore version confirmation */}
      <AlertDialog open={!!restoreTarget} onOpenChange={(open) => !open && setRestoreTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Ripristina versione")}</AlertDialogTitle>
            <AlertDialogDescription>
              {ripristinoPrima}<strong>v{restoreTarget?.version}</strong>{ripristinoDopo}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={restoreMutation.isPending}>{t("Annulla")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => restoreTarget && restoreMutation.mutate(restoreTarget)}
              disabled={restoreMutation.isPending}
            >
              {restoreMutation.isPending ? t("Ripristino...") : t("Ripristina")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
