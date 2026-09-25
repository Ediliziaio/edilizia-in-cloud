import { useState } from "react";
import { Search, X, CalendarDays, CheckCircle2, SlidersHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface Status {
  id: string;
  name: string;
  color: string;
  position: number;
}

const MONTHS = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"
];

interface OrdersFiltersProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
  statuses: Status[];
  yearFilter: string;
  onYearFilterChange: (value: string) => void;
  availableYears: number[];
  paymentFilter: "all" | "pending" | "paid";
  onPaymentFilterChange: (value: "all" | "pending" | "paid") => void;
  monthFilter: string;
  onMonthFilterChange: (value: string) => void;
  hasAnyFilter: boolean;
  onClearAllFilters: () => void;
  hideCompleted: boolean;
  onHideCompletedChange: (value: boolean) => void;
}

export function OrdersFilters({
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  statuses,
  yearFilter,
  onYearFilterChange,
  availableYears,
  paymentFilter,
  onPaymentFilterChange,
  monthFilter,
  onMonthFilterChange,
  hasAnyFilter,
  onClearAllFilters,
  hideCompleted,
  onHideCompletedChange,
}: OrdersFiltersProps) {
  // Conta filtri attivi (escluso "In Corso" e search) per mostrare badge
  const advancedFiltersCount = [
    statusFilter !== "all",
    paymentFilter !== "all",
    // «corrente» (anno in corso + aperte precedenti) è il valore di partenza,
    // non un filtro scelto: contato come attivo, su mobile i filtri si
    // aprivano da soli e il badge diceva sempre «1».
    yearFilter !== "all" && yearFilter !== "corrente",
    monthFilter !== "all",
  ].filter(Boolean).length;

  // Mobile: filtri avanzati collassati di default, aperti se ci sono filtri attivi
  const [advancedOpen, setAdvancedOpen] = useState(advancedFiltersCount > 0);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm max-sm:rounded-none max-sm:border-0 max-sm:bg-transparent max-sm:p-0 max-sm:shadow-none">
      {/* Search + In Corso + Toggle filtri avanzati (mobile) — sempre visibili */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cerca commessa…"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="h-10 border-slate-200 pl-10 shadow-none max-sm:h-9 max-sm:bg-white"
            aria-label="Cerca per codice, descrizione o cliente"
          />
        </div>
        {/* Mobile: i filtri (stato, pagamento, anno, mese) dietro un bottone
            sulla stessa riga, chiusi; prima avevano una riga loro. */}
        <Button
          variant={advancedOpen ? "secondary" : "outline"}
          size="sm"
          onClick={() => setAdvancedOpen((v) => !v)}
          className="tap-compact relative h-9 w-9 shrink-0 bg-white p-0 sm:hidden"
          aria-expanded={advancedOpen}
          aria-label="Filtri"
        >
          <SlidersHorizontal className="h-4 w-4" />
          {advancedFiltersCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-orange-500 text-[10px] font-bold text-white">
              {advancedFiltersCount}
            </span>
          )}
        </Button>
        {/* In Corso toggle — visibile sempre */}
        <Button
          variant={hideCompleted ? "default" : "outline"}
          size="sm"
          onClick={() => onHideCompletedChange(!hideCompleted)}
          className="tap-compact h-10 shrink-0 max-sm:h-9 max-sm:w-9 max-sm:p-0"
          aria-label="Mostra solo commesse in corso"
          title="In Corso"
        >
          <CheckCircle2 className="h-4 w-4 sm:mr-2" />
          <span className="hidden sm:inline">In Corso</span>
        </Button>
        {hasAnyFilter && (
          <Button variant="ghost" size="icon" onClick={onClearAllFilters} className="tap-compact h-10 w-10 text-muted-foreground/60 hover:text-muted-foreground shrink-0 max-sm:h-9 max-sm:w-7" aria-label="Cancella tutti i filtri">
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {/* Filtri avanzati: collapsed mobile (controllato), sempre visibili desktop */}
      <div className={cn("grid grid-cols-2 gap-2 mt-2 sm:flex sm:flex-row sm:gap-2.5 sm:mt-2.5 sm:items-center", !advancedOpen && "hidden sm:flex")}>
          <Select value={statusFilter} onValueChange={onStatusFilterChange}>
            <SelectTrigger className="h-10 w-full border-slate-200 shadow-none sm:w-[170px]">
              <SelectValue placeholder="Stato" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti gli stati</SelectItem>
              <SelectItem value="__da_completare__">Da completare</SelectItem>
              <SelectItem value="__completati__">Completati</SelectItem>
              <SelectItem value="__assistenza__">In assistenza</SelectItem>
              {statuses.map((status) => (
                <SelectItem key={status.id} value={status.id}>
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: status.color }}
                    />
                    {status.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={paymentFilter} onValueChange={(val) => onPaymentFilterChange(val as "all" | "pending" | "paid")}>
            <SelectTrigger className="h-10 w-full border-slate-200 shadow-none sm:w-[170px]">
              <SelectValue placeholder="Pagamenti" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti i pagamenti</SelectItem>
              <SelectItem value="pending">In Sospeso</SelectItem>
              <SelectItem value="paid">Tutto Pagato</SelectItem>
            </SelectContent>
          </Select>
          <Select value={yearFilter} onValueChange={onYearFilterChange}>
            <SelectTrigger className="h-10 w-full border-slate-200 shadow-none sm:w-[132px]">
              <CalendarDays className="h-4 w-4 mr-1 shrink-0 text-slate-400" />
              <SelectValue placeholder="Anno" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti gli anni</SelectItem>
              {availableYears.map((year) => (
                <SelectItem key={year} value={String(year)}>{year}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={monthFilter} onValueChange={onMonthFilterChange}>
            <SelectTrigger className="h-10 w-full border-slate-200 shadow-none sm:w-[135px]">
              <CalendarDays className="h-4 w-4 mr-1 shrink-0 text-slate-400" />
              <SelectValue placeholder="Mese" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti i mesi</SelectItem>
              {MONTHS.map((name, i) => (
                <SelectItem key={i} value={i.toString()}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
      </div>
    </div>
  );
}
