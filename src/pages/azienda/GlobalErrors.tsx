import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { format, subMonths, startOfMonth, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { Link } from "react-router-dom";
import {
  Package,
  HardHat,
  TrendingDown,
  CalendarDays,
  Filter,
  RotateCcw,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { formatCurrency, formatCurrencyCompact } from "@/lib/formatters";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell,
} from "recharts";

const CATEGORY_LABELS: Record<string, string> = {
  fornitore: "Fornitore",
  misura: "Misura",
  quantita: "Quantità",
  lavorazione: "Lavorazione",
  comunicazione: "Comunicazione",
  altro: "Altro",
};

const TYPE_LABELS: Record<string, string> = {
  merce: "Merce",
  manodopera: "Manodopera",
};

const CATEGORY_COLORS: Record<string, string> = {
  fornitore: "hsl(var(--destructive))",
  misura: "hsl(var(--primary))",
  quantita: "hsl(220, 70%, 55%)",
  lavorazione: "hsl(35, 85%, 50%)",
  comunicazione: "hsl(280, 60%, 55%)",
  altro: "hsl(var(--muted-foreground))",
};

type OrderError = {
  id: string;
  error_date: string;
  error_type: string;
  error_category: string;
  amount: number;
  description: string;
  order_id: string;
  orders: { order_code: string | null; description: string };
};

type SortDirection = "asc" | "desc";
type ErrorSortKey = "date" | "order" | "type" | "category" | "amount" | "description";

interface FilterState {
  category: string;
  type: string;
  dateFrom: Date | undefined;
  dateTo: Date | undefined;
}

const EMPTY_FILTERS: FilterState = {
  category: "all",
  type: "all",
  dateFrom: undefined,
  dateTo: undefined,
};

function countActiveFilters(f: FilterState): number {
  let n = 0;
  if (f.category !== "all") n++;
  if (f.type !== "all") n++;
  if (f.dateFrom) n++;
  if (f.dateTo) n++;
  return n;
}

function compareSortValues(
  a: string | number | null | undefined,
  b: string | number | null | undefined,
) {
  const normalizedA = typeof a === "number" ? a : String(a ?? "").toLowerCase();
  const normalizedB = typeof b === "number" ? b : String(b ?? "").toLowerCase();
  if (normalizedA < normalizedB) return -1;
  if (normalizedA > normalizedB) return 1;
  return 0;
}

function SortIcon({ active, direction }: { active: boolean; direction: SortDirection }) {
  if (!active) return <ArrowUpDown className="h-3.5 w-3.5 opacity-45" />;
  return direction === "asc"
    ? <ArrowUp className="h-3.5 w-3.5" />
    : <ArrowDown className="h-3.5 w-3.5" />;
}

function SortableTableHead({
  children,
  active,
  direction,
  onClick,
  className,
  align = "left",
}: {
  children: React.ReactNode;
  active: boolean;
  direction: SortDirection;
  onClick: () => void;
  className?: string;
  align?: "left" | "right";
}) {
  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground",
          align === "right" && "ml-auto justify-end",
        )}
      >
        {children}
        <SortIcon active={active} direction={direction} />
      </button>
    </TableHead>
  );
}

function FilterSection({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center justify-between w-full py-2.5 px-1 text-sm font-medium hover:bg-muted/50 rounded transition-colors">
        <span>{title}</span>
        {open ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
      </CollapsibleTrigger>
      <CollapsibleContent className="px-1 pb-3 space-y-2">{children}</CollapsibleContent>
    </Collapsible>
  );
}

export default function GlobalErrors() {
  const companyId = useEffectiveCompanyId();

  // ── Filtri ────────────────────────────────────────────────
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [localFilters, setLocalFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ key: ErrorSortKey; direction: SortDirection }>({
    key: "date",
    direction: "desc",
  });

  const activeFilterCount = countActiveFilters(filters);

  const handleOpenFilters = () => {
    setLocalFilters(filters);
    setFiltersOpen(true);
  };

  const handleApplyFilters = () => {
    setFilters(localFilters);
    setFiltersOpen(false);
  };

  const handleResetFilters = () => {
    setLocalFilters(EMPTY_FILTERS);
    setFilters(EMPTY_FILTERS);
    setFiltersOpen(false);
  };

  const handleSort = (key: ErrorSortKey) => {
    setSort((current) => ({
      key,
      direction: current.key === key && current.direction === "asc" ? "desc" : "asc",
    }));
  };

  // ── Data ─────────────────────────────────────────────────
  const { data: errors = [], isLoading, error } = useQuery({
    queryKey: ["global-errors", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("order_errors")
        .select("*, orders(order_code, description)")
        .eq("company_id", companyId)
        .order("error_date", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as OrderError[];
    },
    enabled: !!companyId,
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const result = errors.filter((e) => {
      if (filters.category !== "all" && e.error_category !== filters.category) return false;
      if (filters.type !== "all" && e.error_type !== filters.type) return false;
      if (filters.dateFrom || filters.dateTo) {
        const d = parseISO(e.error_date);
        if (filters.dateFrom && d < filters.dateFrom) return false;
        if (filters.dateTo && d > filters.dateTo) return false;
      }
      if (q) {
        const haystack = [
          e.description,
          e.orders?.order_code,
          e.orders?.description,
          CATEGORY_LABELS[e.error_category] || e.error_category,
          TYPE_LABELS[e.error_type] || e.error_type,
        ].filter(Boolean).join(" ").toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });

    const getSortValue = (e: OrderError, key: ErrorSortKey) => {
      switch (key) {
        case "date":
          return parseISO(e.error_date).getTime();
        case "order":
          return e.orders?.order_code ?? e.orders?.description ?? "";
        case "type":
          return TYPE_LABELS[e.error_type] || e.error_type;
        case "category":
          return CATEGORY_LABELS[e.error_category] || e.error_category;
        case "amount":
          return Number(e.amount ?? 0);
        case "description":
          return e.description ?? "";
        default:
          return "";
      }
    };

    return [...result].sort((a, b) => {
      const order = compareSortValues(getSortValue(a, sort.key), getSortValue(b, sort.key));
      return sort.direction === "asc" ? order : -order;
    });
  }, [errors, filters, search, sort]);

  // ── Stats ────────────────────────────────────────────────
  const stats = useMemo(() => {
    const totalLoss = filtered.reduce((s, e) => s + Number(e.amount), 0);
    const merceTotal = filtered
      .filter((e) => e.error_type === "merce")
      .reduce((s, e) => s + Number(e.amount), 0);
    const manodoperaTotal = filtered
      .filter((e) => e.error_type === "manodopera")
      .reduce((s, e) => s + Number(e.amount), 0);

    const catCount: Record<string, number> = {};
    filtered.forEach((e) => {
      catCount[e.error_category] = (catCount[e.error_category] || 0) + 1;
    });
    const topCategory = Object.entries(catCount).sort((a, b) => b[1] - a[1])[0];

    const now = new Date();
    const monthStart = startOfMonth(now);
    const thisMonth = errors
      .filter((e) => parseISO(e.error_date) >= monthStart)
      .reduce((s, e) => s + Number(e.amount), 0);

    return { totalLoss, merceTotal, manodoperaTotal, topCategory, thisMonth };
  }, [filtered, errors]);

  // ── Chart: by category ───────────────────────────────────
  const categoryChart = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.forEach((e) => {
      map[e.error_category] = (map[e.error_category] || 0) + Number(e.amount);
    });
    return Object.entries(map)
      .map(([cat, amount]) => ({ category: CATEGORY_LABELS[cat] || cat, amount, key: cat }))
      .sort((a, b) => b.amount - a.amount);
  }, [filtered]);

  // ── Chart: monthly trend ─────────────────────────────────
  const monthlyChart = useMemo(() => {
    const now = new Date();
    const months: { label: string; start: Date; end: Date }[] = [];
    for (let i = 5; i >= 0; i--) {
      const s = startOfMonth(subMonths(now, i));
      const e = startOfMonth(subMonths(now, i - 1));
      months.push({ label: format(s, "MMM yy", { locale: it }), start: s, end: e });
    }
    return months.map((m) => {
      const inMonth = errors.filter((e) => {
        const d = parseISO(e.error_date);
        return d >= m.start && d < m.end;
      });
      return {
        month: m.label,
        merce: inMonth
          .filter((e) => e.error_type === "merce")
          .reduce((s, e) => s + Number(e.amount), 0),
        manodopera: inMonth
          .filter((e) => e.error_type === "manodopera")
          .reduce((s, e) => s + Number(e.amount), 0),
      };
    });
  }, [errors]);

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        Impossibile caricare le anomalie. Riprova tra qualche secondo o verifica i permessi aziendali.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Header con bottone Filtri ─────────────────────── */}
      <div className="rounded-2xl border border-slate-200 bg-white px-4 sm:px-6 pt-5 pb-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-400 text-white flex items-center justify-center shrink-0 shadow-[0_4px_12px_rgba(249,115,22,0.3)]">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight leading-tight">Anomalie operative</h1>
              <p className="text-sm text-slate-500 mt-0.5">
                Errori merce e manodopera che impattano costi, marginalità e qualità delle commesse.
              </p>
            </div>
          </div>
          <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
            <div className="relative min-w-[260px] flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Cerca commessa, descrizione, categoria..."
                className="h-9 w-full rounded-md border bg-background pl-9 pr-3 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-9 text-xs shrink-0 relative"
              onClick={handleOpenFilters}
            >
              <Filter className="mr-1.5 h-3.5 w-3.5" />
              Filtri
              {activeFilterCount > 0 && (
                <span className="ml-1.5 bg-orange-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none">
                  {activeFilterCount}
                </span>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* ── Stat Cards ───────────────────────────────────── */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Totale Perdite</CardTitle>
            <TrendingDown className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">
              {formatCurrency(stats.totalLoss)}
            </div>
            <p className="text-xs text-muted-foreground">{filtered.length} errori totali</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Errori Merce</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.merceTotal)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Errori Manodopera</CardTitle>
            <HardHat className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.manodoperaTotal)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Questo Mese</CardTitle>
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.thisMonth)}</div>
            {stats.topCategory && (
              <p className="text-xs text-muted-foreground">
                Categoria più frequente:{" "}
                <strong>
                  {CATEGORY_LABELS[stats.topCategory[0]] || stats.topCategory[0]}
                </strong>{" "}
                ({stats.topCategory[1]})
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Charts ────────────────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Perdite per Categoria</CardTitle>
          </CardHeader>
          <CardContent>
            {categoryChart.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Nessun dato</p>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={categoryChart} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tickFormatter={formatCurrencyCompact} />
                  <YAxis type="category" dataKey="category" width={100} />
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
                  <Bar dataKey="amount" name="Importo" radius={[0, 4, 4, 0]}>
                    {categoryChart.map((entry) => (
                      <Cell
                        key={entry.key}
                        fill={CATEGORY_COLORS[entry.key] || "hsl(var(--primary))"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Andamento Mensile (ultimi 6 mesi)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={monthlyChart}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis tickFormatter={formatCurrencyCompact} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
                <Legend />
                <Bar
                  dataKey="merce"
                  name="Merce"
                  stackId="a"
                  fill="hsl(var(--destructive))"
                  radius={[0, 0, 0, 0]}
                />
                <Bar
                  dataKey="manodopera"
                  name="Manodopera"
                  stackId="a"
                  fill="hsl(var(--primary))"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* ── Tabella errori ────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Tutti gli errori</CardTitle>
            {activeFilterCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground h-7"
                onClick={handleResetFilters}
              >
                <RotateCcw className="h-3 w-3 mr-1" />
                Rimuovi filtri
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead active={sort.key === "date"} direction={sort.direction} onClick={() => handleSort("date")}>Data</SortableTableHead>
                  <SortableTableHead active={sort.key === "order"} direction={sort.direction} onClick={() => handleSort("order")}>Ordine</SortableTableHead>
                  <SortableTableHead active={sort.key === "type"} direction={sort.direction} onClick={() => handleSort("type")}>Tipo</SortableTableHead>
                  <SortableTableHead active={sort.key === "category"} direction={sort.direction} onClick={() => handleSort("category")}>Categoria</SortableTableHead>
                  <SortableTableHead className="text-right" align="right" active={sort.key === "amount"} direction={sort.direction} onClick={() => handleSort("amount")}>Importo</SortableTableHead>
                  <SortableTableHead active={sort.key === "description"} direction={sort.direction} onClick={() => handleSort("description")}>Descrizione</SortableTableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="text-center text-muted-foreground py-8"
                    >
                      Caricamento anomalie...
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="text-center text-muted-foreground py-8"
                    >
                      Nessun errore trovato
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="whitespace-nowrap">
                        {format(parseISO(e.error_date), "dd/MM/yyyy")}
                      </TableCell>
                      <TableCell>
                        <Link
                          to={`/azienda/ordini/${e.order_id}`}
                          className="text-primary hover:underline font-medium"
                        >
                          {e.orders.order_code || e.orders.description?.slice(0, 30)}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={e.error_type === "merce" ? "destructive" : "default"}
                        >
                          {TYPE_LABELS[e.error_type] || e.error_type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {CATEGORY_LABELS[e.error_category] || e.error_category}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(Number(e.amount))}
                      </TableCell>
                      <TableCell className="max-w-[250px] truncate">
                        {e.description}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* ── Filtri Sheet (sidebar laterale destra) ─────────── */}
      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent side="right" className="w-[340px] sm:w-[380px] flex flex-col">
          <SheetHeader>
            <SheetTitle className="text-base">Filtri Avanzati</SheetTitle>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto space-y-1 mt-4">
            {/* Tipo errore */}
            <FilterSection title="Tipo errore" defaultOpen>
              <Select
                value={localFilters.type}
                onValueChange={(v) => setLocalFilters((p) => ({ ...p, type: v }))}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Tutti" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti</SelectItem>
                  {Object.entries(TYPE_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterSection>

            {/* Categoria */}
            <FilterSection title="Categoria" defaultOpen>
              <Select
                value={localFilters.category}
                onValueChange={(v) => setLocalFilters((p) => ({ ...p, category: v }))}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Tutte" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutte</SelectItem>
                  {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterSection>

            {/* Data da */}
            <FilterSection title="Periodo">
              <div className="space-y-2">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Dal</p>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className={cn(
                          "w-full justify-start h-8 text-xs",
                          localFilters.dateFrom && "text-foreground"
                        )}
                      >
                        <CalendarDays className="h-3.5 w-3.5 mr-1.5" />
                        {localFilters.dateFrom
                          ? format(localFilters.dateFrom, "dd/MM/yyyy")
                          : "Scegli data"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={localFilters.dateFrom}
                        onSelect={(d) => setLocalFilters((p) => ({ ...p, dateFrom: d }))}
                        className="p-3 pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Al</p>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className={cn(
                          "w-full justify-start h-8 text-xs",
                          localFilters.dateTo && "text-foreground"
                        )}
                      >
                        <CalendarDays className="h-3.5 w-3.5 mr-1.5" />
                        {localFilters.dateTo
                          ? format(localFilters.dateTo, "dd/MM/yyyy")
                          : "Scegli data"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={localFilters.dateTo}
                        onSelect={(d) => setLocalFilters((p) => ({ ...p, dateTo: d }))}
                        className="p-3 pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            </FilterSection>
          </div>

          {/* Action buttons */}
          <div className="border-t pt-4 space-y-2 shrink-0">
            <Button className="w-full bg-orange-500 hover:bg-orange-600 text-white" onClick={handleApplyFilters}>
              Applica filtri
            </Button>
            <Button
              variant="outline"
              className="w-full text-sm"
              onClick={handleResetFilters}
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
              Ripristina
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
