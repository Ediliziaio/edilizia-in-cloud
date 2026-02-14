import { Search, Euro, X, CalendarDays } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { DateRangeFilter } from "@/components/orders/DateRangeFilter";

interface DateRange {
  from: Date | undefined;
  to: Date | undefined;
}

interface Status {
  id: string;
  name: string;
  color: string;
  position: number;
}

interface Customer {
  id: string;
  name: string;
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
  customerFilter: string;
  onCustomerFilterChange: (value: string) => void;
  uniqueCustomers: Customer[];
  amountMin: string;
  amountMax: string;
  onAmountMinChange: (value: string) => void;
  onAmountMaxChange: (value: string) => void;
  contractDateRange: DateRange;
  onContractDateRangeChange: (range: DateRange) => void;
  warehouseDateRange: DateRange;
  onWarehouseDateRangeChange: (range: DateRange) => void;
  expectedDateRange: DateRange;
  onExpectedDateRangeChange: (range: DateRange) => void;
  hasAnyFilter: boolean;
  onClearAllFilters: () => void;
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
  customerFilter,
  onCustomerFilterChange,
  uniqueCustomers,
  amountMin,
  amountMax,
  onAmountMinChange,
  onAmountMaxChange,
  contractDateRange,
  onContractDateRangeChange,
  warehouseDateRange,
  onWarehouseDateRangeChange,
  expectedDateRange,
  onExpectedDateRangeChange,
  hasAnyFilter,
  onClearAllFilters,
}: OrdersFiltersProps) {
  return (
    <>
      {/* Filters Row 1: Search + Status + Payment + Month */}
      <div className="flex flex-col sm:flex-row gap-4">
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
          <SelectTrigger className="w-full sm:w-[160px]">
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
      </div>

      {/* Filters Row 2: Customer, Amount, Date Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <Select value={customerFilter} onValueChange={onCustomerFilterChange}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Filtra cliente" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti i clienti</SelectItem>
            {uniqueCustomers.map((customer) => (
              <SelectItem key={customer.id} value={customer.id}>
                {customer.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={`w-full sm:w-[180px] justify-start text-left font-normal ${
                (amountMin || amountMax) ? "border-primary" : ""
              }`}
            >
              <Euro className="mr-2 h-4 w-4" />
              {amountMin || amountMax ? (
                <span className="truncate">
                  {amountMin ? `€${amountMin}` : "..."} - {amountMax ? `€${amountMax}` : "..."}
                </span>
              ) : (
                <span>Importo</span>
              )}
              {(amountMin || amountMax) && (
                <X
                  className="ml-auto h-4 w-4 opacity-50 hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAmountMinChange("");
                    onAmountMaxChange("");
                  }}
                />
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[220px] p-4" align="start">
            <div className="space-y-3">
              <p className="text-sm font-medium text-muted-foreground">Range Importo</p>
              <div className="space-y-2">
                <div>
                  <Label className="text-xs">Minimo (€)</Label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={amountMin}
                    onChange={(e) => onAmountMinChange(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">Massimo (€)</Label>
                  <Input
                    type="number"
                    placeholder="∞"
                    value={amountMax}
                    onChange={(e) => onAmountMaxChange(e.target.value)}
                    className="mt-1"
                  />
                </div>
              </div>
              {(amountMin || amountMax) && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    onAmountMinChange("");
                    onAmountMaxChange("");
                  }}
                >
                  Cancella
                </Button>
              )}
            </div>
          </PopoverContent>
        </Popover>

        <DateRangeFilter
          label="Data Contratto"
          range={contractDateRange}
          onRangeChange={onContractDateRangeChange}
        />
        <DateRangeFilter
          label="Arrivo Merce"
          range={warehouseDateRange}
          onRangeChange={onWarehouseDateRangeChange}
        />
        <DateRangeFilter
          label="Data Posa"
          range={expectedDateRange}
          onRangeChange={onExpectedDateRangeChange}
        />

        {hasAnyFilter && (
          <Button variant="ghost" size="sm" onClick={onClearAllFilters} className="text-muted-foreground">
            <X className="h-4 w-4 mr-1" />
            Pulisci filtri
          </Button>
        )}
      </div>
    </>
  );
}
