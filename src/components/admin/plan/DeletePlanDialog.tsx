import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { deleteUnusedPlan, fetchPlanDeleteImpact } from "@/lib/adminPlanDeletion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface DeletePlanTarget {
  id: string;
  name: string;
  slug?: string | null;
}

interface DeletePlanDialogProps {
  open: boolean;
  plan: DeletePlanTarget | null;
  onOpenChange: (open: boolean) => void;
  onDeleted?: () => void;
}

export function DeletePlanDialog({ open, plan, onOpenChange, onDeleted }: DeletePlanDialogProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const planId = plan?.id ?? null;

  const impactQuery = useQuery({
    queryKey: ["admin-plan-delete-impact", planId],
    queryFn: () => fetchPlanDeleteImpact(planId!),
    enabled: open && !!planId,
    staleTime: 0,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await deleteUnusedPlan(id);
      if (user?.id) {
        await supabase.from("admin_audit_log").insert({
          user_id: user.id,
          action: "subscription_plan_delete",
          target_type: "subscription_plan",
          target_id: id,
          details: {
            plan_name: plan?.name ?? null,
            slug: plan?.slug ?? null,
            source: "admin_plan_delete_dialog",
          },
        });
      }
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["subscription-plans"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-plan-usage"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-plan-paid-revenue"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-plan-delete-impact"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-plan-detail", planId] }),
        queryClient.invalidateQueries({ queryKey: ["admin-plan-company-count", planId] }),
      ]);
      toast({ title: "Piano eliminato" });
      onOpenChange(false);
      onDeleted?.();
    },
    onError: (error: Error) => {
      toast({ title: "Piano non eliminato", description: error.message, variant: "destructive" });
      impactQuery.refetch();
    },
  });

  const impact = impactQuery.data;
  const isChecking = impactQuery.isLoading || impactQuery.isFetching;
  const canDelete = !!impact?.canDelete && !isChecking && !deleteMutation.isPending;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-destructive" />
            Elimina piano
          </AlertDialogTitle>
          <AlertDialogDescription>
            {plan ? (
              <>
                Stai per eliminare <strong>{plan.name}</strong>
                {plan.slug ? <> (<code>{plan.slug}</code>)</> : null}.
              </>
            ) : (
              "Seleziona un piano da eliminare."
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {isChecking && (
          <div className="flex items-center gap-2 rounded-lg border p-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Controllo aziende, abbonamenti e storico collegati...
          </div>
        )}

        {impactQuery.isError && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Non riesco a verificare i collegamenti del piano. Per sicurezza non lo elimino.
            </AlertDescription>
          </Alert>
        )}

        {impact && (
          <div className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Aziende assegnate</p>
                <p className="text-lg font-semibold">{impact.companies}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Abbonamenti</p>
                <p className="text-lg font-semibold">{impact.subscriptions}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Eventi storico</p>
                <p className="text-lg font-semibold">{impact.logs}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Default feature</p>
                <p className="text-lg font-semibold">{impact.featureDefaults}</p>
              </div>
            </div>

            {impact.canDelete ? (
              <Alert>
                <Trash2 className="h-4 w-4" />
                <AlertDescription>
                  Nessun collegamento bloccante trovato. L'eliminazione è definitiva e rimuove anche i default feature del piano.
                </AlertDescription>
              </Alert>
            ) : (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Questo piano è collegato a dati operativi o storici e non può essere eliminato in sicurezza.
                  Usa <Badge variant="secondary" className="mx-1">Disattiva</Badge>
                  per non venderlo più, poi sposta le aziende su un altro piano.
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleteMutation.isPending}>Annulla</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={!canDelete}
            onClick={() => planId && deleteMutation.mutate(planId)}
          >
            {deleteMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4 mr-2" />
            )}
            Elimina definitivamente
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
