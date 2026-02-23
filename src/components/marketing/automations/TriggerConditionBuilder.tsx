import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Plus, FolderPlus, Copy, Ban } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import {
  type TriggerFilters,
  type TriggerCondition,
  type TriggerConditionGroup,
  type TriggerFieldDef,
  isConditionGroup,
  getFieldsForCategory,
  getOperatorsForType,
  NO_VALUE_OPERATORS,
} from "@/types/automationBuilder";
import { ConditionValueInput } from "./ConditionValueInput";

interface Props {
  triggerCategory: string;
  filters: TriggerFilters;
  onChange: (filters: TriggerFilters) => void;
  errors?: Set<string>;
  companyId?: string;
}

function genId() {
  return crypto.randomUUID().slice(0, 8);
}

// Map marketing_custom_fields field_type to our FieldType
function mapCustomFieldType(fieldType: string): TriggerFieldDef["type"] {
  switch (fieldType) {
    case "number": return "number";
    case "date": return "date";
    case "boolean": case "checkbox": return "boolean";
    case "select": case "dropdown": return "select";
    default: return "text";
  }
}

export function TriggerConditionBuilder({ triggerCategory, filters, onChange, errors, companyId }: Props) {
  const [customFields, setCustomFields] = useState<TriggerFieldDef[]>([]);
  const baseFields = getFieldsForCategory(triggerCategory);

  // Load custom fields from DB
  useEffect(() => {
    if (!companyId) return;
    // Map trigger category to object_type
    const objectType = triggerCategory === "contact" ? "contact" : triggerCategory === "opportunity" ? "opportunity" : null;
    if (!objectType) {
      setCustomFields([]);
      return;
    }
    supabase
      .from("marketing_custom_fields")
      .select("id, field_key, field_label, field_type, options")
      .eq("company_id", companyId)
      .eq("object_type", objectType)
      .then(({ data, error }) => {
        if (error) {
          console.error("Error loading custom fields:", error.message);
          setCustomFields([]);
          return;
        }
        if (data && data.length > 0) {
          setCustomFields(
            data.map((f: any) => {
              const def: TriggerFieldDef = {
                key: `custom_field.${f.field_key}`,
                label: f.field_label,
                type: mapCustomFieldType(f.field_type),
                group: "Campi personalizzati",
              };
              if (def.type === "select" && f.options) {
                try {
                  const opts = typeof f.options === "string" ? JSON.parse(f.options) : f.options;
                  if (Array.isArray(opts)) {
                    def.options = opts.map((o: any) =>
                      typeof o === "string" ? { value: o, label: o } : { value: o.value || o, label: o.label || o.value || o }
                    );
                  }
                } catch { /* ignore */ }
              }
              return def;
            })
          );
        } else {
          setCustomFields([]);
        }
      });
  }, [companyId, triggerCategory]);

  const fields = [...baseFields, ...customFields];

  const addCondition = () => {
    onChange({
      ...filters,
      conditions: [
        ...filters.conditions,
        { id: genId(), field: "", operator: "", value: "" } as TriggerCondition,
      ],
    });
  };

  const addGroup = () => {
    onChange({
      ...filters,
      conditions: [
        ...filters.conditions,
        { id: genId(), logic: "AND", conditions: [{ id: genId(), field: "", operator: "", value: "" }] } as TriggerConditionGroup,
      ],
    });
  };

  const updateLogic = (logic: "AND" | "OR") => {
    onChange({ ...filters, logic });
  };

  const updateConditions = (newConditions: (TriggerCondition | TriggerConditionGroup)[]) => {
    onChange({ ...filters, conditions: newConditions });
  };

  const removeAt = (index: number) => {
    updateConditions(filters.conditions.filter((_, i) => i !== index));
  };

  const duplicateAt = (index: number) => {
    const item = filters.conditions[index];
    const clone = JSON.parse(JSON.stringify(item));
    const regenIds = (obj: any) => {
      if (obj.id) obj.id = genId();
      if (obj.conditions) obj.conditions.forEach(regenIds);
    };
    regenIds(clone);
    const newConds = [...filters.conditions];
    newConds.splice(index + 1, 0, clone);
    updateConditions(newConds);
  };

  const updateItemAt = (index: number, updated: TriggerCondition | TriggerConditionGroup) => {
    const newConds = [...filters.conditions];
    newConds[index] = updated;
    updateConditions(newConds);
  };

  if (filters.conditions.length === 0) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">Nessun filtro configurato. Aggiungi una condizione per filtrare quando il trigger si attiva.</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="text-xs h-7" onClick={addCondition}>
            <Plus className="h-3 w-3 mr-1" /> Aggiungi Filtro
          </Button>
          <Button variant="outline" size="sm" className="text-xs h-7" onClick={addGroup}>
            <FolderPlus className="h-3 w-3 mr-1" /> Aggiungi Gruppo
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {filters.conditions.map((item, index) => (
        <div key={isConditionGroup(item) ? item.id : (item as TriggerCondition).id}>
          {index > 0 && (
            <div className="flex justify-center my-1.5">
              <LogicToggle value={filters.logic} onChange={updateLogic} />
            </div>
          )}
          {isConditionGroup(item) ? (
            <GroupRow
              group={item}
              fields={fields}
              triggerCategory={triggerCategory}
              companyId={companyId}
              onUpdate={(g) => updateItemAt(index, g)}
              onRemove={() => removeAt(index)}
              onDuplicate={() => duplicateAt(index)}
              errors={errors}
            />
          ) : (
            <ConditionRow
              condition={item as TriggerCondition}
              fields={fields}
              companyId={companyId}
              onUpdate={(c) => updateItemAt(index, c)}
              onRemove={() => removeAt(index)}
              errors={errors}
            />
          )}
        </div>
      ))}
      <div className="flex gap-2 pt-1">
        <Button variant="outline" size="sm" className="text-xs h-7" onClick={addCondition}>
          <Plus className="h-3 w-3 mr-1" /> Aggiungi Filtro
        </Button>
        <Button variant="outline" size="sm" className="text-xs h-7" onClick={addGroup}>
          <FolderPlus className="h-3 w-3 mr-1" /> Aggiungi Gruppo
        </Button>
      </div>
    </div>
  );
}

// ── Logic Toggle ──
function LogicToggle({ value, onChange }: { value: "AND" | "OR"; onChange: (v: "AND" | "OR") => void }) {
  return (
    <div className="inline-flex rounded-md border border-border overflow-hidden text-[10px]">
      <button
        className={cn("px-2 py-0.5 transition-colors", value === "AND" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted")}
        onClick={() => onChange("AND")}
      >
        E (AND)
      </button>
      <button
        className={cn("px-2 py-0.5 transition-colors", value === "OR" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted")}
        onClick={() => onChange("OR")}
      >
        O (OR)
      </button>
    </div>
  );
}

// ── Single Condition Row ──
function ConditionRow({
  condition,
  fields,
  companyId,
  onUpdate,
  onRemove,
  errors,
}: {
  condition: TriggerCondition;
  fields: TriggerFieldDef[];
  companyId?: string;
  onUpdate: (c: TriggerCondition) => void;
  onRemove: () => void;
  errors?: Set<string>;
}) {
  const selectedField = fields.find((f) => f.key === condition.field);
  const operators = selectedField ? getOperatorsForType(selectedField.type) : [];
  const selectedOp = operators.find((o) => o.value === condition.operator);
  const hasFieldErr = errors?.has(condition.id + "_field");
  const hasOpErr = errors?.has(condition.id + "_op");
  const hasValErr = errors?.has(condition.id + "_val");

  // Group fields
  const grouped = fields.reduce<Record<string, TriggerFieldDef[]>>((acc, f) => {
    (acc[f.group] = acc[f.group] || []).push(f);
    return acc;
  }, {});

  return (
    <div className={cn("flex flex-col gap-1.5 p-2 rounded-md border bg-muted/30", condition.negate && "border-destructive/40 bg-destructive/5")}>
      <div className="flex gap-1.5 items-start">
        {/* NOT toggle */}
        <Button
          variant={condition.negate ? "destructive" : "ghost"}
          size="icon"
          className={cn("h-7 w-7 shrink-0 text-[9px] font-bold", !condition.negate && "text-muted-foreground")}
          onClick={() => onUpdate({ ...condition, negate: !condition.negate })}
          title={condition.negate ? "Rimuovi negazione" : "Nega condizione (NOT)"}
        >
          <Ban className="h-3 w-3" />
        </Button>

        {/* Field select */}
        <Select
          value={condition.field || ""}
          onValueChange={(v) => {
            onUpdate({ ...condition, field: v, operator: "", value: "" });
          }}
        >
          <SelectTrigger className={cn("h-8 text-xs flex-1 min-w-0", hasFieldErr && "border-destructive")}>
            <SelectValue placeholder="Campo..." />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(grouped).map(([group, gFields]) => (
              <div key={group}>
                <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{group}</div>
                {gFields.map((f) => (
                  <SelectItem key={f.key} value={f.key} className="text-xs">{f.label}</SelectItem>
                ))}
              </div>
            ))}
          </SelectContent>
        </Select>

        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onRemove}>
          <Trash2 className="h-3.5 w-3.5 text-destructive" />
        </Button>
      </div>

      {/* Negate badge */}
      {condition.negate && (
        <Badge variant="destructive" className="text-[9px] h-4 w-fit">NOT</Badge>
      )}

      {condition.field && (
        <Select
          value={condition.operator || ""}
          onValueChange={(v) => {
            const needsVal = !NO_VALUE_OPERATORS.includes(v);
            onUpdate({ ...condition, operator: v, value: needsVal ? condition.value : "" });
          }}
        >
          <SelectTrigger className={cn("h-8 text-xs", hasOpErr && "border-destructive")}>
            <SelectValue placeholder="Operatore..." />
          </SelectTrigger>
          <SelectContent>
            {operators.map((op) => (
              <SelectItem key={op.value} value={op.value} className="text-xs">{op.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {condition.field && condition.operator && selectedOp?.needsValue && (
        <ConditionValueInput
          field={selectedField}
          operator={condition.operator}
          value={condition.value}
          onChange={(v) => onUpdate({ ...condition, value: v })}
          hasError={hasValErr}
          companyId={companyId}
        />
      )}
    </div>
  );
}

// ── Group Row ──
function GroupRow({
  group,
  fields,
  triggerCategory,
  companyId,
  onUpdate,
  onRemove,
  onDuplicate,
  errors,
}: {
  group: TriggerConditionGroup;
  fields: TriggerFieldDef[];
  triggerCategory: string;
  companyId?: string;
  onUpdate: (g: TriggerConditionGroup) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  errors?: Set<string>;
}) {
  const addCondition = () => {
    onUpdate({
      ...group,
      conditions: [...group.conditions, { id: genId(), field: "", operator: "", value: "" } as TriggerCondition],
    });
  };

  const addSubGroup = () => {
    onUpdate({
      ...group,
      conditions: [
        ...group.conditions,
        { id: genId(), logic: "AND", conditions: [{ id: genId(), field: "", operator: "", value: "" }] } as TriggerConditionGroup,
      ],
    });
  };

  const removeAt = (index: number) => {
    const newConds = group.conditions.filter((_, i) => i !== index);
    if (newConds.length === 0) {
      onRemove();
    } else {
      onUpdate({ ...group, conditions: newConds });
    }
  };

  const updateItemAt = (index: number, updated: TriggerCondition | TriggerConditionGroup) => {
    const newConds = [...group.conditions];
    newConds[index] = updated;
    onUpdate({ ...group, conditions: newConds });
  };

  return (
    <div className="border-l-2 border-primary/40 pl-3 py-1 space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Gruppo</span>
        <div className="flex gap-0.5">
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onDuplicate} title="Duplica gruppo">
            <Copy className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onRemove} title="Elimina gruppo">
            <Trash2 className="h-3 w-3 text-destructive" />
          </Button>
        </div>
      </div>

      {group.conditions.map((item, index) => (
        <div key={isConditionGroup(item) ? item.id : (item as TriggerCondition).id}>
          {index > 0 && (
            <div className="flex justify-center my-1">
              <LogicToggle value={group.logic} onChange={(v) => onUpdate({ ...group, logic: v })} />
            </div>
          )}
          {isConditionGroup(item) ? (
            <GroupRow
              group={item}
              fields={fields}
              triggerCategory={triggerCategory}
              companyId={companyId}
              onUpdate={(g) => updateItemAt(index, g)}
              onRemove={() => removeAt(index)}
              onDuplicate={() => {
                const clone = JSON.parse(JSON.stringify(item));
                const regenIds = (obj: any) => { if (obj.id) obj.id = genId(); if (obj.conditions) obj.conditions.forEach(regenIds); };
                regenIds(clone);
                const newConds = [...group.conditions];
                newConds.splice(index + 1, 0, clone);
                onUpdate({ ...group, conditions: newConds });
              }}
              errors={errors}
            />
          ) : (
            <ConditionRow
              condition={item as TriggerCondition}
              fields={fields}
              companyId={companyId}
              onUpdate={(c) => updateItemAt(index, c)}
              onRemove={() => removeAt(index)}
              errors={errors}
            />
          )}
        </div>
      ))}

      <div className="flex gap-2 pt-0.5">
        <Button variant="ghost" size="sm" className="text-[10px] h-6 px-2" onClick={addCondition}>
          <Plus className="h-3 w-3 mr-0.5" /> Condizione
        </Button>
        <Button variant="ghost" size="sm" className="text-[10px] h-6 px-2" onClick={addSubGroup}>
          <FolderPlus className="h-3 w-3 mr-0.5" /> Sotto-gruppo
        </Button>
      </div>
    </div>
  );
}
