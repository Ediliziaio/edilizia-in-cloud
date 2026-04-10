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
    <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Cerca per codice, descrizione o cliente..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-10"
        />
      </div>
      <Select value={statusFilter} onValueChange={onStatusFilterChange}>
        <SelectTrigger className="w-full sm:w-[180px]">
          <SelectValue placeholder="Filtra per stato" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tutti gli stati</SelectItem>
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
        <SelectTrigger className="w-full sm:w-[180px]">
          <SelectValue placeholder="Filtra pagamenti" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tutti i pagamenti</SelectItem>
          <SelectItem value="pending">In Sospeso</SelectItem>
          <SelectItem value="paid">Tutto Pagato</SelectItem>
        </SelectContent>
      </Select>
      <Select value={monthFilter} onValueChange={onMonthFilterChange}>
        <SelectTrigger className="w-full sm:w-[140px]">
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
        className="shrink-0"
      >
        <CheckCircle2 className="h-4 w-4 mr-2" />
        In Corso
      </Button>

      {hasAnyFilter && (
        <Button variant="ghost" size="icon" onClick={onClearAllFilters} className="h-8 w-8 text-muted-foreground/60 hover:text-muted-foreground shrink-0">
          <X className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}
