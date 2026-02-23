import { Trash2, Mail, Clock, Tag, ArrowRightLeft, ListTodo, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

export interface MarketingActionConfig {
  type: string;
  config: Record<string, any>;
}

interface Props {
  action: MarketingActionConfig;
  index: number;
  emailTemplates: { id: string; name: string }[];
  pipelines: { id: string; name: string; stages: { id: string; name: string }[] }[];
  companyUsers: { id: string; name: string }[];
  tags: string[];
  onChange: (index: number, action: MarketingActionConfig) => void;
  onRemove: (index: number) => void;
}

const ACTION_TYPES = [
  { value: "send_email", label: "Invia email", icon: Mail, color: "text-blue-600" },
  { value: "wait_days", label: "Attendi X giorni", icon: Clock, color: "text-purple-600" },
  { value: "add_tag", label: "Aggiungi tag", icon: Tag, color: "text-emerald-600" },
  { value: "remove_tag", label: "Rimuovi tag", icon: Tag, color: "text-red-600" },
  { value: "move_pipeline_stage", label: "Sposta fase pipeline", icon: ArrowRightLeft, color: "text-blue-600" },
  { value: "create_task", label: "Crea attività", icon: ListTodo, color: "text-emerald-600" },
  { value: "send_notification", label: "Invia notifica", icon: Bell, color: "text-amber-600" },
];

export function MarketingActionBlock({ action, index, emailTemplates, pipelines, companyUsers, tags, onChange, onRemove }: Props) {
  const actionMeta = ACTION_TYPES.find(a => a.value === action.type);
  const Icon = actionMeta?.icon || ListTodo;

  const updateConfig = (key: string, value: any) => {
    onChange(index, { ...action, config: { ...action.config, [key]: value } });
  };

  const selectedPipeline = pipelines.find(p => p.id === action.config.pipeline_id);

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

        <Select value={action.type} onValueChange={v => onChange(index, { type: v, config: {} })}>
          <SelectTrigger><SelectValue placeholder="Tipo azione" /></SelectTrigger>
          <SelectContent>
            {ACTION_TYPES.map(t => (
              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {action.type === "send_email" && (
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Template email</Label>
              <Select value={action.config.template_id || ""} onValueChange={v => updateConfig("template_id", v)}>
                <SelectTrigger><SelectValue placeholder="Seleziona template..." /></SelectTrigger>
                <SelectContent>
                  {emailTemplates.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Oggetto personalizzato (opzionale)</Label>
              <Input value={action.config.subject_override || ""} onChange={e => updateConfig("subject_override", e.target.value)} placeholder="Lascia vuoto per usare l'oggetto del template" />
            </div>
          </div>
        )}

        {action.type === "wait_days" && (
          <div>
            <Label className="text-xs">Giorni di attesa</Label>
            <Input type="number" min={1} max={365} value={action.config.days ?? 1} onChange={e => updateConfig("days", parseInt(e.target.value) || 1)} />
          </div>
        )}

        {(action.type === "add_tag" || action.type === "remove_tag") && (
          <div>
            <Label className="text-xs">Tag</Label>
            <Select value={action.config.tag || ""} onValueChange={v => updateConfig("tag", v)}>
              <SelectTrigger><SelectValue placeholder="Seleziona tag..." /></SelectTrigger>
              <SelectContent>
                {tags.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input className="mt-2" value={action.config.custom_tag || ""} onChange={e => updateConfig("custom_tag", e.target.value)} placeholder="...oppure scrivi un nuovo tag" />
          </div>
        )}

        {action.type === "move_pipeline_stage" && (
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Pipeline</Label>
              <Select value={action.config.pipeline_id || ""} onValueChange={v => { updateConfig("pipeline_id", v); updateConfig("stage_id", ""); }}>
                <SelectTrigger><SelectValue placeholder="Seleziona pipeline..." /></SelectTrigger>
                <SelectContent>
                  {pipelines.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {selectedPipeline && (
              <div>
                <Label className="text-xs">Fase di destinazione</Label>
                <Select value={action.config.stage_id || ""} onValueChange={v => updateConfig("stage_id", v)}>
                  <SelectTrigger><SelectValue placeholder="Seleziona fase..." /></SelectTrigger>
                  <SelectContent>
                    {selectedPipeline.stages.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        )}

        {action.type === "create_task" && (
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Titolo attività</Label>
              <Input value={action.config.title || ""} onChange={e => updateConfig("title", e.target.value)} placeholder="es. Follow-up con il lead" />
            </div>
            <div>
              <Label className="text-xs">Note</Label>
              <Textarea value={action.config.notes || ""} onChange={e => updateConfig("notes", e.target.value)} rows={2} />
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
        )}

        {action.type === "send_notification" && (
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Messaggio notifica</Label>
              <Textarea value={action.config.message || ""} onChange={e => updateConfig("message", e.target.value)} rows={2} placeholder="Messaggio da inviare..." />
            </div>
            <div>
              <Label className="text-xs">Destinatario</Label>
              <Select value={action.config.notify_user_id || "none"} onValueChange={v => updateConfig("notify_user_id", v === "none" ? null : v)}>
                <SelectTrigger><SelectValue placeholder="Seleziona utente" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Proprietario contatto</SelectItem>
                  {companyUsers.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
