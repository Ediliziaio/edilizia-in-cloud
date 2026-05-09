/**
 * ApprovalsTab — pending approvals da Silvio
 * Estratto da SilvioAdminHub.tsx (refactor monolite → sub-component).
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { CheckCircle2, XCircle, RefreshCw, AlertTriangle } from "lucide-react";
import type { PendingApproval } from "./shared";

export function ApprovalsTab() {
  const queryClient = useQueryClient();
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["silvio-pending-approvals"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("silvio_pending_approvals")
        .select("*")
        .eq("status", "awaiting")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PendingApproval[];
    },
  });

  const resolveMutation = useMutation({
    mutationFn: async ({
      id,
      status,
    }: {
      id: string;
      status: "approved" | "rejected";
    }) => {
      const { error } = await supabase.rpc(
        "silvio_admin_resolve_approval" as never,
        {
          p_approval_id: id,
          p_status: status,
          p_modified_payload: null,
          p_resolution_note: null,
        } as never,
      );
      if (error) throw error;
    },
    onSuccess: (_, { status }) => {
      toast.success(
        status === "approved" ? "Approvata: in esecuzione" : "Rifiutata",
      );
      queryClient.invalidateQueries({ queryKey: ["silvio-pending-approvals"] });
      queryClient.invalidateQueries({ queryKey: ["silvio-action-queue"] });
    },
    onError: (e) => toast.error("Errore", { description: String(e) }),
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {data?.length ?? 0} azioni in attesa di approvazione
        </p>
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
            <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
            Nessuna azione in attesa. Silvio è in pari.
          </CardContent>
        </Card>
      ) : (
        data.map((a) => (
          <Card key={a.id} className="border-amber-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  Approvazione richiesta
                </span>
                <Badge variant="outline" className="font-mono text-[10px]">
                  {format(new Date(a.created_at), "dd MMM HH:mm", {
                    locale: it,
                  })}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="bg-muted/50 rounded p-3 text-xs whitespace-pre-wrap font-mono">
                {a.preview_md}
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700"
                  onClick={() => {
                    if (
                      window.confirm(
                        "Approvare questa azione e metterla in esecuzione?",
                      )
                    ) {
                      resolveMutation.mutate({ id: a.id, status: "approved" });
                    }
                  }}
                  disabled={resolveMutation.isPending}
                >
                  <CheckCircle2 className="h-4 w-4 mr-1" />
                  Approva
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (
                      window.confirm(
                        "Rifiutare questa azione Silvio? Non verra eseguita.",
                      )
                    ) {
                      resolveMutation.mutate({ id: a.id, status: "rejected" });
                    }
                  }}
                  disabled={resolveMutation.isPending}
                >
                  <XCircle className="h-4 w-4 mr-1" />
                  Rifiuta
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Scade:{" "}
                {format(new Date(a.expires_at), "dd MMM HH:mm", { locale: it })}
              </p>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

// ─── QUEUE TAB ─────────────────────────────────────────────────────────────

