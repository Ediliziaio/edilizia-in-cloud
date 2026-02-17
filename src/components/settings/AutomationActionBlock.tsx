import { Trash2, ListTodo, ArrowRightLeft, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

export interface ActionConfig {
  type: string;
  config: Record<string, any>;
}

interface Props {
  action: ActionConfig;
  index: number;
  orderStatuses: { id: string; name: string }[];
  companyUsers: { id: string; name: string }[];
  onChange: (index: number, action: ActionConfig) => void;
  onRemove: (index: number) => void;
}

const ACTION_TYPES = [
  { value: "create_task", label: "Crea attività", icon: ListTodo, color: "text-emerald-600" },
  { value: "change_order_status", label: "Cambia stato commessa", icon: ArrowRightLeft, color: "text-blue-600" },
  { value: "create_reminder", label: "Crea promemoria", icon: Bell, color: "text-amber-600" },
];

const PRIORITIES = [
  { value: "bassa", label: "Bassa" },
  { value: "normale", label: "Normale" },
  { value: "alta", label: "Alta" },
  { value: "urgente", label: "Urgente" },
];

const DUE_DATE_REFERENCES = [
  { value: "work_start_date", label: "Data inizio lavori" },
  { value: "work_end_date", label: "Data fine lavori" },
  { value: "expected_date", label: "Data prevista consegna" },
];

export function AutomationActionBlock({ action, index, orderStatuses, companyUsers, onChange, onRemove }: Props) {
  const actionMeta = ACTION_TYPES.find(a => a.value === action.type);
  const Icon = actionMeta?.icon || ListTodo;

  const updateConfig = (key: string, value: any) => {
    onChange(index, { ...action, config: { ...action.config, [key]: value } });
  };

  return (
    <Card className="border-l-4 border-l-emerald-500 bg-emerald-50/30">
      <CardContent className="pt-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon className={`h-4 w-4 ${actionMeta?.color || "text-muted-foreground"}`} />
            <span className="text-sm font-medium">Azione {index + 1}</span>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onRemove(index)}>
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
        </div>

        <Select value={action.type} onValueChange={(v) => onChange(index, { type: v, config: {} })}>
          <SelectTrigger><SelectValue placeholder="Tipo azione" /></SelectTrigger>
          <SelectContent>
            {ACTION_TYPES.map(t => (
              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {action.type === "create_task" && (
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Titolo attività</Label>
              <Input value={action.config.title || ""} onChange={e => updateConfig("title", e.target.value)} placeholder="es. Verificare materiali per posa" />
            </div>
            <div>
              <Label className="text-xs">Note</Label>
              <Textarea value={action.config.notes || ""} onChange={e => updateConfig("notes", e.target.value)} placeholder="Descrizione dettagliata..." rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Priorità</Label>
                <Select value={action.config.priority || "normale"} onValueChange={v => updateConfig("priority", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Assegna a</Label>
                <Select value={action.config.assigned_to_id || "none"} onValueChange={v => updateConfig("assigned_to_id", v === "none" ? null : v)}>
                  <SelectTrigger><SelectValue placeholder="Nessuno" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nessuno</SelectItem>
                    {companyUsers.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Scadenza relativa a</Label>
                <Select value={action.config.due_date_reference || ""} onValueChange={v => updateConfig("due_date_reference", v)}>
                  <SelectTrigger><SelectValue placeholder="Seleziona data" /></SelectTrigger>
                  <SelectContent>
                    {DUE_DATE_REFERENCES.map(d => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Giorni offset</Label>
                <Input type="number" value={action.config.due_date_offset_days ?? 0} onChange={e => updateConfig("due_date_offset_days", parseInt(e.target.value) || 0)} placeholder="-5 = 5 gg prima" />
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {(action.config.due_date_offset_days ?? 0) < 0
                    ? `${Math.abs(action.config.due_date_offset_days)} giorni prima`
                    : (action.config.due_date_offset_days ?? 0) > 0
                    ? `${action.config.due_date_offset_days} giorni dopo`
                    : "Stesso giorno"}
                </p>
              </div>
            </div>
          </div>
        )}

        {action.type === "change_order_status" && (
          <div>
            <Label className="text-xs">Nuovo stato commessa</Label>
            <Select value={action.config.target_status_id || ""} onValueChange={v => updateConfig("target_status_id", v)}>
              <SelectTrigger><SelectValue placeholder="Seleziona stato" /></SelectTrigger>
              <SelectContent>
                {orderStatuses.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}

        {action.type === "create_reminder" && (
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Titolo promemoria</Label>
              <Input value={action.config.title || ""} onChange={e => updateConfig("title", e.target.value)} placeholder="es. Verificare pagamento saldo" />
            </div>
            <div>
              <Label className="text-xs">Note</Label>
              <Textarea value={action.config.notes || ""} onChange={e => updateConfig("notes", e.target.value)} rows={2} />
            </div>
            <div>
              <Label className="text-xs">Giorni da oggi</Label>
              <Input type="number" value={action.config.days_offset ?? 7} onChange={e => updateConfig("days_offset", parseInt(e.target.value) || 7)} />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
