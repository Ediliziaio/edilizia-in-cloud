import { useState, useRef } from "react";
import type { InternalAutomationNode, ConfigField, AvailableVariable, CatalogItem } from "@/types/internalAutomationBuilder";
import {
  findTriggerLabel, findActionLabel,
  findTriggerItem, findActionItem,
  INTERNAL_NODE_TYPE_LABELS,
  getTriggerVariables,
} from "@/types/internalAutomationBuilder";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { X, Variable } from "lucide-react";

interface Props {
  node: InternalAutomationNode;
  flowTriggerType?: string; // the trigger_type of the flow, to get available variables
  onUpdate: (id: string, updates: Partial<InternalAutomationNode>) => void;
  onClose: () => void;
}

export function InternalNodePanel({ node, flowTriggerType, onUpdate, onClose }: Props) {
  const config = node.config_json || {};
  const nodeType = node.node_type;

  const updateConfig = (key: string, value: any) => {
    onUpdate(node.id, { config_json: { ...config, [key]: value } });
  };

  // Resolve catalog item
  let catalogItem: CatalogItem | undefined;
  if (nodeType === "trigger") {
    catalogItem = findTriggerItem(config.trigger_type || "");
  } else if (nodeType === "action") {
    catalogItem = findActionItem(config.action_type || "");
  } else if (nodeType === "condition") {
    catalogItem = findActionItem("if_condition");
  } else if (nodeType === "delay") {
    catalogItem = findActionItem("wait_delay");
  }

  const title = nodeType === "trigger"
    ? findTriggerLabel(config.trigger_type || "")
    : nodeType === "action"
    ? findActionLabel(config.action_type || "")
    : INTERNAL_NODE_TYPE_LABELS[nodeType] || nodeType;

  // Get variables from the flow's trigger type
  const availableVariables = flowTriggerType ? getTriggerVariables(flowTriggerType) : [];

  // For condition nodes, hide "condition_value" when operator is is_empty/is_not_empty
  const shouldShowField = (field: ConfigField) => {
    if (nodeType === "condition" && field.key === "condition_value") {
      return !["is_empty", "is_not_empty"].includes(config.condition_operator || "");
    }
    return true;
  };

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

        {/* Trigger info */}
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

        {/* Dynamic config fields */}
        {catalogItem?.configFields && (
          <div className="space-y-3">
            {catalogItem.configFields.filter(shouldShowField).map((field) => (
              <DynamicField
                key={field.key}
                field={field}
                value={config[field.key]}
                onChange={(v) => updateConfig(field.key, v)}
                availableVariables={field.supportsVariables ? availableVariables : undefined}
              />
            ))}
          </div>
        )}

        {/* Condition hint */}
        {nodeType === "condition" && (
          <p className="text-xs text-muted-foreground italic">
            Il nodo condizione crea due rami: "Sì" (true) e "No" (false).
          </p>
        )}

        {/* Variable hints */}
        {availableVariables.length > 0 && (
          <>
            <Separator />
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Variabili disponibili</p>
              <div className="text-xs text-muted-foreground space-y-0.5">
                {availableVariables.map((v) => (
                  <p key={v.key}>
                    <code className="bg-muted px-1 rounded">{`{{${v.key}}}`}</code> — {v.label}
                    {v.example && <span className="text-muted-foreground/60 ml-1">(es. {v.example})</span>}
                  </p>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Dynamic Field Component ──────────────────────────

interface DynamicFieldProps {
  field: ConfigField;
  value: any;
  onChange: (value: any) => void;
  availableVariables?: AvailableVariable[];
}

function DynamicField({ field, value, onChange, availableVariables }: DynamicFieldProps) {
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  const insertVariable = (varKey: string) => {
    const insertion = `{{${varKey}}}`;
    const el = inputRef.current;
    if (el) {
      const start = el.selectionStart ?? (value || "").length;
      const end = el.selectionEnd ?? start;
      const currentVal = value || "";
      const newVal = currentVal.substring(0, start) + insertion + currentVal.substring(end);
      onChange(newVal);
      setTimeout(() => {
        el.focus();
        const pos = start + insertion.length;
        el.setSelectionRange(pos, pos);
      }, 0);
    } else {
      onChange((value || "") + insertion);
    }
  };

  const resolvedValue = value ?? field.defaultValue ?? "";

  return (
    <div>
      <div className="flex items-center justify-between">
        <Label className="text-xs">{field.label}{field.required && <span className="text-destructive ml-0.5">*</span>}</Label>
        {availableVariables && availableVariables.length > 0 && (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="h-5 w-5" title="Inserisci variabile">
                <Variable className="h-3 w-3" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-1" align="end">
              <div className="max-h-48 overflow-y-auto">
                {availableVariables.map((v) => (
                  <button
                    key={v.key}
                    className="w-full text-left px-2 py-1.5 text-xs hover:bg-accent rounded-sm flex items-center gap-2"
                    onClick={() => insertVariable(v.key)}
                  >
                    <code className="text-xs bg-muted px-1 rounded">{`{{${v.key}}}`}</code>
                    <span className="text-muted-foreground truncate">{v.label}</span>
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>

      {field.type === "text" && (
        <Input
          ref={inputRef as React.Ref<HTMLInputElement>}
          value={resolvedValue}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          className="mt-1"
        />
      )}

      {field.type === "textarea" && (
        <Textarea
          ref={inputRef as React.Ref<HTMLTextAreaElement>}
          value={resolvedValue}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          className="mt-1"
          rows={3}
        />
      )}

      {field.type === "number" && (
        <Input
          type="number"
          value={resolvedValue}
          onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
          placeholder={field.placeholder}
          className="mt-1"
          min={field.min}
          max={field.max}
        />
      )}

      {field.type === "select" && field.options && (
        <Select value={resolvedValue || field.defaultValue || ""} onValueChange={onChange}>
          <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
          <SelectContent>
            {field.options.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
