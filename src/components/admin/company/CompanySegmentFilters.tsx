import React, { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  type CompanyFilters,
  useCompanyFilters,
  REGIONI_ITALIANE,
  SETTORI_EDILIZIA,
} from "@/hooks/superadmin/useCompanyFilters";

// ─── Tipi ─────────────────────────────────────────────────

interface CompanySegmentFiltersProps {
  filters: CompanyFilters;
  onFiltersChange: (filters: CompanyFilters) => void;
  activeCount: number;
}

// ─── Costanti ─────────────────────────────────────────────

const DIMENSIONI: Array<{ value: "micro" | "piccola" | "media" | "grande"; label: string }> = [
  { value: "micro", label: "Micro" },
  { value: "piccola", label: "Piccola" },
  { value: "media", label: "Media" },
  { value: "grande", label: "Grande" },
];

const STATI: Array<{ value: string; label: string }> = [
  { value: "active", label: "Attivo" },
  { value: "trial", label: "Trial" },
  { value: "suspended", label: "Sospeso" },
  { value: "churned", label: "Churned" },
];

const OPZIONI_TRIAL = [
  { value: "null", label: "Qualsiasi" },
  { value: "7", label: "Prossimi 7 giorni" },
  { value: "14", label: "Prossimi 14 giorni" },
  { value: "30", label: "Prossimi 30 giorni" },
];

// ─── Componente sezione checkbox ─────────────────────────

interface SezioneCheckboxProps {
  titolo: string;
  voci: Array<{ value: string; label: string }>;
  selezionati: string[];
  onToggle: (value: string) => void;
  colonne?: 1 | 2;
}

function SezioneCheckbox({
  titolo,
  voci,
  selezionati,
  onToggle,
  colonne = 1,
}: SezioneCheckboxProps) {
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold text-foreground">{titolo}</h4>
      <div
        className={
          colonne === 2
            ? "grid grid-cols-2 gap-x-4 gap-y-2"
            : "flex flex-col gap-2"
        }
      >
        {voci.map(voce => (
          <div key={voce.value} className="flex items-center gap-2">
            <Checkbox
              id={`filter-${titolo}-${voce.value}`}
              checked={selezionati.includes(voce.value)}
              onCheckedChange={() => onToggle(voce.value)}
            />
            <Label
              htmlFor={`filter-${titolo}-${voce.value}`}
              className="text-sm font-normal cursor-pointer leading-tight"
            >
              {voce.label}
            </Label>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Componente principale ────────────────────────────────

/**
 * Drawer laterale per la segmentazione avanzata delle aziende.
 * Lo stato interno viene "committato" solo al click su "Applica".
 */
export function CompanySegmentFilters({
  filters: filtriesSterni,
  onFiltersChange,
  activeCount,
}: CompanySegmentFiltersProps) {
  const [aperto, setAperto] = useState(false);

  // Stato locale del drawer — non propagato finché non si clicca "Applica"
  const { filters, toggleArrayValue, clearFilters, updateFilter } =
    useCompanyFilters(filtriesSterni);

  const handleApplica = () => {
    onFiltersChange(filters);
    setAperto(false);
  };

  const handlePulisci = () => {
    clearFilters();
  };

  return (
    <Sheet open={aperto} onOpenChange={setAperto}>
      <SheetTrigger asChild>
        <Button variant="outline" className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4" />
          Filtri
          {activeCount > 0 && (
            <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-xs">
              {activeCount}
            </Badge>
          )}
        </Button>
      </SheetTrigger>

      <SheetContent
        side="right"
        className="flex flex-col overflow-y-auto p-0"
        style={{ width: 380 }}
      >
        <SheetHeader className="px-6 py-4 border-b">
          <SheetTitle>Filtri di segmentazione</SheetTitle>
        </SheetHeader>

        {/* Corpo del drawer con scroll */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">

          {/* 1 — Regione */}
          <SezioneCheckbox
            titolo="Regione"
            voci={REGIONI_ITALIANE.map(r => ({ value: r, label: r }))}
            selezionati={filters.regions}
            onToggle={v => toggleArrayValue("regions", v)}
            colonne={2}
          />

          <Separator />

          {/* 2 — Dimensione */}
          <SezioneCheckbox
            titolo="Dimensione"
            voci={DIMENSIONI}
            selezionati={filters.sizes}
            onToggle={v => toggleArrayValue("sizes", v)}
            colonne={2}
          />

          <Separator />

          {/* 3 — Settore */}
          <SezioneCheckbox
            titolo="Settore"
            voci={SETTORI_EDILIZIA.map(s => ({ value: s, label: s }))}
            selezionati={filters.sectors}
            onToggle={v => toggleArrayValue("sectors", v)}
          />

          <Separator />

          {/* 4 — Stato */}
          <SezioneCheckbox
            titolo="Stato"
            voci={STATI}
            selezionati={filters.statuses}
            onToggle={v => toggleArrayValue("statuses", v)}
            colonne={2}
          />

          <Separator />

          {/* 5 — Data iscrizione */}
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-foreground">Data iscrizione</h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Da</Label>
                <Input
                  type="date"
                  value={filters.dateFrom ?? ""}
                  onChange={e =>
                    updateFilter("dateFrom", e.target.value || null)
                  }
                  className="text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">A</Label>
                <Input
                  type="date"
                  value={filters.dateTo ?? ""}
                  onChange={e =>
                    updateFilter("dateTo", e.target.value || null)
                  }
                  className="text-sm"
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* 6 — Trial in scadenza */}
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-foreground">Trial in scadenza</h4>
            <Select
              value={filters.trialExpiringDays?.toString() ?? "null"}
              onValueChange={v =>
                updateFilter(
                  "trialExpiringDays",
                  v === "null" ? null : parseInt(v, 10)
                )
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Qualsiasi" />
              </SelectTrigger>
              <SelectContent>
                {OPZIONI_TRIAL.map(op => (
                  <SelectItem key={op.value} value={op.value}>
                    {op.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

        </div>

        {/* Footer azioni */}
        <SheetFooter className="px-6 py-4 border-t flex flex-row gap-2">
          <Button
            variant="ghost"
            className="flex-1"
            onClick={handlePulisci}
          >
            Pulisci filtri
          </Button>
          <Button
            variant="default"
            className="flex-1"
            onClick={handleApplica}
          >
            Applica
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
