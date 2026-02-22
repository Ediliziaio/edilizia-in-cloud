import { useState, useMemo } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight, RotateCcw, Search } from "lucide-react";

// --- Types ---

export interface ContactFilters {
  // Contact info
  name: string;
  email: string;
  phone: string;
  company: string;
  source: string;
  city: string;
  province: string;
  // Dates
  dateFrom: string;
  dateTo: string;
  activityFrom: string;
  activityTo: string;
  // Tags
  tags: string[];
  // Opportunities
  pipelineId: string;
  stageId: string;
  oppStatuses: string[];
  // Custom fields  
  customFields: Record<string, string>;
}

export const EMPTY_CONTACT_FILTERS: ContactFilters = {
  name: "",
  email: "",
  phone: "",
  company: "",
  source: "",
  city: "",
  province: "",
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
  const cfCount = Object.values(f.customFields).filter(Boolean).length;
  count += cfCount;
  return count;
}

// --- Sub-components ---

function FilterSection({ title, children, defaultOpen = false, hidden = false }: {
  title: string; children: React.ReactNode; defaultOpen?: boolean; hidden?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (hidden) return null;
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center justify-between w-full py-2 px-1 text-sm font-medium hover:bg-muted/50 rounded transition-colors">
        <span>{title}</span>
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
      </CollapsibleTrigger>
      <CollapsibleContent className="px-1 pb-3 space-y-2">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

function SmallInput({ placeholder, value, onChange }: { placeholder: string; value: string; onChange: (v: string) => void }) {
  return <Input placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} className="h-8 text-sm" />;
}

function DateRange({ fromValue, toValue, onFromChange, onToChange }: {
  fromValue: string; toValue: string; onFromChange: (v: string) => void; onToChange: (v: string) => void;
}) {
  return (
    <div className="flex gap-2">
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

export function ContactFiltersSheet({ open, onOpenChange, filters, onApply, availableTags, pipelines = [], customFields = [] }: Props) {
  const [local, setLocal] = useState<ContactFilters>(filters);
  const [searchQ, setSearchQ] = useState("");

  const handleOpenChange = (o: boolean) => {
    if (o) { setLocal(filters); setSearchQ(""); }
    onOpenChange(o);
  };

  const set = <K extends keyof ContactFilters>(key: K, value: ContactFilters[K]) =>
    setLocal((prev) => ({ ...prev, [key]: value }));

  const toggleTag = (tag: string) =>
    set("tags", local.tags.includes(tag) ? local.tags.filter((t) => t !== tag) : [...local.tags, tag]);

  const toggleOppStatus = (status: string) =>
    set("oppStatuses", local.oppStatuses.includes(status) ? local.oppStatuses.filter((s) => s !== status) : [...local.oppStatuses, status]);

  const setCF = (fieldId: string, value: string) =>
    setLocal((prev) => ({ ...prev, customFields: { ...prev.customFields, [fieldId]: value } }));

  // Get stages for selected pipeline
  const selectedPipelineStages = useMemo(() => {
    if (!local.pipelineId) return [];
    const p = pipelines.find((p) => p.id === local.pipelineId);
    return (p?.marketing_pipeline_stages || []).sort((a, b) => a.position - b.position);
  }, [local.pipelineId, pipelines]);

  // Search filter
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

  // Section visibility based on search
  const contactInfoFields = [
    { label: "Nome", key: "name" },
    { label: "Email", key: "email" },
    { label: "Telefono", key: "phone" },
    { label: "Azienda", key: "company" },
    { label: "Fonte", key: "source" },
    { label: "Città", key: "city" },
    { label: "Provincia", key: "province" },
  ];
  const visibleContactFields = contactInfoFields.filter((f) => match(f.label));
  const showContactInfo = match("informazioni di contatto") || visibleContactFields.length > 0;
  const showActivity = match("attività") || match("data creazione") || match("ultima attività");
  const showOpp = match("opportunità") || match("sequenza") || match("fase") || match("stato");
  const showTags = match("tag") && availableTags.length > 0;

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="w-[360px] sm:w-[400px] flex flex-col">
        <SheetHeader>
          <SheetTitle className="text-base">Filtri Avanzati</SheetTitle>
        </SheetHeader>

        {/* Search */}
        <div className="relative mt-2">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Cerca filtri..."
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>

        <div className="flex-1 overflow-y-auto space-y-0.5 mt-3">
          {/* Informazioni di contatto */}
          <FilterSection title="Informazioni di contatto" defaultOpen hidden={!showContactInfo}>
            {visibleContactFields.map((f) => (
              <SmallInput
                key={f.key}
                placeholder={f.label}
                value={(local as any)[f.key] || ""}
                onChange={(v) => set(f.key as keyof ContactFilters, v)}
              />
            ))}
          </FilterSection>

          {/* Attività di contatto */}
          <FilterSection title="Attività di contatto" hidden={!showActivity}>
            <Label className="text-xs font-medium">Data creazione</Label>
            <DateRange
              fromValue={local.dateFrom}
              toValue={local.dateTo}
              onFromChange={(v) => set("dateFrom", v)}
              onToChange={(v) => set("dateTo", v)}
            />
            <Label className="text-xs font-medium mt-2">Ultima attività</Label>
            <DateRange
              fromValue={local.activityFrom}
              toValue={local.activityTo}
              onFromChange={(v) => set("activityFrom", v)}
              onToChange={(v) => set("activityTo", v)}
            />
          </FilterSection>

          {/* Informazioni sulle opportunità */}
          <FilterSection title="Informazioni sulle opportunità" hidden={!showOpp}>
            {/* Pipeline */}
            <Label className="text-xs font-medium">Sequenza</Label>
            <Select
              value={local.pipelineId || "_none"}
              onValueChange={(v) => {
                set("pipelineId", v === "_none" ? "" : v);
                set("stageId", "");
              }}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="Tutte le sequenze" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">Tutte le sequenze</SelectItem>
                {pipelines.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Stage */}
            {selectedPipelineStages.length > 0 && (
              <>
                <Label className="text-xs font-medium mt-2">Fase della pipeline</Label>
                <Select
                  value={local.stageId || "_none"}
                  onValueChange={(v) => set("stageId", v === "_none" ? "" : v)}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Tutte le fasi" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">Tutte le fasi</SelectItem>
                    {selectedPipelineStages.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            )}

            {/* Status */}
            <Label className="text-xs font-medium mt-2">Stato della pipeline</Label>
            <div className="space-y-1.5">
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
          </FilterSection>

          {/* Tag */}
          <FilterSection title="Tag" hidden={!showTags}>
            <div className="flex flex-wrap gap-1.5">
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
                {displayFields.map((field) => {
                  const cfValue = local.customFields[field.id] || "";
                  switch (field.field_type) {
                    case "text":
                      return (
                        <div key={field.id}>
                          <Label className="text-xs text-muted-foreground">{field.name}</Label>
                          <SmallInput placeholder={field.name} value={cfValue} onChange={(v) => setCF(field.id, v)} />
                        </div>
                      );
                    case "number":
                      return (
                        <div key={field.id}>
                          <Label className="text-xs text-muted-foreground">{field.name}</Label>
                          <Input type="number" placeholder={field.name} value={cfValue} onChange={(e) => setCF(field.id, e.target.value)} className="h-8 text-sm" />
                        </div>
                      );
                    case "date":
                      return (
                        <div key={field.id}>
                          <Label className="text-xs text-muted-foreground">{field.name}</Label>
                          <Input type="date" value={cfValue} onChange={(e) => setCF(field.id, e.target.value)} className="h-8 text-sm" />
                        </div>
                      );
                    case "select":
                      return (
                        <div key={field.id}>
                          <Label className="text-xs text-muted-foreground">{field.name}</Label>
                          <Select value={cfValue || "_none"} onValueChange={(v) => setCF(field.id, v === "_none" ? "" : v)}>
                            <SelectTrigger className="h-8 text-sm">
                              <SelectValue placeholder="Seleziona..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="_none">Tutti</SelectItem>
                              {(field.options || []).map((opt) => (
                                <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      );
                    default:
                      return null;
                  }
                })}
              </FilterSection>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex gap-2 pt-4 border-t">
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
      </SheetContent>
    </Sheet>
  );
}
