import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { endOfDay, format, isValid, parseISO, startOfMonth, subMonths } from "date-fns";
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
  Download,
  UserRound,
  Users,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
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
import { escapeCsvCell } from "@/lib/csvExport";
import { formatCurrency, formatCurrencyCompact } from "@/lib/formatters";
import { OperationalKpiCard } from "@/components/orders/OperationalKpiCard";
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
type AttributionKind = "salesperson" | "employee" | "subcontractor" | "supplier" | "creator" | "unassigned";
type ReviewStatus = "aperta" | "in_verifica" | "assegnata" | "risolta" | "non_imputabile";

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

const ATTRIBUTION_META: Record<AttributionKind, { label: string; shortLabel: string; icon: typeof UserRound; color: string }> = {
  salesperson: { label: "Venditore", shortLabel: "Vend.", icon: UserRound, color: "bg-blue-50 text-blue-700 border-blue-200" },
  employee: { label: "Operaio", shortLabel: "Operaio", icon: HardHat, color: "bg-purple-50 text-purple-700 border-purple-200" },
  subcontractor: { label: "Subappaltatore", shortLabel: "Sub", icon: Users, color: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  supplier: { label: "Fornitore", shortLabel: "Forn.", icon: Truck, color: "bg-orange-50 text-orange-700 border-orange-200" },
  creator: { label: "Registrata da", shortLabel: "Autore", icon: UserCheck, color: "bg-slate-50 text-slate-700 border-slate-200" },
  unassigned: { label: "Da assegnare", shortLabel: "N/D", icon: AlertTriangle, color: "bg-slate-50 text-slate-700 border-slate-200" },
};

const REVIEW_STATUS_META: Record<ReviewStatus, { label: string; color: string; icon: typeof Clock3 }> = {
  aperta: { label: "Aperta", color: "bg-red-50 text-red-700 border-red-200", icon: AlertTriangle },
  in_verifica: { label: "In verifica", color: "bg-amber-50 text-amber-700 border-amber-200", icon: Clock3 },
  assegnata: { label: "Assegnata", color: "bg-blue-50 text-blue-700 border-blue-200", icon: ClipboardCheck },
  risolta: { label: "Risolta", color: "bg-green-50 text-green-700 border-green-200", icon: CheckCircle2 },
  non_imputabile: { label: "Non imputabile", color: "bg-slate-50 text-slate-700 border-slate-200", icon: CheckCircle2 },
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
  created_by: string | null;
  review_status?: ReviewStatus | null;
  detailed_cause?: string | null;
  process_origin?: string | null;
  verify_role?: string | null;
  corrective_action?: string | null;
  corrective_due_date?: string | null;
  confirmed_responsibility_kind?: string | null;
  confirmed_responsibility_id?: string | null;
  confirmed_responsibility_name?: string | null;
  ai_cause_summary?: string | null;
  ai_recommendation?: string | null;
  resolved_at?: string | null;
  resolved_by?: string | null;
  orders: { order_code: string | null; description: string | null } | null;
};

type ActorRef = {
  id: string;
  name: string;
  kind: AttributionKind;
};

type ActorMaps = {
  salespeople: Map<string, ActorRef[]>;
  employees: Map<string, ActorRef[]>;
  subcontractors: Map<string, ActorRef[]>;
  suppliers: Map<string, ActorRef[]>;
  creators: Map<string, ActorRef>;
};

type Attribution = {
  actor: ActorRef;
  confidence: "alta" | "media" | "bassa";
  reason: string;
};

type EnrichedOrderError = OrderError & {
  normalizedType: NormalizedType;
  normalizedCategory: NormalizedCategory;
  responsibility: ResponsibilityKey;
  severity: SeverityKey;
  actionHint: string;
  attributions: Attribution[];
  reporter: ActorRef | null;
  reviewStatus: ReviewStatus;
  detailedCause: string | null;
  processOrigin: string | null;
  verifyRole: string | null;
  correctiveAction: string | null;
  aiRecommendation: string | null;
  operationalDetail: string | null;
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

function extractStructuredField(description: string | null | undefined, label: string): string | null {
  if (!description) return null;
  const prefix = `${label}:`;
  const line = description
    .split("\n")
    .map((item) => item.trim())
    .find((item) => item.toLowerCase().startsWith(prefix.toLowerCase()));
  if (!line) return null;
  const value = line.slice(prefix.length).trim();
  return value || null;
}

function normalizeReviewStatus(value: string | null | undefined): ReviewStatus {
  if (value === "in_verifica" || value === "assegnata" || value === "risolta" || value === "non_imputabile") return value;
  return "aperta";
}

function uniqueActors(actors: ActorRef[]): ActorRef[] {
  const map = new Map<string, ActorRef>();
  actors.forEach((actor) => map.set(`${actor.kind}:${actor.id}:${actor.name}`, actor));
  return [...map.values()];
}

function addActors(
  attributions: Attribution[],
  actors: ActorRef[],
  confidence: Attribution["confidence"],
  reason: string,
) {
  uniqueActors(actors).forEach((actor) => {
    attributions.push({ actor, confidence, reason });
  });
}

function inferAttributions(error: OrderError, actorMaps: ActorMaps): Attribution[] {
  const type = normalizeType(error.error_type);
  const category = normalizeCategory(error.error_category);
  const suppliers = actorMaps.suppliers.get(error.order_id) ?? [];
  const employees = actorMaps.employees.get(error.order_id) ?? [];
  const subcontractors = actorMaps.subcontractors.get(error.order_id) ?? [];
  const salespeople = actorMaps.salespeople.get(error.order_id) ?? [];
  const attributions: Attribution[] = [];

  if (type === "fornitura" || ["fornitore", "difetto_prodotto", "difetto_materiale", "ritardo"].includes(category)) {
    addActors(attributions, suppliers, "alta", "Causa collegata a fornitura, materiale o ritardo su commessa con fornitore associato.");
  }
  if (type === "logistica" || category === "danno_materiale") {
    addActors(attributions, suppliers, suppliers.length ? "media" : "bassa", "Possibile responsabilità logistica o consegna materiale.");
    addActors(attributions, subcontractors, "media", "Danno o logistica su commessa con squadra esterna collegata.");
  }
  if (type === "manodopera" || type === "esecuzione" || category === "lavorazione") {
    addActors(attributions, employees, "alta", "Causa collegata a lavorazione o manodopera su commessa con operai assegnati.");
    addActors(attributions, subcontractors, "alta", "Causa collegata a esecuzione su commessa con subappaltatore assegnato.");
  }
  if (category === "misura" || category === "quantita" || category === "comunicazione") {
    addActors(attributions, salespeople, "media", "Causa commerciale/tecnica ricorrente su ordine con venditore associato.");
    addActors(attributions, employees, "media", "Possibile contributo operativo su misura, quantità o passaggio informazioni.");
  }

  if (attributions.length === 0) {
    attributions.push({
      actor: { id: "unassigned", name: "Da assegnare", kind: "unassigned" },
      confidence: "bassa",
      reason: "Non ci sono venditori, operai, subappaltatori o fornitori collegati alla commessa.",
    });
  }

  return attributions;
}

function enrichError(error: OrderError, actorMaps: ActorMaps): EnrichedOrderError {
  const normalizedType = normalizeType(error.error_type);
  const normalizedCategory = normalizeCategory(error.error_category);
  const responsibility = inferResponsibility(normalizedType, normalizedCategory);
  const severity = inferSeverity(Number(error.amount ?? 0));
  const reporter = error.created_by ? actorMaps.creators.get(error.created_by) ?? null : null;
  return {
    ...error,
    normalizedType,
    normalizedCategory,
    responsibility,
    severity,
    actionHint: getActionHint(responsibility, normalizedCategory),
    attributions: inferAttributions(error, actorMaps),
    reporter,
    reviewStatus: normalizeReviewStatus(error.review_status),
    detailedCause: error.detailed_cause ?? extractStructuredField(error.description, "Causa precisa"),
    processOrigin: error.process_origin ?? extractStructuredField(error.description, "Origine processo"),
    verifyRole: error.verify_role ?? extractStructuredField(error.description, "Soggetto da verificare"),
    correctiveAction: error.corrective_action ?? extractStructuredField(error.description, "Azione correttiva"),
    aiRecommendation: error.ai_recommendation ?? null,
    operationalDetail: extractStructuredField(error.description, "Dettaglio") ?? error.description,
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

function parseErrorDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = parseISO(value);
  return isValid(parsed) ? parsed : null;
}

function getErrorAmount(value: number | null | undefined): number {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

function getActorKey(actor: ActorRef): string {
  return `${actor.kind}:${actor.id}`;
}

function getConfidenceScore(confidence: Attribution["confidence"]): number {
  if (confidence === "alta") return 90;
  if (confidence === "media") return 60;
  return 30;
}

function getAttributionAction(item: {
  actor: ActorRef;
  high: number;
  topCause: string;
  amount: number;
  count: number;
}) {
  if (item.actor.kind === "supplier") {
    return item.high > 0
      ? "Apri verifica fornitore: DDT, foto danni, reclamo e blocco riordini critici."
      : "Controlla condizioni fornitore e ricorrenza su materiali/ritardi.";
  }
  if (item.actor.kind === "employee") {
    return "Pianifica confronto operativo: checklist posa, rilievi e correzione processo.";
  }
  if (item.actor.kind === "subcontractor") {
    return "Rivedi SLA subappalto, qualità consegna e trattenute su lavorazioni ricorrenti.";
  }
  if (item.actor.kind === "salesperson") {
    return "Rivedi passaggio commerciale-tecnico: misure, quantità e informazioni cliente.";
  }
  return "Manca un collegamento operativo: assegna venditore, fornitore, squadra o operaio alla commessa.";
}

function formatErrorDate(value: string | null | undefined): string {
  const parsed = parseErrorDate(value);
  return parsed ? format(parsed, "dd/MM/yyyy") : "Data mancante";
}

function csvEscape(value: string | number | null | undefined): string {
  return escapeCsvCell(value, ";");
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

export default function GlobalErrors() {
  const companyId = useEffectiveCompanyId();
  const queryClient = useQueryClient();

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [localFilters, setLocalFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [attributionFilter, setAttributionFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ key: ErrorSortKey; direction: SortDirection }>({
    key: "date",
    direction: "desc",
  });

  const activeFilterCount = countActiveFilters(filters) + (attributionFilter !== "all" ? 1 : 0);

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
    setAttributionFilter("all");
    setFiltersOpen(false);
  };

  const applyQuickFilter = (patch: Partial<FilterState>) => {
    const next = { ...EMPTY_FILTERS, ...patch };
    setLocalFilters(next);
    setFilters(next);
  };

  const handleSort = (key: ErrorSortKey) => {
    setSort((current) => ({
      key,
      direction: current.key === key && current.direction === "asc" ? "desc" : "asc",
    }));
  };

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: ReviewStatus }) => {
      const patch: Record<string, unknown> = {
        review_status: status,
        updated_at: new Date().toISOString(),
      };
      if (status === "risolta" || status === "non_imputabile") {
        patch.resolved_at = new Date().toISOString();
      }
      const { error: updateError } = await (supabase.from("order_errors") as any)
        .update(patch)
        .eq("id", id)
        .eq("company_id", companyId);
      if (updateError) throw updateError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["global-errors", companyId] });
      toast.success("Stato anomalia aggiornato");
    },
    onError: (err: any) => {
      const message = String(err?.message ?? "");
      if (/schema cache|column|review_status/i.test(message)) {
        toast.error("Migration richiesta", {
          description: "I nuovi campi workflow non sono ancora presenti nel database.",
        });
        return;
      }
      toast.error("Impossibile aggiornare lo stato");
    },
  });

  const { data: errors = [], isLoading, isFetching, error, refetch } = useQuery({
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
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });

  const errorOrderIds = useMemo(() => [...new Set(errors.map((e) => e.order_id).filter(Boolean))], [errors]);
  const errorCreatorIds = useMemo(() => [...new Set(errors.map((e) => e.created_by).filter(Boolean) as string[])], [errors]);

  const emptyActorMaps = useMemo<ActorMaps>(() => ({
    salespeople: new Map(),
    employees: new Map(),
    subcontractors: new Map(),
    suppliers: new Map(),
    creators: new Map(),
  }), []);

  const { data: actorMaps = emptyActorMaps, isFetching: isFetchingActors } = useQuery({
    queryKey: ["order-error-attribution-actors", companyId, errorOrderIds, errorCreatorIds],
    enabled: !!companyId && errorOrderIds.length > 0,
    queryFn: async (): Promise<ActorMaps> => {
      const [salespeopleRes, employeesRes, teamsRes, itemsRes, creatorsRes] = await Promise.all([
        supabase
          .from("order_salespeople")
          .select("order_id, salesperson_id, salesperson:salespeople(id, first_name, last_name)")
          .in("order_id", errorOrderIds),
        supabase
          .from("order_employees")
          .select("order_id, employee_id, employee:employees(id, first_name, last_name)")
          .in("order_id", errorOrderIds),
        supabase
          .from("order_external_teams")
          .select("order_id, external_team_id, external_team:external_teams(id, name)")
          .in("order_id", errorOrderIds),
        supabase
          .from("order_items")
          .select("order_id, supplier_id, supplier:suppliers(id, name)")
          .in("order_id", errorOrderIds),
        errorCreatorIds.length > 0
          ? supabase
              .from("profiles")
              .select("id, first_name, last_name, email")
              .in("id", errorCreatorIds)
          : Promise.resolve({ data: [], error: null }),
      ]);

      const firstError = [salespeopleRes.error, employeesRes.error, teamsRes.error, itemsRes.error, creatorsRes.error].find(Boolean);
      if (firstError) throw firstError;

      const maps: ActorMaps = {
        salespeople: new Map(),
        employees: new Map(),
        subcontractors: new Map(),
        suppliers: new Map(),
        creators: new Map(),
      };
      const pushActor = (map: Map<string, ActorRef[]>, orderId: string, actor: ActorRef) => {
        const existing = map.get(orderId) ?? [];
        if (!existing.some((item) => item.kind === actor.kind && item.id === actor.id)) {
          existing.push(actor);
        }
        map.set(orderId, existing);
      };

      (salespeopleRes.data ?? []).forEach((row: any) => {
        const person = row.salesperson;
        if (!person) return;
        const name = `${person.first_name ?? ""} ${person.last_name ?? ""}`.trim() || "Venditore senza nome";
        pushActor(maps.salespeople, row.order_id, { id: row.salesperson_id, name, kind: "salesperson" });
      });
      (employeesRes.data ?? []).forEach((row: any) => {
        const person = row.employee;
        if (!person) return;
        const name = `${person.first_name ?? ""} ${person.last_name ?? ""}`.trim() || "Operaio senza nome";
        pushActor(maps.employees, row.order_id, { id: row.employee_id, name, kind: "employee" });
      });
      (teamsRes.data ?? []).forEach((row: any) => {
        const team = row.external_team;
        if (!team) return;
        pushActor(maps.subcontractors, row.order_id, { id: row.external_team_id, name: team.name || "Subappaltatore senza nome", kind: "subcontractor" });
      });
      (itemsRes.data ?? []).forEach((row: any) => {
        const supplier = row.supplier;
        if (!supplier || !row.supplier_id) return;
        pushActor(maps.suppliers, row.order_id, { id: row.supplier_id, name: supplier.name || "Fornitore senza nome", kind: "supplier" });
      });
      (creatorsRes.data ?? []).forEach((profile: any) => {
        const name = `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() || profile.email || "Utente";
        maps.creators.set(profile.id, { id: profile.id, name, kind: "creator" });
      });

      return maps;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const enrichedErrors = useMemo(() => errors.map((item) => enrichError(item, actorMaps)), [errors, actorMaps]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const result = enrichedErrors.filter((e) => {
      if (filters.category !== "all" && e.normalizedCategory !== filters.category) return false;
      if (filters.type !== "all" && e.normalizedType !== filters.type) return false;
      if (filters.responsibility !== "all" && e.responsibility !== filters.responsibility) return false;
      if (filters.severity !== "all" && e.severity !== filters.severity) return false;
      if (attributionFilter !== "all" && !e.attributions.some((item) => getActorKey(item.actor) === attributionFilter)) return false;
      if (filters.dateFrom || filters.dateTo) {
        const d = parseErrorDate(e.error_date);
        if (!d) return false;
        if (filters.dateFrom && d < filters.dateFrom) return false;
        if (filters.dateTo && d > endOfDay(filters.dateTo)) return false;
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
          e.detailedCause,
          e.processOrigin,
          e.verifyRole,
          REVIEW_STATUS_META[e.reviewStatus].label,
          ...e.attributions.map((item) => item.actor.name),
          ...e.attributions.map((item) => ATTRIBUTION_META[item.actor.kind].label),
          e.reporter?.name,
          e.reporter ? "registrata da" : "",
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
          return parseErrorDate(e.error_date)?.getTime() ?? 0;
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
          return getErrorAmount(e.amount);
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
  }, [enrichedErrors, filters, attributionFilter, search, sort]);

  const stats = useMemo(() => {
    const totalLoss = filtered.reduce((s, e) => s + getErrorAmount(e.amount), 0);
    const critical = filtered.filter((e) => e.severity === "high");
    const thisMonthStart = startOfMonth(new Date());
    const thisMonth = filtered
      .filter((e) => {
        const d = parseErrorDate(e.error_date);
        return d ? d >= thisMonthStart : false;
      })
      .reduce((s, e) => s + getErrorAmount(e.amount), 0);

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
    const detailedTotals = new Map<string, number>();
    const statusTotals: Record<ReviewStatus, number> = {
      aperta: 0,
      in_verifica: 0,
      assegnata: 0,
      risolta: 0,
      non_imputabile: 0,
    };

    filtered.forEach((e) => {
      responsibilityTotals[e.responsibility].amount += getErrorAmount(e.amount);
      responsibilityTotals[e.responsibility].count += 1;
      categoryTotals[e.normalizedCategory] += 1;
      if (e.detailedCause) detailedTotals.set(e.detailedCause, (detailedTotals.get(e.detailedCause) ?? 0) + 1);
      statusTotals[e.reviewStatus] += 1;
    });

    const topResponsibility = Object.entries(responsibilityTotals)
      .filter(([, value]) => value.count > 0)
      .sort((a, b) => b[1].amount - a[1].amount)[0] as
      | [ResponsibilityKey, { amount: number; count: number }]
      | undefined;
    const topCategory = Object.entries(categoryTotals)
      .filter(([, count]) => count > 0)
      .sort((a, b) => b[1] - a[1])[0] as [NormalizedCategory, number] | undefined;
    const topDetailedCause = [...detailedTotals.entries()].sort((a, b) => b[1] - a[1])[0];

    return { totalLoss, critical, thisMonth, responsibilityTotals, topResponsibility, topCategory, topDetailedCause, statusTotals };
  }, [filtered]);

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
      map[e.normalizedCategory] += getErrorAmount(e.amount);
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

  const detailedCauseChart = useMemo(() => {
    const map = new Map<string, { cause: string; amount: number; count: number }>();
    filtered.forEach((errorRow) => {
      const cause = errorRow.detailedCause || CATEGORY_META[errorRow.normalizedCategory].label;
      const current = map.get(cause) ?? { cause, amount: 0, count: 0 };
      current.amount += getErrorAmount(errorRow.amount);
      current.count += 1;
      map.set(cause, current);
    });
    return [...map.values()].sort((a, b) => b.amount - a.amount || b.count - a.count).slice(0, 7);
  }, [filtered]);

  const attributionStats = useMemo(() => {
    const map = new Map<string, {
      actor: ActorRef;
      amount: number;
      count: number;
      high: number;
      score: number;
      causes: Map<NormalizedCategory, number>;
      reasons: Set<string>;
    }>();

    enrichedErrors.forEach((errorRow) => {
      const amount = getErrorAmount(errorRow.amount);
      uniqueActors(errorRow.attributions.map((item) => item.actor)).forEach((actor) => {
        const attribution = errorRow.attributions.find((item) => getActorKey(item.actor) === getActorKey(actor));
        if (!attribution) return;
        const key = getActorKey(actor);
        const current = map.get(key) ?? {
          actor,
          amount: 0,
          count: 0,
          high: 0,
          score: 0,
          causes: new Map<NormalizedCategory, number>(),
          reasons: new Set<string>(),
        };
        current.amount += amount;
        current.count += 1;
        current.high += errorRow.severity === "high" ? 1 : 0;
        current.score += getConfidenceScore(attribution.confidence);
        current.causes.set(errorRow.normalizedCategory, (current.causes.get(errorRow.normalizedCategory) ?? 0) + 1);
        current.reasons.add(attribution.reason);
        map.set(key, current);
      });
    });

    return [...map.values()]
      .map((item) => {
        const topCause = [...item.causes.entries()].sort((a, b) => b[1] - a[1])[0];
        return {
          ...item,
          avgConfidence: item.count > 0 ? Math.round(item.score / item.count) : 0,
          topCause: topCause ? CATEGORY_META[topCause[0]].label : "Nessuna causa",
          topCauseCount: topCause?.[1] ?? 0,
          firstReason: [...item.reasons][0] ?? "Pattern rilevato dal collegamento alla commessa.",
        };
      })
      .filter((item) => item.actor.kind !== "creator")
      .sort((a, b) => b.amount - a.amount || b.count - a.count);
  }, [enrichedErrors]);

  const filteredAttributionStats = useMemo(() => {
    const currentKeys = new Set(filtered.flatMap((errorRow) => errorRow.attributions.map((item) => getActorKey(item.actor))));
    return attributionStats.filter((item) => currentKeys.has(getActorKey(item.actor)));
  }, [attributionStats, filtered]);

  const topAttribution = filteredAttributionStats[0] ?? null;

  const attributionRoleStats = useMemo(() => {
    const map = new Map<AttributionKind, { kind: AttributionKind; amount: number; count: number; actors: number; high: number }>();
    filteredAttributionStats.forEach((item) => {
      const current = map.get(item.actor.kind) ?? {
        kind: item.actor.kind,
        amount: 0,
        count: 0,
        actors: 0,
        high: 0,
      };
      current.amount += item.amount;
      current.count += item.count;
      current.actors += 1;
      current.high += item.high;
      map.set(item.actor.kind, current);
    });
    return [...map.values()].sort((a, b) => b.amount - a.amount || b.count - a.count);
  }, [filteredAttributionStats]);

  const controlPlan = useMemo(() => {
    return filteredAttributionStats
      .filter((item) => item.actor.kind !== "creator")
      .slice(0, 3)
      .map((item) => ({
        key: getActorKey(item.actor),
        title: `${ATTRIBUTION_META[item.actor.kind].label}: ${item.actor.name}`,
        impact: item.amount,
        cases: item.count,
        action: getAttributionAction(item),
      }));
  }, [filteredAttributionStats]);

  const aiExecutiveInsight = useMemo(() => {
    const openCritical = filtered.filter((item) => item.severity === "high" && item.reviewStatus !== "risolta" && item.reviewStatus !== "non_imputabile");
    const topCause = detailedCauseChart[0];
    const topActor = filteredAttributionStats[0];
    if (!topCause && !topActor && openCritical.length === 0) {
      return "Non emergono pattern critici nel perimetro filtrato. Continua a registrare cause precise per migliorare l'analisi.";
    }
    const parts = [];
    if (openCritical.length > 0) parts.push(`${openCritical.length} anomalie critiche sono ancora aperte o in verifica`);
    if (topCause) parts.push(`la causa più costosa è ${topCause.cause} (${formatCurrency(topCause.amount)})`);
    if (topActor) parts.push(`il soggetto più ricorrente da verificare è ${topActor.actor.name}`);
    return `AI controllo perdite: ${parts.join(", ")}. Azione consigliata: parti dal piano di autocontrollo e chiudi prima le anomalie critiche.`;
  }, [detailedCauseChart, filtered, filteredAttributionStats]);

  const highestLoss = filtered[0]
    ? [...filtered].sort((a, b) => getErrorAmount(b.amount) - getErrorAmount(a.amount))[0]
    : null;

  const unassignedCount = filtered.filter((e) => e.responsibility === "unassigned").length;
  const supplierCount = filtered.filter((e) => e.responsibility === "supplier").length;

  const exportFilteredCsv = () => {
    const headers = [
      "Data",
      "Commessa",
      "Descrizione commessa",
      "Registrata da",
      "Sorgente",
      "Causa",
      "Causa precisa",
      "Origine processo",
      "Soggetto da verificare",
      "Stato gestione",
      "Responsabilita",
      "Priorita",
      "Attribuzione probabile",
      "Confidenza",
      "Importo",
      "Descrizione anomalia",
      "Azione suggerita",
    ];
    const rows = filtered.map((e) => [
      formatErrorDate(e.error_date),
      e.orders?.order_code ?? "",
      e.orders?.description ?? "",
      e.reporter?.name ?? "",
      TYPE_META[e.normalizedType].label,
      CATEGORY_META[e.normalizedCategory].label,
      e.detailedCause ?? "",
      e.processOrigin ?? "",
      e.verifyRole ?? "",
      REVIEW_STATUS_META[e.reviewStatus].label,
      RESPONSIBILITY_META[e.responsibility].label,
      SEVERITY_META[e.severity].label,
      e.attributions.map((item) => `${ATTRIBUTION_META[item.actor.kind].label}: ${item.actor.name}`).join(" | "),
      e.attributions.map((item) => item.confidence).join(" | "),
      getErrorAmount(e.amount).toFixed(2),
      e.description ?? "",
      e.actionHint,
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map(csvEscape).join(";"))
      .join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `anomalie-ordini-${format(new Date(), "yyyy-MM-dd")}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

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
        const d = parseErrorDate(e.error_date);
        if (!d) return;
        if (d < m.start || d >= m.end) return;
        const chartKey = TYPE_META[e.normalizedType].chartKey;
        if (chartKey === "supply") row.fornitura += getErrorAmount(e.amount);
        if (chartKey === "execution") row.esecuzione += getErrorAmount(e.amount);
        if (chartKey === "logistics") row.logistica += getErrorAmount(e.amount);
        if (chartKey === "other") row.altro += getErrorAmount(e.amount);
      });
      return row;
    });
  }, [enrichedErrors]);

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <span>Impossibile caricare le anomalie. Riprova tra qualche secondo o verifica i permessi aziendali.</span>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Riprova
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-white to-orange-50/40 px-3 py-3 sm:py-5 shadow-sm sm:px-6">
        <div className="flex flex-col gap-3 sm:gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-2.5 sm:gap-3">
            <div className="flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-amber-400 text-white shadow-[0_4px_12px_rgba(249,115,22,0.3)]">
              <AlertTriangle className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-bold leading-tight tracking-tight text-slate-900 sm:text-2xl">
                Anomalie operative
              </h1>
              <p className="hidden sm:block mt-0.5 text-sm text-slate-500">
                Capisci dove nasce la perdita, chi deve intervenire e quali cause si ripetono.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2.5">
          <div className="relative w-full sm:min-w-[260px] sm:flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Cerca anomalia…"
              aria-label="Cerca commessa, causa o responsabile"
              className="h-10 w-full rounded-md border border-slate-200 bg-background pl-9 pr-3 text-sm shadow-none outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            className="relative h-10 shrink-0 text-xs w-full sm:w-auto"
            onClick={handleOpenFilters}
            aria-label="Apri filtri anomalie"
          >
            <Filter className="h-3.5 w-3.5 sm:mr-1.5" />
            <span>Filtri</span>
            {activeFilterCount > 0 && (
              <span className="ml-1.5 rounded-full bg-orange-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                {activeFilterCount}
              </span>
            )}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <OperationalKpiCard
          label="Totale perdite"
          value={formatCurrency(stats.totalLoss)}
          hint={`${filtered.length} anomalie nel perimetro`}
          icon={TrendingDown}
          tone="red"
        />
        <OperationalKpiCard
          label="Responsabilità principale"
          value={stats.topResponsibility ? RESPONSIBILITY_META[stats.topResponsibility[0]].shortLabel : "Nessuna"}
          hint={
            stats.topResponsibility
              ? `${formatCurrency(stats.topResponsibility[1].amount)} su ${stats.topResponsibility[1].count} casi`
              : "Nessuna anomalia filtrata"
          }
          icon={UserCheck}
          tone="orange"
        />
        <OperationalKpiCard
          label="Anomalie critiche"
          value={String(stats.critical.length)}
          hint={
            stats.critical.length > 0
              ? `${formatCurrency(stats.critical.reduce((s, e) => s + getErrorAmount(e.amount), 0))} da presidiare`
              : "Nessuna perdita sopra soglia"
          }
          icon={Target}
          tone={stats.critical.length > 0 ? "red" : "green"}
        />
        <OperationalKpiCard
          label="Questo mese"
          value={formatCurrency(stats.thisMonth)}
          hint={
            stats.topDetailedCause
              ? `Causa precisa: ${stats.topDetailedCause[0]} (${stats.topDetailedCause[1]})`
              : stats.topCategory
                ? `Causa frequente: ${CATEGORY_META[stats.topCategory[0]].label} (${stats.topCategory[1]})`
              : "Nessuna causa ricorrente"
          }
          icon={CalendarDays}
          tone="blue"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_0.74fr]">
        <Card className="border-slate-200 bg-gradient-to-br from-white to-slate-50/80 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Cosa fare ora</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            <button
              type="button"
              onClick={() => applyQuickFilter({ severity: "high" })}
              className="rounded-xl border border-red-100 bg-red-50/70 p-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm"
            >
              <p className="text-xs font-semibold uppercase text-red-700">Priorità</p>
              <p className="mt-1 text-lg font-bold text-red-700">{stats.critical.length} critiche</p>
              <p className="text-xs text-red-700/80">Isola le anomalie sopra soglia.</p>
            </button>
            <button
              type="button"
              onClick={() => applyQuickFilter({ responsibility: "supplier" })}
              className="rounded-xl border border-orange-100 bg-orange-50/70 p-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm"
            >
              <p className="text-xs font-semibold uppercase text-orange-700">Fornitori</p>
              <p className="mt-1 text-lg font-bold text-orange-700">{supplierCount} casi</p>
              <p className="text-xs text-orange-700/80">Apri reclami e ricorrenze.</p>
            </button>
            <button
              type="button"
              onClick={() => applyQuickFilter({ responsibility: "unassigned" })}
              className="rounded-xl border border-slate-200 bg-white p-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm"
            >
              <p className="text-xs font-semibold uppercase text-slate-600">Governance</p>
              <p className="mt-1 text-lg font-bold text-slate-900">{unassignedCount} da assegnare</p>
              <p className="text-xs text-slate-500">Dai un responsabile operativo.</p>
            </button>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Azioni rapide</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Button
              variant="outline"
              className="justify-start border-slate-200"
              onClick={() => applyQuickFilter({ dateFrom: startOfMonth(new Date()), dateTo: new Date() })}
            >
              <CalendarDays className="mr-2 h-4 w-4 text-orange-500" />
              Vedi solo questo mese
            </Button>
            <Button
              variant="outline"
              className="justify-start border-slate-200"
              onClick={exportFilteredCsv}
              disabled={filtered.length === 0}
            >
              <Download className="mr-2 h-4 w-4 text-orange-500" />
              Esporta anomalie filtrate
            </Button>
            {highestLoss && (
              <Button
                asChild
                variant="outline"
                className="justify-start border-slate-200"
              >
                <Link to={`/azienda/ordini/${highestLoss.order_id}`}>
                  <Target className="mr-2 h-4 w-4 text-red-500" />
                  Apri perdita maggiore: {formatCurrency(getErrorAmount(highestLoss.amount))}
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_0.9fr]">
        <Card className="border-orange-200 bg-gradient-to-br from-orange-50/80 via-white to-white shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-orange-500" />
              AI controllo perdite
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed text-slate-700">{aiExecutiveInsight}</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Stato gestione anomalie</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2 md:grid-cols-5">
            {(Object.entries(REVIEW_STATUS_META) as [ReviewStatus, typeof REVIEW_STATUS_META[ReviewStatus]][]).map(([status, meta]) => {
              const Icon = meta.icon;
              return (
                <div key={status} className="rounded-xl border border-slate-200 bg-slate-50/70 p-2">
                  <div className="flex items-center gap-1.5">
                    <Icon className="h-3.5 w-3.5 text-slate-500" />
                    <span className="text-[11px] font-medium text-slate-600">{meta.label}</span>
                  </div>
                  <p className="mt-1 text-lg font-bold text-slate-950">{stats.statusTotals[status]}</p>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base">Statistiche responsabilità specifiche</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                Il sistema incrocia anomalie, causa, commessa, venditori, operai, subappaltatori e fornitori collegati. Chi registra l'anomalia resta tracciato, ma non viene contato come causa.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {attributionFilter !== "all" && (
                <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setAttributionFilter("all")}>
                  <RotateCcw className="mr-1 h-3 w-3" />
                  Tutti
                </Button>
              )}
              {isFetchingActors && <span className="text-xs text-muted-foreground">Aggiornamento attribuzioni...</span>}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredAttributionStats.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-6 text-center">
              <p className="text-sm font-medium text-slate-700">Nessun collegamento persona/fornitore trovato</p>
              <p className="mt-1 text-xs text-slate-500">
                Assegna venditori, operai, subappaltatori o fornitori alle commesse per attivare l'analisi automatica.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
                {attributionRoleStats.map((role) => {
                  const meta = ATTRIBUTION_META[role.kind];
                  const Icon = meta.icon;
                  return (
                    <div key={role.kind} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                      <div className="flex items-center gap-2">
                        <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg border", meta.color)}>
                          <Icon className="h-3.5 w-3.5" />
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-slate-800">{meta.label}</p>
                          <p className="text-[11px] text-muted-foreground">{role.actors} soggetti</p>
                        </div>
                      </div>
                      <div className="mt-2 flex items-end justify-between gap-2">
                        <p className="text-sm font-bold text-slate-950">{formatCurrency(role.amount)}</p>
                        <p className={cn("text-xs font-semibold", role.high > 0 ? "text-red-600" : "text-slate-500")}>
                          {role.count} casi
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
                {filteredAttributionStats.slice(0, 8).map((item) => {
                  const meta = ATTRIBUTION_META[item.actor.kind];
                  const Icon = meta.icon;
                  const actorKey = getActorKey(item.actor);
                  const active = attributionFilter === actorKey;
                  return (
                    <button
                      key={actorKey}
                      type="button"
                      onClick={() => setAttributionFilter(active ? "all" : actorKey)}
                      className={cn(
                        "rounded-2xl border p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-md",
                        active ? "border-orange-200 bg-orange-50/70 shadow-sm" : "border-slate-200 bg-gradient-to-br from-white to-slate-50/80",
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-3">
                          <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border", meta.color)}>
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-950">{item.actor.name}</p>
                            <p className="text-xs text-muted-foreground">{meta.label}</p>
                          </div>
                        </div>
                        <Badge variant="outline" className={cn("shrink-0 border", meta.color)}>
                          {item.avgConfidence}%
                        </Badge>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <div>
                          <p className="text-lg font-bold text-slate-950">{formatCurrency(item.amount)}</p>
                          <p className="text-[11px] text-muted-foreground">impatto attribuito</p>
                        </div>
                        <div>
                          <p className={cn("text-lg font-bold", item.high > 0 ? "text-red-600" : "text-slate-950")}>{item.count}</p>
                          <p className="text-[11px] text-muted-foreground">casi · {item.high} critici</p>
                        </div>
                      </div>
                      <div className="mt-3 rounded-xl bg-white/75 p-2 text-xs text-slate-600">
                        <span className="font-semibold text-slate-800">Causa top:</span> {item.topCause} ({item.topCauseCount})
                      </div>
                      <p className="mt-2 line-clamp-2 text-[11px] text-muted-foreground">
                        {getAttributionAction(item)}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {(topAttribution || controlPlan.length > 0) && (
        <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
          {topAttribution && (
            <Card className="border-orange-200 bg-orange-50/65 shadow-sm">
              <CardContent className="grid gap-3 p-4 md:grid-cols-[auto_1fr] md:items-start">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-orange-600">
                  <Target className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-orange-950">Pattern principale rilevato</p>
                  <p className="mt-1 text-sm text-orange-800">
                    {ATTRIBUTION_META[topAttribution.actor.kind].label} <strong>{topAttribution.actor.name}</strong> concentra {formatCurrency(topAttribution.amount)} su {topAttribution.count} anomalie. {topAttribution.firstReason}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3 border-orange-200 bg-white/80 text-orange-700 hover:bg-white"
                    onClick={() => setAttributionFilter(getActorKey(topAttribution.actor))}
                  >
                    Analizza pattern
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {controlPlan.length > 0 && (
            <Card className="border-slate-200 bg-white shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Piano di autocontrollo</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Prime azioni suggerite dal sistema in base a impatto, frequenza e responsabilità probabile.
                </p>
              </CardHeader>
              <CardContent className="space-y-2">
                {controlPlan.map((item, index) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setAttributionFilter(item.key)}
                    className="flex w-full gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-left transition-all hover:-translate-y-0.5 hover:border-orange-200 hover:bg-orange-50/40 hover:shadow-sm"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white text-xs font-bold text-orange-600">
                      {index + 1}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-slate-900">{item.title}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {formatCurrency(item.impact)} · {item.cases} casi
                      </span>
                      <span className="mt-1 block text-xs text-slate-600">{item.action}</span>
                    </span>
                  </button>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cause precise ricorrenti</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {detailedCauseChart.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Nessuna causa precisa registrata</p>
            ) : (
              detailedCauseChart.map((item) => {
                const percentage = stats.totalLoss > 0 ? Math.round((item.amount / stats.totalLoss) * 100) : 0;
                return (
                  <div key={item.cause} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="font-medium text-slate-800">{item.cause}</span>
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
          {isFetching && !isLoading && (
            <p className="text-xs text-muted-foreground">Aggiornamento dati in corso...</p>
          )}
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
                  <TableHead>Stato</TableHead>
                  <SortableTableHead active={sort.key === "severity"} direction={sort.direction} onClick={() => handleSort("severity")}>Priorità</SortableTableHead>
                  <SortableTableHead className="text-right" align="right" active={sort.key === "amount"} direction={sort.direction} onClick={() => handleSort("amount")}>Importo</SortableTableHead>
                  <SortableTableHead active={sort.key === "description"} direction={sort.direction} onClick={() => handleSort("description")}>Azione</SortableTableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                      Caricamento anomalie...
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                      Nessuna anomalia trovata
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((e) => {
                    const typeMeta = TYPE_META[e.normalizedType];
                    const TypeIcon = typeMeta.icon;
                    const statusMeta = REVIEW_STATUS_META[e.reviewStatus];
                    const StatusIcon = statusMeta.icon;
                    const orderLabel = e.orders?.order_code || e.orders?.description?.slice(0, 30) || "Commessa non trovata";
                    return (
                      <TableRow key={e.id}>
                        <TableCell className="whitespace-nowrap">{formatErrorDate(e.error_date)}</TableCell>
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
                          <Badge variant="outline" className={cn("gap-1 border", statusMeta.color)}>
                            <StatusIcon className="h-3 w-3" />
                            {statusMeta.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn("border", SEVERITY_META[e.severity].color)}>
                            {SEVERITY_META[e.severity].label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-semibold text-red-600">
                          {formatCurrency(getErrorAmount(e.amount))}
                        </TableCell>
                        <TableCell className="min-w-[300px] max-w-[360px]">
                          <div className="space-y-1">
                            <p className="line-clamp-2 text-sm">{e.operationalDetail || "Nessuna descrizione"}</p>
                            <div className="flex flex-wrap gap-1">
                              {e.detailedCause && (
                                <Badge variant="outline" className="border-orange-200 bg-orange-50 text-[10px] text-orange-700">
                                  Causa: {e.detailedCause}
                                </Badge>
                              )}
                              {e.processOrigin && (
                                <Badge variant="outline" className="border-blue-200 bg-blue-50 text-[10px] text-blue-700">
                                  Origine: {e.processOrigin}
                                </Badge>
                              )}
                            </div>
                            {e.verifyRole && (
                              <p className="text-[11px] text-slate-500">
                                Da verificare: <span className="font-medium text-slate-700">{e.verifyRole}</span>
                              </p>
                            )}
                            {e.reporter && (
                              <p className="text-[11px] text-slate-500">
                                Registrata da: <span className="font-medium text-slate-700">{e.reporter.name}</span>
                              </p>
                            )}
                            <div className="flex flex-wrap gap-1">
                              {e.attributions.slice(0, 2).map((item) => (
                                <Badge
                                  key={`${e.id}-${getActorKey(item.actor)}`}
                                  variant="outline"
                                  className={cn("border text-[10px]", ATTRIBUTION_META[item.actor.kind].color)}
                                >
                                  {ATTRIBUTION_META[item.actor.kind].shortLabel}: {item.actor.name} · {item.confidence}
                                </Badge>
                              ))}
                              {e.attributions.length > 2 && (
                                <Badge variant="outline" className="text-[10px]">
                                  +{e.attributions.length - 2}
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {e.correctiveAction || e.aiRecommendation || e.actionHint}
                            </p>
                            <div className="flex flex-wrap gap-1 pt-1">
                              {e.reviewStatus !== "in_verifica" && e.reviewStatus !== "risolta" && e.reviewStatus !== "non_imputabile" && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 px-2 text-[11px]"
                                  disabled={updateStatusMutation.isPending}
                                  onClick={() => updateStatusMutation.mutate({ id: e.id, status: "in_verifica" })}
                                >
                                  Verifica
                                </Button>
                              )}
                              {e.reviewStatus !== "assegnata" && e.reviewStatus !== "risolta" && e.reviewStatus !== "non_imputabile" && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 px-2 text-[11px]"
                                  disabled={updateStatusMutation.isPending}
                                  onClick={() => updateStatusMutation.mutate({ id: e.id, status: "assegnata" })}
                                >
                                  Assegna
                                </Button>
                              )}
                              {e.reviewStatus !== "risolta" && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 border-green-200 px-2 text-[11px] text-green-700 hover:bg-green-50"
                                  disabled={updateStatusMutation.isPending}
                                  onClick={() => updateStatusMutation.mutate({ id: e.id, status: "risolta" })}
                                >
                                  Risolta
                                </Button>
                              )}
                              {e.reviewStatus !== "non_imputabile" && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-[11px] text-slate-500 hover:text-slate-700"
                                  disabled={updateStatusMutation.isPending}
                                  onClick={() => updateStatusMutation.mutate({ id: e.id, status: "non_imputabile" })}
                                >
                                  Non imputabile
                                </Button>
                              )}
                            </div>
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
