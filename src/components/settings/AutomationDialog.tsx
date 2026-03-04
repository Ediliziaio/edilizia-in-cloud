import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Plus, Zap, Filter, Play, Trash2 } from "lucide-react";
import { AutomationActionBlock, type ActionConfig } from "./AutomationActionBlock";
import type { Json } from "@/integrations/supabase/types";

interface AutomationData {
  id?: string;
  name: string;
  description: string;
  trigger_type: string;
  trigger_config: Record<string, any>;
  conditions: ConditionConfig[];
  actions: ActionConfig[];
}

interface ConditionConfig {
  field: string;
  operator: string;
  value: string;
}

const TRIGGER_TYPES = [
  { value: "order_status_change", label: "Cambio stato commessa" },
  { value: "order_created", label: "Nuova commessa creata" },
  { value: "work_start_date_set", label: "Data inizio lavori impostata" },
  { value: "work_end_date_set", label: "Data fine lavori impostata" },
  { value: "payment_received", label: "Pagamento ricevuto" },
  { value: "due_date_approaching", label: "Scadenza in avvicinamento" },
];

const DATE_FIELD_OPTIONS = [
  { value: "expected_date", label: "Data consegna prevista" },
  { value: "work_start_date", label: "Data inizio lavori" },
  { value: "work_end_date", label: "Data fine lavori" },
];

const CONDITION_FIELDS = [
  { value: "current_status_name", label: "Stato commessa" },
  { value: "total_amount", label: "Importo totale" },
  { value: "payment_type", label: "Tipo pagamento" },
  { value: "has_building_bonus", label: "Bonus edilizio" },
];

const CONDITION_OPERATORS = [
  { value: "equals", label: "Uguale a" },
  { value: "not_equals", label: "Diverso da" },
  { value: "greater_than", label: "Maggiore di" },
  { value: "less_than", label: "Minore di" },
  { value: "contains", label: "Contiene" },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  automation?: any;
  onSaved: () => void;
}

export function AutomationDialog({ open, onOpenChange, automation, onSaved }: Props) {
  const { user, effectiveCompany } = useAuth();
  const [saving, setSaving] = useState(false);
  const [orderStatuses, setOrderStatuses] = useState<{ id: string; name: string }[]>([]);
  const [companyUsers, setCompanyUsers] = useState<{ id: string; name: string }[]>([]);

  const [form, setForm] = useState<AutomationData>({
    name: "",
    description: "",
    trigger_type: "",
    trigger_config: {},
    conditions: [],
    actions: [],
  });

  useEffect(() => {
    if (automation) {
      setForm({
        id: automation.id,
        name: automation.name,
        description: automation.description || "",
        trigger_type: automation.trigger_type,
        trigger_config: (automation.trigger_config as Record<string, any>) || {},
        conditions: (automation.conditions as ConditionConfig[]) || [],
        actions: (automation.actions as ActionConfig[]) || [],
      });
    } else {
      setForm({ name: "", description: "", trigger_type: "", trigger_config: {}, conditions: [], actions: [] });
    }
  }, [automation, open]);

  useEffect(() => {
    if (!effectiveCompany?.id) return;
    const fetchData = async () => {
      const [statusRes, usersRes] = await Promise.all([
        supabase.from("order_statuses").select("id, name").eq("company_id", effectiveCompany.id).order("position"),
        supabase.from("profiles").select("id, first_name, last_name").eq("company_id", effectiveCompany.id),
      ]);
      if (statusRes.data) setOrderStatuses(statusRes.data);
      if (usersRes.data) {
        const userIds = usersRes.data.map((p) => p.id);
        const { data: roles } = await supabase
          .from("user_roles")
          .select("user_id, role")
          .in("user_id", userIds);
        const validUserIds = roles
          ?.filter((r) => ["company_admin", "company_staff", "salesperson", "call_center"].includes(r.role))
          .map((r) => r.user_id) || [];
        setCompanyUsers(usersRes.data.filter((p) => validUserIds.includes(p.id)).map(u => ({ id: u.id, name: `${u.first_name} ${u.last_name}` })));
      }
    };
    fetchData();
  }, [effectiveCompany?.id]);

  const addCondition = () => {
    setForm(f => ({ ...f, conditions: [...f.conditions, { field: "", operator: "equals", value: "" }] }));
  };

  const updateCondition = (i: number, cond: ConditionConfig) => {
    setForm(f => ({ ...f, conditions: f.conditions.map((c, idx) => idx === i ? cond : c) }));
  };

  const removeCondition = (i: number) => {
    setForm(f => ({ ...f, conditions: f.conditions.filter((_, idx) => idx !== i) }));
  };

  const addAction = () => {
    setForm(f => ({ ...f, actions: [...f.actions, { type: "create_task", config: {} }] }));
  };

  const updateAction = (i: number, action: ActionConfig) => {
    setForm(f => ({ ...f, actions: f.actions.map((a, idx) => idx === i ? action : a) }));
  };

  const removeAction = (i: number) => {
    setForm(f => ({ ...f, actions: f.actions.filter((_, idx) => idx !== i) }));
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.trigger_type || form.actions.length === 0) {
      toast.error("Compila tutti i campi obbligatori", { description: "Nome, trigger e almeno un'azione sono richiesti." });
      return;
    }
    if (!effectiveCompany?.id || !user?.id) {
      toast.error("Errore", { description: "Seleziona un'azienda prima di creare un'automazione." });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        description: form.description || null,
        trigger_type: form.trigger_type,
        trigger_config: form.trigger_config as Json,
        conditions: form.conditions as unknown as Json,
        actions: form.actions as unknown as Json,
        company_id: effectiveCompany.id,
        created_by: user.id,
      };

      if (form.id) {
        const { error } = await supabase.from("automations").update(payload).eq("id", form.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("automations").insert(payload);
        if (error) throw error;
      }
      toast.success(form.id ? "Automazione aggiornata" : "Automazione creata");
      onSaved();
      onOpenChange(false);
    } catch (err: any) {
      toast.error("Errore", { description: err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{form.id ? "Modifica Automazione" : "Nuova Automazione"}</DialogTitle>
          <DialogDescription>Configura trigger, condizioni e azioni per questa automazione.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Name & Description */}
          <div className="grid grid-cols-1 gap-3">
            <div>
              <Label>Nome automazione *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="es. Pre-Posa Check" />
            </div>
            <div>
              <Label>Descrizione</Label>
              <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} placeholder="Descrizione opzionale..." />
            </div>
          </div>

          <Separator />

          {/* QUANDO - Trigger */}
          <Card className="border-l-4 border-l-blue-500 bg-blue-50/30">
            <CardContent className="pt-4 space-y-3">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-blue-600" />
                <span className="font-semibold text-sm">QUANDO</span>
              </div>
              <Select value={form.trigger_type} onValueChange={v => setForm(f => ({ ...f, trigger_type: v, trigger_config: {} }))}>
                <SelectTrigger><SelectValue placeholder="Seleziona trigger..." /></SelectTrigger>
                <SelectContent>
                  {TRIGGER_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
              {form.trigger_type === "order_status_change" && (
                <div>
                  <Label className="text-xs">Stato specifico (opzionale)</Label>
                  <Select value={form.trigger_config.target_status_id || "any"} onValueChange={v => setForm(f => ({ ...f, trigger_config: { ...f.trigger_config, target_status_id: v === "any" ? undefined : v } }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Qualsiasi cambio stato</SelectItem>
                      {orderStatuses.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {form.trigger_type === "due_date_approaching" && (
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs">Data da monitorare</Label>
                    <Select value={form.trigger_config.date_field || "expected_date"} onValueChange={v => setForm(f => ({ ...f, trigger_config: { ...f.trigger_config, date_field: v } }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {DATE_FIELD_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Giorni prima della scadenza</Label>
                    <Input
                      type="number"
                      min={1}
                      max={30}
                      value={form.trigger_config.days_before ?? 3}
                      onChange={e => setForm(f => ({ ...f, trigger_config: { ...f.trigger_config, days_before: parseInt(e.target.value) || 3 } }))}
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Connector */}
          <div className="flex justify-center"><div className="w-0.5 h-6 bg-border" /></div>

          {/* SE - Conditions */}
          <Card className="border-l-4 border-l-amber-500 bg-amber-50/30">
            <CardContent className="pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-amber-600" />
                  <span className="font-semibold text-sm">SE</span>
                  <span className="text-xs text-muted-foreground">(opzionale)</span>
                </div>
                <Button variant="outline" size="sm" onClick={addCondition}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Condizione
                </Button>
              </div>
              {form.conditions.map((cond, i) => (
                <div key={i} className="flex items-end gap-2">
                  <div className="flex-1">
                    <Label className="text-xs">Campo</Label>
                    <Select value={cond.field} onValueChange={v => updateCondition(i, { ...cond, field: v })}>
                      <SelectTrigger><SelectValue placeholder="Campo" /></SelectTrigger>
                      <SelectContent>
                        {CONDITION_FIELDS.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex-1">
                    <Label className="text-xs">Operatore</Label>
                    <Select value={cond.operator} onValueChange={v => updateCondition(i, { ...cond, operator: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CONDITION_OPERATORS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex-1">
                    <Label className="text-xs">Valore</Label>
                    <Input value={cond.value} onChange={e => updateCondition(i, { ...cond, value: e.target.value })} />
                  </div>
                  <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => removeCondition(i)}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              ))}
              {form.conditions.length === 0 && (
                <p className="text-xs text-muted-foreground">Nessuna condizione — l'automazione si attiverà sempre al trigger.</p>
              )}
            </CardContent>
          </Card>

          {/* Connector */}
          <div className="flex justify-center"><div className="w-0.5 h-6 bg-border" /></div>

          {/* ALLORA - Actions */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Play className="h-4 w-4 text-emerald-600" />
                <span className="font-semibold text-sm">ALLORA</span>
              </div>
              <Button variant="outline" size="sm" onClick={addAction}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Azione
              </Button>
            </div>
            {form.actions.map((action, i) => (
              <AutomationActionBlock
                key={i}
                action={action}
                index={i}
                orderStatuses={orderStatuses}
                companyUsers={companyUsers}
                onChange={updateAction}
                onRemove={removeAction}
              />
            ))}
            {form.actions.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">Aggiungi almeno un'azione per completare l'automazione.</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Salvataggio..." : form.id ? "Salva modifiche" : "Crea automazione"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
