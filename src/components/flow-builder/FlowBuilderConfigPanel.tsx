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

interface FlowBuilderConfigPanelProps {
  selectedNode: Node | null;
  onUpdateData: (nodeId: string, data: Record<string, any>) => void;
  onDelete: (nodeId: string) => void;
  onClose: () => void;
}

export function FlowBuilderConfigPanel({
  selectedNode,
  onUpdateData,
  onDelete,
  onClose,
}: FlowBuilderConfigPanelProps) {
  const catalog = useMemo(
    () => (selectedNode ? getCatalogItem(selectedNode.data?.itemId as string) : null),
    [selectedNode]
  );

  if (!selectedNode) return null;

  const schema = catalog?.configSchema ?? [];
  const nodeData = selectedNode.data as Record<string, any>;

  const handleChange = (fieldId: string, value: any) => {
    onUpdateData(selectedNode.id, { ...nodeData, [fieldId]: value });
  };

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

      {/* Label field always */}
      <ScrollArea className="flex-1">
        <div className="space-y-4 p-4">
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

          {/* Dynamic fields from configSchema */}
          {schema.map((field) => (
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

// ── Dynamic config field ──

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
          className="h-8 text-xs"
        />
      )}
      {field.type === "select" && field.options && (
        <Select value={value ?? field.defaultValue ?? ""} onValueChange={onChange}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Seleziona..." />
          </SelectTrigger>
          <SelectContent>
            {field.options.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {field.type === "boolean" && (
        <Switch checked={!!value} onCheckedChange={onChange} />
      )}
      {field.type === "tags" && (
        <Input
          value={Array.isArray(value) ? value.join(", ") : (value ?? "")}
          onChange={(e) => onChange(e.target.value.split(",").map((s: string) => s.trim()).filter(Boolean))}
          placeholder="tag1, tag2, ..."
          className="h-8 text-xs"
        />
      )}
    </div>
  );
}
