import { useState, useMemo } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Search, Lock, GripVertical, ChevronDown, ChevronRight, LayoutTemplate, Minimize2, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { BUILT_IN_FIELDS, type FieldDefinition, type CardLayout } from "@/hooks/useCardFieldPreferences";

interface CardCustomizeSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeFields: string[];
  layout: CardLayout;
  onApply: (fields: string[], layout: CardLayout) => void;
  customFields?: FieldDefinition[];
}

const LAYOUT_OPTIONS: { value: CardLayout; label: string; icon: React.ReactNode }[] = [
  { value: "default", label: "Predefinito", icon: <LayoutTemplate className="h-4 w-4" /> },
  { value: "compact", label: "Compatto", icon: <Minimize2 className="h-4 w-4" /> },
  { value: "no-label", label: "Senza etichetta", icon: <EyeOff className="h-4 w-4" /> },
];

const SECTIONS: { key: string; label: string }[] = [
  { key: "other", label: "Altri dettagli" },
  { key: "contact", label: "PRIMARIO Contatto Dettagli" },
  { key: "opportunity", label: "Opportunità Dettagli" },
];

export function CardCustomizeSheet({ open, onOpenChange, activeFields, layout, onApply, customFields = [] }: CardCustomizeSheetProps) {
  const [draftFields, setDraftFields] = useState<string[]>(activeFields);
  const [draftLayout, setDraftLayout] = useState<CardLayout>(layout);
  const [search, setSearch] = useState("");
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});

  // Reset draft when sheet opens
  const handleOpenChange = (v: boolean) => {
    if (v) {
      setDraftFields([...activeFields]);
      setDraftLayout(layout);
      setSearch("");
    }
    onOpenChange(v);
  };

  const allFields = useMemo(() => [...BUILT_IN_FIELDS, ...customFields], [customFields]);

  const mainFields = useMemo(() => allFields.filter((f) => f.section === "main"), [allFields]);
  const activeMainFields = useMemo(() => mainFields.filter((f) => draftFields.includes(f.key)), [mainFields, draftFields]);

  const sectionFields = useMemo(() => {
    const map: Record<string, FieldDefinition[]> = {};
    for (const sec of SECTIONS) {
      map[sec.key] = allFields.filter((f) => f.section === sec.key && !draftFields.includes(f.key));
    }
    // Add custom fields to opportunity section
    return map;
  }, [allFields, draftFields]);

  const q = search.toLowerCase();
  const filterField = (f: FieldDefinition) => !q || f.label.toLowerCase().includes(q);

  const toggleField = (key: string) => {
    setDraftFields((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const toggleSection = (key: string) => {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Mini preview values
  const previewLines = useMemo(() => {
    const labels: Record<string, string> = {};
    allFields.forEach((f) => (labels[f.key] = f.label));
    const sampleValues: Record<string, string> = {
      opp_name: "Mario Rossi - Roma",
      tags: "facebook, google",
      owner: "AR",
      source: "Facebook",
      value: "EUR 12.500,00",
      lost_reason: "Prezzo troppo alto",
      contact_email: "mario@example.com",
      contact_phone: "+39 333 1234567",
      created_at: "22/02/2026",
      updated_at: "22/02/2026",
      contact_name: "Mario Rossi",
      contact_company: "Rossi Costruzioni",
      contact_city: "Roma",
      contact_source: "Sito web",
      pipeline: "Vendite",
      stage: "Qualificato",
      status: "Aperta",
      status_changed_at: "21/02/2026",
      stage_changed_at: "20/02/2026",
    };
    return draftFields
      .filter((k) => k !== "opp_name" && k !== "tags" && k !== "owner")
      .map((k) => ({ label: labels[k] || k, value: sampleValues[k] || "—" }));
  }, [draftFields, allFields]);

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col p-0 gap-0">
        <SheetHeader className="px-5 pt-5 pb-3 border-b">
          <SheetTitle className="text-lg font-bold">Personalizza scheda</SheetTitle>
          <SheetDescription className="text-xs text-muted-foreground">
            Scegli i campi da mostrare sulla card dell'opportunità
          </SheetDescription>
        </SheetHeader>

        {/* Mini Preview */}
        <div className="px-5 py-3 border-b bg-muted/30">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1.5">Anteprima</p>
          <div className="bg-background border rounded-lg p-3 shadow-sm space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-bold truncate">Mario Rossi - Roma</p>
              <span className="shrink-0 h-5 w-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[9px] font-bold">
                AR
              </span>
            </div>
            {draftFields.includes("tags") && (
              <div className="flex gap-1">
                <span className="text-[9px] bg-primary/10 text-primary rounded px-1.5 py-0.5">facebook</span>
                <span className="text-[9px] bg-primary/10 text-primary rounded px-1.5 py-0.5">google</span>
              </div>
            )}
            {previewLines.slice(0, 4).map((line) => (
              <p key={line.label} className="text-[10px] leading-tight truncate">
                {draftLayout !== "no-label" && (
                  <span className="text-muted-foreground">{line.label}: </span>
                )}
                <span className={cn("text-foreground", draftLayout === "compact" && "text-[9px]")}>
                  {line.value}
                </span>
              </p>
            ))}
            {previewLines.length > 4 && (
              <p className="text-[9px] text-muted-foreground">+{previewLines.length - 4} altri campi...</p>
            )}
          </div>
        </div>

        {/* Layout selector */}
        <div className="px-5 py-3 border-b">
          <p className="text-xs font-semibold mb-2">Layout della scheda</p>
          <div className="flex gap-2">
            {LAYOUT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setDraftLayout(opt.value)}
                className={cn(
                  "flex-1 flex flex-col items-center gap-1 rounded-lg border p-2 text-[10px] transition-colors",
                  draftLayout === opt.value
                    ? "border-primary bg-primary/5 text-primary font-semibold"
                    : "border-border text-muted-foreground hover:border-primary/40"
                )}
              >
                {opt.icon}
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="fields" className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="mx-5 mt-3 w-auto self-start">
            <TabsTrigger value="fields" className="text-xs">Campi</TabsTrigger>
            <TabsTrigger value="quick" className="text-xs">Attività rapida</TabsTrigger>
          </TabsList>

          <TabsContent value="fields" className="flex-1 overflow-auto px-5 pb-20 mt-2 space-y-3">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Cerca campi..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 pl-8 text-xs"
              />
            </div>

            {/* Active fields */}
            <div className="space-y-1">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase">Campi attivi</p>
              {activeMainFields.filter(filterField).map((field) => (
                <FieldRow
                  key={field.key}
                  field={field}
                  active
                  locked={field.locked}
                  onToggle={() => toggleField(field.key)}
                />
              ))}
              {/* Active non-main fields */}
              {draftFields
                .filter((k) => !mainFields.some((mf) => mf.key === k))
                .map((k) => {
                  const f = allFields.find((af) => af.key === k);
                  if (!f || !filterField(f)) return null;
                  return <FieldRow key={k} field={f} active onToggle={() => toggleField(k)} />;
                })}
            </div>

            {/* Add fields sections */}
            <div className="space-y-1">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase">Aggiungi campi</p>

              {/* Inactive main fields */}
              {mainFields
                .filter((f) => !draftFields.includes(f.key) && filterField(f))
                .map((f) => (
                  <FieldRow key={f.key} field={f} active={false} onToggle={() => toggleField(f.key)} />
                ))}

              {SECTIONS.map((sec) => {
                const fields = (sectionFields[sec.key] || []).filter(filterField);
                if (fields.length === 0) return null;
                const isOpen = expandedSections[sec.key] ?? false;
                return (
                  <Collapsible key={sec.key} open={isOpen} onOpenChange={() => toggleSection(sec.key)}>
                    <CollapsibleTrigger className="flex items-center gap-1.5 w-full py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
                      {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      {sec.label}
                      <span className="ml-auto text-[10px] text-muted-foreground">{fields.length}</span>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-0.5 pl-2">
                      {fields.map((f) => (
                        <FieldRow key={f.key} field={f} active={false} onToggle={() => toggleField(f.key)} />
                      ))}
                    </CollapsibleContent>
                  </Collapsible>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="quick" className="flex-1 overflow-auto px-5 pb-20 mt-2">
            <p className="text-xs text-muted-foreground py-8 text-center">
              Le attività rapide saranno disponibili prossimamente.
            </p>
          </TabsContent>
        </Tabs>

        {/* Fixed footer */}
        <div className="absolute bottom-0 left-0 right-0 flex items-center justify-end gap-2 px-5 py-3 bg-background border-t">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Annulla
          </Button>
          <Button
            size="sm"
            onClick={() => {
              onApply(draftFields, draftLayout);
              onOpenChange(false);
            }}
          >
            Applica
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function FieldRow({
  field,
  active,
  locked,
  onToggle,
}: {
  field: FieldDefinition;
  active: boolean;
  locked?: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center gap-2 py-1.5 px-1 rounded hover:bg-muted/50 group">
      {active && !locked && <GripVertical className="h-3.5 w-3.5 text-muted-foreground/50 cursor-grab shrink-0" />}
      {active && locked && <Lock className="h-3 w-3 text-muted-foreground/50 shrink-0" />}
      {!active && <div className="w-3.5" />}
      <Checkbox
        checked={active}
        disabled={locked}
        onCheckedChange={() => !locked && onToggle()}
        className="h-3.5 w-3.5"
      />
      <span className="text-xs truncate">{field.label}</span>
    </div>
  );
}
