import { useState, useMemo, useEffect } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, Pencil, Plus, Search, Trash2, X } from "lucide-react";

// --- Types ---

export interface FilterRule {
  id: string;
  field: string;
  operator: "is" | "is_not" | "is_empty" | "is_not_empty";
  value: string;
}

export interface FilterGroup {
  id: string;
  rules: FilterRule[];
}

export interface ContactFilters {
  groups: FilterGroup[];
}

export const EMPTY_CONTACT_FILTERS: ContactFilters = {
  groups: [],
};

export function countActiveContactFilters(f: ContactFilters): number {
  return f.groups.reduce((sum, g) => sum + g.rules.length, 0);
}

// --- Field definitions ---

export interface PipelineWithStages {
  id: string;
  name: string;
  marketing_pipeline_stages: { id: string; name: string; position: number }[];
}

export interface CustomFieldDef {
  id: string;
  name: string;
  field_type: string;
  section: string;
  options: string[] | null;
}

interface FieldDef {
  key: string;
  label: string;
  group: string;
  type: "text" | "date" | "select" | "tags";
  options?: { value: string; label: string }[];
}

const STANDARD_FIELDS: FieldDef[] = [
  { key: "name", label: "Nome", group: "Contatto", type: "text" },
  { key: "email", label: "Email", group: "Contatto", type: "text" },
  { key: "phone", label: "Telefono", group: "Contatto", type: "text" },
  { key: "company_name", label: "Azienda", group: "Contatto", type: "text" },
  { key: "source", label: "Fonte", group: "Contatto", type: "text" },
  { key: "city", label: "Città", group: "Contatto", type: "text" },
  { key: "province", label: "Provincia", group: "Contatto", type: "text" },
  { key: "created_at", label: "Data creazione", group: "Date", type: "date" },
  { key: "last_activity_at", label: "Ultima attività", group: "Date", type: "date" },
  { key: "tags", label: "Tag", group: "Tag", type: "tags" },
];

const OPP_STATUSES = [
  { value: "open", label: "Aperta" },
  { value: "won", label: "Vinta" },
  { value: "lost", label: "Persa" },
  { value: "abandoned", label: "Abbandonata" },
];

const OPERATOR_LABELS: Record<string, string> = {
  is: "è",
  is_not: "non è",
  is_empty: "è vuoto",
  is_not_empty: "non è vuoto",
};

const TEXT_OPERATORS = ["is", "is_not", "is_empty", "is_not_empty"] as const;

function genId() {
  return Math.random().toString(36).slice(2, 10);
}

// --- Props ---

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: ContactFilters;
  onApply: (filters: ContactFilters) => void;
  availableTags: string[];
  pipelines?: PipelineWithStages[];
  customFields?: CustomFieldDef[];
}

// --- Component ---

export function ContactFiltersSheet({ open, onOpenChange, filters, onApply, availableTags, pipelines = [], customFields = [] }: Props) {
  const [local, setLocal] = useState<ContactFilters>(filters);
  // pickingFor: null = rules view, "new_group" = picking for new OR group, "nested_<groupId>" = picking for AND in group, "change_<ruleId>" = changing field
  const [pickingFor, setPickingFor] = useState<string | null>(null);
  const [fieldSearch, setFieldSearch] = useState("");

  useEffect(() => {
    if (open) {
      setLocal(filters);
      setPickingFor(null);
      setFieldSearch("");
    }
  }, [open, filters]);

  // Build all available fields
  const allFields = useMemo((): FieldDef[] => {
    const fields: FieldDef[] = [...STANDARD_FIELDS];
    pipelines.forEach((p) => {
      fields.push({
        key: `opp_pipeline_${p.id}`,
        label: `Sequenza: ${p.name}`,
        group: "Opportunità",
        type: "select",
        options: [{ value: p.id, label: p.name }],
      });
    });
    if (pipelines.length > 0) {
      const stageOptions = pipelines.flatMap((p) =>
        (p.marketing_pipeline_stages || [])
          .sort((a, b) => a.position - b.position)
          .map((s) => ({ value: s.id, label: `${p.name} → ${s.name}` }))
      );
      if (stageOptions.length > 0) {
        fields.push({ key: "opp_stage", label: "Fase pipeline", group: "Opportunità", type: "select", options: stageOptions });
      }
    }
    fields.push({ key: "opp_status", label: "Stato opportunità", group: "Opportunità", type: "select", options: OPP_STATUSES });
    customFields.forEach((cf) => {
      const fieldType: FieldDef["type"] = cf.field_type === "date" ? "date" : cf.options && cf.options.length > 0 ? "select" : "text";
      fields.push({
        key: `cf_${cf.id}`,
        label: cf.name,
        group: "Campi personalizzati",
        type: fieldType,
        options: cf.options ? cf.options.map((o) => ({ value: o, label: o })) : undefined,
      });
    });
    return fields;
  }, [pipelines, customFields]);

  const getFieldDef = (key: string): FieldDef | undefined => allFields.find((f) => f.key === key);
  const needsValue = (op: string) => op === "is" || op === "is_not";

  // --- Group/Rule CRUD ---
  const updateRule = (ruleId: string, patch: Partial<FilterRule>) => {
    setLocal((prev) => ({
      ...prev,
      groups: prev.groups.map((g) => ({
        ...g,
        rules: g.rules.map((r) => (r.id === ruleId ? { ...r, ...patch } : r)),
      })),
    }));
  };

  const removeRule = (groupId: string, ruleId: string) => {
    setLocal((prev) => {
      const groups = prev.groups
        .map((g) => g.id === groupId ? { ...g, rules: g.rules.filter((r) => r.id !== ruleId) } : g)
        .filter((g) => g.rules.length > 0);
      return { groups };
    });
  };

  const selectFieldForPicking = (fieldKey: string) => {
    if (!pickingFor) return;

    if (pickingFor === "new_group") {
      const newGroup: FilterGroup = { id: genId(), rules: [{ id: genId(), field: fieldKey, operator: "is", value: "" }] };
      setLocal((prev) => ({ groups: [...prev.groups, newGroup] }));
    } else if (pickingFor.startsWith("nested_")) {
      const groupId = pickingFor.replace("nested_", "");
      const newRule: FilterRule = { id: genId(), field: fieldKey, operator: "is", value: "" };
      setLocal((prev) => ({
        groups: prev.groups.map((g) => g.id === groupId ? { ...g, rules: [...g.rules, newRule] } : g),
      }));
    } else if (pickingFor.startsWith("change_")) {
      const ruleId = pickingFor.replace("change_", "");
      updateRule(ruleId, { field: fieldKey, value: "" });
    }

    setPickingFor(null);
    setFieldSearch("");
  };

  // --- Field picker filtered ---
  const filteredFields = useMemo(() => {
    const q = fieldSearch.toLowerCase();
    const filtered = q ? allFields.filter((f) => f.label.toLowerCase().includes(q) || f.group.toLowerCase().includes(q)) : allFields;
    const grouped: Record<string, FieldDef[]> = {};
    filtered.forEach((f) => {
      if (!grouped[f.group]) grouped[f.group] = [];
      grouped[f.group].push(f);
    });
    return grouped;
  }, [allFields, fieldSearch]);

  const isPicking = pickingFor !== null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[400px] sm:w-[440px] flex flex-col overflow-hidden p-0">
        <SheetDescription className="sr-only">Filtri avanzati per i contatti</SheetDescription>

        {isPicking ? (
          /* Field picker screen */
          <div className="flex flex-col h-full">
            <div className="px-6 pt-6 pb-3">
              <div className="flex items-center gap-2 mb-3">
                <button
                  onClick={() => { setPickingFor(null); setFieldSearch(""); }}
                  className="p-1 hover:bg-muted rounded transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <h3 className="text-sm font-semibold flex-1">Scegli campo</h3>
              </div>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Cerca campo..."
                  value={fieldSearch}
                  onChange={(e) => setFieldSearch(e.target.value)}
                  className="pl-8 h-8 text-sm"
                  autoFocus
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-6 pb-4">
              {Object.entries(filteredFields).map(([group, fields]) => (
                <div key={group} className="mb-3">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground py-1.5 px-1">{group}</div>
                  {fields.map((f) => (
                    <button
                      key={f.key}
                      onClick={() => selectFieldForPicking(f.key)}
                      className="flex items-center w-full px-2 py-2 text-sm rounded-md hover:bg-muted/60 transition-colors text-foreground"
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              ))}
              {Object.keys(filteredFields).length === 0 && (
                <div className="text-center py-4 text-sm text-muted-foreground">Nessun campo trovato</div>
              )}
            </div>
          </div>
        ) : (
          /* Rules list screen */
          <div className="flex flex-col h-full">
            <div className="px-6 pt-6 pb-3">
              <SheetHeader>
                <SheetTitle className="text-base">Filtri Avanzati</SheetTitle>
              </SheetHeader>
            </div>

            <div className="flex-1 overflow-y-auto px-6 pb-4">
              {local.groups.length === 0 && (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  Nessun filtro attivo. Clicca sotto per aggiungerne uno.
                </div>
              )}

              {local.groups.map((group, gIdx) => (
                <div key={group.id}>
                  {/* OR separator between groups */}
                  {gIdx > 0 && (
                    <div className="flex items-center gap-3 my-3">
                      <div className="flex-1 h-px bg-border" />
                      <span className="text-[11px] font-semibold text-destructive uppercase tracking-wider">OR</span>
                      <div className="flex-1 h-px bg-border" />
                    </div>
                  )}

                  {/* Group block */}
                  <div className="rounded-lg border bg-card">
                    {group.rules.map((rule, rIdx) => {
                      const fieldDef = getFieldDef(rule.field);
                      const showValue = needsValue(rule.operator);
                      const isSelectField = fieldDef?.type === "select" || fieldDef?.type === "tags";

                      return (
                        <div key={rule.id}>
                          {/* AND separator between rules in same group */}
                          {rIdx > 0 && (
                            <div className="flex items-center gap-3 px-3">
                              <div className="flex-1 h-px bg-border" />
                              <span className="text-[10px] font-semibold text-primary uppercase tracking-wider">AND</span>
                              <div className="flex-1 h-px bg-border" />
                            </div>
                          )}

                          <div className="p-3 space-y-2">
                            {/* Row 1: field name + operator */}
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => { setPickingFor(`change_${rule.id}`); setFieldSearch(""); }}
                                className="flex items-center gap-1 text-sm font-medium text-foreground hover:text-primary transition-colors truncate"
                              >
                                {fieldDef?.label || rule.field}
                                <Pencil className="h-3 w-3 text-muted-foreground" />
                              </button>
                              <div className="flex-1" />
                              <Select
                                value={rule.operator}
                                onValueChange={(v) => {
                                  const op = v as FilterRule["operator"];
                                  updateRule(rule.id, { operator: op, ...(op === "is_empty" || op === "is_not_empty" ? { value: "" } : {}) });
                                }}
                              >
                                <SelectTrigger className="h-7 w-[120px] text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {TEXT_OPERATORS.map((op) => (
                                    <SelectItem key={op} value={op} className="text-xs">{OPERATOR_LABELS[op]}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            {/* Row 2: value input + trash */}
                            {showValue && (
                              <div className="flex items-center gap-2">
                                <div className="flex-1">
                                  {isSelectField && fieldDef?.options ? (
                                    <Select value={rule.value} onValueChange={(v) => updateRule(rule.id, { value: v })}>
                                      <SelectTrigger className="h-8 text-xs">
                                        <SelectValue placeholder="Seleziona..." />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {fieldDef.type === "tags"
                                          ? availableTags.map((t) => <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>)
                                          : fieldDef.options.map((o) => <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>)}
                                      </SelectContent>
                                    </Select>
                                  ) : fieldDef?.type === "date" ? (
                                    <Input type="date" value={rule.value} onChange={(e) => updateRule(rule.id, { value: e.target.value })} className="h-8 text-xs" />
                                  ) : (
                                    <Input placeholder="Inserisci valore..." value={rule.value} onChange={(e) => updateRule(rule.id, { value: e.target.value })} className="h-8 text-xs" />
                                  )}
                                </div>
                                <button
                                  onClick={() => removeRule(group.id, rule.id)}
                                  className="p-1 text-muted-foreground hover:text-destructive transition-colors"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            )}

                            {/* Trash for empty/not empty operators */}
                            {!showValue && (
                              <div className="flex justify-end">
                                <button
                                  onClick={() => removeRule(group.id, rule.id)}
                                  className="p-1 text-muted-foreground hover:text-destructive transition-colors"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {/* + Aggiungi filtro annidato (AND) */}
                    <div className="px-3 pb-2">
                      <button
                        onClick={() => { setPickingFor(`nested_${group.id}`); setFieldSearch(""); }}
                        className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors py-1"
                      >
                        <Plus className="h-3 w-3" />
                        Aggiungi filtro annidato
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              {/* + Aggiungi filtro (OR - new group) */}
              <button
                onClick={() => { setPickingFor("new_group"); setFieldSearch(""); }}
                className="flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 transition-colors py-3 mt-1"
              >
                <Plus className="h-4 w-4" />
                Aggiungi filtro
              </button>
            </div>

            {/* Footer */}
            <div className="flex items-center gap-2 p-4 border-t bg-background">
              <button
                onClick={() => {
                  setLocal(EMPTY_CONTACT_FILTERS);
                  onApply(EMPTY_CONTACT_FILTERS);
                  onOpenChange(false);
                }}
                className="text-xs text-destructive hover:text-destructive/80 transition-colors mr-auto"
              >
                Rimuovi tutti i filtri
              </button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
              >
                Annulla
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  onApply(local);
                  onOpenChange(false);
                }}
              >
                Applica
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
