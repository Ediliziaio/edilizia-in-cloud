/**
 * QueueTab — action queue real-time monitor
 * Estratto da SilvioAdminHub.tsx (refactor monolite → sub-component).
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Clock, RefreshCw } from "lucide-react";
import { STATUS_COLORS } from "./shared";
import type { QueueAction } from "./shared";

export function QueueTab() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["silvio-action-queue", statusFilter],
    refetchInterval: 15_000,
    queryFn: async () => {
      let q = supabase
        .from("silvio_action_queue")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as QueueAction[];
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc(
        "silvio_admin_update_queue_action" as never,
        {
          p_action_id: id,
          p_operation: "cancel",
        } as never,
      );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Azione cancellata");
      queryClient.invalidateQueries({ queryKey: ["silvio-action-queue"] });
    },
    onError: (e) =>
      toast.error("Errore cancellazione", { description: String(e) }),
  });

  const retryMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc(
        "silvio_admin_update_queue_action" as never,
        {
          p_action_id: id,
          p_operation: "retry",
        } as never,
      );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Re-enqueued");
      queryClient.invalidateQueries({ queryKey: ["silvio-action-queue"] });
    },
    onError: (e) => toast.error("Errore retry", { description: String(e) }),
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filtra status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti</SelectItem>
            <SelectItem value="queued">In coda</SelectItem>
            <SelectItem value="awaiting_approval">
              In attesa approval
            </SelectItem>
            <SelectItem value="running">In esecuzione</SelectItem>
            <SelectItem value="done">Completate</SelectItem>
            <SelectItem value="failed">Fallite</SelectItem>
            <SelectItem value="cancelled">Cancellate</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw
            className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`}
          />
          Aggiorna
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-40" />
      ) : !data || data.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center text-sm text-muted-foreground">
            <Clock className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            Coda vuota. Niente azioni schedulate.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Action</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-left">Origine</th>
                    <th className="px-3 py-2 text-right">Tentativi</th>
                    <th className="px-3 py-2 text-left">Schedulato</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((a) => (
                    <tr key={a.id} className="border-t hover:bg-muted/20">
                      <td className="px-3 py-2 font-mono text-xs">
                        {a.action_type}
                      </td>
                      <td className="px-3 py-2">
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${STATUS_COLORS[a.status] ?? ""}`}
                        >
                          {a.status}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {a.initiated_by}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs">
                        {a.attempts}/{a.max_attempts}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {format(new Date(a.scheduled_for), "dd/MM HH:mm:ss", {
                          locale: it,
                        })}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1 justify-end">
                          {a.status === "failed" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs"
                              onClick={() => {
                                if (
                                  window.confirm(
                                    "Rimettere in coda questa azione fallita?",
                                  )
                                )
                                  retryMutation.mutate(a.id);
                              }}
                              disabled={retryMutation.isPending}
                            >
                              Retry
                            </Button>
                          )}
                          {(a.status === "queued" ||
                            a.status === "awaiting_approval") && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs text-rose-600"
                              onClick={() => {
                                if (
                                  window.confirm(
                                    "Cancellare questa azione dalla coda Silvio?",
                                  )
                                )
                                  cancelMutation.mutate(a.id);
                              }}
                              disabled={cancelMutation.isPending}
                            >
                              Cancella
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── POLICIES TAB ──────────────────────────────────────────────────────────

