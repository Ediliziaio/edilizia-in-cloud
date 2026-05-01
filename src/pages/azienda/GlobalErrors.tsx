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
  Truck,
  Wrench,
  UserCheck,
  Target,
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

type NormalizedType =
  | "merce"
  | "fornitura"
  | "logistica"
  | "manodopera"
  | "esecuzione"
  | "altro";
type NormalizedCategory =
  | "fornitore"
  | "misura"
  | "quantita"
  | "lavorazione"
  | "comunicazione"
  | "difetto_prodotto"
  | "difetto_materiale"
  | "danno_materiale"
  | "ritardo"
  | "altro";
type ResponsibilityKey =
  | "supplier"
  | "technical"
  | "site_team"
  | "logistics"
  | "internal"
  | "unassigned";
type SeverityKey = "high" | "medium" | "low";

const TYPE_META: Record<NormalizedType, { label: string; icon: typeof Package; color: string; chartKey: "supply" | "execution" | "logistics" | "other" }> = {
  merce: { label: "Merce", icon: Package, color: "bg-red-50 text-red-700 border-red-200", chartKey: "supply" },
  fornitura: { label: "Fornitura", icon: Truck, color: "bg-orange-50 text-orange-700 border-orange-200", chartKey: "supply" },
  logistica: { label: "Logistica", icon: Truck, color: "bg-blue-50 text-blue-700 border-blue-200", chartKey: "logistics" },
  manodopera: { label: "Manodopera", icon: HardHat, color: "bg-indigo-50 text-indigo-700 border-indigo-200", chartKey: "execution" },
  esecuzione: { label: "Esecuzione", icon: Wrench, color: "bg-purple-50 text-purple-700 border-purple-200", chartKey: "execution" },
  altro: { label: "Altro", icon: AlertTriangle, color: "bg-slate-50 text-slate-700 border-slate-200", chartKey: "other" },
};

const CATEGORY_META: Record<NormalizedCategory, { label: string; color: string }> = {
  fornitore: { label: "Errore fornitore", color: "hsl(var(--destructive))" },
  misura: { label: "Errore misura", color: "hsl(var(--primary))" },
  quantita: { label: "Errore quantità", color: "hsl(260, 75%, 58%)" },
  lavorazione: { label: "Errore lavorazione", color: "hsl(35, 85%, 50%)" },
  comunicazione: { label: "Comunicazione", color: "hsl(280, 60%, 55%)" },
  difetto_prodotto: { label: "Difetto prodotto", color: "hsl(0, 78%, 58%)" },
  difetto_materiale: { label: "Difetto materiale", color: "hsl(20, 84%, 52%)" },
  danno_materiale: { label: "Danno materiale", color: "hsl(12, 80%, 55%)" },
  ritardo: { label: "Ritardo", color: "hsl(45, 90%, 48%)" },
  altro: { label: "Altro", color: "hsl(var(--muted-foreground))" },
};

const RESPONSIBILITY_META: Record<ResponsibilityKey, { label: string; shortLabel: string; color: string }> = {
  supplier: { label: "Fornitore", shortLabel: "Fornitore", color: "bg-orange-50 text-orange-700 border-orange-200" },
  technical: { label: "Rilievo / tecnico", shortLabel: "Tecnico", color: "bg-blue-50 text-blue-700 border-blue-200" },
  site_team: { label: "Squadra / cantiere", shortLabel: "Cantiere", color: "bg-purple-50 text-purple-700 border-purple-200" },
  logistics: { label: "Logistica / corriere", shortLabel: "Logistica", color: "bg-cyan-50 text-cyan-700 border-cyan-200" },
  internal: { label: "Comunicazione interna", shortLabel: "Interna", color: "bg-amber-50 text-amber-700 border-amber-200" },
  unassigned: { label: "Da assegnare", shortLabel: "Da assegnare", color: "bg-slate-50 text-slate-700 border-slate-200" },
};

const SEVERITY_META: Record<SeverityKey, { label: string; color: string }> = {
  high: { label: "Critica", color: "bg-red-50 text-red-700 border-red-200" },
  medium: { label: "Da gestire", color: "bg-amber-50 text-amber-700 border-amber-200" },
  low: { label: "Minore", color: "bg-slate-50 text-slate-700 border-slate-200" },
};

const TYPE_ALIASES: Record<string, NormalizedType> = {
  merce: "merce",
  materiale: "merce",
  fornitura: "fornitura",
  fornitore: "fornitura",
  logistica: "logistica",
  trasporto: "logistica",
  manodopera: "manodopera",
  esecuzione: "esecuzione",
  lavorazione: "esecuzione",
  cantiere: "esecuzione",
  altro: "altro",
};

const CATEGORY_ALIASES: Record<string, NormalizedCategory> = {
  fornitore: "fornitore",
  errore_fornitore: "fornitore",
  misura: "misura",
  misure: "misura",
  errore_misura: "misura",
  errore_misure: "misura",
  quantita: "quantita",
  quantita_errata: "quantita",
  errore_quantita: "quantita",
  lavorazione: "lavorazione",
  errore_lavorazione: "lavorazione",
  comunicazione: "comunicazione",
  errore_comunicazione: "comunicazione",
  difetto_prodotto: "difetto_prodotto",
  prodotto_difettoso: "difetto_prodotto",
  difetto_materiale: "difetto_materiale",
  materiale_difettoso: "difetto_materiale",
  danno_materiale: "danno_materiale",
  danni_materiale: "danno_materiale",
  danni: "danno_materiale",
  ritardo: "ritardo",
  ritardi: "ritardo",
  altro: "altro",
};

type OrderError = {
  id: string;
  error_date: string;
  error_type: string | null;
  error_category: string | null;
  amount: number | null;
  description: string | null;
  order_id: string;
  orders: { order_code: string | null; description: string | null } | null;
};

type EnrichedOrderError = OrderError & {
  normalizedType: NormalizedType;
  normalizedCategory: NormalizedCategory;
  responsibility: ResponsibilityKey;
  severity: SeverityKey;
  actionHint: string;
};

type SortDirection = "asc" | "desc";
type ErrorSortKey =
  | "date"
  | "order"
  | "type"
  | "category"
  | "responsibility"
  | "severity"
  | "amount"
  | "description";

interface FilterState {
  category: string;
  type: string;
  responsibility: string;
  severity: string;
  dateFrom: Date | undefined;
  dateTo: Date | undefined;
}

const EMPTY_FILTERS: FilterState = {
  category: "all",
  type: "all",
  responsibility: "all",
  severity: "all",
  dateFrom: undefined,
  dateTo: undefined,
};

function normalizeKey(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[ -]+/g, "_");
}

function normalizeType(value: string | null | undefined): NormalizedType {
  return TYPE_ALIASES[normalizeKey(value)] ?? "altro";
}

function normalizeCategory(value: string | null | undefined): NormalizedCategory {
  return CATEGORY_ALIASES[normalizeKey(value)] ?? "altro";
}

function inferResponsibility(
  type: NormalizedType,
  category: NormalizedCategory,
): ResponsibilityKey {
  if (type === "fornitura" || ["fornitore", "difetto_prodotto", "difetto_materiale"].includes(category)) {
    return "supplier";
  }
  if (category === "misura") return "technical";
  if (type === "logistica" || ["danno_materiale", "ritardo"].includes(category)) return "logistics";
  if (type === "manodopera" || type === "esecuzione" || category === "lavorazione") return "site_team";
  if (category === "comunicazione") return "internal";
  return "unassigned";
}

function inferSeverity(amount: number): SeverityKey {
  if (amount >= 1000) return "high";
  if (amount >= 300) return "medium";
  return "low";
}

function getActionHint(
  responsibility: ResponsibilityKey,
  category: NormalizedCategory,
): string {
  if (category === "misura") return "Rivedi rilievi, tolleranze e approvazione misure prima dell'ordine.";
  if (category === "ritardo") return "Controlla lead time, DDT collegati e promesse fornitore.";
  if (category === "danno_materiale") return "Apri verifica ricezione/DDT e raccogli foto del danno.";
  if (responsibility === "supplier") return "Verifica fornitore, reclamo e impatto su prossimi ordini.";
  if (responsibility === "site_team") return "Collega squadra, lavorazione e azione correttiva sul cantiere.";
  if (responsibility === "internal") return "Allinea note, messaggi e passaggi di consegna interni.";
  return "Assegna un responsabile e collega commessa, fornitore o DDT.";
}

function enrichError(error: OrderError): EnrichedOrderError {
  const normalizedType = normalizeType(error.error_type);
  const normalizedCategory = normalizeCategory(error.error_category);
  const responsibility = inferResponsibility(normalizedType, normalizedCategory);
  const severity = inferSeverity(Number(error.amount ?? 0));
  return {
    ...error,
    normalizedType,
    normalizedCategory,
    responsibility,
    severity,
    actionHint: getActionHint(responsibility, normalizedCategory),
  };
}

function countActiveFilters(f: FilterState): number {
  let n = 0;
  if (f.category !== "all") n++;
  if (f.type !== "all") n++;
  if (f.responsibility !== "all") n++;
  if (f.severity !== "all") n++;
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
      <CollapsibleTrigger className="flex w-full items-center justify-between rounded px-1 py-2.5 text-sm font-medium transition-colors hover:bg-muted/50">
        <span>{title}</span>
        {open ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-2 px-1 pb-3">{children}</CollapsibleContent>
    </Collapsible>
  );
}

function FilterSelect({
  value,
  onValueChange,
  placeholder,
  children,
}: {
  value: string;
  onValueChange: (value: string) => void;
  placeholder: string;
  children: React.ReactNode;
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className="h-8 text-sm">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>{children}</SelectContent>
    </Select>
  );
}

function MetricCard({
  title,
  value,
  detail,
  icon: Icon,
  tone = "default",
}: {
  title: string;
  value: string;
  detail?: string;
  icon: typeof Package;
  tone?: "default" | "danger" | "warning" | "success";
}) {
  const toneClasses = {
    default: "text-slate-900",
    danger: "text-red-600",
    warning: "text-orange-600",
    success: "text-emerald-600",
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className={cn("h-4 w-4", toneClasses[tone])} />
      </CardHeader>
      <CardContent>
        <div className={cn("text-2xl font-bold", toneClasses[tone])}>{value}</div>
        {detail && <p className="mt-1 text-xs text-muted-foreground">{detail}</p>}
      </CardContent>
    </Card>
  );
}

export default function GlobalErrors() {
  const companyId = useEffectiveCompanyId();

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

  const { data: errors = [], isLoading, error } = useQuery({
    queryKey: ["global-errors", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error: queryError } = await supabase
        .from("order_errors")
        .select("*, orders(order_code, description)")
        .eq("company_id", companyId)
        .order("error_date", { ascending: false });
      if (queryError) throw queryError;
      return (data || []) as unknown as OrderError[];
    },
    enabled: !!companyId,
  });

  const enrichedErrors = useMemo(() => errors.map(enrichError), [errors]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const result = enrichedErrors.filter((e) => {
      if (filters.category !== "all" && e.normalizedCategory !== filters.category) return false;
      if (filters.type !== "all" && e.normalizedType !== filters.type) return false;
      if (filters.responsibility !== "all" && e.responsibility !== filters.responsibility) return false;
      if (filters.severity !== "all" && e.severity !== filters.severity) return false;
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
          TYPE_META[e.normalizedType].label,
          CATEGORY_META[e.normalizedCategory].label,
          RESPONSIBILITY_META[e.responsibility].label,
          SEVERITY_META[e.severity].label,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });

    const getSortValue = (e: EnrichedOrderError, key: ErrorSortKey) => {
      switch (key) {
        case "date":
          return parseISO(e.error_date).getTime();
        case "order":
          return e.orders?.order_code ?? e.orders?.description ?? "";
        case "type":
          return TYPE_META[e.normalizedType].label;
        case "category":
          return CATEGORY_META[e.normalizedCategory].label;
        case "responsibility":
          return RESPONSIBILITY_META[e.responsibility].label;
        case "severity":
          return e.severity === "high" ? 3 : e.severity === "medium" ? 2 : 1;
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
  }, [enrichedErrors, filters, search, sort]);

  const stats = useMemo(() => {
    const totalLoss = filtered.reduce((s, e) => s + Number(e.amount ?? 0), 0);
    const critical = filtered.filter((e) => e.severity === "high");
    const thisMonthStart = startOfMonth(new Date());
    const thisMonth = enrichedErrors
      .filter((e) => parseISO(e.error_date) >= thisMonthStart)
      .reduce((s, e) => s + Number(e.amount ?? 0), 0);

    const responsibilityTotals: Record<ResponsibilityKey, { amount: number; count: number }> = {
      supplier: { amount: 0, count: 0 },
      technical: { amount: 0, count: 0 },
      site_team: { amount: 0, count: 0 },
      logistics: { amount: 0, count: 0 },
      internal: { amount: 0, count: 0 },
      unassigned: { amount: 0, count: 0 },
    };
    const categoryTotals: Record<NormalizedCategory, number> = {
      fornitore: 0,
      misura: 0,
      quantita: 0,
      lavorazione: 0,
      comunicazione: 0,
      difetto_prodotto: 0,
      difetto_materiale: 0,
      danno_materiale: 0,
      ritardo: 0,
      altro: 0,
    };

    filtered.forEach((e) => {
      responsibilityTotals[e.responsibility].amount += Number(e.amount ?? 0);
      responsibilityTotals[e.responsibility].count += 1;
      categoryTotals[e.normalizedCategory] += 1;
    });

    const topResponsibility = Object.entries(responsibilityTotals)
      .filter(([, value]) => value.count > 0)
      .sort((a, b) => b[1].amount - a[1].amount)[0] as
      | [ResponsibilityKey, { amount: number; count: number }]
      | undefined;
    const topCategory = Object.entries(categoryTotals)
      .filter(([, count]) => count > 0)
      .sort((a, b) => b[1] - a[1])[0] as [NormalizedCategory, number] | undefined;

    return { totalLoss, critical, thisMonth, responsibilityTotals, topResponsibility, topCategory };
  }, [filtered, enrichedErrors]);

  const categoryChart = useMemo(() => {
    const map: Record<NormalizedCategory, number> = {
      fornitore: 0,
      misura: 0,
      quantita: 0,
      lavorazione: 0,
      comunicazione: 0,
      difetto_prodotto: 0,
      difetto_materiale: 0,
      danno_materiale: 0,
      ritardo: 0,
      altro: 0,
    };
    filtered.forEach((e) => {
      map[e.normalizedCategory] += Number(e.amount ?? 0);
    });
    return Object.entries(map)
      .filter(([, amount]) => amount > 0)
      .map(([cat, amount]) => ({
        category: CATEGORY_META[cat as NormalizedCategory].label,
        amount,
        key: cat as NormalizedCategory,
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [filtered]);

  const responsibilityChart = useMemo(() => {
    return Object.entries(stats.responsibilityTotals)
      .filter(([, value]) => value.count > 0)
      .map(([key, value]) => ({
        key: key as ResponsibilityKey,
        label: RESPONSIBILITY_META[key as ResponsibilityKey].label,
        count: value.count,
        amount: value.amount,
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [stats.responsibilityTotals]);

  const monthlyChart = useMemo(() => {
    const now = new Date();
    const months: { label: string; start: Date; end: Date }[] = [];
    for (let i = 5; i >= 0; i--) {
      const s = startOfMonth(subMonths(now, i));
      const e = startOfMonth(subMonths(now, i - 1));
      months.push({ label: format(s, "MMM yy", { locale: it }), start: s, end: e });
    }
    return months.map((m) => {
      const row = { month: m.label, fornitura: 0, esecuzione: 0, logistica: 0, altro: 0 };
      enrichedErrors.forEach((e) => {
        const d = parseISO(e.error_date);
        if (d < m.start || d >= m.end) return;
        const chartKey = TYPE_META[e.normalizedType].chartKey;
        if (chartKey === "supply") row.fornitura += Number(e.amount ?? 0);
        if (chartKey === "execution") row.esecuzione += Number(e.amount ?? 0);
        if (chartKey === "logistics") row.logistica += Number(e.amount ?? 0);
        if (chartKey === "other") row.altro += Number(e.amount ?? 0);
      });
      return row;
    });
  }, [enrichedErrors]);

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        Impossibile caricare le anomalie. Riprova tra qualche secondo o verifica i permessi aziendali.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white px-4 pb-5 pt-5 shadow-sm sm:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-amber-400 text-white shadow-[0_4px_12px_rgba(249,115,22,0.3)]">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-bold leading-tight tracking-tight text-slate-900 sm:text-2xl">
                Anomalie operative
              </h1>
              <p className="mt-0.5 text-sm text-slate-500">
                Capisci dove nasce la perdita, chi deve intervenire e quali cause si ripetono.
              </p>
            </div>
          </div>
          <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
            <div className="relative min-w-[260px] flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Cerca commessa, causa, responsabile..."
                className="h-9 w-full rounded-md border bg-background pl-9 pr-3 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              className="relative h-9 shrink-0 text-xs"
              onClick={handleOpenFilters}
            >
              <Filter className="mr-1.5 h-3.5 w-3.5" />
              Filtri
              {activeFilterCount > 0 && (
                <span className="ml-1.5 rounded-full bg-orange-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                  {activeFilterCount}
                </span>
              )}
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Totale perdite"
          value={formatCurrency(stats.totalLoss)}
          detail={`${filtered.length} anomalie nel perimetro`}
          icon={TrendingDown}
          tone="danger"
        />
        <MetricCard
          title="Responsabilità principale"
          value={stats.topResponsibility ? RESPONSIBILITY_META[stats.topResponsibility[0]].shortLabel : "Nessuna"}
          detail={
            stats.topResponsibility
              ? `${formatCurrency(stats.topResponsibility[1].amount)} su ${stats.topResponsibility[1].count} casi`
              : "Nessuna anomalia filtrata"
          }
          icon={UserCheck}
          tone="warning"
        />
        <MetricCard
          title="Anomalie critiche"
          value={String(stats.critical.length)}
          detail={
            stats.critical.length > 0
              ? `${formatCurrency(stats.critical.reduce((s, e) => s + Number(e.amount ?? 0), 0))} da presidiare`
              : "Nessuna perdita sopra soglia"
          }
          icon={Target}
          tone={stats.critical.length > 0 ? "danger" : "success"}
        />
        <MetricCard
          title="Questo mese"
          value={formatCurrency(stats.thisMonth)}
          detail={
            stats.topCategory
              ? `Causa frequente: ${CATEGORY_META[stats.topCategory[0]].label} (${stats.topCategory[1]})`
              : "Nessuna causa ricorrente"
          }
          icon={CalendarDays}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_0.72fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Perdite per causa</CardTitle>
          </CardHeader>
          <CardContent>
            {categoryChart.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Nessun dato</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={categoryChart} layout="vertical" margin={{ left: 32 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tickFormatter={formatCurrencyCompact} />
                  <YAxis type="category" dataKey="category" width={126} />
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
                  <Bar dataKey="amount" name="Importo" radius={[0, 4, 4, 0]}>
                    {categoryChart.map((entry) => (
                      <Cell key={entry.key} fill={CATEGORY_META[entry.key].color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Responsabilità probabile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {responsibilityChart.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Nessuna responsabilità rilevata</p>
            ) : (
              responsibilityChart.map((item) => {
                const percentage = stats.totalLoss > 0 ? Math.round((item.amount / stats.totalLoss) * 100) : 0;
                return (
                  <div key={item.key} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="font-medium">{item.label}</span>
                      <span className="text-muted-foreground">{formatCurrency(item.amount)}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-orange-500"
                        style={{ width: `${Math.max(percentage, 4)}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {item.count} casi · {percentage}% delle perdite filtrate
                    </p>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Andamento mensile per sorgente</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={monthlyChart}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis tickFormatter={formatCurrencyCompact} />
              <Tooltip formatter={(v: number) => formatCurrency(v)} />
              <Legend />
              <Bar dataKey="fornitura" name="Fornitura/merce" stackId="a" fill="hsl(20, 84%, 52%)" />
              <Bar dataKey="esecuzione" name="Esecuzione" stackId="a" fill="hsl(260, 75%, 58%)" />
              <Bar dataKey="logistica" name="Logistica" stackId="a" fill="hsl(205, 80%, 50%)" />
              <Bar dataKey="altro" name="Altro" stackId="a" fill="hsl(var(--muted-foreground))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Registro anomalie</CardTitle>
            {activeFilterCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground"
                onClick={handleResetFilters}
              >
                <RotateCcw className="mr-1 h-3 w-3" />
                Rimuovi filtri
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead active={sort.key === "date"} direction={sort.direction} onClick={() => handleSort("date")}>Data</SortableTableHead>
                  <SortableTableHead active={sort.key === "order"} direction={sort.direction} onClick={() => handleSort("order")}>Commessa</SortableTableHead>
                  <SortableTableHead active={sort.key === "type"} direction={sort.direction} onClick={() => handleSort("type")}>Sorgente</SortableTableHead>
                  <SortableTableHead active={sort.key === "category"} direction={sort.direction} onClick={() => handleSort("category")}>Causa</SortableTableHead>
                  <SortableTableHead active={sort.key === "responsibility"} direction={sort.direction} onClick={() => handleSort("responsibility")}>Responsabilità</SortableTableHead>
                  <SortableTableHead active={sort.key === "severity"} direction={sort.direction} onClick={() => handleSort("severity")}>Priorità</SortableTableHead>
                  <SortableTableHead className="text-right" align="right" active={sort.key === "amount"} direction={sort.direction} onClick={() => handleSort("amount")}>Importo</SortableTableHead>
                  <SortableTableHead active={sort.key === "description"} direction={sort.direction} onClick={() => handleSort("description")}>Azione</SortableTableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                      Caricamento anomalie...
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                      Nessuna anomalia trovata
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((e) => {
                    const typeMeta = TYPE_META[e.normalizedType];
                    const TypeIcon = typeMeta.icon;
                    const orderLabel = e.orders?.order_code || e.orders?.description?.slice(0, 30) || "Commessa non trovata";
                    return (
                      <TableRow key={e.id}>
                        <TableCell className="whitespace-nowrap">{format(parseISO(e.error_date), "dd/MM/yyyy")}</TableCell>
                        <TableCell>
                          <Link
                            to={`/azienda/ordini/${e.order_id}`}
                            className="font-medium text-primary hover:underline"
                          >
                            {orderLabel}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn("gap-1 border", typeMeta.color)}>
                            <TypeIcon className="h-3 w-3" />
                            {typeMeta.label}
                          </Badge>
                        </TableCell>
                        <TableCell>{CATEGORY_META[e.normalizedCategory].label}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn("border", RESPONSIBILITY_META[e.responsibility].color)}>
                            {RESPONSIBILITY_META[e.responsibility].label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn("border", SEVERITY_META[e.severity].color)}>
                            {SEVERITY_META[e.severity].label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-semibold text-red-600">
                          {formatCurrency(Number(e.amount ?? 0))}
                        </TableCell>
                        <TableCell className="min-w-[300px] max-w-[360px]">
                          <div className="space-y-1">
                            <p className="line-clamp-2 text-sm">{e.description || "Nessuna descrizione"}</p>
                            <p className="text-xs text-muted-foreground">{e.actionHint}</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent side="right" className="flex w-[340px] flex-col sm:w-[380px]">
          <SheetHeader>
            <SheetTitle className="text-base">Filtri avanzati anomalie</SheetTitle>
          </SheetHeader>

          <div className="mt-4 flex-1 space-y-1 overflow-y-auto">
            <FilterSection title="Sorgente" defaultOpen>
              <FilterSelect
                value={localFilters.type}
                onValueChange={(v) => setLocalFilters((p) => ({ ...p, type: v }))}
                placeholder="Tutte"
              >
                <SelectItem value="all">Tutte</SelectItem>
                {Object.entries(TYPE_META).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v.label}
                  </SelectItem>
                ))}
              </FilterSelect>
            </FilterSection>

            <FilterSection title="Causa" defaultOpen>
              <FilterSelect
                value={localFilters.category}
                onValueChange={(v) => setLocalFilters((p) => ({ ...p, category: v }))}
                placeholder="Tutte"
              >
                <SelectItem value="all">Tutte</SelectItem>
                {Object.entries(CATEGORY_META).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v.label}
                  </SelectItem>
                ))}
              </FilterSelect>
            </FilterSection>

            <FilterSection title="Responsabilità probabile">
              <FilterSelect
                value={localFilters.responsibility}
                onValueChange={(v) => setLocalFilters((p) => ({ ...p, responsibility: v }))}
                placeholder="Tutte"
              >
                <SelectItem value="all">Tutte</SelectItem>
                {Object.entries(RESPONSIBILITY_META).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v.label}
                  </SelectItem>
                ))}
              </FilterSelect>
            </FilterSection>

            <FilterSection title="Priorità">
              <FilterSelect
                value={localFilters.severity}
                onValueChange={(v) => setLocalFilters((p) => ({ ...p, severity: v }))}
                placeholder="Tutte"
              >
                <SelectItem value="all">Tutte</SelectItem>
                {Object.entries(SEVERITY_META).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v.label}
                  </SelectItem>
                ))}
              </FilterSelect>
            </FilterSection>

            <FilterSection title="Periodo">
              <div className="space-y-2">
                <div>
                  <p className="mb-1 text-xs text-muted-foreground">Dal</p>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className={cn("h-8 w-full justify-start text-xs", localFilters.dateFrom && "text-foreground")}
                      >
                        <CalendarDays className="mr-1.5 h-3.5 w-3.5" />
                        {localFilters.dateFrom ? format(localFilters.dateFrom, "dd/MM/yyyy") : "Scegli data"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={localFilters.dateFrom}
                        onSelect={(d) => setLocalFilters((p) => ({ ...p, dateFrom: d }))}
                        className="pointer-events-auto p-3"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div>
                  <p className="mb-1 text-xs text-muted-foreground">Al</p>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className={cn("h-8 w-full justify-start text-xs", localFilters.dateTo && "text-foreground")}
                      >
                        <CalendarDays className="mr-1.5 h-3.5 w-3.5" />
                        {localFilters.dateTo ? format(localFilters.dateTo, "dd/MM/yyyy") : "Scegli data"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={localFilters.dateTo}
                        onSelect={(d) => setLocalFilters((p) => ({ ...p, dateTo: d }))}
                        className="pointer-events-auto p-3"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            </FilterSection>
          </div>

          <div className="shrink-0 space-y-2 border-t pt-4">
            <Button className="w-full bg-orange-500 text-white hover:bg-orange-600" onClick={handleApplyFilters}>
              Applica filtri
            </Button>
            <Button variant="outline" className="w-full text-sm" onClick={handleResetFilters}>
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Ripristina
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
