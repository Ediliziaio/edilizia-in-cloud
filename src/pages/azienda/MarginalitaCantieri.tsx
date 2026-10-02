import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import MargineVociDetail from "@/components/marginalita/MargineVociDetail";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { formatCurrency } from "@/lib/formatters";
import { escapeCsvCell } from "@/lib/csvExport";
import { SedeFilterBar } from "@/components/sedi/SedeFilterBar";
import { SedeMargineCard } from "@/components/sedi/SedeMargineCard";
import { useSediAnalytics } from "@/hooks/useSediAnalytics";
import { useCompanyStructure } from "@/hooks/controlloGestione/useCompanyStructure";
import { calculateOrderStructureImpact } from "@/lib/controlloGestione/strutturaCommessa";
import { useSedeFilter } from "@/store/sedeFilterStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Search,
  BarChart3,
  ArrowUpRight,
  Info,
  HardHat,
  RefreshCw,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  FileDown,
  Lightbulb,
  ShieldAlert,
  Target,
} from "lucide-react";
import { cn } from "@/lib/utils";

const MARGINALITA_FETCH_LIMIT = 1000;

interface MarginalitaRow {
  id: string;
  company_id: string;
  order_code: string | null;
  description: string;
  preventivo_contratto: number;
  variazioni_approvate: number;
  preventivo_totale: number;
  costo_acquisti: number;
  costo_materiali_magazzino: number;
  movimenti_magazzino_senza_costo: number;
  costo_errori: number;
  consuntivo: number;
  margine: number;
  margine_perc: number;
  cliente_nome: string;
  work_start_date: string | null;
  work_end_date: string | null;
  percentuale_avanzamento: number | null;
  created_at: string;
}

interface MarginAnomaly {
  id: string;
  order_id: string;
  amount: number | null;
  description: string | null;
  error_type: string | null;
  error_category: string | null;
  detailed_cause?: string | null;
  process_origin?: string | null;
  verify_role?: string | null;
  review_status?: string | null;
}

interface MarginSettings {
  overhead_percentuale?: number | null;
  // Colonna reale di preventivo_impostazioni: prima si chiedevano
  // margine_minimo/target_percentuale (inesistenti → 400, KPI margine muto).
  margine_target_default?: number | null;
  soglia_margine_visibile?: number | null;
}

interface VehicleEstimateRow {
  order_id: string;
  costo_mezzi_stimato: number | null;
  mezzi_usati: number | null;
  giorni_mezzo: number | null;
  mezzi_senza_costo: number | null;
  dati_mezzi_visibili: boolean | null;
}

interface AdjustedMargin {
  source: "automatic" | "fallback";
  structureAmount: number;
  structurePct: number;
  adjustedMargin: number;
  adjustedMarginPct: number;
  months: number | null;
}

type SortDirection = "asc" | "desc";
type MarginalitaSortKey =
  | "order"
  | "cliente"
  | "stato"
  | "preventivo"
  | "consuntivo"
  | "margine"
  | "marginePerc"
  | "overhead"
  | "margineNetto"
  | "acquisti"
  | "errori";

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

function safeNumber(value: number | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** Senza ricavo e almeno un costo registrato il 100% e' solo un falso positivo. */
function hasReliableMargin(row: Pick<MarginalitaRow, "preventivo_totale" | "consuntivo">): boolean {
  return safeNumber(row.preventivo_totale) > 0 && safeNumber(row.consuntivo) > 0;
}

function clampPercentage(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

function normalizeReviewStatus(value: string | null | undefined) {
  const normalized = String(value ?? "aperta").toLowerCase();
  if (["risolta", "non_imputabile"].includes(normalized)) return normalized;
  if (["in_verifica", "assegnata"].includes(normalized)) return normalized;
  return "aperta";
}

function extractStructuredField(description: string | null | undefined, label: string) {
  if (!description) return null;
  const prefix = `${label}:`;
  const line = description
    .split(/\r?\n/)
    .find((item) => item.toLowerCase().startsWith(prefix.toLowerCase()));
  if (!line) return null;
  const value = line.slice(prefix.length).trim();
  return value || null;
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
  align?: "left" | "center" | "right";
}) {
  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground",
          align === "center" && "mx-auto justify-center",
          align === "right" && "ml-auto justify-end",
        )}
      >
        {children}
        <SortIcon active={active} direction={direction} />
      </button>
    </TableHead>
  );
}

function MargineColorClass(perc: number): string {
  if (perc >= 25) return "text-green-600";
  if (perc >= 10) return "text-amber-600";
  return "text-red-600";
}

function MargineProgressClass(perc: number): string {
  if (perc >= 25) return "bg-green-500";
  if (perc >= 10) return "bg-amber-500";
  return "bg-red-500";
}

function MargineBadge({ perc }: { perc: number }) {
  const isPositive = perc >= 0;
  return (
    <Badge
      className={cn(
        "text-xs font-semibold tabular-nums",
        perc >= 25 && "bg-green-100 text-green-800 border-green-200 border",
        perc >= 10 && perc < 25 && "bg-amber-100 text-amber-800 border-amber-200 border",
        perc < 10 && "bg-red-100 text-red-800 border-red-200 border",
      )}
    >
      {isPositive ? "+" : ""}{perc.toFixed(1)}%
    </Badge>
  );
}

function MarginHealthBadge({ perc }: { perc: number }) {
  if (perc < 0) {
    return <Badge className="border border-red-200 bg-red-100 text-red-800">In perdita</Badge>;
  }
  if (perc < 10) {
    return <Badge className="border border-orange-200 bg-orange-100 text-orange-800">Sotto target</Badge>;
  }
  if (perc < 25) {
    return <Badge className="border border-amber-200 bg-amber-100 text-amber-800">Da monitorare</Badge>;
  }
  return <Badge className="border border-green-200 bg-green-100 text-green-800">Sano</Badge>;
}

export default function MarginalitaCantieri() {
  const companyId = useEffectiveCompanyId();
  const [search, setSearch] = useState("");
  const [annoFilter, setAnnoFilter] = useState<string>("tutti");
  const [healthFilter, setHealthFilter] = useState<"tutti" | "critici" | "sotto_target" | "sani">("tutti");
  const [overheadPctOverride, setOverheadPct] = useState<number | null>(null);
  const [targetMarginPctOverride, setTargetMarginPct] = useState<number | null>(null);
  const [drillRow, setDrillRow] = useState<MarginalitaRow | null>(null);
  const [sort, setSort] = useState<{ key: MarginalitaSortKey; direction: SortDirection }>({
    key: "margineNetto",
    direction: "asc",
  });

  const { data: marginalitaData, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["marginalita-cantieri", companyId],
    queryFn: async () => {
      // Limit payload deterministically and expose the cap in UI instead of hiding truncated data.
      const rich = await supabase
        .from("v_ordine_marginalita")
        .select("id, company_id, order_code, description, preventivo_contratto, variazioni_approvate, preventivo_totale, costo_acquisti, costo_materiali_magazzino, movimenti_magazzino_senza_costo, costo_errori, consuntivo, margine, margine_perc, cliente_nome, work_start_date, work_end_date, percentuale_avanzamento, created_at", { count: "exact" })
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false })
        .limit(MARGINALITA_FETCH_LIMIT);

      if (rich.error) {
        const isOldView = /schema cache|column|costo_materiali_magazzino|movimenti_magazzino_senza_costo|percentuale_avanzamento/i
          .test(rich.error.message || "");
        if (!isOldView) throw rich.error;

        const fallback = await supabase
          .from("v_ordine_marginalita")
          .select("id, company_id, order_code, description, preventivo_contratto, variazioni_approvate, preventivo_totale, costo_acquisti, costo_errori, consuntivo, margine, margine_perc, cliente_nome, work_start_date, work_end_date, created_at", { count: "exact" })
          .eq("company_id", companyId!)
          .order("created_at", { ascending: false })
          .limit(MARGINALITA_FETCH_LIMIT);
        if (fallback.error) throw fallback.error;
        return {
          rows: (fallback.data || []).map((row) => ({
            ...row,
            costo_materiali_magazzino: 0,
            movimenti_magazzino_senza_costo: 0,
            percentuale_avanzamento: null as number | null,
          })) as MarginalitaRow[],
          totalCount: fallback.count ?? (fallback.data?.length ?? 0),
        };
      }

      return {
        rows: (rich.data || []) as MarginalitaRow[],
        totalCount: rich.count ?? (rich.data?.length ?? 0),
      };
    },
    enabled: !!companyId,
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const rows = useMemo(() => marginalitaData?.rows ?? [], [marginalitaData]);
  const totalRows = marginalitaData?.totalCount ?? rows.length;
  const hasMoreRows = totalRows > rows.length;

  const {
    data: vehicleEstimates = [],
    isLoading: isLoadingVehicleEstimates,
    refetch: refetchVehicleEstimates,
  } = useQuery({
    queryKey: ["marginalita-costi-mezzi-stimati", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_ordine_costi_mezzi_stimati")
        .select("order_id, costo_mezzi_stimato, mezzi_usati, giorni_mezzo, mezzi_senza_costo, dati_mezzi_visibili")
        .eq("company_id", companyId!);
      if (error) throw error;
      return (data ?? []) as VehicleEstimateRow[];
    },
    enabled: !!companyId,
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const vehicleEstimateByOrder = useMemo(
    () => new Map(vehicleEstimates.map((row) => [row.order_id, row])),
    [vehicleEstimates],
  );

  const { data: marginSettings } = useQuery({
    queryKey: ["preventivo-impostazioni-margin", companyId],
    queryFn: async () => {
      const { data, error } = await (supabase.from("preventivo_impostazioni") as any)
        .select("overhead_percentuale, margine_target_default, soglia_margine_visibile")
        .eq("company_id", companyId!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as MarginSettings | null;
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
  });

  const configuredOverheadPct = marginSettings?.overhead_percentuale;
  const configuredTargetMarginPct = marginSettings?.margine_target_default
    ?? marginSettings?.soglia_margine_visibile;
  const overheadPct = overheadPctOverride
    ?? clampPercentage(Number(configuredOverheadPct ?? 20));
  const targetMarginPct = targetMarginPctOverride
    ?? clampPercentage(Number(configuredTargetMarginPct ?? 10));
  const structure = useCompanyStructure(!!companyId);

  const getAdjustedMargin = useCallback((row: MarginalitaRow): AdjustedMargin => {
    const revenue = safeNumber(row.preventivo_totale);
    const directMargin = safeNumber(row.margine);
    const automatic = calculateOrderStructureImpact({
      directMargin,
      revenue,
      monthlyPerActiveOrder: structure.data?.monthlyPerActiveOrder ?? null,
      workStartDate: row.work_start_date,
      workEndDate: row.work_end_date,
      progressPercent: row.percentuale_avanzamento,
      today: structure.data?.today ?? new Date().toLocaleDateString("en-CA"),
    });

    if (
      automatic.allocatedStructure !== null
      && automatic.marginAfterStructure !== null
      && automatic.marginAfterStructurePct !== null
    ) {
      return {
        source: "automatic" as const,
        structureAmount: automatic.allocatedStructure,
        structurePct: revenue > 0 ? (automatic.allocatedStructure / revenue) * 100 : 0,
        adjustedMargin: automatic.marginAfterStructure,
        adjustedMarginPct: automatic.marginAfterStructurePct,
        months: automatic.months,
      };
    }

    const structureAmount = revenue * (overheadPct / 100);
    const adjustedMargin = directMargin - structureAmount;
    return {
      source: "fallback" as const,
      structureAmount,
      structurePct: overheadPct,
      adjustedMargin,
      adjustedMarginPct: revenue > 0 ? (adjustedMargin / revenue) * 100 : 0,
      months: null,
    };
  }, [overheadPct, structure.data]);

  const orderIds = useMemo(() => rows.map((row) => row.id), [rows]);

  const { data: anomalies = [], isFetching: isFetchingAnomalies } = useQuery({
    queryKey: ["marginalita-anomalie-collegate", companyId, rows.length, rows[0]?.id],
    queryFn: async () => {
      if (orderIds.length === 0) return [] as MarginAnomaly[];
      const limitedOrderIds = orderIds.slice(0, 1000);
      const rich = await (supabase.from("order_errors") as any)
        .select("id, order_id, amount, description, error_type, error_category, detailed_cause, process_origin, verify_role, review_status")
        .eq("company_id", companyId!)
        .in("order_id", limitedOrderIds);
      if (rich.error && /schema cache|column|detailed_cause|review_status/i.test(rich.error.message || "")) {
        const fallback = await (supabase.from("order_errors") as any)
          .select("id, order_id, amount, description, error_type, error_category")
          .eq("company_id", companyId!)
          .in("order_id", limitedOrderIds);
        if (fallback.error) throw fallback.error;
        return (fallback.data || []) as MarginAnomaly[];
      }
      if (rich.error) throw rich.error;
      return (rich.data || []) as MarginAnomaly[];
    },
    enabled: !!companyId && orderIds.length > 0,
    staleTime: 2 * 60 * 1000,
  });

  const anomaliesByOrder = useMemo(() => {
    const map = new Map<string, {
      total: number;
      count: number;
      openTotal: number;
      openCount: number;
      causes: Map<string, { amount: number; count: number }>;
    }>();

    anomalies.forEach((item) => {
      const key = item.order_id;
      if (!key) return;
      const amount = safeNumber(item.amount);
      const status = normalizeReviewStatus(item.review_status);
      const isOpen = status !== "risolta" && status !== "non_imputabile";
      const cause =
        item.detailed_cause ||
        extractStructuredField(item.description, "Causa precisa") ||
        item.error_category ||
        item.error_type ||
        "Non classificata";
      const current = map.get(key) ?? {
        total: 0,
        count: 0,
        openTotal: 0,
        openCount: 0,
        causes: new Map<string, { amount: number; count: number }>(),
      };
      current.total += amount;
      current.count += 1;
      if (isOpen) {
        current.openTotal += amount;
        current.openCount += 1;
      }
      const causeStats = current.causes.get(cause) ?? { amount: 0, count: 0 };
      causeStats.amount += amount;
      causeStats.count += 1;
      current.causes.set(cause, causeStats);
      map.set(key, current);
    });

    return map;
  }, [anomalies]);

  const getOrderAnomalySummary = useCallback((orderId: string) => {
    const summary = anomaliesByOrder.get(orderId);
    if (!summary) return null;
    const topCause = [...summary.causes.entries()]
      .sort((a, b) => b[1].amount - a[1].amount || b[1].count - a[1].count)[0];
    return {
      ...summary,
      topCause: topCause?.[0] ?? null,
      topCauseAmount: topCause?.[1].amount ?? 0,
      topCauseCount: topCause?.[1].count ?? 0,
    };
  }, [anomaliesByOrder]);

  const getMarginDecision = useCallback((row: MarginalitaRow) => {
    const preventivoTotale = safeNumber(row.preventivo_totale);
    const consuntivo = safeNumber(row.consuntivo);
    const adjusted = getAdjustedMargin(row);
    const margineNetto = adjusted.adjustedMarginPct;
    const anomaly = getOrderAnomalySummary(row.id);
    const targetGapPct = Math.max(0, targetMarginPct - margineNetto);
    const recoveryAmount = preventivoTotale * (targetGapPct / 100);

    if (preventivoTotale <= 0) {
      return {
        label: "Ricavo mancante",
        detail: "Ordine senza valore contrattuale: margine non affidabile.",
        tone: "red" as const,
        recoveryAmount,
      };
    }
    if (!hasReliableMargin(row)) {
      return {
        label: "Costi da completare",
        detail: "Nessun costo registrato: il margine non e' ancora calcolabile.",
        tone: "orange" as const,
        recoveryAmount: 0,
      };
    }
    if (margineNetto < 0) {
      return {
        label: "Perdita netta",
        detail: anomaly?.topCause
          ? `Prima causa da chiudere: ${anomaly.topCause}.`
          : "Costi diretti e struttura stimata superano il ricavo.",
        tone: "red" as const,
        recoveryAmount,
      };
    }
    if ((anomaly?.openCount ?? 0) > 0) {
      return {
        label: "Anomalie aperte",
        detail: `${anomaly?.openCount} anomalie non chiuse impattano per ${formatCurrency(anomaly?.openTotal ?? 0)}.`,
        tone: "orange" as const,
        recoveryAmount,
      };
    }
    if (margineNetto < targetMarginPct) {
      return {
        label: "Sotto target",
        detail: `Mancano ${formatCurrency(recoveryAmount)} per arrivare al target dopo struttura ${targetMarginPct.toFixed(1)}%.`,
        tone: "amber" as const,
        recoveryAmount,
      };
    }
    if (consuntivo > preventivoTotale * 0.75) {
      return {
        label: "Costi alti",
        detail: "Consuntivo oltre il 75% del ricavo: controlla acquisti e varianti.",
        tone: "amber" as const,
        recoveryAmount,
      };
    }
    return {
      label: "Sano",
      detail: "Margine dopo struttura sopra target nella vista corrente.",
      tone: "green" as const,
      recoveryAmount,
    };
  }, [getAdjustedMargin, getOrderAnomalySummary, targetMarginPct]);

  // ── Anni disponibili per il filtro ───────────────────────────
  const anniDisponibili = useMemo(() => {
    const anni = new Set(rows.map((r) => new Date(r.created_at).getFullYear().toString()));
    return ["tutti", ...Array.from(anni).sort((a, b) => Number(b) - Number(a))];
  }, [rows]);

  // ── Filtro ───────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let result = rows;
    if (annoFilter !== "tutti") {
      result = result.filter((r) => new Date(r.created_at).getFullYear().toString() === annoFilter);
    }
    if (search.trim()) {
      const s = search.toLowerCase();
      result = result.filter(
        (r) =>
          r.order_code?.toLowerCase().includes(s) ||
          r.description?.toLowerCase().includes(s) ||
          r.cliente_nome?.toLowerCase().includes(s),
      );
    }
    result = result.filter((r) => {
      const reliable = hasReliableMargin(r);
      const netto = getAdjustedMargin(r).adjustedMarginPct;
      if (healthFilter === "critici") return !reliable || netto < 0;
      if (healthFilter === "sotto_target") return reliable && netto >= 0 && netto < targetMarginPct;
      if (healthFilter === "sani") return reliable && netto >= 25;
      return true;
    });
    const getSortValue = (row: MarginalitaRow, key: MarginalitaSortKey) => {
      const adjusted = getAdjustedMargin(row);
      switch (key) {
        case "order":
          return row.order_code ?? row.description ?? "";
        case "cliente":
          return row.cliente_nome ?? "";
        case "stato":
          return hasReliableMargin(row) ? adjusted.adjustedMarginPct : -Infinity;
        case "preventivo":
          return safeNumber(row.preventivo_totale);
        case "consuntivo":
          return safeNumber(row.consuntivo);
        case "margine":
          return safeNumber(row.margine);
        case "marginePerc":
          return safeNumber(row.margine_perc);
        case "overhead":
          return adjusted.structureAmount;
        case "margineNetto":
          return adjusted.adjustedMargin;
        case "acquisti":
          return safeNumber(row.costo_acquisti) + safeNumber(row.costo_materiali_magazzino);
        case "errori":
          return safeNumber(row.costo_errori);
        default:
          return "";
      }
    };

    return [...result].sort((a, b) => {
      const order = compareSortValues(getSortValue(a, sort.key), getSortValue(b, sort.key));
      return sort.direction === "asc" ? order : -order;
    });
  }, [rows, annoFilter, search, healthFilter, targetMarginPct, sort, getAdjustedMargin]);

  const handleSort = (key: MarginalitaSortKey) => {
    setSort((current) => ({
      key,
      direction: current.key === key && current.direction === "asc" ? "desc" : "asc",
    }));
  };

  const exportFilteredCsv = () => {
    const headers = [
      "Ordine",
      "Cliente",
      "Preventivo",
      "Consuntivo",
      "Margine diretto",
      "Margine diretto %",
      "Metodo struttura",
      "Quota struttura euro",
      "Quota struttura %",
      "Target dopo struttura %",
      "Margine dopo struttura %",
      "Margine dopo struttura euro",
      "Acquisti ODA",
      "Materiali da scorta",
      "Mezzi stimati fuori consuntivo",
      "Mezzi assegnati",
      "Mezzi senza costo configurato",
      "Anomalie",
      "Anomalie aperte",
      "Motivo rischio",
      "Azione",
    ];
    const rowsCsv = filtered.map((row) => {
      const preventivoTotale = safeNumber(row.preventivo_totale);
      const adjusted = getAdjustedMargin(row);
      const decision = getMarginDecision(row);
      const anomaly = getOrderAnomalySummary(row.id);
      const reliable = hasReliableMargin(row);
      return [
        row.order_code ?? "",
        row.cliente_nome ?? "",
        preventivoTotale.toFixed(2),
        safeNumber(row.consuntivo).toFixed(2),
        reliable ? safeNumber(row.margine).toFixed(2) : "",
        reliable ? safeNumber(row.margine_perc).toFixed(1) : "",
        adjusted.source === "automatic" ? "Automatica per tempo" : "Fallback percentuale",
        adjusted.structureAmount.toFixed(2),
        adjusted.structurePct.toFixed(1),
        targetMarginPct.toFixed(1),
        reliable ? adjusted.adjustedMarginPct.toFixed(1) : "",
        reliable ? adjusted.adjustedMargin.toFixed(2) : "",
        safeNumber(row.costo_acquisti).toFixed(2),
        safeNumber(row.costo_materiali_magazzino).toFixed(2),
        safeNumber(vehicleEstimateByOrder.get(row.id)?.costo_mezzi_stimato).toFixed(2),
        String(safeNumber(vehicleEstimateByOrder.get(row.id)?.mezzi_usati)),
        String(safeNumber(vehicleEstimateByOrder.get(row.id)?.mezzi_senza_costo)),
        safeNumber(row.costo_errori).toFixed(2),
        String(anomaly?.openCount ?? 0),
        decision.label,
        decision.detail,
      ];
    });
    const csv = [headers, ...rowsCsv]
      .map((row) => row.map((cell) => escapeCsvCell(cell, ";")).join(";"))
      .join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `marginalita-cantieri-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // ── KPI aggregati (su filtered) ──────────────────────────────
  const kpi = useMemo(() => {
    const reliableRows = filtered.filter(hasReliableMargin);
    const totPreventivo = filtered.reduce((s, r) => s + safeNumber(r.preventivo_totale), 0);
    const totConsuntivo = filtered.reduce((s, r) => s + safeNumber(r.consuntivo), 0);
    const reliableRevenue = reliableRows.reduce((s, r) => s + safeNumber(r.preventivo_totale), 0);
    const totMargine = reliableRows.reduce((s, r) => s + safeNumber(r.margine), 0);
    const avgMarginePerc = reliableRevenue > 0 ? (totMargine / reliableRevenue) * 100 : 0;
    const cantierInRosso = reliableRows.filter((r) => safeNumber(r.margine_perc) < 0).length;
    const adjustedMarginTotal = reliableRows.reduce((sum, row) => sum + getAdjustedMargin(row).adjustedMargin, 0);
    const allocatedStructureTotal = reliableRows.reduce((sum, row) => sum + getAdjustedMargin(row).structureAmount, 0);
    const avgMargineNettoPerc = reliableRevenue > 0 ? (adjustedMarginTotal / reliableRevenue) * 100 : 0;
    const incompleteCount = filtered.length - reliableRows.length;
    const riskCount = filtered.filter((r) => !hasReliableMargin(r) || getAdjustedMargin(r).adjustedMarginPct < targetMarginPct).length;
    const errorCost = filtered.reduce((s, r) => s + safeNumber(r.costo_errori), 0);
    const purchaseCost = filtered.reduce(
      (s, r) => s + safeNumber(r.costo_acquisti) + safeNumber(r.costo_materiali_magazzino),
      0,
    );
    const vehicleEstimateTotal = filtered.reduce(
      (sum, row) => sum + safeNumber(vehicleEstimateByOrder.get(row.id)?.costo_mezzi_stimato),
      0,
    );
    const vehiclesUsed = filtered.reduce(
      (sum, row) => sum + safeNumber(vehicleEstimateByOrder.get(row.id)?.mezzi_usati),
      0,
    );
    const vehiclesWithoutCost = filtered.reduce(
      (sum, row) => sum + safeNumber(vehicleEstimateByOrder.get(row.id)?.mezzi_senza_costo),
      0,
    );
    const targetRecovery = filtered.reduce((sum, row) => sum + getMarginDecision(row).recoveryAmount, 0);
    const openAnomalyCost = filtered.reduce((sum, row) => sum + (getOrderAnomalySummary(row.id)?.openTotal ?? 0), 0);
    const openAnomalyCount = filtered.reduce((sum, row) => sum + (getOrderAnomalySummary(row.id)?.openCount ?? 0), 0);
    return {
      totPreventivo,
      totConsuntivo,
      totMargine,
      avgMarginePerc,
      cantierInRosso,
      avgMargineNettoPerc,
      adjustedMarginTotal,
      allocatedStructureTotal,
      reliableCount: reliableRows.length,
      incompleteCount,
      riskCount,
      errorCost,
      purchaseCost,
      vehicleEstimateTotal,
      vehiclesUsed,
      vehiclesWithoutCost,
      targetRecovery,
      openAnomalyCost,
      openAnomalyCount,
    };
  }, [filtered, targetMarginPct, vehicleEstimateByOrder, getAdjustedMargin, getMarginDecision, getOrderAnomalySummary]);

  const marginControl = useMemo(() => {
    const riskRows = filtered
      .map((row) => {
        const decision = getMarginDecision(row);
        const margineNetto = getAdjustedMargin(row).adjustedMarginPct;
        return { row, decision, margineNetto };
      })
      .filter((item) => item.decision.tone !== "green")
      .sort((a, b) => b.decision.recoveryAmount - a.decision.recoveryAmount || a.margineNetto - b.margineNetto);

    const causeMap = new Map<string, { amount: number; count: number; openAmount: number }>();
    filtered.forEach((row) => {
      const summary = getOrderAnomalySummary(row.id);
      if (!summary) return;
      summary.causes.forEach((value, cause) => {
        const current = causeMap.get(cause) ?? { amount: 0, count: 0, openAmount: 0 };
        current.amount += value.amount;
        current.count += value.count;
        current.openAmount += summary.topCause === cause ? summary.openTotal : 0;
        causeMap.set(cause, current);
      });
    });

    const topCauses = [...causeMap.entries()]
      .map(([cause, value]) => ({ cause, ...value }))
      .sort((a, b) => b.amount - a.amount || b.count - a.count)
      .slice(0, 5);

    const insight = riskRows.length > 0
      ? `${riskRows.length} commesse richiedono attenzione. Gap economico calcolabile rispetto al target dopo struttura ${targetMarginPct.toFixed(1)}%: ${formatCurrency(kpi.targetRecovery)}.${kpi.incompleteCount > 0 ? ` ${kpi.incompleteCount} senza costi completi.` : ""}`
      : `Le commesse filtrate sono sopra il target dopo struttura ${targetMarginPct.toFixed(1)}%.`;

    return { riskRows: riskRows.slice(0, 5), topCauses, insight };
  }, [filtered, targetMarginPct, kpi.incompleteCount, kpi.targetRecovery, getAdjustedMargin, getMarginDecision, getOrderAnomalySummary]);

  const { sediSelezionate, periodo } = useSedeFilter();
  const { data: sediData, isLoading: sediLoading } = useSediAnalytics({
    da: periodo.da,
    a:  periodo.a,
  });
  const sediVisibili = (sediData?.sedi ?? [])
    .filter((s) => sediSelezionate.length === 0 || sediSelezionate.includes(s.sede_id))
    .sort((a, b) => b.margine_pct - a.margine_pct);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="testata-pagina rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-white to-orange-50/40 px-3 sm:px-6 py-3 sm:py-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-2.5 sm:gap-3">
          <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-xl bg-gradient-to-br from-orange-500 to-eic-amber text-white flex items-center justify-center shrink-0 shadow-[0_4px_12px_rgba(249,115,22,0.3)]">
            <BarChart3 className="h-4 w-4 sm:h-5 sm:w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-2xl font-bold text-slate-900 tracking-tight leading-tight">Marginalità Cantieri</h1>
            <p className="hidden sm:block text-sm text-slate-500 mt-0.5">
              Controlla preventivo, costi diretti e struttura per capire quali commesse stanno erodendo margine.
            </p>
          </div>
        </div>
          <div className="flex flex-wrap gap-1.5 sm:gap-2">
            <Button variant="outline" size="sm" onClick={exportFilteredCsv} disabled={isLoading || filtered.length === 0} className="shrink-0" aria-label="Esporta vista CSV">
              <FileDown className="h-3.5 w-3.5 sm:mr-1.5" />
              <span className="hidden sm:inline">Esporta vista</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void refetch();
                void refetchVehicleEstimates();
              }}
              disabled={isFetching}
              className="shrink-0"
              aria-label="Aggiorna dati"
            >
              <RefreshCw className={cn("h-3.5 w-3.5 sm:mr-1.5", isFetching && "animate-spin")} />
              <span className="hidden sm:inline">Aggiorna dati</span>
            </Button>
          </div>
        </div>
      </div>

      <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="overflow-hidden border-slate-200 bg-eic-navy-deep text-white shadow-sm">
          <CardContent className="space-y-4 p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="flex gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-500/95 shadow-[0_10px_24px_rgba(249,115,22,0.28)]">
                  <ShieldAlert className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-100">Marginalità commesse</p>
                  <h2 className="mt-1 text-lg font-semibold">Cosa è già eroso e cosa puoi ancora correggere</h2>
                  <p className="mt-1 max-w-2xl text-sm text-blue-100/85">
                    {marginControl.insight}
                    {isFetchingAnomalies ? " Sto aggiornando le anomalie collegate..." : ""}
                  </p>
                </div>
              </div>
              <Badge className="w-fit border border-white/20 bg-white/10 text-white hover:bg-white/10">
                Target dopo struttura {targetMarginPct.toFixed(1)}%
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              <div className="rounded-xl border border-white/10 bg-white/10 p-3">
                <p className="text-[11px] font-semibold uppercase text-blue-100">Margine diretto</p>
                <p className="mt-1 text-xl font-bold">{kpi.reliableCount > 0 ? formatCurrency(kpi.totMargine) : "—"}</p>
                <p className="text-xs text-blue-100/75">{kpi.reliableCount} commesse calcolabili</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/10 p-3">
                <p className="text-[11px] font-semibold uppercase text-blue-100">Dopo struttura</p>
                <p className="mt-1 text-xl font-bold">{kpi.reliableCount > 0 ? formatCurrency(kpi.adjustedMarginTotal) : "—"}</p>
                <p className="text-xs text-blue-100/75">{kpi.reliableCount > 0 ? `${kpi.avgMargineNettoPerc.toFixed(1)}% medio` : "dati da completare"}</p>
              </div>
              <div className="rounded-xl border border-orange-300/30 bg-orange-400/15 p-3">
                <p className="text-[11px] font-semibold uppercase text-orange-100">Gap dal target</p>
                <p className="mt-1 text-xl font-bold">{formatCurrency(kpi.targetRecovery)}</p>
                <p className="text-xs text-orange-100/75">da recuperare o compensare</p>
              </div>
              <div className="rounded-xl border border-red-300/30 bg-red-400/15 p-3">
                <p className="text-[11px] font-semibold uppercase text-red-100">Da controllare</p>
                <p className="mt-1 text-xl font-bold">{kpi.riskCount}</p>
                <p className="text-xs text-red-100/75">{kpi.incompleteCount} con dati incompleti</p>
              </div>
            </div>
            <p className="text-xs text-blue-100/70">
              Le stime di struttura e mezzi restano separate dal consuntivo. Apri una commessa prioritaria per completare i controlli e intervenire sui costi.
            </p>
          </CardContent>
        </Card>

        <Card className="border-orange-100 bg-orange-50/50 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base text-orange-950">
              <Lightbulb className="h-4 w-4 text-orange-600" />
              Azioni operative
            </CardTitle>
            <p className="text-xs text-orange-800/80">
              Il badge indica il gap rispetto al target: apri la commessa e verifica anomalie, acquisti e varianti.
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {marginControl.riskRows.length === 0 ? (
              <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                Nessuna commessa sotto soglia nella vista corrente. Mantieni aggiornati acquisti e anomalie.
              </div>
            ) : (
              marginControl.riskRows.slice(0, 3).map(({ row, decision }) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => setDrillRow(row)}
                  className="w-full rounded-xl border border-orange-100 bg-white p-3 text-left transition-all hover:-translate-y-0.5 hover:border-orange-200 hover:shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-950">
                        {row.order_code ? `#${row.order_code}` : "Commessa"} · {row.cliente_nome || "Cliente non indicato"}
                      </p>
                      <p className="mt-1 text-xs text-slate-600">{decision.detail}</p>
                    </div>
                    <Badge className="shrink-0 border border-orange-200 bg-orange-50 text-orange-700">
                      {formatCurrency(decision.recoveryAmount)}
                    </Badge>
                  </div>
                </button>
              ))
            )}
          </CardContent>
        </Card>
      </section>

      {/* ── Performance per Sede ───────────────────────────── */}
      {(sediVisibili.length > 0 || sediLoading) && (
        <section className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-lg font-semibold text-eic-navy">Performance per Sede</h2>
            <SedeFilterBar />
          </div>
          {sediLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-48 animate-pulse bg-muted rounded-lg" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {sediVisibili.map((sede) => (
                <SedeMargineCard
                  key={sede.sede_id}
                  sede={sede}
                />
              ))}
            </div>
          )}
        </section>
      )}

      <details className="group rounded-2xl border border-slate-200 bg-white shadow-sm">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-slate-800">
          <span>Dettagli economici e ipotesi di calcolo</span>
          <span className="text-xs font-normal text-muted-foreground group-open:hidden">Mostra</span>
          <span className="hidden text-xs font-normal text-muted-foreground group-open:inline">Nascondi</span>
        </summary>
        <div className="grid gap-4 border-t border-slate-100 p-4 text-sm sm:grid-cols-2 xl:grid-cols-4">
          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground">Ricavi e consuntivo</p>
            <p className="mt-1 font-semibold">{formatCurrency(kpi.totPreventivo)} · {formatCurrency(kpi.totConsuntivo)}</p>
            <p className="text-xs text-muted-foreground">preventivo totale · costi registrati</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground">Materiali</p>
            <p className="mt-1 font-semibold">{formatCurrency(kpi.purchaseCost)}</p>
            <p className="text-xs text-muted-foreground">acquisti e prelievi da scorta</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-sky-700">Mezzi stimati</p>
            <p className="mt-1 font-semibold">{isLoadingVehicleEstimates ? "—" : formatCurrency(kpi.vehicleEstimateTotal)}</p>
            <p className="text-xs text-muted-foreground">fuori consuntivo · {kpi.vehiclesUsed} assegnazioni{kpi.vehiclesWithoutCost > 0 ? ` · ${kpi.vehiclesWithoutCost} senza costo` : ""}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-red-700">Errori e anomalie</p>
            <p className="mt-1 font-semibold">{formatCurrency(kpi.errorCost)}</p>
            <p className="text-xs text-muted-foreground">{kpi.openAnomalyCount} ancora da verificare</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-blue-700">Struttura mensile</p>
            <p className="mt-1 font-semibold">{structure.data ? formatCurrency(structure.data.monthlyStructure) : "—"}</p>
            <p className="text-xs text-muted-foreground">costi fissi e personale d'ufficio</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-blue-700">Quota per commessa</p>
            <p className="mt-1 font-semibold">{structure.data?.monthlyPerActiveOrder ? formatCurrency(structure.data.monthlyPerActiveOrder) : "—"}</p>
            <p className="text-xs text-muted-foreground">{structure.data?.activeOrders ?? "—"} commesse attive</p>
          </div>
          <div className="sm:col-span-2">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Metodo</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              La struttura viene ripartita automaticamente nel tempo. Se mancano date o dati viene applicato il fallback del {overheadPct.toFixed(1)}%. Mezzi e struttura sono letture gestionali e non modificano il consuntivo contabile.
            </p>
          </div>
        </div>
      </details>

      {hasMoreRows && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Vista limitata alle prime {rows.length.toLocaleString("it-IT")} commesse su {totalRows.toLocaleString("it-IT")}.
          Raffina ricerca o periodo per analisi operative precise su grandi volumi.
        </div>
      )}

      {/* ── Filtri ─────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm">
      <div className="flex flex-col flex-wrap gap-2.5 sm:flex-row">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cerca ordine, cliente..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 border-slate-200 pl-9 shadow-none"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground whitespace-nowrap">Fallback struttura %</label>
          <Input
            type="number"
            min={0}
            max={100}
            step={1}
            value={overheadPct}
            onChange={(e) => setOverheadPct(clampPercentage(Number(e.target.value)))}
            className="w-20 h-8 text-sm"
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs max-w-[240px]">Usato solo quando la ripartizione automatica non può essere calcolata, per esempio se manca la data di inizio commessa.</p>
            </TooltipContent>
          </Tooltip>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground whitespace-nowrap">Target dopo struttura %</label>
          <Input
            type="number"
            min={0}
            max={100}
            step={1}
            value={targetMarginPct}
            onChange={(e) => setTargetMarginPct(clampPercentage(Number(e.target.value)))}
            className="w-20 h-8 text-sm"
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <Target className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs max-w-[220px]">Soglia minima dopo l'incidenza stimata della struttura, usata per calcolare il gap e ordinare le priorità operative.</p>
            </TooltipContent>
          </Tooltip>
        </div>
        <div className="flex gap-2 flex-wrap">
          {[
            { key: "tutti", label: "Tutti" },
            { key: "critici", label: "In perdita" },
            { key: "sotto_target", label: "Sotto target" },
            { key: "sani", label: "Sani" },
          ].map((item) => (
            <button
              key={item.key}
              onClick={() => setHealthFilter(item.key as typeof healthFilter)}
              className={cn(
                "rounded-lg border px-3 py-2 text-sm transition-colors",
                healthFilter === item.key
                  ? "border-orange-200 bg-orange-50 font-semibold text-slate-950 shadow-sm"
                  : "border-slate-200 text-muted-foreground hover:bg-slate-50 hover:text-slate-900",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2 flex-wrap">
          {anniDisponibili.map((anno) => (
            <button
              key={anno}
              onClick={() => setAnnoFilter(anno)}
              className={cn(
                "rounded-lg border px-3 py-2 text-sm transition-colors",
                annoFilter === anno
                  ? "border-orange-200 bg-orange-50 font-semibold text-slate-950 shadow-sm"
                  : "border-slate-200 text-muted-foreground hover:bg-slate-50 hover:text-slate-900",
              )}
            >
              {anno === "tutti" ? "Tutti" : anno}
            </button>
          ))}
        </div>
        </div>
      </div>

      {/* ── Tabella Desktop ────────────────────────────────── */}
      <Card className="hidden md:block">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            Dettaglio per cantiere
            {filtered.length !== rows.length && (
              <Badge variant="secondary" className="text-xs">{filtered.length} / {rows.length}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-3 p-6 text-center">
              <p className="text-sm text-destructive">Errore nel caricamento dati.</p>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                Riprova
              </Button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <HardHat className="h-12 w-12 text-muted-foreground/40" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium text-foreground">Nessun cantiere trovato</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {rows.length === 0
                    ? "I dati di marginalità appariranno qui una volta creati gli ordini."
                    : "Prova a modificare i filtri di ricerca."}
                </p>
              </div>
              {rows.length === 0 && (
                <Link to="/azienda/ordini/nuovo" className="text-xs font-medium text-primary hover:underline flex items-center gap-1">
                  <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                  Crea il primo ordine
                </Link>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead active={sort.key === "order"} direction={sort.direction} onClick={() => handleSort("order")}>Ordine</SortableTableHead>
                  <SortableTableHead active={sort.key === "cliente"} direction={sort.direction} onClick={() => handleSort("cliente")}>Cliente</SortableTableHead>
                  <SortableTableHead active={sort.key === "stato"} direction={sort.direction} onClick={() => handleSort("stato")}>Stato</SortableTableHead>
                  <SortableTableHead className="text-right" align="right" active={sort.key === "preventivo"} direction={sort.direction} onClick={() => handleSort("preventivo")}>Preventivo</SortableTableHead>
                  <SortableTableHead className="text-right" align="right" active={sort.key === "consuntivo"} direction={sort.direction} onClick={() => handleSort("consuntivo")}>Consuntivo</SortableTableHead>
                  <SortableTableHead className="text-right" align="right" active={sort.key === "margine"} direction={sort.direction} onClick={() => handleSort("margine")}>Margine diretto €</SortableTableHead>
                  <SortableTableHead className="text-center w-32" align="center" active={sort.key === "marginePerc"} direction={sort.direction} onClick={() => handleSort("marginePerc")}>Margine diretto %</SortableTableHead>
                  <SortableTableHead className="text-right" align="right" active={sort.key === "overhead"} direction={sort.direction} onClick={() => handleSort("overhead")}>Quota struttura</SortableTableHead>
                  <SortableTableHead className="text-right" align="right" active={sort.key === "margineNetto"} direction={sort.direction} onClick={() => handleSort("margineNetto")}>Dopo struttura</SortableTableHead>
                  <SortableTableHead className="text-right" align="right" active={sort.key === "acquisti"} direction={sort.direction} onClick={() => handleSort("acquisti")}>Materiali</SortableTableHead>
                  <SortableTableHead className="text-right" align="right" active={sort.key === "errori"} direction={sort.direction} onClick={() => handleSort("errori")}>Errori</SortableTableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((row) => {
                  const preventivoTotale = safeNumber(row.preventivo_totale);
                  const consuntivo = safeNumber(row.consuntivo);
                  const margine = safeNumber(row.margine);
                  const marginePerc = safeNumber(row.margine_perc);
                  const costoAcquisti = safeNumber(row.costo_acquisti);
                  const costoMagazzino = safeNumber(row.costo_materiali_magazzino);
                  const costoErrori = safeNumber(row.costo_errori);
                  const adjusted = getAdjustedMargin(row);
                  const margineNetto = adjusted.adjustedMarginPct;
                  const margineNettoAbs = adjusted.adjustedMargin;
                  const overheadAllocato = adjusted.structureAmount;
                  const decision = getMarginDecision(row);
                  const anomaly = getOrderAnomalySummary(row.id);
                  const reliable = hasReliableMargin(row);
                  return (
                    <TableRow
                      key={row.id}
                      className="group cursor-pointer hover:bg-primary/5 transition-colors"
                      onClick={() => setDrillRow(row)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-1 font-medium text-primary">
                          {row.order_code ? `#${row.order_code}` : "–"}
                          <ArrowUpRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                        <p className="text-xs text-muted-foreground truncate max-w-[180px]">{row.description}</p>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{row.cliente_nome || "–"}</TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          {reliable
                            ? <MarginHealthBadge perc={margineNetto} />
                            : <Badge variant="outline" className="border-orange-200 bg-orange-50 text-orange-700">Dati incompleti</Badge>}
                          <p
                            className={cn(
                              "max-w-[190px] text-xs",
                              decision.tone === "red" && "text-red-600",
                              decision.tone === "orange" && "text-orange-600",
                              decision.tone === "amber" && "text-amber-600",
                              decision.tone === "green" && "text-green-600",
                            )}
                          >
                            {decision.label}
                            {anomaly?.openCount ? ` · ${anomaly.openCount} anomalie aperte` : ""}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(preventivoTotale)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(consuntivo)}</TableCell>
                      <TableCell className={cn("text-right font-semibold", MargineColorClass(marginePerc))}>
                        {reliable ? formatCurrency(margine) : "—"}
                      </TableCell>
                      <TableCell className="text-center">
                        {reliable ? <div className="flex flex-col items-center gap-1">
                          <MargineBadge perc={marginePerc} />
                          <Progress
                            value={clampPercentage(marginePerc)}
                            className="h-1 w-20"
                            indicatorClassName={MargineProgressClass(marginePerc)}
                          />
                        </div> : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">
                        <span title={adjusted.source === "automatic"
                          ? `${adjusted.months?.toFixed(1) ?? "—"} mesi × quota mensile automatica`
                          : `Fallback del ${adjusted.structurePct.toFixed(1)}% sul ricavo`}>
                          {formatCurrency(overheadAllocato)}
                        </span>
                        <span className="ml-1 text-[10px] uppercase text-slate-400">
                          {adjusted.source === "automatic" ? "auto" : "fallback"}
                        </span>
                      </TableCell>
                      <TableCell className={cn("text-right font-semibold text-sm", MargineColorClass(margineNetto))}>
                        {reliable ? <>{formatCurrency(margineNettoAbs)}
                        <span className="text-xs ml-1">({margineNetto.toFixed(1)}%)</span></> : "—"}
                      </TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">
                        {costoAcquisti + costoMagazzino > 0 ? (
                          <span title={`${formatCurrency(costoAcquisti)} ODA · ${formatCurrency(costoMagazzino)} scorta`}>
                            {formatCurrency(costoAcquisti + costoMagazzino)}
                          </span>
                        ) : "–"}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {costoErrori > 0 ? (
                          <span className="text-red-600">{formatCurrency(costoErrori)}</span>
                        ) : (
                          <span className="text-muted-foreground">–</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── Card Mobile ────────────────────────────────────── */}
      <div className="md:hidden space-y-3">
        {isLoading ? (
          [1, 2, 3].map((i) => <Skeleton key={i} className="h-28 w-full" />)
        ) : error ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <p className="text-sm text-destructive">Errore nel caricamento dati.</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Riprova
            </Button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
            <HardHat className="h-10 w-10 text-muted-foreground/40" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">
              {rows.length === 0 ? "Crea il primo ordine per vedere i dati di marginalità." : "Nessun cantiere corrisponde ai filtri."}
            </p>
          </div>
        ) : (
          filtered.map((row) => {
            const preventivoTotale = safeNumber(row.preventivo_totale);
            const consuntivo = safeNumber(row.consuntivo);
            const margine = safeNumber(row.margine);
            const marginePerc = safeNumber(row.margine_perc);
            const adjusted = getAdjustedMargin(row);
            const decision = getMarginDecision(row);
            const reliable = hasReliableMargin(row);
            return (
            <Card key={row.id}>
              <CardContent className="pt-4 pb-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link
                      to={`/azienda/ordini/${row.id}`}
                      className="font-medium text-sm hover:text-primary flex items-center gap-1"
                    >
                      {row.order_code ? `#${row.order_code}` : "–"}
                      <ArrowUpRight className="h-3 w-3" />
                    </Link>
                    <p className="text-xs text-muted-foreground truncate">{row.description}</p>
                    {row.cliente_nome && (
                      <p className="text-xs text-muted-foreground">{row.cliente_nome}</p>
                    )}
                  </div>
                  {reliable
                    ? <MargineBadge perc={marginePerc} />
                    : <Badge variant="outline" className="border-orange-200 bg-orange-50 text-orange-700">Dati incompleti</Badge>}
                </div>
                {reliable && <MarginHealthBadge perc={adjusted.adjustedMarginPct} />}
                {decision.tone !== "green" && (
                  <div className="rounded-lg border border-orange-100 bg-orange-50 px-3 py-2 text-xs text-orange-800">
                    <span className="font-semibold">{decision.label}:</span> {decision.detail}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                  <div>
                    <p className="text-muted-foreground">Preventivo</p>
                    <p className="font-medium">{formatCurrency(preventivoTotale)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Consuntivo</p>
                    <p className="font-medium">{formatCurrency(consuntivo)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Margine diretto</p>
                    <p className={cn("font-semibold", MargineColorClass(marginePerc))}>
                      {reliable ? formatCurrency(margine) : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Dopo struttura</p>
                    <p className={cn("font-semibold", MargineColorClass(adjusted.adjustedMarginPct))}>
                      {reliable ? formatCurrency(adjusted.adjustedMargin) : "—"}
                    </p>
                  </div>
                </div>

                {reliable && <Progress
                  value={clampPercentage(marginePerc)}
                  className="h-1.5"
                  indicatorClassName={MargineProgressClass(marginePerc)}
                />}
              </CardContent>
            </Card>
            );
          })
        )}
      </div>

      {/* Drill-down sheet */}
      <MargineVociDetail
        open={!!drillRow}
        onClose={() => setDrillRow(null)}
        row={drillRow}
      />
    </div>
  );
}
