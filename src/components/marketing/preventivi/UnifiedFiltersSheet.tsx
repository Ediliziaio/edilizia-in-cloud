/**
 * UnifiedFiltersSheet — pannello laterale filtri avanzati per la lista
 * unificata preventivi (Classico + Serramenti + Fotovoltaico).
 *
 * Filtri:
 *  - Tipi (multi-select chip)
 *  - Stati unificati (multi-select chip)
 *  - Commerciale (dropdown)
 *  - Range importo €
 *  - Range data (creato/aggiornato — usa il campo data sortabile)
 *  - Ordinamento
 */
import {
  Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { SlidersHorizontal, X, Layers, Briefcase, Wallet, Calendar, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PreventivoTipo, UnifiedStato } from "./UnifiedPreventiviList";

export type UnifiedSort =
  | "recent" | "value_desc" | "value_asc"
  | "code_asc" | "code_desc" | "client_asc";

export interface UnifiedFilters {
  tipi: PreventivoTipo[];
  stati: UnifiedStato[];
  commercialeId: string;       // "all" | "none" | <profileId>
  importoMin: string;
  importoMax: string;
  dateFrom: string;            // ISO date YYYY-MM-DD
  dateTo: string;
  sort: UnifiedSort;
}

export const DEFAULT_FILTERS: UnifiedFilters = {
  tipi: [],
  stati: [],
  commercialeId: "all",
  importoMin: "",
  importoMax: "",
  dateFrom: "",
  dateTo: "",
  sort: "recent",
};

const TIPO_OPTIONS: Array<{ value: PreventivoTipo; label: string; emoji: string }> = [
  { value: "classico",         label: "Classico",         emoji: "📄" },
  { value: "serramenti",       label: "Serramenti",       emoji: "🟧" },
  { value: "fotovoltaico",     label: "Fotovoltaico",     emoji: "☀" },
  { value: "ristrutturazione", label: "Ristrutturazione", emoji: "🔨" },
  { value: "bagni",            label: "Bagni",            emoji: "🛁" },
];

const STATO_OPTIONS: Array<{ value: UnifiedStato; label: string; toneCls: string }> = [
  { value: "bozza",    label: "Bozza",    toneCls: "border-slate-300 data-[on=true]:bg-slate-200 data-[on=true]:text-slate-800" },
  { value: "in_corso", label: "In corso", toneCls: "border-blue-300 data-[on=true]:bg-blue-100 data-[on=true]:text-blue-800" },
  { value: "vinto",    label: "Vinto",    toneCls: "border-emerald-300 data-[on=true]:bg-emerald-100 data-[on=true]:text-emerald-800" },
  { value: "perso",    label: "Perso",    toneCls: "border-rose-300 data-[on=true]:bg-rose-100 data-[on=true]:text-rose-800" },
];

const SORT_OPTIONS: Array<{ value: UnifiedSort; label: string }> = [
  { value: "recent",     label: "Più recenti" },
  { value: "value_desc", label: "Importo: alto → basso" },
  { value: "value_asc",  label: "Importo: basso → alto" },
  { value: "code_asc",   label: "Codice: A → Z" },
  { value: "code_desc",  label: "Codice: Z → A" },
  { value: "client_asc", label: "Cliente: A → Z" },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: UnifiedFilters;
  onApply: (next: UnifiedFilters) => void;
  commerciali: Array<{ id: string; name: string }>;
  serramentiEnabled: boolean;
  fotovoltaicoEnabled: boolean;
  ristrutturazioneEnabled: boolean;
  bagniEnabled: boolean;
  totalResults: number;
}

export function UnifiedFiltersSheet({
  open, onOpenChange, filters, onApply, commerciali,
  serramentiEnabled, fotovoltaicoEnabled, ristrutturazioneEnabled, bagniEnabled, totalResults,
}: Props) {
  const toggleTipo = (t: PreventivoTipo) => {
    const set = new Set(filters.tipi);
    if (set.has(t)) set.delete(t); else set.add(t);
    onApply({ ...filters, tipi: Array.from(set) });
  };
  const toggleStato = (s: UnifiedStato) => {
    const set = new Set(filters.stati);
    if (set.has(s)) set.delete(s); else set.add(s);
    onApply({ ...filters, stati: Array.from(set) });
  };

  const activeCount = countActive(filters);
  const resetAll = () => onApply(DEFAULT_FILTERS);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-orange-600" />
            Filtri preventivi
            {activeCount > 0 && (
              <Badge className="bg-orange-500 hover:bg-orange-500 text-[10px]">
                {activeCount} attivi
              </Badge>
            )}
          </SheetTitle>
          <SheetDescription>
            Affina la lista per tipo, stato, commerciale, importo, periodo.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 py-5">
          {/* TIPO PREVENTIVO */}
          <Section icon={<Layers className="h-3.5 w-3.5" />} title="Tipo preventivo">
            <div className="flex flex-wrap gap-2">
              {TIPO_OPTIONS.map((t) => {
                if (t.value === "serramenti" && !serramentiEnabled) return null;
                if (t.value === "fotovoltaico" && !fotovoltaicoEnabled) return null;
                if (t.value === "ristrutturazione" && !ristrutturazioneEnabled) return null;
                if (t.value === "bagni" && !bagniEnabled) return null;
                const on = filters.tipi.includes(t.value);
                return (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => toggleTipo(t.value)}
                    className={cn(
                      "px-3 h-9 text-xs font-medium rounded-md border transition-colors",
                      on
                        ? "bg-orange-100 text-orange-700 border-orange-300"
                        : "bg-white text-muted-foreground border-slate-200 hover:bg-slate-50"
                    )}
                  >
                    {t.emoji} {t.label}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Nessuna selezione = mostra tutti i tipi.
            </p>
          </Section>

          {/* STATO */}
          <Section icon={<Layers className="h-3.5 w-3.5" />} title="Stato unificato">
            <div className="flex flex-wrap gap-2">
              {STATO_OPTIONS.map((s) => {
                const on = filters.stati.includes(s.value);
                return (
                  <button
                    key={s.value}
                    type="button"
                    data-on={on}
                    onClick={() => toggleStato(s.value)}
                    className={cn(
                      "px-3 h-9 text-xs font-medium rounded-md border transition-colors",
                      on ? "" : "bg-white text-muted-foreground border-slate-200 hover:bg-slate-50",
                      s.toneCls,
                    )}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Multi-selezione. Combinabile con le sub-tab inline.
            </p>
          </Section>

          {/* COMMERCIALE */}
          <Section icon={<Briefcase className="h-3.5 w-3.5" />} title="Commerciale">
            <Select value={filters.commercialeId} onValueChange={(v) => onApply({ ...filters, commercialeId: v })}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti i commerciali</SelectItem>
                <SelectItem value="none">Non assegnato</SelectItem>
                {commerciali.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Section>

          {/* IMPORTO */}
          <Section icon={<Wallet className="h-3.5 w-3.5" />} title="Importo (€)">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Min</Label>
                <Input
                  type="number" inputMode="decimal" placeholder="0"
                  value={filters.importoMin}
                  onChange={(e) => onApply({ ...filters, importoMin: e.target.value })}
                  className="h-9"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Max</Label>
                <Input
                  type="number" inputMode="decimal" placeholder="∞"
                  value={filters.importoMax}
                  onChange={(e) => onApply({ ...filters, importoMax: e.target.value })}
                  className="h-9"
                />
              </div>
            </div>
          </Section>

          {/* PERIODO */}
          <Section icon={<Calendar className="h-3.5 w-3.5" />} title="Periodo">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Da</Label>
                <Input
                  type="date"
                  value={filters.dateFrom}
                  onChange={(e) => onApply({ ...filters, dateFrom: e.target.value })}
                  className="h-9"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">A</Label>
                <Input
                  type="date"
                  value={filters.dateTo}
                  onChange={(e) => onApply({ ...filters, dateTo: e.target.value })}
                  className="h-9"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <QuickPeriod label="7 giorni" days={7}  onApply={onApply} filters={filters} />
              <QuickPeriod label="30 giorni" days={30} onApply={onApply} filters={filters} />
              <QuickPeriod label="90 giorni" days={90} onApply={onApply} filters={filters} />
              <QuickPeriod label="Anno corrente" ytd onApply={onApply} filters={filters} />
              {(filters.dateFrom || filters.dateTo) && (
                <button
                  type="button"
                  onClick={() => onApply({ ...filters, dateFrom: "", dateTo: "" })}
                  className="text-[10px] text-muted-foreground hover:text-foreground underline"
                >
                  Reset periodo
                </button>
              )}
            </div>
          </Section>

          {/* ORDINAMENTO */}
          <Section icon={<ArrowUpDown className="h-3.5 w-3.5" />} title="Ordinamento">
            <Select value={filters.sort} onValueChange={(v) => onApply({ ...filters, sort: v as UnifiedSort })}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Section>
        </div>

        <SheetFooter className="gap-2 sm:gap-0 border-t pt-4">
          <Button variant="ghost" onClick={resetAll} className="text-xs gap-1">
            <X className="h-3.5 w-3.5" /> Azzera tutti
          </Button>
          <Button onClick={() => onOpenChange(false)} className="bg-orange-500 hover:bg-orange-600">
            Mostra {totalResults} risultat{totalResults === 1 ? "o" : "i"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function Section({
  icon, title, children,
}: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 pb-1.5 border-b border-slate-100">
        <span className="text-orange-600">{icon}</span>
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">{title}</h4>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function QuickPeriod({
  label, days, ytd, onApply, filters,
}: {
  label: string;
  days?: number;
  ytd?: boolean;
  onApply: (f: UnifiedFilters) => void;
  filters: UnifiedFilters;
}) {
  const apply = () => {
    const now = new Date();
    let from: Date;
    if (ytd) from = new Date(now.getFullYear(), 0, 1);
    else from = new Date(now.getTime() - (days ?? 0) * 86400000);
    const toStr = now.toISOString().slice(0, 10);
    const fromStr = from.toISOString().slice(0, 10);
    onApply({ ...filters, dateFrom: fromStr, dateTo: toStr });
  };
  return (
    <button
      type="button"
      onClick={apply}
      className="text-[10px] px-2 py-1 rounded border border-slate-200 hover:bg-slate-50 text-muted-foreground"
    >
      {label}
    </button>
  );
}

function countActive(f: UnifiedFilters): number {
  let n = 0;
  if (f.tipi.length > 0) n++;
  if (f.stati.length > 0) n++;
  if (f.commercialeId !== "all") n++;
  if (f.importoMin !== "") n++;
  if (f.importoMax !== "") n++;
  if (f.dateFrom !== "") n++;
  if (f.dateTo !== "") n++;
  if (f.sort !== "recent") n++;
  return n;
}
