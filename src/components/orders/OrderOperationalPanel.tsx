/**
 * OrderOperationalPanel — pannello operativo della commessa:
 *  - Prossima azione ("cosa fare adesso") + scadenza, con alert se scaduta.
 *  - Responsabile (orders.assigned_to) tra lo staff aziendale.
 *  - Checklist fasi (Sopralluogo → Materiale → Posa → Collaudo → Fatturazione).
 *
 * Solo letture/scritture su `orders`; salva e invalida la query dell'ordine.
 */
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { useCompanyStaffUsers } from "@/hooks/useCompanyStaffUsers";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Target, AlertTriangle, Loader2, ListChecks, User } from "lucide-react";
import { cn } from "@/lib/utils";

const PHASES = [
  { key: "sopralluogo", label: "Sopralluogo" },
  { key: "materiale", label: "Materiale ordinato" },
  { key: "posa", label: "Posa / Installazione" },
  { key: "collaudo", label: "Collaudo" },
  { key: "fatturazione", label: "Fatturazione" },
] as const;

interface Props {
  orderId: string;
  companyId: string;
  initialNextAction?: string | null;
  initialNextActionDate?: string | null;
  initialAssignedTo?: string | null;
  initialChecklist?: Record<string, boolean> | null;
  canEdit?: boolean;
}

export function OrderOperationalPanel({
  orderId, companyId, initialNextAction, initialNextActionDate, initialAssignedTo, initialChecklist, canEdit = true,
}: Props) {
  const queryClient = useQueryClient();
  const { data: staff = [] } = useCompanyStaffUsers(companyId, "all");

  const [nextAction, setNextAction] = useState(initialNextAction ?? "");
  const [nextActionDate, setNextActionDate] = useState(initialNextActionDate ?? "");
  const [assignedTo, setAssignedTo] = useState(initialAssignedTo ?? "");
  const [checklist, setChecklist] = useState<Record<string, boolean>>(initialChecklist ?? {});
  const [savingAction, setSavingAction] = useState(false);
  const [savingAssign, setSavingAssign] = useState(false);

  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.orders.detail(orderId) });

  const update = async (patch: Record<string, unknown>): Promise<boolean> => {
    const { error } = await supabase.from("orders").update(patch as never).eq("id", orderId);
    if (error) { toast.error("Salvataggio non riuscito", { description: error.message }); return false; }
    return true;
  };

  const isOverdue = useMemo(() => {
    if (!nextAction.trim() || !nextActionDate) return false;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return new Date(nextActionDate) < today;
  }, [nextAction, nextActionDate]);

  const saveAction = async () => {
    setSavingAction(true);
    if (await update({ next_action: nextAction.trim() || null, next_action_date: nextActionDate || null })) {
      toast.success("Prossima azione salvata");
      refresh();
    }
    setSavingAction(false);
  };

  const changeAssignee = async (value: string) => {
    const v = value === "none" ? "" : value;
    setAssignedTo(v);
    setSavingAssign(true);
    if (await update({ assigned_to: v || null })) refresh();
    setSavingAssign(false);
  };

  const togglePhase = async (key: string, checked: boolean) => {
    const next = { ...checklist, [key]: checked };
    setChecklist(next);
    if (await update({ operational_checklist: next })) refresh();
    else setChecklist(checklist); // rollback su errore
  };

  const doneCount = PHASES.filter((p) => checklist[p.key]).length;
  const staffName = (id: string) => {
    const u = staff.find((s) => s.id === id);
    return u ? `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || "Utente" : "";
  };
  const dirtyAction = (nextAction ?? "") !== (initialNextAction ?? "") || (nextActionDate ?? "") !== (initialNextActionDate ?? "");

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Target className="h-4 w-4 text-primary" /> Operatività commessa
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Prossima azione + scadenza */}
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
            Prossima azione — cosa fare adesso
            {isOverdue && (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-destructive">
                <AlertTriangle className="h-3 w-3" /> scaduta
              </span>
            )}
          </Label>
          <Textarea
            value={nextAction}
            onChange={(e) => setNextAction(e.target.value)}
            placeholder="Es. Ordinare i serramenti · Chiamare il cliente per la posa · Inviare il SAL…"
            rows={2}
            className="text-sm resize-none"
            disabled={!canEdit}
          />
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={nextActionDate}
              onChange={(e) => setNextActionDate(e.target.value)}
              className={cn("h-9 text-sm w-auto", isOverdue && "border-destructive text-destructive")}
              disabled={!canEdit}
            />
            <Button size="sm" onClick={saveAction} disabled={!canEdit || savingAction || !dirtyAction}>
              {savingAction ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salva azione"}
            </Button>
          </div>
        </div>

        {/* Responsabile */}
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
            <User className="h-3.5 w-3.5" /> Responsabile commessa
            {savingAssign && <Loader2 className="h-3 w-3 animate-spin" />}
          </Label>
          <Select value={assignedTo || "none"} onValueChange={changeAssignee} disabled={!canEdit}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Nessun responsabile">{assignedTo ? staffName(assignedTo) : "Nessun responsabile"}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Nessun responsabile</SelectItem>
              {staff.map((u) => (
                <SelectItem key={u.id} value={u.id}>{`${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || "Utente"}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Checklist fasi */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
            <ListChecks className="h-3.5 w-3.5" /> Avanzamento fasi
            <span className="ml-auto text-[11px] tabular-nums">{doneCount}/{PHASES.length}</span>
          </Label>
          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(doneCount / PHASES.length) * 100}%` }} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1">
            {PHASES.map((p) => (
              <label key={p.key} className="flex items-center gap-2 rounded-md border bg-card px-2.5 py-2 text-sm cursor-pointer hover:bg-accent/40">
                <Checkbox
                  checked={!!checklist[p.key]}
                  onCheckedChange={(c) => canEdit && togglePhase(p.key, !!c)}
                  disabled={!canEdit}
                />
                <span className={cn(checklist[p.key] && "line-through text-muted-foreground")}>{p.label}</span>
              </label>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default OrderOperationalPanel;
