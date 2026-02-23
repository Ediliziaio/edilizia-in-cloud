import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight, RotateCcw } from "lucide-react";

export interface OpportunityFilters {
  statuses: string[];
  assignedTo: string;
  followerId: string;
  callCenterId: string;
  source: string;
  valueMin: string;
  valueMax: string;
  dateFrom: string;
  dateTo: string;
  tags: string[];
}

export const EMPTY_FILTERS: OpportunityFilters = {
  statuses: [],
  assignedTo: "",
  followerId: "",
  callCenterId: "",
  source: "",
  valueMin: "",
  valueMax: "",
  dateFrom: "",
  dateTo: "",
  tags: [],
};

export function countActiveFilters(f: OpportunityFilters): number {
  let count = 0;
  if (f.statuses.length) count++;
  if (f.assignedTo) count++;
  if (f.followerId) count++;
  if (f.callCenterId) count++;
  if (f.source) count++;
  if (f.valueMin || f.valueMax) count++;
  if (f.dateFrom || f.dateTo) count++;
  if (f.tags.length) count++;
  return count;
}

import { STATUS_OPTIONS } from "@/types/opportunities";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: OpportunityFilters;
  onApply: (filters: OpportunityFilters) => void;
  staff: { id: string; name: string }[];
  availableTags: string[];
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

export function OpportunityFiltersSheet({ open, onOpenChange, filters, onApply, staff, availableTags }: Props) {
  const [local, setLocal] = useState<OpportunityFilters>(filters);

  // Sync when opening
  const handleOpenChange = (o: boolean) => {
    if (o) setLocal(filters);
    onOpenChange(o);
  };

  const toggleStatus = (val: string) => {
    setLocal((prev) => ({
      ...prev,
      statuses: prev.statuses.includes(val) ? prev.statuses.filter((s) => s !== val) : [...prev.statuses, val],
    }));
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
          {/* Status */}
          <FilterSection title="Stato" defaultOpen>
            <div className="space-y-2">
              {STATUS_OPTIONS.map((opt) => (
                <label key={opt.value} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={local.statuses.includes(opt.value)}
                    onCheckedChange={() => toggleStatus(opt.value)}
                    className="h-4 w-4"
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </FilterSection>

          {/* Titolare */}
          <FilterSection title="Titolare">
            <Select value={local.assignedTo || "all"} onValueChange={(v) => setLocal((p) => ({ ...p, assignedTo: v === "all" ? "" : v }))}>
              <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Tutti" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti</SelectItem>
                {staff.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </FilterSection>

          {/* Follower */}
          <FilterSection title="Follower">
            <Select value={local.followerId || "all"} onValueChange={(v) => setLocal((p) => ({ ...p, followerId: v === "all" ? "" : v }))}>
              <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Tutti" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti</SelectItem>
                {staff.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </FilterSection>

          {/* Call Center */}
          <FilterSection title="Call Center">
            <Select value={local.callCenterId || "all"} onValueChange={(v) => setLocal((p) => ({ ...p, callCenterId: v === "all" ? "" : v }))}>
              <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Tutti" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti</SelectItem>
                {staff.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </FilterSection>

          {/* Fonte */}
          <FilterSection title="Fonte dell'opportunità">
            <Input
              placeholder="Es: Facebook, Sito web..."
              value={local.source}
              onChange={(e) => setLocal((p) => ({ ...p, source: e.target.value }))}
              className="h-8 text-sm"
            />
          </FilterSection>

          {/* Valore */}
          <FilterSection title="Valore dell'opportunità">
            <div className="flex gap-2">
              <div className="flex-1">
                <Label className="text-xs text-muted-foreground">Min (€)</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={local.valueMin}
                  onChange={(e) => setLocal((p) => ({ ...p, valueMin: e.target.value }))}
                  className="h-8 text-sm"
                />
              </div>
              <div className="flex-1">
                <Label className="text-xs text-muted-foreground">Max (€)</Label>
                <Input
                  type="number"
                  placeholder="∞"
                  value={local.valueMax}
                  onChange={(e) => setLocal((p) => ({ ...p, valueMax: e.target.value }))}
                  className="h-8 text-sm"
                />
              </div>
            </div>
          </FilterSection>

          {/* Data creazione */}
          <FilterSection title="Creato il">
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

          {/* Tags */}
          {availableTags.length > 0 && (
            <FilterSection title="Tags">
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
              setLocal(EMPTY_FILTERS);
              onApply(EMPTY_FILTERS);
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
