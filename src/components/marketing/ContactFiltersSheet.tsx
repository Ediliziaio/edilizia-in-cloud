import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight, RotateCcw } from "lucide-react";

export interface ContactFilters {
  source: string;
  tags: string[];
  company: string;
  dateFrom: string;
  dateTo: string;
  activityFrom: string;
  activityTo: string;
}

export const EMPTY_CONTACT_FILTERS: ContactFilters = {
  source: "",
  tags: [],
  company: "",
  dateFrom: "",
  dateTo: "",
  activityFrom: "",
  activityTo: "",
};

export function countActiveContactFilters(f: ContactFilters): number {
  let count = 0;
  if (f.source) count++;
  if (f.tags.length) count++;
  if (f.company) count++;
  if (f.dateFrom || f.dateTo) count++;
  if (f.activityFrom || f.activityTo) count++;
  return count;
}

function FilterSection({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center justify-between w-full py-2.5 px-1 text-sm font-medium hover:bg-muted/50 rounded transition-colors">
        <span>{title}</span>
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
      </CollapsibleTrigger>
      <CollapsibleContent className="px-1 pb-3 space-y-2">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: ContactFilters;
  onApply: (filters: ContactFilters) => void;
  availableTags: string[];
}

export function ContactFiltersSheet({ open, onOpenChange, filters, onApply, availableTags }: Props) {
  const [local, setLocal] = useState<ContactFilters>(filters);

  const handleOpenChange = (o: boolean) => {
    if (o) setLocal(filters);
    onOpenChange(o);
  };

  const toggleTag = (tag: string) => {
    setLocal((prev) => ({
      ...prev,
      tags: prev.tags.includes(tag) ? prev.tags.filter((t) => t !== tag) : [...prev.tags, tag],
    }));
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="w-[340px] sm:w-[380px] flex flex-col">
        <SheetHeader>
          <SheetTitle className="text-base">Filtri Avanzati</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto space-y-1 mt-4">
          {/* Fonte */}
          <FilterSection title="Fonte" defaultOpen>
            <Input
              placeholder="Es: Facebook, Sito web..."
              value={local.source}
              onChange={(e) => setLocal((p) => ({ ...p, source: e.target.value }))}
              className="h-8 text-sm"
            />
          </FilterSection>

          {/* Azienda */}
          <FilterSection title="Azienda">
            <Input
              placeholder="Nome azienda..."
              value={local.company}
              onChange={(e) => setLocal((p) => ({ ...p, company: e.target.value }))}
              className="h-8 text-sm"
            />
          </FilterSection>

          {/* Data creazione */}
          <FilterSection title="Data creazione">
            <div className="flex gap-2">
              <div className="flex-1">
                <Label className="text-xs text-muted-foreground">Da</Label>
                <Input
                  type="date"
                  value={local.dateFrom}
                  onChange={(e) => setLocal((p) => ({ ...p, dateFrom: e.target.value }))}
                  className="h-8 text-sm"
                />
              </div>
              <div className="flex-1">
                <Label className="text-xs text-muted-foreground">A</Label>
                <Input
                  type="date"
                  value={local.dateTo}
                  onChange={(e) => setLocal((p) => ({ ...p, dateTo: e.target.value }))}
                  className="h-8 text-sm"
                />
              </div>
            </div>
          </FilterSection>

          {/* Ultima attività */}
          <FilterSection title="Ultima attività">
            <div className="flex gap-2">
              <div className="flex-1">
                <Label className="text-xs text-muted-foreground">Da</Label>
                <Input
                  type="date"
                  value={local.activityFrom}
                  onChange={(e) => setLocal((p) => ({ ...p, activityFrom: e.target.value }))}
                  className="h-8 text-sm"
                />
              </div>
              <div className="flex-1">
                <Label className="text-xs text-muted-foreground">A</Label>
                <Input
                  type="date"
                  value={local.activityTo}
                  onChange={(e) => setLocal((p) => ({ ...p, activityTo: e.target.value }))}
                  className="h-8 text-sm"
                />
              </div>
            </div>
          </FilterSection>

          {/* Tags */}
          {availableTags.length > 0 && (
            <FilterSection title="Tag">
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
          )}
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
