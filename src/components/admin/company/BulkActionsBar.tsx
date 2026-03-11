import { useState } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Loader2, X, RefreshCw, Pause, Play, CalendarPlus, CreditCard } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { queryKeys } from "@/lib/queryKeys";

interface BulkActionsBarProps {
  selectedIds: Set<string>;
  companies: Array<{ id: string; name: string; status: string }>;
  onClearSelection: () => void;
}

export function BulkActionsBar({ selectedIds, companies, onClearSelection }: BulkActionsBarProps) {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const [confirmAction, setConfirmAction] = useState<{ type: string; label: string; variant: "default" | "destructive" } | null>(null);
  const [planDialog, setPlanDialog] = useState(false);
  const [trialDialog, setTrialDialog] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string>("");
  const [trialDays, setTrialDays] = useState<number>(7);

  const selectedCompanies = companies.filter((c) => selectedIds.has(c.id));
  const count = selectedIds.size;

  // Fetch plans for plan change dialog
  const { data: plans = [] } = useQuery({
    queryKey: ["subscription-plans-bulk"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscription_plans")
        .select("id, name")
        .eq("is_active", true)
        .order("price_monthly");
      if (error) throw error;
      return data;
    },
    enabled: planDialog,
  });

  const logAuditAction = async (action: string, details: Record<string, any>) => {
    await supabase.from("admin_audit_log").insert({
      user_id: profile?.id || "",
      action,
      target_type: "company",
      details: { company_ids: Array.from(selectedIds), ...details } as any,
    });
  };

  const bulkStatusMutation = useMutation({
    mutationFn: async ({ status }: { status: string }) => {
      const ids = Array.from(selectedIds);
      const { error } = await supabase
        .from("companies")
        .update({ status, updated_at: new Date().toISOString() })
        .in("id", ids);
      if (error) throw error;
      await logAuditAction(`bulk_${status}`, { new_status: status, count: ids.length });
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["admin-companies-full"] });
      const labels: Record<string, string> = { suspended: "sospese", active: "riattivate" };
      toast.success(`${count} aziende ${labels[vars.status] || "aggiornate"}`);
      onClearSelection();
    },
    onError: () => toast.error("Errore nell'operazione bulk"),
  });

  const bulkPlanMutation = useMutation({
    mutationFn: async ({ planId }: { planId: string }) => {
      const ids = Array.from(selectedIds);
      const { error } = await supabase
        .from("companies")
        .update({ subscription_plan_id: planId, updated_at: new Date().toISOString() })
        .in("id", ids);
      if (error) throw error;
      await logAuditAction("bulk_change_plan", { new_plan_id: planId, count: ids.length });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-companies-full"] });
      toast.success(`Piano aggiornato per ${count} aziende`);
      onClearSelection();
      setPlanDialog(false);
    },
    onError: () => toast.error("Errore nel cambio piano"),
  });

  const bulkExtendTrialMutation = useMutation({
    mutationFn: async ({ days }: { days: number }) => {
      const ids = Array.from(selectedIds);
      // Extend trial for each company individually since we need interval math
      for (const id of ids) {
        const { error } = await supabase.rpc("extend_company_trial" as any, {
          p_company_id: id,
          p_days: days,
        });
        // If RPC doesn't exist, fall back to manual update
        if (error) {
          const { data: company } = await supabase
            .from("companies")
            .select("trial_ends_at")
            .eq("id", id)
            .single();
          const baseDate = company?.trial_ends_at ? new Date(company.trial_ends_at) : new Date();
          const newDate = new Date(baseDate);
          newDate.setDate(newDate.getDate() + days);
          const { error: updateErr } = await supabase
            .from("companies")
            .update({ trial_ends_at: newDate.toISOString(), updated_at: new Date().toISOString() })
            .eq("id", id);
          if (updateErr) throw updateErr;
        }
      }
      await logAuditAction("bulk_extend_trial", { days, count: ids.length });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-companies-full"] });
      toast.success(`Trial esteso di ${trialDays} giorni per ${count} aziende`);
      onClearSelection();
      setTrialDialog(false);
    },
    onError: () => toast.error("Errore nell'estensione trial"),
  });

  const isPending = bulkStatusMutation.isPending || bulkPlanMutation.isPending || bulkExtendTrialMutation.isPending;

  if (count === 0) return null;

  return (
    <>
      <div className="flex items-center gap-3 rounded-lg border bg-primary/5 border-primary/20 p-3 animate-in slide-in-from-top-2">
        <Badge variant="default" className="shrink-0">
          {count} selezionat{count === 1 ? "a" : "e"}
        </Badge>

        <div className="flex items-center gap-2 flex-1 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPlanDialog(true)}
            disabled={isPending}
          >
            <CreditCard className="h-3.5 w-3.5 mr-1.5" />
            Cambia Piano
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setTrialDialog(true)}
            disabled={isPending}
          >
            <CalendarPlus className="h-3.5 w-3.5 mr-1.5" />
            Estendi Trial
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setConfirmAction({ type: "suspended", label: "Sospendi", variant: "destructive" })}
            disabled={isPending}
          >
            <Pause className="h-3.5 w-3.5 mr-1.5" />
            Sospendi
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setConfirmAction({ type: "active", label: "Riattiva", variant: "default" })}
            disabled={isPending}
          >
            <Play className="h-3.5 w-3.5 mr-1.5" />
            Riattiva
          </Button>
        </div>

        <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8" onClick={onClearSelection}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Confirm status change */}
      <AlertDialog open={!!confirmAction} onOpenChange={(open) => { if (!open) setConfirmAction(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Conferma: {confirmAction?.label}</AlertDialogTitle>
            <AlertDialogDescription>
              Stai per {confirmAction?.label?.toLowerCase()} {count} aziend{count === 1 ? "a" : "e"}:
              <span className="block mt-2 text-foreground font-medium max-h-32 overflow-y-auto">
                {selectedCompanies.map((c) => c.name).join(", ")}
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmAction) {
                  bulkStatusMutation.mutate({ status: confirmAction.type });
                  setConfirmAction(null);
                }
              }}
              className={confirmAction?.variant === "destructive" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
            >
              {isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              {confirmAction?.label}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Plan change dialog */}
      <Dialog open={planDialog} onOpenChange={setPlanDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Cambia Piano</DialogTitle>
            <DialogDescription>
              Seleziona il nuovo piano per {count} aziend{count === 1 ? "a" : "e"}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Label>Piano</Label>
            <Select value={selectedPlanId} onValueChange={setSelectedPlanId}>
              <SelectTrigger><SelectValue placeholder="Seleziona piano..." /></SelectTrigger>
              <SelectContent>
                {plans.map((p: any) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPlanDialog(false)}>Annulla</Button>
            <Button
              onClick={() => bulkPlanMutation.mutate({ planId: selectedPlanId })}
              disabled={!selectedPlanId || bulkPlanMutation.isPending}
            >
              {bulkPlanMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Applica
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Extend trial dialog */}
      <Dialog open={trialDialog} onOpenChange={setTrialDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Estendi Trial</DialogTitle>
            <DialogDescription>
              Estendi il trial per {count} aziend{count === 1 ? "a" : "e"}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Label>Giorni da aggiungere</Label>
            <Input
              type="number"
              min={1}
              max={365}
              value={trialDays}
              onChange={(e) => setTrialDays(Number(e.target.value))}
            />
            <div className="flex gap-2">
              {[7, 14, 30].map((d) => (
                <Button key={d} variant="outline" size="sm" onClick={() => setTrialDays(d)}>
                  +{d}gg
                </Button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTrialDialog(false)}>Annulla</Button>
            <Button
              onClick={() => bulkExtendTrialMutation.mutate({ days: trialDays })}
              disabled={trialDays < 1 || bulkExtendTrialMutation.isPending}
            >
              {bulkExtendTrialMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Estendi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
