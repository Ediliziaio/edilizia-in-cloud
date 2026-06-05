import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight, RotateCcw } from "lucide-react";

export interface QuotesFilters {
  statuses: string[];
  salespersonId: string; // "" = tutti, "none" = senza
  source: string; // "" = tutti
  approvalStatus: string; // "" = tutti
  importoMin: string;
  importoMax: string;
  dateFrom: string;
  dateTo: string;
  marginMin: string; // min margine % (admin-only filter)
  marginMax: string;
}

export const EMPTY_QUOTE_FILTERS: QuotesFilters = {
  statuses: [],
  salespersonId: "",
  source: "",
  approvalStatus: "",
  importoMin: "",
  importoMax: "",
  dateFrom: "",
  dateTo: "",
  marginMin: "",
  marginMax: "",
};

export function countActiveQuoteFilters(f: QuotesFilters): number {
  let count = 0;
  if (f.statuses.length) count++;
  if (f.salespersonId) count++;
  if (f.source) count++;
  if (f.approvalStatus) count++;
  if (f.importoMin || f.importoMax) count++;
  if (f.dateFrom || f.dateTo) count++;
  if (f.marginMin || f.marginMax) count++;
  return count;
}

const STATUS_OPTIONS = [
  { value: "bozza", label: "Bozza" },
  { value: "inviata", label: "Inviata" },
  { value: "visualizzata", label: "Visualizzata" },
  { value: "accettata", label: "Accettata" },
  { value: "rifiutata", label: "Rifiutata" },
  { value: "scaduta", label: "Scaduta" },
];

const SOURCE_OPTIONS = [
  { value: "manuale", label: "Creato manualmente" },
  { value: "computo_ai", label: "Da Computo AI" },
  { value: "foto_ai", label: "Da Foto/PDF AI" },
  { value: "opportunity", label: "Da Opportunità" },
  { value: "genera_ai", label: "Generato con AI (testo/voce)" },
];

const APPROVAL_OPTIONS = [
  { value: "not_required", label: "Non richiesta" },
  { value: "pending", label: "In attesa" },
  { value: "approved", label: "Approvato" },
  { value: "rejected", label: "Rifiutato" },
  { value: "counter_proposed", label: "Contro-proposta" },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: QuotesFilters;
  onApply: (filters: QuotesFilters) => void;
  salespeople: Array<{ id: string; first_name: string; last_name: string }>;
  isAdmin: boolean;
}

function FilterSection({
  title, children, defaultOpen = false,
}: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
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

export function QuotesFiltersSheet({ open, onOpenChange, filters, onApply, salespeople, isAdmin }: Props) {
  const [local, setLocal] = useState<QuotesFilters>(filters);

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

  const active = countActiveQuoteFilters(local);

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="w-full sm:w-[380px] flex flex-col">
        <SheetHeader>
          <SheetTitle className="text-base flex items-center gap-2">
            Filtri Avanzati
            {active > 0 && (
              <span className="text-xs rounded-full bg-primary/10 text-primary px-2 py-0.5">
                {active} attivi
              </span>
            )}
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto space-y-1 mt-4">
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

          <FilterSection title="Commerciale">
            <Select
              value={local.salespersonId || "all"}
              onValueChange={(v) => setLocal((p) => ({ ...p, salespersonId: v === "all" ? "" : v }))}
            >
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti i commerciali</SelectItem>
                <SelectItem value="none">Senza commerciale</SelectItem>
                {salespeople.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.first_name} {s.last_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterSection>

          <FilterSection title="Origine">
            <Select
              value={local.source || "all"}
              onValueChange={(v) => setLocal((p) => ({ ...p, source: v === "all" ? "" : v }))}
            >
              <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Tutte le origini" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutte le origini</SelectItem>
                {SOURCE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterSection>

          <FilterSection title="Stato approvazione sconto">
            <Select
              value={local.approvalStatus || "all"}
              onValueChange={(v) => setLocal((p) => ({ ...p, approvalStatus: v === "all" ? "" : v }))}
            >
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti</SelectItem>
                {APPROVAL_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterSection>

          <FilterSection title="Importo preventivo">
            <div className="flex gap-2">
              <div className="flex-1">
                <Label className="text-xs text-muted-foreground">Min (€)</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={local.importoMin}
                  onChange={(e) => setLocal((p) => ({ ...p, importoMin: e.target.value }))}
                  className="h-8 text-sm"
                />
              </div>
              <div className="flex-1">
                <Label className="text-xs text-muted-foreground">Max (€)</Label>
                <Input
                  type="number"
                  placeholder="∞"
                  value={local.importoMax}
                  onChange={(e) => setLocal((p) => ({ ...p, importoMax: e.target.value }))}
                  className="h-8 text-sm"
                />
              </div>
            </div>
          </FilterSection>

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

          {isAdmin && (
            <FilterSection title="Margine preventivo (admin)">
              <div className="flex gap-2">
                <div className="flex-1">
                  <Label className="text-xs text-muted-foreground">Min %</Label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={local.marginMin}
                    onChange={(e) => setLocal((p) => ({ ...p, marginMin: e.target.value }))}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="flex-1">
                  <Label className="text-xs text-muted-foreground">Max %</Label>
                  <Input
                    type="number"
                    placeholder="100"
                    value={local.marginMax}
                    onChange={(e) => setLocal((p) => ({ ...p, marginMax: e.target.value }))}
                    className="h-8 text-sm"
                  />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Filtra per fascia di margine lordo atteso (visibile solo ad admin).
              </p>
            </FilterSection>
          )}
        </div>

        <div className="flex gap-2 pt-4 border-t">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 gap-1.5"
            onClick={() => {
              setLocal(EMPTY_QUOTE_FILTERS);
              onApply(EMPTY_QUOTE_FILTERS);
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
