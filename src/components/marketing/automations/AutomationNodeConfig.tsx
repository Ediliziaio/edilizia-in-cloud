import type { AutomationNode } from "@/types/automationBuilder";
import { NODE_TYPE_LABELS } from "@/types/automationBuilder";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

interface Props {
  node: AutomationNode;
  onUpdate: (id: string, updates: Partial<AutomationNode>) => void;
  onClose: () => void;
}

export function AutomationNodeConfig({ node, onUpdate, onClose }: Props) {
  const updateConfig = (key: string, value: any) => {
    onUpdate(node.id, { config_json: { ...node.config_json, [key]: value } });
  };

  return (
    <div className="w-80 border-l bg-background p-4 overflow-y-auto shrink-0">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-sm">
          Configura {NODE_TYPE_LABELS[node.node_type]}
        </h3>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-4">
        <div>
          <Label className="text-xs">Nome nodo</Label>
          <Input
            value={node.label || ""}
            onChange={e => onUpdate(node.id, { label: e.target.value })}
            placeholder="Etichetta..."
            className="mt-1"
          />
        </div>

        {node.node_type === "delay" && (
          <>
            <div>
              <Label className="text-xs">Valore</Label>
              <Input
                type="number"
                min={1}
                value={node.config_json?.delay_value || ""}
                onChange={e => updateConfig("delay_value", parseInt(e.target.value) || 1)}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Unità</Label>
              <Select
                value={node.config_json?.delay_unit || "days"}
                onValueChange={v => updateConfig("delay_unit", v)}
              >
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="minutes">Minuti</SelectItem>
                  <SelectItem value="hours">Ore</SelectItem>
                  <SelectItem value="days">Giorni</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </>
        )}

        {node.node_type === "trigger" && (
          <div>
            <Label className="text-xs">Evento trigger</Label>
            <Input
              value={node.config_json?.trigger_event || ""}
              disabled
              className="mt-1 bg-muted"
            />
          </div>
        )}

        {node.node_type === "action" && (
          <>
            <div>
              <Label className="text-xs">Tipo azione</Label>
              <Input
                value={node.config_json?.action_type || ""}
                disabled
                className="mt-1 bg-muted"
              />
            </div>
            {(node.config_json?.action_type === "add_tag" || node.config_json?.action_type === "remove_tag") && (
              <div>
                <Label className="text-xs">Tag</Label>
                <Input
                  value={node.config_json?.tag || ""}
                  onChange={e => updateConfig("tag", e.target.value)}
                  placeholder="Nome tag..."
                  className="mt-1"
                />
              </div>
            )}
            {node.config_json?.action_type === "send_email" && (
              <div>
                <Label className="text-xs">Oggetto email</Label>
                <Input
                  value={node.config_json?.subject_override || ""}
                  onChange={e => updateConfig("subject_override", e.target.value)}
                  placeholder="Oggetto..."
                  className="mt-1"
                />
              </div>
            )}
            {node.config_json?.action_type === "send_sms" && (
              <div>
                <Label className="text-xs">Testo SMS</Label>
                <Textarea
                  value={node.config_json?.sms_text || ""}
                  onChange={e => updateConfig("sms_text", e.target.value)}
                  placeholder="Testo del messaggio..."
                  className="mt-1"
                  rows={3}
                />
              </div>
            )}
            {node.config_json?.action_type === "send_ai_message" && (
              <>
                <div>
                  <Label className="text-xs">Prompt AI</Label>
                  <Textarea
                    value={node.config_json?.ai_prompt || ""}
                    onChange={e => updateConfig("ai_prompt", e.target.value)}
                    placeholder="Scrivi il prompt per l'AI..."
                    className="mt-1"
                    rows={3}
                  />
                </div>
                <div>
                  <Label className="text-xs">Canale invio</Label>
                  <Select
                    value={node.config_json?.ai_channel || "email"}
                    onValueChange={v => updateConfig("ai_channel", v)}
                  >
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="email">Email</SelectItem>
                      <SelectItem value="whatsapp">WhatsApp</SelectItem>
                      <SelectItem value="sms">SMS</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
            {node.config_json?.action_type === "create_task" && (
              <div>
                <Label className="text-xs">Titolo attività</Label>
                <Input
                  value={node.config_json?.title || ""}
                  onChange={e => updateConfig("title", e.target.value)}
                  placeholder="Titolo..."
                  className="mt-1"
                />
              </div>
            )}
            {node.config_json?.action_type === "webhook_out" && (
              <div>
                <Label className="text-xs">URL Webhook</Label>
                <Input
                  value={node.config_json?.webhook_url || ""}
                  onChange={e => updateConfig("webhook_url", e.target.value)}
                  placeholder="https://..."
                  className="mt-1"
                />
              </div>
            )}
            {node.config_json?.action_type === "external_api" && (
              <>
                <div>
                  <Label className="text-xs">URL API</Label>
                  <Input
                    value={node.config_json?.api_url || ""}
                    onChange={e => updateConfig("api_url", e.target.value)}
                    placeholder="https://..."
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">Metodo</Label>
                  <Select
                    value={node.config_json?.api_method || "POST"}
                    onValueChange={v => updateConfig("api_method", v)}
                  >
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="GET">GET</SelectItem>
                      <SelectItem value="POST">POST</SelectItem>
                      <SelectItem value="PUT">PUT</SelectItem>
                      <SelectItem value="DELETE">DELETE</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
            {node.config_json?.action_type === "jump_to_step" && (
              <div>
                <Label className="text-xs">ID nodo destinazione</Label>
                <Input
                  value={node.config_json?.target_node_id || ""}
                  onChange={e => updateConfig("target_node_id", e.target.value)}
                  placeholder="ID del nodo..."
                  className="mt-1"
                />
              </div>
            )}
          </>
        )}

        {node.node_type === "condition" && (
          <>
            <div>
              <Label className="text-xs">Campo</Label>
              <Input
                value={node.config_json?.condition_field || ""}
                onChange={e => updateConfig("condition_field", e.target.value)}
                placeholder="es: opportunity_value"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Operatore</Label>
              <Select
                value={node.config_json?.condition_operator || "equals"}
                onValueChange={v => updateConfig("condition_operator", v)}
              >
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="equals">Uguale a</SelectItem>
                  <SelectItem value="not_equals">Diverso da</SelectItem>
                  <SelectItem value="greater_than">Maggiore di</SelectItem>
                  <SelectItem value="less_than">Minore di</SelectItem>
                  <SelectItem value="contains">Contiene</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Valore</Label>
              <Input
                value={node.config_json?.condition_value || ""}
                onChange={e => updateConfig("condition_value", e.target.value)}
                placeholder="Valore..."
                className="mt-1"
              />
            </div>
          </>
        )}

        {node.node_type === "split" && (
          <>
            <div>
              <Label className="text-xs">Percentuale ramo A</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={node.config_json?.split_a || 50}
                onChange={e => {
                  const val = parseInt(e.target.value) || 0;
                  updateConfig("split_a", val);
                  updateConfig("split_b", 100 - val);
                }}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Percentuale ramo B</Label>
              <Input
                type="number"
                value={node.config_json?.split_b || 50}
                disabled
                className="mt-1 bg-muted"
              />
            </div>
          </>
        )}

        {node.node_type === "goal" && (
          <div>
            <Label className="text-xs">Condizione obiettivo</Label>
            <Textarea
              value={node.config_json?.goal_condition || ""}
              onChange={e => updateConfig("goal_condition", e.target.value)}
              placeholder="Descrivi la condizione per raggiungere l'obiettivo..."
              className="mt-1"
              rows={3}
            />
          </div>
        )}
      </div>
    </div>
  );
}
