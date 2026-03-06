import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format, startOfMonth, endOfMonth, addMonths, subMonths, isWithinInterval, startOfDay, isBefore, startOfYear } from "date-fns";
import { it } from "date-fns/locale";
import { Search, ChevronDown, ChevronRight, AlertTriangle, CalendarIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { useTableSort } from "@/hooks/useTableSort";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"; // used for customMonths selector
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/formatters";
import type { ExpectedPayment } from "@/lib/forecastTypes";

interface CollectedPayment {
  orderId: string;
  orderCode: string | null;
  customerName: string;
  type: string;
  amount: number;
  paidDate: Date;
}

interface CollectedTabProps {
  orders: any[];
  expectedPayments: ExpectedPayment[];
}

export function CollectedTab({ orders, expectedPayments }: CollectedTabProps) {
  const navigate = useNavigate();
  const now = new Date();
  const [customMonths, setCustomMonths] = useState(3);
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedMonths, setExpandedMonths] = useState<Record<string, boolean>>({});
  const [activePreset, setActivePreset] = useState<string>("thisMonth");
  const [customPopoverOpen, setCustomPopoverOpen] = useState(false);

  const thisMonthStart = startOfMonth(now);
  const thisMonthEnd = endOfMonth(now);

  // All collected payments
  const allCollected = useMemo<CollectedPayment[]>(() => {
    const collected: CollectedPayment[] = [];
    orders.forEach((inst: any) => {
      if (!inst.is_paid || !inst.paid_date || !inst.amount || Number(inst.amount) <= 0) return;
      const order = inst.order;
      const customerName = order?.customer
        ? `${order.customer.first_name} ${order.customer.last_name}`
        : "Cliente sconosciuto";
      collected.push({
        orderId: order?.id || inst.order_id,
        orderCode: order?.order_code || null,
        customerName,
        type: inst.label || inst.type || "Rata",
        amount: Number(inst.amount),
        paidDate: new Date(inst.paid_date),
      });
    });
    return collected.sort((a, b) => b.paidDate.getTime() - a.paidDate.getTime());
  }, [orders]);

  // Collected this month
  const collectedThisMonth = useMemo(() => {
    const interval = { start: thisMonthStart, end: thisMonthEnd };
    return allCollected.filter(p => isWithinInterval(p.paidDate, interval));
  }, [allCollected, thisMonthStart, thisMonthEnd]);

  const collectedTotal = collectedThisMonth.reduce((s, p) => s + p.amount, 0);

  // Expected this month (for progress)
  const expectedThisMonth = useMemo(() => {
    return expectedPayments.filter(p => p.expectedDate && isWithinInterval(p.expectedDate, { start: thisMonthStart, end: thisMonthEnd }));
  }, [expectedPayments, thisMonthStart, thisMonthEnd]);
  const expectedThisMonthTotal = expectedThisMonth.reduce((s, p) => s + p.amount, 0);

  // Progress percentage
  const totalTarget = collectedTotal + expectedThisMonthTotal;
  const progressPercent = totalTarget > 0 ? Math.round((collectedTotal / totalTarget) * 100) : 0;

  // Quick date presets
  const applyPreset = (preset: string) => {
    setActivePreset(preset);
    switch (preset) {
      case "thisMonth":
        setDateFrom(thisMonthStart);
        setDateTo(thisMonthEnd);
        break;
      case "lastQuarter": {
        const qStart = startOfMonth(subMonths(now, 3));
        const qEnd = endOfMonth(subMonths(now, 1));
        setDateFrom(qStart);
        setDateTo(qEnd);
        break;
      }
      case "thisYear":
        setDateFrom(startOfYear(now));
        setDateTo(thisMonthEnd);
        break;
      case "all":
        setDateFrom(undefined);
        setDateTo(undefined);
        break;
      case "custom":
        setCustomPopoverOpen(true);
        break;
    }
  };

  const handleRangeSelect = (range: import("react-day-picker").DateRange | undefined) => {
    setDateFrom(range?.from);
    setDateTo(range?.to);
    if (range?.from && range?.to) {
      setCustomPopoverOpen(false);
    }
  };

  const filteredCollected = useMemo(() => {
    // "all" preset: no date filtering
    if (activePreset === "all" && !dateFrom && !dateTo) {
      let items = allCollected;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        items = items.filter(p =>
          p.customerName.toLowerCase().includes(q) ||
          (p.orderCode && p.orderCode.toLowerCase().includes(q))
        );
      }
      return items;
    }

    // Use explicit date range (set by presets or custom)
    const effectiveFrom = dateFrom || thisMonthStart;
    const effectiveTo = dateTo || thisMonthEnd;

    let items = allCollected.filter(p => {
      if (p.paidDate < startOfDay(effectiveFrom)) return false;
      if (p.paidDate > endOfMonth(effectiveTo)) return false;
      return true;
    });

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      items = items.filter(p =>
        p.customerName.toLowerCase().includes(q) ||
        (p.orderCode && p.orderCode.toLowerCase().includes(q))
      );
    }
    return items;
  }, [allCollected, activePreset, dateFrom, dateTo, searchQuery, thisMonthStart, thisMonthEnd]);

  const collectedAccessors = useMemo(() => ({
    date: (p: CollectedPayment) => p.paidDate,
    orderCode: (p: CollectedPayment) => p.orderCode || "",
    customerName: (p: CollectedPayment) => p.customerName,
    type: (p: CollectedPayment) => p.type,
    amount: (p: CollectedPayment) => p.amount,
  }), []);

  const { sortConfig, toggleSort, sortedItems: sortedCollected } = useTableSort(filteredCollected, collectedAccessors);

  const filteredCollectedTotal = filteredCollected.reduce((s, p) => s + p.amount, 0);

  // Custom period stats
  const customPeriodStats = useMemo(() => {
    const start = startOfMonth(addMonths(now, 1));
    const end = endOfMonth(addMonths(now, customMonths));
    const inRange = (d: Date | null) => d && isWithinInterval(d, { start, end });
    const payments = expectedPayments.filter(p => inRange(p.expectedDate));
    return {
      total: payments.reduce((s, p) => s + p.amount, 0),
      count: payments.length,
    };
  }, [customMonths, expectedPayments, now]);

  // Period payments
  const periodPayments = useMemo(() => {
    const nextMonthStart = startOfMonth(addMonths(now, 1));
    const nextMonthEnd = endOfMonth(addMonths(now, 1));
    const nextMonth = expectedPayments.filter(p => p.expectedDate && isWithinInterval(p.expectedDate, { start: nextMonthStart, end: nextMonthEnd }));
    const noDate = expectedPayments.filter(p => !p.expectedDate);
    return {
      nextMonth,
      noDate,
      nextMonthTotal: nextMonth.reduce((s, p) => s + p.amount, 0),
      noDateTotal: noDate.reduce((s, p) => s + p.amount, 0),
    };
  }, [expectedPayments, now]);

  // Unified "Da Ricevere" grouped by month + overdue
  const groupedExpected = useMemo(() => {
    const today = startOfDay(now);
    const groups: Record<string, { label: string; payments: ExpectedPayment[]; total: number; isOverdue?: boolean }> = {};

    // Overdue group
    const overdue = expectedPayments.filter(p => p.expectedDate && isBefore(p.expectedDate, today));
    if (overdue.length > 0) {
      groups["__overdue"] = {
        label: "Scaduti",
        payments: overdue,
        total: overdue.reduce((s, p) => s + p.amount, 0),
        isOverdue: true,
      };
    }

    // Current and future months
    const futurePayments = expectedPayments.filter(p => p.expectedDate && !isBefore(p.expectedDate, today));
    futurePayments.forEach(p => {
      const key = format(p.expectedDate!, "yyyy-MM");
      if (!groups[key]) {
        groups[key] = {
          label: format(p.expectedDate!, "MMMM yyyy", { locale: it }),
          payments: [],
          total: 0,
        };
      }
      groups[key].payments.push(p);
      groups[key].total += p.amount;
    });

    // No date group
    const noDate = expectedPayments.filter(p => !p.expectedDate);
    if (noDate.length > 0) {
      groups["__nodate"] = {
        label: "Senza data prevista",
        payments: noDate,
        total: noDate.reduce((s, p) => s + p.amount, 0),
      };
    }

    return groups;
  }, [expectedPayments, now]);

  const allExpectedTotal = expectedPayments.reduce((s, p) => s + p.amount, 0);

  const toggleMonth = (key: string) => {
    setExpandedMonths(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const showingFiltered = activePreset !== "thisMonth";

  return (
    <div className="space-y-6">
      {/* Hero Progress Card */}
      <Card className="border-l-4 border-l-emerald-500">
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row md:items-center gap-6">
            <div className="flex-1 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-muted-foreground">
                  Progresso incassi — {format(now, "MMMM yyyy", { locale: it })}
                </h3>
                <span className="text-2xl font-bold text-emerald-600">{progressPercent}%</span>
              </div>
              <Progress value={progressPercent} className="h-3" />
              <div className="flex justify-between text-sm">
                <span className="text-emerald-600 font-medium">
                  Incassato: {formatCurrency(collectedTotal)}
                  <span className="text-muted-foreground font-normal ml-1">({collectedThisMonth.length})</span>
                </span>
                <span className="text-amber-600 font-medium">
                  Da ricevere: {formatCurrency(expectedThisMonthTotal)}
                  <span className="text-muted-foreground font-normal ml-1">({expectedThisMonth.length})</span>
                </span>
              </div>
            </div>
            <div className="text-right md:border-l md:pl-6 border-border">
              <p className="text-xs text-muted-foreground">Obiettivo mese</p>
              <p className="text-xl font-bold">{formatCurrency(totalTarget)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Compact summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Prossimo mese</p>
            <p className="text-2xl font-bold">{formatCurrency(periodPayments.nextMonthTotal)}</p>
            <p className="text-xs text-muted-foreground mt-1">{periodPayments.nextMonth.length} pagamenti</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {customMonths === 1 ? "Prossimo mese" : `Prossimi ${customMonths} mesi`}
              </p>
              <Select value={String(customMonths)} onValueChange={(v) => setCustomMonths(Number(v))}>
                <SelectTrigger className="w-[80px] h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(n => (
                    <SelectItem key={n} value={String(n)}>{n} {n === 1 ? "mese" : "mesi"}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-2xl font-bold mt-1">{formatCurrency(customPeriodStats.total)}</p>
            <p className="text-xs text-muted-foreground mt-1">{customPeriodStats.count} pagamenti</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Senza data prevista</p>
            <p className="text-2xl font-bold">{formatCurrency(periodPayments.noDateTotal)}</p>
            <p className="text-xs text-muted-foreground mt-1">{periodPayments.noDate.length} pagamenti</p>
          </CardContent>
        </Card>
      </div>

      {/* Già Incassato */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3">
            <CardTitle className="text-lg">
              {showingFiltered ? "Già incassato — Periodo personalizzato" : `Già incassato — ${format(now, "MMMM yyyy", { locale: it })}`}
            </CardTitle>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
              <div className="flex flex-wrap items-center border rounded-md">
                {([
                  { key: "thisMonth", label: "Questo mese" },
                  { key: "lastQuarter", label: "Ultimo trimestre" },
                  { key: "thisYear", label: "Quest'anno" },
                  { key: "all", label: "Tutto" },
                ] as const).map(({ key, label }) => (
                  <Button
                    key={key}
                    variant={activePreset === key ? "default" : "ghost"}
                    size="sm"
                    className="h-8 text-xs rounded-none first:rounded-l-md last:rounded-r-md"
                    onClick={() => applyPreset(key)}
                  >
                    {label}
                  </Button>
                ))}
                <Popover open={customPopoverOpen} onOpenChange={setCustomPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant={activePreset === "custom" ? "default" : "ghost"}
                      size="sm"
                      className="h-8 text-xs rounded-none rounded-r-md"
                      onClick={() => { setActivePreset("custom"); setCustomPopoverOpen(true); }}
                    >
                      <CalendarIcon className="h-3.5 w-3.5 mr-1" />
                      {activePreset === "custom" && dateFrom && dateTo
                        ? `${format(dateFrom, "dd MMM", { locale: it })} – ${format(dateTo, "dd MMM", { locale: it })}`
                        : "Personalizzato"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="range"
                      selected={dateFrom && dateTo ? { from: dateFrom, to: dateTo } : dateFrom ? { from: dateFrom } : undefined}
                      onSelect={handleRangeSelect}
                      numberOfMonths={2}
                      locale={it}
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="relative flex-1 w-full sm:max-w-[250px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Cerca cliente o ordine..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-8 text-xs pl-8"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredCollected.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Nessun incasso registrato{showingFiltered ? " nel periodo selezionato" : " questo mese"}
              {searchQuery && " per questa ricerca"}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead column="date" label="Data" sortConfig={sortConfig} onSort={toggleSort} />
                  <SortableTableHead column="orderCode" label="Ordine" sortConfig={sortConfig} onSort={toggleSort} />
                  <SortableTableHead column="customerName" label="Cliente" sortConfig={sortConfig} onSort={toggleSort} />
                  <SortableTableHead column="type" label="Tipo" sortConfig={sortConfig} onSort={toggleSort} />
                  <SortableTableHead column="amount" label="Importo" sortConfig={sortConfig} onSort={toggleSort} className="text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedCollected.map((p, i) => (
                  <TableRow
                    key={`${p.orderId}-${p.type}-${i}`}
                    className={p.orderId ? "cursor-pointer hover:bg-muted/50" : ""}
                    onClick={() => p.orderId && navigate(`/azienda/ordini/${p.orderId}`)}
                  >
                    <TableCell className="text-sm">{format(p.paidDate, "dd/MM/yyyy")}</TableCell>
                    <TableCell className="text-sm font-medium">{p.orderCode || "—"}</TableCell>
                    <TableCell className="text-sm">{p.customerName}</TableCell>
                    <TableCell className="text-sm">{p.type}</TableCell>
                    <TableCell className="text-right text-sm font-medium text-emerald-600">{formatCurrency(p.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {/* Sticky total footer - always visible */}
          {filteredCollected.length > 0 && (
            <div className="flex justify-end mt-3 pt-3 border-t">
              <span className="text-sm font-semibold text-emerald-600">
                Totale: {formatCurrency(filteredCollectedTotal)}
                <span className="text-muted-foreground font-normal ml-2">({filteredCollected.length} pagamenti)</span>
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Unified "Da Ricevere" */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Da ricevere</CardTitle>
            <span className="text-sm font-semibold text-amber-600">{formatCurrency(allExpectedTotal)}</span>
          </div>
        </CardHeader>
        <CardContent className="space-y-1">
          {Object.keys(groupedExpected).length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Nessun pagamento atteso</p>
          ) : (
            Object.entries(groupedExpected)
              .sort(([a], [b]) => {
                if (a === "__overdue") return -1;
                if (b === "__overdue") return 1;
                if (a === "__nodate") return 1;
                if (b === "__nodate") return -1;
                return a.localeCompare(b);
              })
              .map(([key, group]) => (
                <ExpectedGroupSection
                  key={key}
                  groupKey={key}
                  group={group}
                  isExpanded={expandedMonths[key] ?? key === "__overdue"}
                  onToggle={() => toggleMonth(key)}
                />
              ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ── Collapsible month group ── */
interface GroupData {
  label: string;
  payments: ExpectedPayment[];
  total: number;
  isOverdue?: boolean;
}

function ExpectedGroupSection({ groupKey, group, isExpanded, onToggle }: {
  groupKey: string;
  group: GroupData;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const navigate = useNavigate();
  return (
    <Collapsible open={isExpanded} onOpenChange={onToggle}>
      <CollapsibleTrigger asChild>
        <button className="flex items-center justify-between w-full px-3 py-2.5 rounded-md hover:bg-muted/50 transition-colors text-left">
          <div className="flex items-center gap-2">
            {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            <span className="text-sm font-medium capitalize">{group.label}</span>
            {group.isOverdue && (
              <Badge variant="destructive" className="text-[10px] h-5 gap-1">
                <AlertTriangle className="h-3 w-3" />
                {group.payments.length}
              </Badge>
            )}
            {!group.isOverdue && (
              <span className="text-xs text-muted-foreground">({group.payments.length})</span>
            )}
          </div>
          <span className={`text-sm font-semibold ${group.isOverdue ? "text-destructive" : "text-amber-600"}`}>
            {formatCurrency(group.total)}
          </span>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="pl-2 pr-1 pb-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data prevista</TableHead>
                <TableHead>Ordine</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Importo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {group.payments.map((p, i) => (
                <TableRow
                  key={`${p.orderId}-${p.type}-${i}`}
                  className={p.orderId ? "cursor-pointer hover:bg-muted/50" : ""}
                  onClick={() => p.orderId && navigate(`/azienda/ordini/${p.orderId}`)}
                >
                  <TableCell className="text-sm">
                    <span className={group.isOverdue ? "text-destructive font-medium" : ""}>
                      {p.expectedDate ? format(p.expectedDate, "dd/MM/yyyy") : "—"}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm font-medium">{p.orderCode || "—"}</TableCell>
                  <TableCell className="text-sm">{p.customerName}</TableCell>
                  <TableCell className="text-sm">{p.type}</TableCell>
                  <TableCell className="text-right text-sm font-medium">{formatCurrency(p.amount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
