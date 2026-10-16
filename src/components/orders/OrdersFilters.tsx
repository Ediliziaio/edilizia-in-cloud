import type { ReactNode } from "react";
import { Search, X, CalendarDays, CheckCircle2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Status {
  id: string;
  name: string;
  color: string;
  position: number;
}

const MONTHS = [
  "Gennaio",
  "Febbraio",
  "Marzo",
  "Aprile",
  "Maggio",
  "Giugno",
  "Luglio",
  "Agosto",
  "Settembre",
  "Ottobre",
  "Novembre",
  "Dicembre",
];

interface OrdersFiltersProps {
  trailingControls?: ReactNode;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
  statuses: Status[];
  yearFilter: string;
  onYearFilterChange: (value: string) => void;
  availableYears: number[];
  paymentFilter: "all" | "pending" | "paid" | "overdue";
  onPaymentFilterChange: (
    value: "all" | "pending" | "paid" | "overdue",
  ) => void;
  monthFilter: string;
  onMonthFilterChange: (value: string) => void;
  hasAnyFilter: boolean;
  onClearAllFilters: () => void;
  hideCompleted: boolean;
  onHideCompletedChange: (value: boolean) => void;
}

export function OrdersFilters({
  trailingControls,
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
  return (
    <div
      className="grid grid-cols-2 items-center gap-2 sm:flex sm:flex-wrap sm:gap-1.5"
      role="group"
      aria-label="Filtri commesse"
    >
      <div className="relative col-span-2 min-w-0 sm:w-[180px] sm:shrink-0">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder="Cerca commessa…"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="h-10 border-slate-200 bg-white pl-7 shadow-none max-sm:h-9 sm:h-8 sm:text-xs"
          aria-label="Cerca per codice, descrizione o cliente"
        />
      </div>

      <Select value={statusFilter} onValueChange={onStatusFilterChange}>
        <SelectTrigger
          aria-label="Stato commessa"
          className="h-10 w-full border-slate-200 bg-white shadow-none sm:h-8 sm:w-[132px] sm:px-2 sm:text-xs sm:shrink-0"
        >
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
      <Select
        value={paymentFilter}
        onValueChange={(val) =>
          onPaymentFilterChange(val as "all" | "pending" | "paid" | "overdue")
        }
      >
        <SelectTrigger
          aria-label="Stato pagamento"
          className="h-10 w-full border-slate-200 bg-white shadow-none sm:h-8 sm:w-[142px] sm:px-2 sm:text-xs sm:shrink-0"
        >
          <SelectValue placeholder="Pagamenti" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tutti i pagamenti</SelectItem>
          <SelectItem value="pending">Da incassare</SelectItem>
          <SelectItem value="paid">Saldato</SelectItem>
          <SelectItem value="overdue">Rate scadute</SelectItem>
        </SelectContent>
      </Select>
      <Select value={yearFilter} onValueChange={onYearFilterChange}>
        <SelectTrigger
          aria-label="Periodo commesse"
          title={
            yearFilter === "corrente"
              ? `${new Date().getFullYear()} + precedenti da gestire`
              : undefined
          }
          className="h-10 w-full border-slate-200 bg-white shadow-none sm:h-8 sm:w-[160px] sm:px-2 sm:text-xs sm:shrink-0"
        >
          <CalendarDays className="h-4 w-4 mr-1 shrink-0 text-slate-400" />
          <SelectValue placeholder="Anno">
            {yearFilter === "corrente"
              ? `${new Date().getFullYear()} + pregresso`
              : undefined}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {/* La scelta di partenza della pagina: senza questa voce, col
                  valore «corrente» il campo restava vuoto (solo l'icona). */}
          <SelectItem value="corrente">
            {new Date().getFullYear()} + precedenti da gestire
          </SelectItem>
          <SelectItem value="all">Tutti gli anni</SelectItem>
          {availableYears.map((year) => (
            <SelectItem key={year} value={String(year)}>
              {year}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={monthFilter} onValueChange={onMonthFilterChange}>
        <SelectTrigger
          aria-label="Mese commesse"
          className="h-10 w-full border-slate-200 bg-white shadow-none sm:h-8 sm:w-[140px] sm:px-2 sm:text-xs sm:shrink-0"
        >
          <CalendarDays className="h-4 w-4 mr-1 shrink-0 text-slate-400" />
          <SelectValue placeholder="Mese" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tutti i mesi</SelectItem>
          {MONTHS.map((name, i) => (
            <SelectItem key={i} value={i.toString()}>
              {name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        variant={hideCompleted ? "default" : "outline"}
        size="sm"
        onClick={() => onHideCompletedChange(!hideCompleted)}
        className="tap-compact col-span-2 h-9 shrink-0 gap-1.5 sm:h-8 sm:px-2 sm:text-xs"
        aria-label="Nascondi commesse con lavori completati"
        aria-pressed={hideCompleted}
        title="Nascondi commesse con lavori completati"
      >
        <CheckCircle2 className="h-3.5 w-3.5" />
        <span>Nascondi completate</span>
      </Button>
      {trailingControls}
      {hasAnyFilter && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearAllFilters}
          className="tap-compact h-9 shrink-0 gap-1.5 text-muted-foreground sm:h-8 sm:px-2 sm:text-xs"
          aria-label="Cancella tutti i filtri"
        >
          <X className="h-3.5 w-3.5" />
          <span>Azzera filtri</span>
        </Button>
      )}
    </div>
  );
}
