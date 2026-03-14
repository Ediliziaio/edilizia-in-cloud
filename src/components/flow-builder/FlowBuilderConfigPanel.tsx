import { useMemo } from "react";
import { getCatalogItem, type ConfigFieldSchema } from "@/lib/flow-node-catalog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { X, Trash2 } from "lucide-react";
import type { Node } from "@xyflow/react";

import { DelayConfigPanel } from "./config-panels/DelayConfigPanel";
import { ConditionConfigPanel } from "./config-panels/ConditionConfigPanel";
import { TaskConfigPanel } from "./config-panels/TaskConfigPanel";
import { EmailConfigPanel } from "./config-panels/EmailConfigPanel";

interface FlowBuilderConfigPanelProps {
  selectedNode: Node | null;
  onUpdateData: (nodeId: string, data: Record<string, any>) => void;
  onDelete: (nodeId: string) => void;
  onClose: () => void;
}

// Item IDs that get specialized panels
const SPECIALIZED_PANELS = new Set([
  "attendi", "condition_se", "condition_multi",
  "crea_task", "aggiorna_task",
  "invia_email",
]);

export function FlowBuilderConfigPanel({
  selectedNode,
  onUpdateData,
  onDelete,
  onClose,
}: FlowBuilderConfigPanelProps) {
  const catalog = useMemo(
    () => (selectedNode ? getCatalogItem(selectedNode.data?.itemId as string) : null),
    [selectedNode?.id, selectedNode?.data?.itemId]
  );

  if (!selectedNode) return null;

  const schema = catalog?.configSchema ?? [];
  const nodeData = selectedNode.data as Record<string, any>;
  const itemId = nodeData.itemId as string;

  const handleChange = (fieldId: string, value: any) => {
    onUpdateData(selectedNode.id, { ...nodeData, [fieldId]: value });
  };

  const isSpecialized = SPECIALIZED_PANELS.has(itemId);

  return (
    <div className="flex h-full w-[300px] flex-col border-l bg-background">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <p className="text-xs font-semibold uppercase text-muted-foreground">
            {catalog?.kind ?? "Nodo"}
          </p>
          <p className="text-sm font-medium">{catalog?.label ?? nodeData.label}</p>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-4 p-4">
          {/* Label field always */}
          <div className="space-y-1.5">
            <Label className="text-xs">Etichetta nodo</Label>
            <Input
              value={(nodeData.label as string) || ""}
              onChange={(e) => handleChange("label", e.target.value)}
              placeholder={catalog?.label ?? "Etichetta"}
              className="h-8 text-xs"
            />
          </div>

          {/* Note text for note nodes */}
          {selectedNode.type === "note" && (
            <div className="space-y-1.5">
              <Label className="text-xs">Testo nota</Label>
              <Textarea
                value={(nodeData.note_text as string) || ""}
                onChange={(e) => handleChange("note_text", e.target.value)}
                placeholder="Scrivi una nota..."
                className="text-xs min-h-[80px]"
              />
            </div>
          )}

          {/* Specialized panels */}
          {itemId === "attendi" && (
            <DelayConfigPanel config={nodeData} onChange={handleChange} />
          )}
          {(itemId === "condition_se" || itemId === "condition_multi") && (
            <ConditionConfigPanel config={nodeData} onChange={handleChange} />
          )}
          {(itemId === "crea_task" || itemId === "aggiorna_task") && (
            <TaskConfigPanel config={nodeData} onChange={handleChange} />
          )}
          {itemId === "invia_email" && (
            <EmailConfigPanel config={nodeData} onChange={handleChange} />
          )}

          {/* Generic fields from configSchema (only if NOT specialized) */}
          {!isSpecialized && schema.map((field) => (
            <ConfigField
              key={field.id}
              field={field}
              value={nodeData[field.id]}
              onChange={(v) => handleChange(field.id, v)}
            />
          ))}

          {/* Description */}
          {catalog?.description && (
            <div className="rounded-lg border bg-muted/50 p-3">
              <p className="text-[11px] text-muted-foreground">{catalog.description}</p>
            </div>
          )}

          {/* Delete button */}
          <Button
            variant="destructive"
            size="sm"
            className="w-full"
            onClick={() => onDelete(selectedNode.id)}
          >
            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
            Elimina nodo
          </Button>
        </div>
      </ScrollArea>
    </div>
  );
}

// ── Dynamic config field (for non-specialized types) ──

function ConfigField({
  field,
  value,
  onChange,
}: {
  field: ConfigFieldSchema;
  value: any;
  onChange: (v: any) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">
        {field.label}
        {field.required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>

      {field.type === "text" && (
        <Input
          value={value ?? field.defaultValue ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          className="h-8 text-xs"
        />
      )}

      {field.type === "textarea" && (
        <Textarea
          value={value ?? field.defaultValue ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          className="text-xs min-h-[60px]"
        />
      )}

      {field.type === "number" && (
        <Input
          type="number"
          value={value ?? field.defaultValue ?? ""}
          onChange={(e) => onChange(Number(e.target.value))}
          min={field.min}
          max={field.max}
          placeholder={field.placeholder}
          className="h-8 text-xs"
        />
      )}

      {field.type === "select" && field.options && (() => {
        const emptyOpt = field.options.find((o) => o.value === "");
        const validOpts = field.options.filter((o) => o.value !== "");
        const NONE_SENTINEL = "__none__";
        const currentVal = value ?? field.defaultValue ?? "";
        const selectVal = currentVal === "" ? NONE_SENTINEL : currentVal;
        return (
          <Select
            value={selectVal}
            onValueChange={(v) => onChange(v === NONE_SENTINEL ? "" : v)}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder={emptyOpt?.label ?? "Seleziona..."} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE_SENTINEL}>
                {emptyOpt?.label ?? "Nessuno"}
              </SelectItem>
              {validOpts.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      })()}

      {field.type === "user_select" && (
        <Input
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder ?? "ID utente o {{variabile}}"}
          className="h-8 text-xs"
        />
      )}

      {field.type === "entity_select" && (
        <Input
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder ?? "ID entità o {{variabile}}"}
          className="h-8 text-xs"
        />
      )}

      {field.type === "boolean" && (
        <Switch checked={!!value} onCheckedChange={onChange} />
      )}

      {(field.type === "tags" || field.type === "tag_input") && (
        <Input
          value={Array.isArray(value) ? value.join(", ") : (value ?? "")}
          onChange={(e) => onChange(e.target.value.split(",").map((s: string) => s.trim()).filter(Boolean))}
          placeholder={field.placeholder ?? "tag1, tag2, ..."}
          className="h-8 text-xs"
        />
      )}

      {field.type === "json_editor" && (
        <Textarea
          value={value ?? field.defaultValue ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder ?? "{}"}
          className="text-xs min-h-[80px] font-mono"
        />
      )}

      {field.type === "date" && (
        <Input
          type="date"
          value={value ?? field.defaultValue ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 text-xs"
        />
      )}

      {field.type === "time" && (
        <Input
          type="time"
          value={value ?? field.defaultValue ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 text-xs"
        />
      )}

      {field.helpText && (
        <p className="text-[10px] text-muted-foreground">{field.helpText}</p>
      )}
    </div>
  );
}
