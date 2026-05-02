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
import { Loader2, X, Pause, Play, CalendarPlus, CreditCard, ClipboardList } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { queryKeys } from "@/lib/queryKeys";
import { useSuperAdminPermissions } from "@/hooks/useSuperAdminPermissions";

interface BulkActionsBarProps {
  selectedIds: Set<string>;
  companies: Array<{ id: string; name: string; status: string }>;
  onClearSelection: () => void;
}

async function getFunctionErrorMessage(error: unknown): Promise<string> {
  const fallback = error instanceof Error ? error.message : "Errore durante l'operazione";
  const context = (error as { context?: unknown } | null)?.context;
  if (context instanceof Response) {
    try {
      const payload = await context.clone().json() as { error?: string; message?: string };
      return payload.error || payload.message || fallback;
    } catch {
      try {
        const text = await context.clone().text();
        return text || fallback;
      } catch {
        return fallback;
      }
    }
  }
  return fallback;
}

export function BulkActionsBar({ selectedIds, companies, onClearSelection }: BulkActionsBarProps) {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const { permissions } = useSuperAdminPermissions();
  const [confirmAction, setConfirmAction] = useState<{ type: string; label: string; variant: "default" | "destructive" } | null>(null);
  const [planDialog, setPlanDialog] = useState(false);
  const [trialDialog, setTrialDialog] = useState(false);
  const [csTaskDialog, setCsTaskDialog] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string>("");
  const [trialDays, setTrialDays] = useState<number>(7);
  const [csTitle, setCsTitle] = useState("");
  const [csDesc, setCsDesc] = useState("");
  const [csPriority, setCsPriority] = useState("medium");
  const [csDueDate, setCsDueDate] = useState("");

  const selectedCompanies = companies.filter((c) => selectedIds.has(c.id));
  const count = selectedIds.size;
  const selectedIdList = Array.from(selectedIds);
  const hasUnauthorizedSelection = !!permissions.allowed_company_ids?.length
    && selectedIdList.some((id) => !permissions.allowed_company_ids?.includes(id));

  const invalidateCompanies = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.admin.companiesFull });
    queryClient.invalidateQueries({ queryKey: ["admin-companies-summary"] });
  };

  // Fetch plans for plan change dialog
  const { data: plans = [] } = useQuery({
    queryKey: queryKeys.admin.subscriptionPlans,
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
    if (!profile?.id) return;
    await supabase.from("admin_audit_log").insert({
      user_id: profile.id,
      action,
      target_type: "company",
      details: { company_ids: Array.from(selectedIds), ...details } as any,
    });
  };

  const bulkStatusMutation = useMutation({
    mutationFn: async ({ status }: { status: string }) => {
      if (!permissions.bulk_actions) {
        throw new Error("Permesso negato: non puoi modificare lo stato aziende");
      }
      if (hasUnauthorizedSelection) {
        throw new Error("Permesso negato: selezione fuori perimetro amministrativo");
      }
      const ids = selectedIdList;
      const { error } = await supabase
        .from("companies")
        .update({ status, updated_at: new Date().toISOString() })
        .in("id", ids);
      if (error) throw error;
      await logAuditAction(`bulk_${status}`, { new_status: status, count: ids.length });
    },
    onSuccess: (_, vars) => {
      invalidateCompanies();
      const labels: Record<string, string> = { suspended: "sospese", active: "riattivate" };
      toast.success(`${count} aziende ${labels[vars.status] || "aggiornate"}`);
      onClearSelection();
    },
    onError: (error: Error) => toast.error("Errore nell'operazione bulk", { description: error.message }),
  });

  const bulkPlanMutation = useMutation({
    mutationFn: async ({ planId }: { planId: string }) => {
      if (!permissions.billing_write) {
        throw new Error("Permesso negato: non puoi cambiare piano alle aziende");
      }
      if (hasUnauthorizedSelection) {
        throw new Error("Permesso negato: selezione fuori perimetro amministrativo");
      }
      const ids = selectedIdList;
      for (const companyId of ids) {
        const { data, error } = await supabase.functions.invoke("admin-change-plan", {
          body: { company_id: companyId, new_plan_id: planId },
        });
        if (error) throw new Error(await getFunctionErrorMessage(error));
        if ((data as { error?: string } | null)?.error) {
          throw new Error((data as { error: string }).error);
        }
      }
      await logAuditAction("bulk_change_plan", { new_plan_id: planId, count: ids.length });
    },
    onSuccess: () => {
      invalidateCompanies();
      toast.success(`Piano aggiornato per ${count} aziende`);
      onClearSelection();
      setPlanDialog(false);
    },
    onError: (error: Error) => toast.error("Errore nel cambio piano", { description: error.message }),
  });

  const bulkExtendTrialMutation = useMutation({
    mutationFn: async ({ days }: { days: number }) => {
      if (!permissions.billing_write) {
        throw new Error("Permesso negato: non puoi modificare trial o billing");
      }
      if (hasUnauthorizedSelection) {
        throw new Error("Permesso negato: selezione fuori perimetro amministrativo");
      }
      const ids = selectedIdList;
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
      invalidateCompanies();
      toast.success(`Trial esteso di ${trialDays} giorni per ${count} aziende`);
      onClearSelection();
      setTrialDialog(false);
    },
    onError: (error: Error) => toast.error("Errore nell'estensione trial", { description: error.message }),
  });

  const bulkCsTaskMutation = useMutation({
    mutationFn: async () => {
      if (!permissions.bulk_actions) {
        throw new Error("Permesso negato: non puoi creare task massivi");
      }
      if (hasUnauthorizedSelection) {
        throw new Error("Permesso negato: selezione fuori perimetro amministrativo");
      }
      if (!profile?.id) throw new Error("Profilo admin non disponibile");
      const ids = selectedIdList;
      const rows = ids.map((company_id) => ({
        company_id,
        title: csTitle,
        description: csDesc || null,
        priority: csPriority,
        due_date: csDueDate || null,
        created_by: profile.id,
        assigned_to: profile.id,
      }));
      const { error } = await supabase.from("cs_tasks" as never).insert(rows as never);
      if (error) throw error;
      await logAuditAction("bulk_create_cs_task", { title: csTitle, count: ids.length });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.csTasks.all });
      toast.success(`CS Task creato per ${count} aziend${count === 1 ? "a" : "e"}`);
      setCsTaskDialog(false);
      setCsTitle(""); setCsDesc(""); setCsPriority("medium"); setCsDueDate("");
      onClearSelection();
    },
    onError: (error: Error) => toast.error("Errore nella creazione CS Task", { description: error.message }),
  });

  const isPending = bulkStatusMutation.isPending || bulkPlanMutation.isPending || bulkExtendTrialMutation.isPending || bulkCsTaskMutation.isPending;
  const actionsBlocked = hasUnauthorizedSelection || (!permissions.bulk_actions && !permissions.billing_write);

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
            disabled={isPending || !permissions.billing_write || hasUnauthorizedSelection}
          >
            <CreditCard className="h-3.5 w-3.5 mr-1.5" />
            Cambia Piano
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setTrialDialog(true)}
            disabled={isPending || !permissions.billing_write || hasUnauthorizedSelection}
          >
            <CalendarPlus className="h-3.5 w-3.5 mr-1.5" />
            Estendi Trial
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setConfirmAction({ type: "suspended", label: "Sospendi", variant: "destructive" })}
            disabled={isPending || !permissions.bulk_actions || hasUnauthorizedSelection}
          >
            <Pause className="h-3.5 w-3.5 mr-1.5" />
            Sospendi
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setConfirmAction({ type: "active", label: "Riattiva", variant: "default" })}
            disabled={isPending || !permissions.bulk_actions || hasUnauthorizedSelection}
          >
            <Play className="h-3.5 w-3.5 mr-1.5" />
            Riattiva
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCsTaskDialog(true)}
            disabled={isPending || !permissions.bulk_actions || hasUnauthorizedSelection}
          >
            <ClipboardList className="h-3.5 w-3.5 mr-1.5" />
            Crea CS Task
          </Button>
        </div>

        <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8" onClick={onClearSelection}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      {actionsBlocked && (
        <p className="mt-1 text-xs text-destructive">
          Alcune azioni massive sono bloccate: verifica permessi e perimetro aziende assegnato.
        </p>
      )}

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

      {/* Bulk CS Task dialog */}
      <Dialog open={csTaskDialog} onOpenChange={setCsTaskDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Crea CS Task</DialogTitle>
            <DialogDescription>
              Crea un task per {count} aziend{count === 1 ? "a" : "e"} selezionat{count === 1 ? "a" : "e"}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Titolo</Label>
              <Input value={csTitle} onChange={(e) => setCsTitle(e.target.value)} placeholder="Es: Follow-up onboarding" />
            </div>
            <div>
              <Label>Descrizione</Label>
              <Textarea value={csDesc} onChange={(e) => setCsDesc(e.target.value)} placeholder="Dettagli opzionali" rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Priorità</Label>
                <Select value={csPriority} onValueChange={setCsPriority}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Bassa</SelectItem>
                    <SelectItem value="medium">Media</SelectItem>
                    <SelectItem value="high">Alta</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Scadenza</Label>
                <Input type="date" value={csDueDate} onChange={(e) => setCsDueDate(e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCsTaskDialog(false)}>Annulla</Button>
            <Button
              onClick={() => bulkCsTaskMutation.mutate()}
              disabled={!csTitle.trim() || bulkCsTaskMutation.isPending}
            >
              {bulkCsTaskMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Crea Task
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
