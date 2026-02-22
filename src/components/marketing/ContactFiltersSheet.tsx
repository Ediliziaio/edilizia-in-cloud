import { useState, useMemo } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight, ChevronLeft, RotateCcw, Search, Check } from "lucide-react";

// --- Types ---

export interface FilterCondition {
  operator: "is" | "is_not" | "is_empty" | "is_not_empty";
  value: string;
}

export interface ContactFilters {
  name: FilterCondition | null;
  email: FilterCondition | null;
  phone: FilterCondition | null;
  company: FilterCondition | null;
  source: FilterCondition | null;
  city: FilterCondition | null;
  province: FilterCondition | null;
  dateFrom: string;
  dateTo: string;
  activityFrom: string;
  activityTo: string;
  tags: string[];
  pipelineId: string;
  stageId: string;
  oppStatuses: string[];
  customFields: Record<string, FilterCondition>;
}

export const EMPTY_CONTACT_FILTERS: ContactFilters = {
  name: null,
  email: null,
  phone: null,
  company: null,
  source: null,
  city: null,
  province: null,
  dateFrom: "",
  dateTo: "",
  activityFrom: "",
  activityTo: "",
  tags: [],
  pipelineId: "",
  stageId: "",
  oppStatuses: [],
  customFields: {},
};

export function countActiveContactFilters(f: ContactFilters): number {
  let count = 0;
  if (f.name) count++;
  if (f.email) count++;
  if (f.phone) count++;
  if (f.company) count++;
  if (f.source) count++;
  if (f.city) count++;
  if (f.province) count++;
  if (f.dateFrom || f.dateTo) count++;
  if (f.activityFrom || f.activityTo) count++;
  if (f.tags.length) count++;
  if (f.pipelineId) count++;
  if (f.stageId) count++;
  if (f.oppStatuses.length) count++;
  count += Object.values(f.customFields).filter(Boolean).length;
  return count;
}

// --- Sub-components ---

const OPERATOR_LABELS: Record<string, string> = {
  is: "È",
  is_not: "Non è",
  is_empty: "È vuoto",
  is_not_empty: "Non è vuoto",
};

const TEXT_OPERATORS = ["is", "is_not", "is_empty", "is_not_empty"] as const;

function FilterSection({ title, children, defaultOpen = false, hidden = false }: {
  title: string; children: React.ReactNode; defaultOpen?: boolean; hidden?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (hidden) return null;
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center justify-between w-full py-2.5 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors">
        <span>{title}</span>
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
      </CollapsibleTrigger>
      <CollapsibleContent className="pb-1">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

function FilterRow({ label, condition, onClick }: {
  label: string;
  condition: FilterCondition | null;
  onClick: () => void;
}) {
  const isActive = !!condition;
  return (
    <button
      onClick={onClick}
      className="flex items-center justify-between w-full px-2 py-2 text-sm rounded-md hover:bg-muted/60 transition-colors group"
    >
      <div className="flex items-center gap-2">
        {isActive && <div className="h-1.5 w-1.5 rounded-full bg-primary flex-shrink-0" />}
        <span className={isActive ? "font-medium text-foreground" : "text-muted-foreground"}>
          {label}
        </span>
      </div>
      {isActive && (
        <span className="text-xs text-primary truncate max-w-[140px]">
          {condition.operator === "is_empty" || condition.operator === "is_not_empty"
            ? OPERATOR_LABELS[condition.operator]
            : `${OPERATOR_LABELS[condition.operator]}: ${condition.value}`}
        </span>
      )}
      {!isActive && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />}
    </button>
  );
}

function DateRange({ fromValue, toValue, onFromChange, onToChange }: {
  fromValue: string; toValue: string; onFromChange: (v: string) => void; onToChange: (v: string) => void;
}) {
  return (
    <div className="flex gap-2 px-2 py-1">
      <div className="flex-1">
        <Label className="text-xs text-muted-foreground">Da</Label>
        <Input type="date" value={fromValue} onChange={(e) => onFromChange(e.target.value)} className="h-8 text-sm" />
      </div>
      <div className="flex-1">
        <Label className="text-xs text-muted-foreground">A</Label>
        <Input type="date" value={toValue} onChange={(e) => onToChange(e.target.value)} className="h-8 text-sm" />
      </div>
    </div>
  );
}

// --- Filter Detail Screen ---

function FilterDetailScreen({ label, condition, onBack, onChange, onClear }: {
  label: string;
  condition: FilterCondition | null;
  onBack: () => void;
  onChange: (c: FilterCondition | null) => void;
  onClear: () => void;
}) {
  const currentOp = condition?.operator || "is";
  const currentVal = condition?.value || "";
  const needsValue = currentOp === "is" || currentOp === "is_not";

  const setOp = (op: FilterCondition["operator"]) => {
    if (op === "is_empty" || op === "is_not_empty") {
      onChange({ operator: op, value: "" });
    } else {
      onChange({ operator: op, value: currentVal });
    }
  };

  const setVal = (v: string) => {
    onChange({ operator: currentOp as FilterCondition["operator"], value: v });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 pb-3 border-b">
        <button onClick={onBack} className="p-1 hover:bg-muted rounded transition-colors">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <h3 className="text-sm font-semibold flex-1">{label}</h3>
        {condition && (
          <button onClick={onClear} className="text-xs text-destructive hover:underline">
            Rimuovi
          </button>
        )}
      </div>

      {/* Operator Selection */}
      <div className="mt-4 space-y-1">
        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Operatore</Label>
        <div className="space-y-0.5">
          {TEXT_OPERATORS.map((op) => (
            <button
              key={op}
              onClick={() => setOp(op)}
              className={`flex items-center justify-between w-full px-3 py-2.5 text-sm rounded-md transition-colors ${
                currentOp === op ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted/60 text-foreground"
              }`}
            >
              <span>{OPERATOR_LABELS[op]}</span>
              {currentOp === op && <Check className="h-4 w-4 text-primary" />}
            </button>
          ))}
        </div>
      </div>

      {/* Value Input */}
      {needsValue && (
        <div className="mt-4 space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Valore</Label>
          <Input
            placeholder={`Inserisci ${label.toLowerCase()}...`}
            value={currentVal}
            onChange={(e) => setVal(e.target.value)}
            className="h-9"
            autoFocus
          />
        </div>
      )}

      <div className="flex-1" />

      {/* Confirm */}
      <div className="pt-4 border-t">
        <Button className="w-full" size="sm" onClick={onBack}>
          Conferma
        </Button>
      </div>
    </div>
  );
}

// --- Types for props ---

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

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: ContactFilters;
  onApply: (filters: ContactFilters) => void;
  availableTags: string[];
  pipelines?: PipelineWithStages[];
  customFields?: CustomFieldDef[];
}

const OPP_STATUSES = [
  { value: "open", label: "Aperta" },
  { value: "won", label: "Vinta" },
  { value: "lost", label: "Persa" },
  { value: "abandoned", label: "Abbandonata" },
];

const CONTACT_FIELDS = [
  { key: "name", label: "Nome" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Telefono" },
  { key: "company", label: "Azienda" },
  { key: "source", label: "Fonte" },
  { key: "city", label: "Città" },
  { key: "province", label: "Provincia" },
] as const;

type ContactFieldKey = typeof CONTACT_FIELDS[number]["key"];

export function ContactFiltersSheet({ open, onOpenChange, filters, onApply, availableTags, pipelines = [], customFields = [] }: Props) {
  const [local, setLocal] = useState<ContactFilters>(filters);
  const [searchQ, setSearchQ] = useState("");
  const [activeField, setActiveField] = useState<string | null>(null);

  const handleOpenChange = (o: boolean) => {
    if (o) { setLocal(filters); setSearchQ(""); setActiveField(null); }
    onOpenChange(o);
  };

  // Standard field helpers
  const getFieldCondition = (key: ContactFieldKey): FilterCondition | null => local[key];
  const setFieldCondition = (key: ContactFieldKey, c: FilterCondition | null) =>
    setLocal((prev) => ({ ...prev, [key]: c }));

  // Custom field helpers
  const getCFCondition = (fieldId: string): FilterCondition | null => local.customFields[fieldId] || null;
  const setCFCondition = (fieldId: string, c: FilterCondition | null) =>
    setLocal((prev) => ({
      ...prev,
      customFields: c
        ? { ...prev.customFields, [fieldId]: c }
        : Object.fromEntries(Object.entries(prev.customFields).filter(([k]) => k !== fieldId)),
    }));

  const set = <K extends keyof ContactFilters>(key: K, value: ContactFilters[K]) =>
    setLocal((prev) => ({ ...prev, [key]: value }));

  const toggleTag = (tag: string) =>
    set("tags", local.tags.includes(tag) ? local.tags.filter((t) => t !== tag) : [...local.tags, tag]);

  const toggleOppStatus = (status: string) =>
    set("oppStatuses", local.oppStatuses.includes(status) ? local.oppStatuses.filter((s) => s !== status) : [...local.oppStatuses, status]);

  const selectedPipelineStages = useMemo(() => {
    if (!local.pipelineId) return [];
    const p = pipelines.find((p) => p.id === local.pipelineId);
    return (p?.marketing_pipeline_stages || []).sort((a, b) => a.position - b.position);
  }, [local.pipelineId, pipelines]);

  // Search
  const q = searchQ.toLowerCase();
  const match = (text: string) => !q || text.toLowerCase().includes(q);

  // Group custom fields by section
  const cfBySections = useMemo(() => {
    const grouped: Record<string, CustomFieldDef[]> = {};
    customFields.forEach((f) => {
      if (!grouped[f.section]) grouped[f.section] = [];
      grouped[f.section].push(f);
    });
    return grouped;
  }, [customFields]);

  const sectionLabels: Record<string, string> = {
    general_info: "Informazioni Generali",
    additional_info: "Informazioni Aggiuntive",
    address: "Indirizzo",
  };

  // Visibility
  const visibleContactFields = CONTACT_FIELDS.filter((f) => match(f.label));
  const showContactInfo = match("informazioni di contatto") || visibleContactFields.length > 0;
  const showActivity = match("attività") || match("data creazione") || match("ultima attività");
  const showOpp = match("opportunità") || match("sequenza") || match("fase") || match("stato");
  const showTags = match("tag") && availableTags.length > 0;

  // Determine active field info
  const activeFieldInfo = useMemo(() => {
    if (!activeField) return null;
    // Standard field?
    const stdField = CONTACT_FIELDS.find((f) => f.key === activeField);
    if (stdField) return { type: "standard" as const, key: stdField.key, label: stdField.label };
    // Custom field?
    if (activeField.startsWith("cf_")) {
      const cfId = activeField.slice(3);
      const cf = customFields.find((f) => f.id === cfId);
      if (cf) return { type: "custom" as const, id: cfId, label: cf.name };
    }
    return null;
  }, [activeField, customFields]);

  // --- Render ---
  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="w-[360px] sm:w-[400px] flex flex-col overflow-hidden p-0">
        <div className="relative flex-1 overflow-hidden">
          {/* Screen 1: Filter List */}
          <div
            className={`absolute inset-0 flex flex-col transition-transform duration-200 ease-out ${
              activeField ? "-translate-x-full" : "translate-x-0"
            }`}
          >
            <div className="px-6 pt-6">
              <SheetHeader>
                <SheetTitle className="text-base">Filtri Avanzati</SheetTitle>
              </SheetHeader>
              {/* Search */}
              <div className="relative mt-3">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Cerca filtri..."
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
                  className="pl-8 h-8 text-sm"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 mt-2 space-y-0.5">
              {/* Informazioni di contatto */}
              <FilterSection title="Informazioni di contatto" defaultOpen hidden={!showContactInfo}>
                {visibleContactFields.map((f) => (
                  <FilterRow
                    key={f.key}
                    label={f.label}
                    condition={getFieldCondition(f.key)}
                    onClick={() => setActiveField(f.key)}
                  />
                ))}
              </FilterSection>

              {/* Attività di contatto */}
              <FilterSection title="Attività di contatto" hidden={!showActivity}>
                <div className="space-y-2">
                  <Label className="text-xs font-medium px-2">Data creazione</Label>
                  <DateRange
                    fromValue={local.dateFrom}
                    toValue={local.dateTo}
                    onFromChange={(v) => set("dateFrom", v)}
                    onToChange={(v) => set("dateTo", v)}
                  />
                  <Label className="text-xs font-medium px-2 mt-2">Ultima attività</Label>
                  <DateRange
                    fromValue={local.activityFrom}
                    toValue={local.activityTo}
                    onFromChange={(v) => set("activityFrom", v)}
                    onToChange={(v) => set("activityTo", v)}
                  />
                </div>
              </FilterSection>

              {/* Opportunità */}
              <FilterSection title="Informazioni sulle opportunità" hidden={!showOpp}>
                <div className="px-2 space-y-3">
                  <div>
                    <Label className="text-xs font-medium">Sequenza</Label>
                    <Select
                      value={local.pipelineId || "_none"}
                      onValueChange={(v) => {
                        set("pipelineId", v === "_none" ? "" : v);
                        set("stageId", "");
                      }}
                    >
                      <SelectTrigger className="h-8 text-sm mt-1">
                        <SelectValue placeholder="Tutte le sequenze" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">Tutte le sequenze</SelectItem>
                        {pipelines.map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {selectedPipelineStages.length > 0 && (
                    <div>
                      <Label className="text-xs font-medium">Fase della pipeline</Label>
                      <Select
                        value={local.stageId || "_none"}
                        onValueChange={(v) => set("stageId", v === "_none" ? "" : v)}
                      >
                        <SelectTrigger className="h-8 text-sm mt-1">
                          <SelectValue placeholder="Tutte le fasi" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_none">Tutte le fasi</SelectItem>
                          {selectedPipelineStages.map((s) => (
                            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div>
                    <Label className="text-xs font-medium">Stato della pipeline</Label>
                    <div className="space-y-1.5 mt-1">
                      {OPP_STATUSES.map((s) => (
                        <label key={s.value} className="flex items-center gap-2 text-sm cursor-pointer">
                          <Checkbox
                            checked={local.oppStatuses.includes(s.value)}
                            onCheckedChange={() => toggleOppStatus(s.value)}
                          />
                          {s.label}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </FilterSection>

              {/* Tag */}
              <FilterSection title="Tag" hidden={!showTags}>
                <div className="flex flex-wrap gap-1.5 px-2">
                  {availableTags.map((tag) => (
                    <button
                      key={tag}
                      onClick={() => toggleTag(tag)}
                      className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                        local.tags.includes(tag)
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-muted/50 text-muted-foreground border-border hover:bg-muted"
                      }`}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </FilterSection>

              {/* Custom Fields */}
              {Object.entries(cfBySections).map(([section, fields]) => {
                const visibleFields = fields.filter((f) => match(f.name));
                if (visibleFields.length === 0 && !match(sectionLabels[section] || section)) return null;
                const displayFields = visibleFields.length > 0 ? visibleFields : fields;
                return (
                  <FilterSection key={section} title={sectionLabels[section] || section}>
                    {displayFields.map((field) => (
                      <FilterRow
                        key={field.id}
                        label={field.name}
                        condition={getCFCondition(field.id)}
                        onClick={() => setActiveField(`cf_${field.id}`)}
                      />
                    ))}
                  </FilterSection>
                );
              })}
            </div>

            {/* Footer */}
            <div className="flex gap-2 p-4 border-t bg-background">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 gap-1.5"
                onClick={() => {
                  setLocal(EMPTY_CONTACT_FILTERS);
                  onApply(EMPTY_CONTACT_FILTERS);
                  onOpenChange(false);
                }}
              >
                <RotateCcw className="h-3.5 w-3.5" /> Resetta
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

          {/* Screen 2: Filter Detail */}
          <div
            className={`absolute inset-0 flex flex-col transition-transform duration-200 ease-out px-6 pt-6 pb-4 ${
              activeField ? "translate-x-0" : "translate-x-full"
            }`}
          >
            {activeFieldInfo?.type === "standard" && (
              <FilterDetailScreen
                label={activeFieldInfo.label}
                condition={getFieldCondition(activeFieldInfo.key)}
                onBack={() => setActiveField(null)}
                onChange={(c) => setFieldCondition(activeFieldInfo.key, c)}
                onClear={() => { setFieldCondition(activeFieldInfo.key, null); setActiveField(null); }}
              />
            )}
            {activeFieldInfo?.type === "custom" && (
              <FilterDetailScreen
                label={activeFieldInfo.label}
                condition={getCFCondition(activeFieldInfo.id)}
                onBack={() => setActiveField(null)}
                onChange={(c) => setCFCondition(activeFieldInfo.id, c)}
                onClear={() => { setCFCondition(activeFieldInfo.id, null); setActiveField(null); }}
              />
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
