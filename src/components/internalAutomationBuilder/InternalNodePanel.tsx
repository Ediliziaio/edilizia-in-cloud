import { useState } from "react";
import type { InternalAutomationNode } from "@/types/internalAutomationBuilder";
import {
  findTriggerLabel, findActionLabel,
  INTERNAL_NODE_TYPE_LABELS,
} from "@/types/internalAutomationBuilder";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { X } from "lucide-react";

interface Props {
  node: InternalAutomationNode;
  onUpdate: (id: string, updates: Partial<InternalAutomationNode>) => void;
  onClose: () => void;
}

export function InternalNodePanel({ node, onUpdate, onClose }: Props) {
  const config = node.config_json || {};
  const nodeType = node.node_type;

  const updateConfig = (key: string, value: any) => {
    onUpdate(node.id, { config_json: { ...config, [key]: value } });
  };

  const title = nodeType === "trigger"
    ? findTriggerLabel(config.trigger_type || "")
    : nodeType === "action"
    ? findActionLabel(config.action_type || "")
    : INTERNAL_NODE_TYPE_LABELS[nodeType] || nodeType;

  return (
    <div className="w-80 border-l bg-background h-full overflow-y-auto">
      <div className="flex items-center justify-between p-3 border-b">
        <h3 className="font-semibold text-sm">{title}</h3>
        <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7">
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="p-3 space-y-4">
        {/* Label */}
        <div>
          <Label className="text-xs">Etichetta</Label>
          <Input
            value={node.label || ""}
            onChange={(e) => onUpdate(node.id, { label: e.target.value })}
            placeholder="Etichetta nodo"
            className="mt-1"
          />
        </div>

        <Separator />

        {/* Trigger config */}
        {nodeType === "trigger" && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Trigger: <strong>{findTriggerLabel(config.trigger_type || "")}</strong>
            </p>
            <p className="text-xs text-muted-foreground italic">
              Il trigger si attiva automaticamente quando l'evento si verifica nel sistema.
            </p>
          </div>
        )}

        {/* Action config */}
        {nodeType === "action" && config.action_type === "create_task" && (
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Titolo attività</Label>
              <Input value={config.task_title || ""} onChange={(e) => updateConfig("task_title", e.target.value)} placeholder="es. Verificare ordine {{order_number}}" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Note</Label>
              <Textarea value={config.task_notes || ""} onChange={(e) => updateConfig("task_notes", e.target.value)} placeholder="Note..." className="mt-1" rows={3} />
            </div>
            <div>
              <Label className="text-xs">Priorità</Label>
              <Select value={config.task_priority || "medium"} onValueChange={(v) => updateConfig("task_priority", v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Bassa</SelectItem>
                  <SelectItem value="medium">Media</SelectItem>
                  <SelectItem value="high">Alta</SelectItem>
                  <SelectItem value="urgent">Urgente</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Scadenza (giorni da ora)</Label>
              <Input type="number" value={config.task_due_days || ""} onChange={(e) => updateConfig("task_due_days", e.target.value)} placeholder="es. 3" className="mt-1" />
            </div>
          </div>
        )}

        {nodeType === "action" && config.action_type === "update_order_status" && (
          <div>
            <Label className="text-xs">Nuovo stato ordine</Label>
            <Input value={config.new_status || ""} onChange={(e) => updateConfig("new_status", e.target.value)} placeholder="es. in_lavorazione" className="mt-1" />
          </div>
        )}

        {nodeType === "action" && config.action_type === "send_notification" && (
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Titolo notifica</Label>
              <Input value={config.notification_title || ""} onChange={(e) => updateConfig("notification_title", e.target.value)} placeholder="Titolo..." className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Messaggio</Label>
              <Textarea value={config.notification_message || ""} onChange={(e) => updateConfig("notification_message", e.target.value)} placeholder="Messaggio..." className="mt-1" rows={3} />
            </div>
          </div>
        )}

        {nodeType === "action" && config.action_type === "send_email" && (
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Destinatario email</Label>
              <Input value={config.email_to || ""} onChange={(e) => updateConfig("email_to", e.target.value)} placeholder="email@example.com" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Oggetto</Label>
              <Input value={config.email_subject || ""} onChange={(e) => updateConfig("email_subject", e.target.value)} placeholder="Oggetto..." className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Corpo</Label>
              <Textarea value={config.email_body || ""} onChange={(e) => updateConfig("email_body", e.target.value)} placeholder="Corpo email..." className="mt-1" rows={4} />
            </div>
          </div>
        )}

        {nodeType === "action" && config.action_type === "webhook" && (
          <div className="space-y-3">
            <div>
              <Label className="text-xs">URL</Label>
              <Input value={config.webhook_url || ""} onChange={(e) => updateConfig("webhook_url", e.target.value)} placeholder="https://..." className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Metodo</Label>
              <Select value={config.webhook_method || "POST"} onValueChange={(v) => updateConfig("webhook_method", v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="POST">POST</SelectItem>
                  <SelectItem value="GET">GET</SelectItem>
                  <SelectItem value="PUT">PUT</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {nodeType === "action" && config.action_type === "create_ticket" && (
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Oggetto ticket</Label>
              <Input value={config.ticket_subject || ""} onChange={(e) => updateConfig("ticket_subject", e.target.value)} placeholder="Oggetto..." className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Priorità</Label>
              <Select value={config.ticket_priority || "medium"} onValueChange={(v) => updateConfig("ticket_priority", v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Bassa</SelectItem>
                  <SelectItem value="medium">Media</SelectItem>
                  <SelectItem value="high">Alta</SelectItem>
                  <SelectItem value="urgent">Urgente</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {nodeType === "action" && config.action_type === "create_calendar_event" && (
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Titolo evento</Label>
              <Input value={config.event_title || ""} onChange={(e) => updateConfig("event_title", e.target.value)} placeholder="Titolo..." className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Descrizione</Label>
              <Textarea value={config.event_description || ""} onChange={(e) => updateConfig("event_description", e.target.value)} placeholder="Descrizione..." className="mt-1" rows={2} />
            </div>
          </div>
        )}

        {/* Delay config */}
        {nodeType === "delay" && (
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Giorni</Label>
              <Input type="number" min={0} value={config.delay_days || 0} onChange={(e) => updateConfig("delay_days", Number(e.target.value))} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Ore</Label>
              <Input type="number" min={0} max={23} value={config.delay_hours || 0} onChange={(e) => updateConfig("delay_hours", Number(e.target.value))} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Minuti</Label>
              <Input type="number" min={0} max={59} value={config.delay_minutes || 0} onChange={(e) => updateConfig("delay_minutes", Number(e.target.value))} className="mt-1" />
            </div>
          </div>
        )}

        {/* Condition config */}
        {nodeType === "condition" && (
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Campo da valutare</Label>
              <Input value={config.condition_field || ""} onChange={(e) => updateConfig("condition_field", e.target.value)} placeholder="es. status" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Operatore</Label>
              <Select value={config.condition_operator || "equals"} onValueChange={(v) => updateConfig("condition_operator", v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="equals">Uguale a</SelectItem>
                  <SelectItem value="not_equals">Diverso da</SelectItem>
                  <SelectItem value="contains">Contiene</SelectItem>
                  <SelectItem value="greater_than">Maggiore di</SelectItem>
                  <SelectItem value="less_than">Minore di</SelectItem>
                  <SelectItem value="is_empty">È vuoto</SelectItem>
                  <SelectItem value="is_not_empty">Non è vuoto</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {!["is_empty", "is_not_empty"].includes(config.condition_operator || "") && (
              <div>
                <Label className="text-xs">Valore</Label>
                <Input value={config.condition_value || ""} onChange={(e) => updateConfig("condition_value", e.target.value)} placeholder="Valore..." className="mt-1" />
              </div>
            )}
            <p className="text-xs text-muted-foreground italic">
              Il nodo condizione crea due rami: "Sì" (true) e "No" (false).
            </p>
          </div>
        )}

        {/* Variable hints */}
        <Separator />
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">Variabili disponibili</p>
          <div className="text-xs text-muted-foreground space-y-0.5">
            <p><code className="bg-muted px-1 rounded">{"{{id}}"}</code> — ID entità</p>
            <p><code className="bg-muted px-1 rounded">{"{{status}}"}</code> — Stato</p>
            <p><code className="bg-muted px-1 rounded">{"{{order_number}}"}</code> — Nr. ordine</p>
            <p><code className="bg-muted px-1 rounded">{"{{title}}"}</code> — Titolo</p>
            <p><code className="bg-muted px-1 rounded">{"{{name}}"}</code> — Nome</p>
            <p><code className="bg-muted px-1 rounded">{"{{company_id}}"}</code> — ID azienda</p>
          </div>
        </div>
      </div>
    </div>
  );
}
