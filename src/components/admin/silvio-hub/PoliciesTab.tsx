/**
 * PoliciesTab — automation policies CRUD
 * Estratto da SilvioAdminHub.tsx (refactor monolite → sub-component).
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { MODE_COLORS, MODE_LABELS } from "./shared";
import type { Policy } from "./shared";

export function PoliciesTab() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["silvio-automation-policies"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("silvio_automation_policies")
        .select("*")
        .order("action_type");
      if (error) throw error;
      return (data ?? []) as Policy[];
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      action_type,
      mode,
    }: {
      action_type: string;
      mode: Policy["mode"];
    }) => {
      const { error } = await supabase
        .from("silvio_automation_policies")
        .update({ mode })
        .eq("action_type", action_type);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Policy aggiornata");
      queryClient.invalidateQueries({
        queryKey: ["silvio-automation-policies"],
      });
    },
    onError: (e) => toast.error("Errore", { description: String(e) }),
  });

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        🟢 <strong>Auto</strong>: Silvio agisce subito · 🟡{" "}
        <strong>Auto+Notify</strong>: agisce + notifica con annulla 5min · 🔴{" "}
        <strong>Approval</strong>: prepara bozza + attende OK · ⛔{" "}
        <strong>Bloccato</strong>: solo Florin manualmente
      </p>

      {isLoading ? (
        <Skeleton className="h-64" />
      ) : !data ? null : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Action type</th>
                    <th className="px-3 py-2 text-left">Label</th>
                    <th className="px-3 py-2 text-left">Modalità</th>
                    <th className="px-3 py-2 text-right">Timeout (min)</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((p) => (
                    <tr
                      key={p.action_type}
                      className="border-t hover:bg-muted/20"
                    >
                      <td className="px-3 py-2 font-mono text-xs">
                        {p.action_type}
                      </td>
                      <td className="px-3 py-2">{p.display_label}</td>
                      <td className="px-3 py-2">
                        <Select
                          value={p.mode}
                          onValueChange={(v) =>
                            updateMutation.mutate({
                              action_type: p.action_type,
                              mode: v as Policy["mode"],
                            })
                          }
                        >
                          <SelectTrigger
                            className={`h-8 w-44 text-xs ${MODE_COLORS[p.mode]}`}
                          >
                            <SelectValue>{MODE_LABELS[p.mode]}</SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="auto">🟢 Auto</SelectItem>
                            <SelectItem value="auto_notify">
                              🟡 Auto+Notify
                            </SelectItem>
                            <SelectItem value="approval_required">
                              🔴 Approval
                            </SelectItem>
                            <SelectItem value="blocked">⛔ Bloccato</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-3 py-2 text-right text-xs text-muted-foreground">
                        {p.approval_timeout_minutes ?? "—"}
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

// ─── CHIEF OF STAFF TAB ───────────────────────────────────────────────────

