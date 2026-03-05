import { useState } from "react";
import { Search, Euro, X, CalendarDays, SlidersHorizontal, CheckCircle2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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

interface NamedItem {
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
  // New filter props
  salespersonFilter: string;
  onSalespersonFilterChange: (value: string) => void;
  uniqueSalespeople: NamedItem[];
  laborFilter: string;
  onLaborFilterChange: (value: string) => void;
  uniqueLabor: NamedItem[];
  supplierFilter: string;
  onSupplierFilterChange: (value: string) => void;
  uniqueSuppliers: NamedItem[];
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
  salespersonFilter,
  onSalespersonFilterChange,
  uniqueSalespeople,
  laborFilter,
  onLaborFilterChange,
  uniqueLabor,
  supplierFilter,
  onSupplierFilterChange,
  uniqueSuppliers,
  hideCompleted,
  onHideCompletedChange,
}: OrdersFiltersProps) {
  // Count active advanced filters
  const advancedFilterCount = [
    customerFilter !== "all",
    salespersonFilter !== "all",
    laborFilter !== "all",
    supplierFilter !== "all",
    !!amountMin || !!amountMax,
    !!contractDateRange.from || !!contractDateRange.to,
    !!warehouseDateRange.from || !!warehouseDateRange.to,
    !!expectedDateRange.from || !!expectedDateRange.to,
  ].filter(Boolean).length;

  const [showAdvanced, setShowAdvanced] = useState(advancedFilterCount > 0);

  return (
    <>
      {/* Row 1: Primary filters — always visible */}
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

        {/* Advanced filters toggle */}
        <Button
          variant={advancedFilterCount > 0 ? "default" : "outline"}
          size="sm"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="shrink-0"
        >
          <SlidersHorizontal className="h-4 w-4 mr-2" />
          Più filtri
          {advancedFilterCount > 0 && (
            <Badge variant="secondary" className="ml-2 h-5 w-5 p-0 flex items-center justify-center text-xs rounded-full">
              {advancedFilterCount}
            </Badge>
          )}
        </Button>

        {hasAnyFilter && (
          <Button variant="ghost" size="icon" onClick={onClearAllFilters} className="h-8 w-8 text-muted-foreground/60 hover:text-muted-foreground shrink-0">
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {/* Row 2: Advanced filters — collapsible */}
      <Collapsible open={showAdvanced || advancedFilterCount > 0} onOpenChange={setShowAdvanced}>
        <CollapsibleContent>
          <div className="flex flex-wrap gap-3 items-center pt-1">
            {/* Cliente */}
            <Select value={customerFilter} onValueChange={onCustomerFilterChange}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Cliente" />
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

            {/* Venditore */}
            <Select value={salespersonFilter} onValueChange={onSalespersonFilterChange}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Venditore" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti i venditori</SelectItem>
                {uniqueSalespeople.map((sp) => (
                  <SelectItem key={sp.id} value={sp.id}>
                    {sp.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Manodopera */}
            <Select value={laborFilter} onValueChange={onLaborFilterChange}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Manodopera" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutta la manodopera</SelectItem>
                {uniqueLabor.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Fornitore */}
            <Select value={supplierFilter} onValueChange={onSupplierFilterChange}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Fornitore" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti i fornitori</SelectItem>
                {uniqueSuppliers.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Importo */}
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

            {/* Date filters */}
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
          </div>
        </CollapsibleContent>
      </Collapsible>
    </>
  );
}
