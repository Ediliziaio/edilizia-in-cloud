import { useState, useMemo } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, Plus, Search, Trash2, X } from "lucide-react";

// --- Types ---

export interface FilterRule {
  id: string;
  field: string;
  operator: "is" | "is_not" | "is_empty" | "is_not_empty";
  value: string;
}

export interface ContactFilters {
  logic: "and" | "or";
  rules: FilterRule[];
}

export const EMPTY_CONTACT_FILTERS: ContactFilters = {
  logic: "and",
  rules: [],
};

export function countActiveContactFilters(f: ContactFilters): number {
  return f.rules.length;
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
  const [pickingRuleId, setPickingRuleId] = useState<string | null>(null); // rule id being edited, or "new" for adding
  const [fieldSearch, setFieldSearch] = useState("");

  const handleOpenChange = (o: boolean) => {
    if (o) {
      setLocal(filters);
      setPickingRuleId(null);
      setFieldSearch("");
    }
    onOpenChange(o);
  };

  // Build all available fields
  const allFields = useMemo((): FieldDef[] => {
    const fields: FieldDef[] = [...STANDARD_FIELDS];

    // Pipeline fields
    pipelines.forEach((p) => {
      fields.push({
        key: `opp_pipeline_${p.id}`,
        label: `Sequenza: ${p.name}`,
        group: "Opportunità",
        type: "select",
        options: [{ value: p.id, label: p.name }],
      });
    });

    // Pipeline stages (flat)
    if (pipelines.length > 0) {
      const stageOptions = pipelines.flatMap((p) =>
        (p.marketing_pipeline_stages || [])
          .sort((a, b) => a.position - b.position)
          .map((s) => ({ value: s.id, label: `${p.name} → ${s.name}` }))
      );
      if (stageOptions.length > 0) {
        fields.push({
          key: "opp_stage",
          label: "Fase pipeline",
          group: "Opportunità",
          type: "select",
          options: stageOptions,
        });
      }
    }

    // Opp status
    fields.push({
      key: "opp_status",
      label: "Stato opportunità",
      group: "Opportunità",
      type: "select",
      options: OPP_STATUSES,
    });

    // Custom fields
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

  // --- Rule CRUD ---
  const updateRule = (id: string, patch: Partial<FilterRule>) => {
    setLocal((prev) => ({
      ...prev,
      rules: prev.rules.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    }));
  };

  const removeRule = (id: string) => {
    setLocal((prev) => ({
      ...prev,
      rules: prev.rules.filter((r) => r.id !== id),
    }));
  };

  const selectFieldForRule = (ruleId: string, fieldKey: string) => {
    if (ruleId === "new") {
      const newRule: FilterRule = { id: genId(), field: fieldKey, operator: "is", value: "" };
      setLocal((prev) => ({ ...prev, rules: [...prev.rules, newRule] }));
    } else {
      updateRule(ruleId, { field: fieldKey, value: "" });
    }
    setPickingRuleId(null);
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

  // --- Render ---
  const isPicking = pickingRuleId !== null;

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="w-[400px] sm:w-[440px] flex flex-col overflow-hidden p-0">
        <div className="relative flex-1 overflow-hidden">
          {/* Screen 1: Rules list */}
          <div
            className={`absolute inset-0 flex flex-col transition-transform duration-200 ease-out ${
              isPicking ? "-translate-x-full" : "translate-x-0"
            }`}
          >
            <div className="px-6 pt-6 pb-3">
              <SheetHeader>
                <SheetTitle className="text-base">Filtri Avanzati</SheetTitle>
              </SheetHeader>

              {/* AND/OR toggle */}
              {local.rules.length > 1 && (
                <div className="flex items-center gap-2 mt-3">
                  <span className="text-xs text-muted-foreground">I contatti devono corrispondere a</span>
                  <div className="inline-flex rounded-md border overflow-hidden">
                    <button
                      onClick={() => setLocal((p) => ({ ...p, logic: "and" }))}
                      className={`px-3 py-1 text-xs font-medium transition-colors ${
                        local.logic === "and"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted/50 text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      Tutti (E)
                    </button>
                    <button
                      onClick={() => setLocal((p) => ({ ...p, logic: "or" }))}
                      className={`px-3 py-1 text-xs font-medium transition-colors ${
                        local.logic === "or"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted/50 text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      Almeno uno (O)
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Rules */}
            <div className="flex-1 overflow-y-auto px-6 space-y-3">
              {local.rules.length === 0 && (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  Nessun filtro attivo. Clicca sotto per aggiungerne uno.
                </div>
              )}

              {local.rules.map((rule, idx) => {
                const fieldDef = getFieldDef(rule.field);
                const showValue = needsValue(rule.operator);
                const isSelectField = fieldDef?.type === "select" || fieldDef?.type === "tags";

                return (
                  <div key={rule.id} className="rounded-lg border bg-card p-3 space-y-2">
                    {/* Logic label between rules */}
                    {idx > 0 && (
                      <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider -mt-1 mb-1">
                        {local.logic === "and" ? "E" : "O"}
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      {/* Field name (clickable to change) */}
                      <button
                        onClick={() => { setPickingRuleId(rule.id); setFieldSearch(""); }}
                        className="flex-1 text-left text-sm font-medium text-foreground hover:text-primary transition-colors truncate"
                      >
                        {fieldDef?.label || rule.field}
                      </button>
                      <button
                        onClick={() => removeRule(rule.id)}
                        className="p-1 text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {/* Operator */}
                    <Select
                      value={rule.operator}
                      onValueChange={(v) => {
                        updateRule(rule.id, { operator: v as FilterRule["operator"] });
                        if (v === "is_empty" || v === "is_not_empty") {
                          updateRule(rule.id, { operator: v as FilterRule["operator"], value: "" });
                        }
                      }}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TEXT_OPERATORS.map((op) => (
                          <SelectItem key={op} value={op} className="text-xs">
                            {OPERATOR_LABELS[op]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {/* Value */}
                    {showValue && (
                      <>
                        {isSelectField && fieldDef?.options ? (
                          <Select
                            value={rule.value}
                            onValueChange={(v) => updateRule(rule.id, { value: v })}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder="Seleziona..." />
                            </SelectTrigger>
                            <SelectContent>
                              {fieldDef.type === "tags"
                                ? availableTags.map((t) => (
                                    <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>
                                  ))
                                : fieldDef.options.map((o) => (
                                    <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
                                  ))}
                            </SelectContent>
                          </Select>
                        ) : fieldDef?.type === "date" ? (
                          <Input
                            type="date"
                            value={rule.value}
                            onChange={(e) => updateRule(rule.id, { value: e.target.value })}
                            className="h-8 text-xs"
                          />
                        ) : (
                          <Input
                            placeholder={`Inserisci valore...`}
                            value={rule.value}
                            onChange={(e) => updateRule(rule.id, { value: e.target.value })}
                            className="h-8 text-xs"
                          />
                        )}
                      </>
                    )}
                  </div>
                );
              })}

              {/* Add filter button */}
              <button
                onClick={() => { setPickingRuleId("new"); setFieldSearch(""); }}
                className="flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 transition-colors py-2"
              >
                <Plus className="h-4 w-4" />
                Aggiungi filtro
              </button>
            </div>

            {/* Footer */}
            <div className="flex gap-2 p-4 border-t bg-background">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => {
                  setLocal(EMPTY_CONTACT_FILTERS);
                  onApply(EMPTY_CONTACT_FILTERS);
                  onOpenChange(false);
                }}
              >
                <X className="h-3.5 w-3.5 mr-1.5" /> Resetta
              </Button>
              <Button
                size="sm"
                className="flex-1"
                onClick={() => {
                  onApply(local);
                  onOpenChange(false);
                }}
              >
                Applica filtri
              </Button>
            </div>
          </div>

          {/* Screen 2: Field picker */}
          <div
            className={`absolute inset-0 flex flex-col transition-transform duration-200 ease-out ${
              isPicking ? "translate-x-0" : "translate-x-full"
            }`}
          >
            <div className="px-6 pt-6 pb-3">
              <div className="flex items-center gap-2 mb-3">
                <button
                  onClick={() => { setPickingRuleId(null); setFieldSearch(""); }}
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
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground py-1.5 px-1">
                    {group}
                  </div>
                  {fields.map((f) => (
                    <button
                      key={f.key}
                      onClick={() => pickingRuleId && selectFieldForRule(pickingRuleId, f.key)}
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
        </div>
      </SheetContent>
    </Sheet>
  );
}
