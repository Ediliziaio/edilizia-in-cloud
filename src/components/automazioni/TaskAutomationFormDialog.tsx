import { useForm } from "react-hook-form";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { toast } from "sonner";

const TRIGGER_OPTIONS = [
  { value: "contact_created", label: "👤 Nuovo contatto/lead" },
  { value: "opportunity_created", label: "🆕 Opportunità creata" },
  { value: "opportunity_stage_changed", label: "🔄 Opportunità cambia fase" },
  { value: "appointment_confirmed", label: "📅 Appuntamento confermato" },
  { value: "appointment_completed", label: "✅ Appuntamento completato" },
];

interface FormData {
  name: string;
  trigger_type: string;
  action_title: string;
  action_notes: string;
  action_priority: string;
  action_assign_to: string;
  action_due_days: number;
  action_category: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rule?: any;
  onSaved: () => void;
}

export function TaskAutomationFormDialog({ open, onOpenChange, rule, onSaved }: Props) {
  const companyId = useEffectiveCompanyId();
  const { user } = useAuth();
  const isEdit = rule?.id && !rule?._preset;

  const { register, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm<FormData>({
    defaultValues: {
      name: rule?.name ?? "",
      trigger_type: rule?.trigger_type ?? "contact_created",
      action_title: rule?.action_title ?? "",
      action_notes: rule?.action_notes ?? "",
      action_priority: rule?.action_priority ?? "normale",
      action_assign_to: rule?.action_assign_to ?? "entity_assignee",
      action_due_days: rule?.action_due_days ?? 1,
      action_category: rule?.action_category ?? "generale",
    },
  });

  // Reset form when rule changes
  const triggerType = watch("trigger_type");
  const priority = watch("action_priority");
  const assignTo = watch("action_assign_to");

  const saveMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const payload = {
        name: data.name,
        trigger_type: data.trigger_type,
        action_title: data.action_title,
        action_notes: data.action_notes || null,
        action_priority: data.action_priority,
        action_assign_to: data.action_assign_to,
        action_due_days: data.action_due_days,
        action_category: data.action_category || "generale",
      };

      if (isEdit) {
        const { error } = await supabase
          .from("task_automation_rules")
          .update(payload)
          .eq("id", rule.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("task_automation_rules")
          .insert({
            ...payload,
            company_id: companyId!,
            created_by: user?.id,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(isEdit ? "Automazione aggiornata" : "Automazione creata");
      onSaved();
      onOpenChange(false);
    },
    onError: (err: any) => toast.error("Errore", { description: err.message }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Modifica automazione" : "Nuova automazione task"}
          </DialogTitle>
          <DialogDescription>
            Configura quando creare automaticamente un task.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(d => saveMutation.mutate(d))} className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label>Nome regola *</Label>
            <Input
              {...register("name", { required: true })}
              placeholder="es. Nuovo lead → Chiamata"
            />
          </div>

          <div className="space-y-2">
            <Label>Quando si verifica... *</Label>
            <Select
              value={triggerType}
              onValueChange={v => setValue("trigger_type", v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRIGGER_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="border-t pt-4 space-y-4">
            <p className="text-sm font-medium text-muted-foreground">→ Crea il task</p>

            <div className="space-y-2">
              <Label>Titolo task *</Label>
              <Input
                {...register("action_title", { required: true })}
                placeholder='es. Prima chiamata a {{contact_name}}'
              />
              <p className="text-xs text-muted-foreground">
                Variabili: {"{{contact_name}}"}, {"{{opportunity_name}}"}, {"{{appointment_title}}"}, {"{{source}}"}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Priorità</Label>
                <Select
                  value={priority}
                  onValueChange={v => setValue("action_priority", v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="urgente">🔴 Urgente</SelectItem>
                    <SelectItem value="alta">🟠 Alta</SelectItem>
                    <SelectItem value="normale">🔵 Normale</SelectItem>
                    <SelectItem value="bassa">⚪ Bassa</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Scadenza (giorni)</Label>
                <Input
                  type="number"
                  min={0}
                  {...register("action_due_days", { valueAsNumber: true })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Assegna a</Label>
                <Select
                  value={assignTo}
                  onValueChange={v => setValue("action_assign_to", v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="entity_assignee">Chi gestisce l'entità</SelectItem>
                    <SelectItem value="creator">Chi ha creato l'evento</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Categoria</Label>
                <Input
                  {...register("action_category")}
                  placeholder="es. chiamata"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Note task (opzionali)</Label>
              <Textarea
                {...register("action_notes")}
                placeholder="Note da includere nel task creato..."
                rows={2}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annulla
            </Button>
            <Button type="submit" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Salvataggio..." : "Salva automazione"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
