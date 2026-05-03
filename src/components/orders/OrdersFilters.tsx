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
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm">
      <div className="flex flex-col sm:flex-row gap-2.5 items-start sm:items-center">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Cerca per codice, descrizione o cliente..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="h-10 border-slate-200 pl-10 shadow-none"
        />
      </div>
      <Select value={statusFilter} onValueChange={onStatusFilterChange}>
        <SelectTrigger className="h-10 w-full border-slate-200 shadow-none sm:w-[170px]">
          <SelectValue placeholder="Filtra per stato" />
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
          <SelectValue placeholder="Filtra pagamenti" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tutti i pagamenti</SelectItem>
          <SelectItem value="pending">In Sospeso</SelectItem>
          <SelectItem value="paid">Tutto Pagato</SelectItem>
        </SelectContent>
      </Select>
      <Select value={yearFilter} onValueChange={onYearFilterChange}>
        <SelectTrigger className="h-10 w-full border-slate-200 shadow-none sm:w-[132px]">
          <CalendarDays className="h-4 w-4 mr-2" />
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
          <CalendarDays className="h-4 w-4 mr-2" />
          <SelectValue placeholder="Mese" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tutti i mesi</SelectItem>
          {MONTHS.map((name, i) => (
            <SelectItem key={i} value={i.toString()}>{name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* In Corso toggle */}
      <Button
        variant={hideCompleted ? "default" : "outline"}
        size="sm"
        onClick={() => onHideCompletedChange(!hideCompleted)}
        className="h-10 shrink-0"
      >
        <CheckCircle2 className="h-4 w-4 mr-2" />
        In Corso
      </Button>

      {hasAnyFilter && (
        <Button variant="ghost" size="icon" onClick={onClearAllFilters} className="h-10 w-10 text-muted-foreground/60 hover:text-muted-foreground shrink-0">
          <X className="h-3.5 w-3.5" />
        </Button>
      )}
      </div>
    </div>
  );
}
