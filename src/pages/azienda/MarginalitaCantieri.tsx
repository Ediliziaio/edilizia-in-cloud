import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import MargineVociDetail from "@/components/marginalita/MargineVociDetail";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { formatCurrency } from "@/lib/formatters";
import { escapeCsvCell } from "@/lib/csvExport";
import { SedeFilterBar } from "@/components/sedi/SedeFilterBar";
import { SedeMargineCard } from "@/components/sedi/SedeMargineCard";
import { OperationalKpiCard } from "@/components/orders/OperationalKpiCard";
import { useSediAnalytics } from "@/hooks/useSediAnalytics";
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
  TrendingUp,
  TrendingDown,
  Search,
  Euro,
  BarChart3,
  AlertTriangle,
  CheckCircle2,
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
  costo_errori: number;
  consuntivo: number;
  margine: number;
  margine_perc: number;
  cliente_nome: string;
  work_start_date: string | null;
  work_end_date: string | null;
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
  margine_minimo_percentuale?: number | null;
  margine_target_percentuale?: number | null;
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
  const [overheadPct, setOverheadPct] = useState(20);
  const [targetMarginPct, setTargetMarginPct] = useState(10);
  const [drillRow, setDrillRow] = useState<MarginalitaRow | null>(null);
  const [sort, setSort] = useState<{ key: MarginalitaSortKey; direction: SortDirection }>({
    key: "margineNetto",
    direction: "asc",
  });

  const { data: marginalitaData, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["marginalita-cantieri", companyId],
    queryFn: async () => {
      // Limit payload deterministically and expose the cap in UI instead of hiding truncated data.
      const { data, error, count } = await supabase
        .from("v_ordine_marginalita")
        .select("id, company_id, order_code, description, preventivo_contratto, variazioni_approvate, preventivo_totale, costo_acquisti, costo_errori, consuntivo, margine, margine_perc, cliente_nome, work_start_date, work_end_date, created_at", { count: "exact" })
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false })
        .limit(MARGINALITA_FETCH_LIMIT);
      if (error) throw error;
      return {
        rows: (data || []) as MarginalitaRow[],
        totalCount: count ?? (data?.length ?? 0),
      };
    },
    enabled: !!companyId,
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const rows = useMemo(() => marginalitaData?.rows ?? [], [marginalitaData]);
  const totalRows = marginalitaData?.totalCount ?? rows.length;
  const hasMoreRows = totalRows > rows.length;

  const { data: marginSettings } = useQuery({
    queryKey: ["preventivo-impostazioni-margin", companyId],
    queryFn: async () => {
      const { data, error } = await (supabase.from("preventivo_impostazioni") as any)
        .select("overhead_percentuale, margine_minimo_percentuale, margine_target_percentuale")
        .eq("company_id", companyId!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as MarginSettings | null;
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (!marginSettings) return;
    if (marginSettings.overhead_percentuale != null) {
      setOverheadPct(clampPercentage(Number(marginSettings.overhead_percentuale)));
    }
    const dbTarget = marginSettings.margine_target_percentuale ?? marginSettings.margine_minimo_percentuale;
    if (dbTarget != null) {
      setTargetMarginPct(clampPercentage(Number(dbTarget)));
    }
  }, [marginSettings]);

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

  const getOrderAnomalySummary = (orderId: string) => {
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
  };

  const getMarginDecision = (row: MarginalitaRow) => {
    const preventivoTotale = safeNumber(row.preventivo_totale);
    const consuntivo = safeNumber(row.consuntivo);
    const marginePerc = safeNumber(row.margine_perc);
    const margineNetto = marginePerc - overheadPct;
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
    if (margineNetto < 0) {
      return {
        label: "Perdita netta",
        detail: anomaly?.topCause
          ? `Prima causa da chiudere: ${anomaly.topCause}.`
          : "Consuntivo e overhead superano il ricavo.",
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
        detail: `Mancano ${formatCurrency(recoveryAmount)} per arrivare al target netto ${targetMarginPct.toFixed(1)}%.`,
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
      detail: "Margine netto sopra target nella vista corrente.",
      tone: "green" as const,
      recoveryAmount,
    };
  };

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
      const netto = safeNumber(r.margine_perc) - overheadPct;
      if (healthFilter === "critici") return netto < 0;
      if (healthFilter === "sotto_target") return netto >= 0 && netto < targetMarginPct;
      if (healthFilter === "sani") return netto >= 25;
      return true;
    });
    const getSortValue = (row: MarginalitaRow, key: MarginalitaSortKey) => {
      const margineNetto = safeNumber(row.margine_perc) - overheadPct;
      const preventivoTotale = safeNumber(row.preventivo_totale);
      const overheadAllocato = preventivoTotale * (overheadPct / 100);
      const margineNettoAbs = preventivoTotale * (margineNetto / 100);
      switch (key) {
        case "order":
          return row.order_code ?? row.description ?? "";
        case "cliente":
          return row.cliente_nome ?? "";
        case "stato":
          return margineNetto;
        case "preventivo":
          return safeNumber(row.preventivo_totale);
        case "consuntivo":
          return safeNumber(row.consuntivo);
        case "margine":
          return safeNumber(row.margine);
        case "marginePerc":
          return safeNumber(row.margine_perc);
        case "overhead":
          return overheadAllocato;
        case "margineNetto":
          return margineNettoAbs;
        case "acquisti":
          return safeNumber(row.costo_acquisti);
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
  }, [rows, annoFilter, search, healthFilter, overheadPct, targetMarginPct, sort]);

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
      "Margine lordo",
      "Margine lordo %",
      "Overhead %",
      "Target netto %",
      "Margine netto %",
      "Margine netto euro",
      "Acquisti",
      "Anomalie",
      "Anomalie aperte",
      "Motivo rischio",
      "Azione",
    ];
    const rowsCsv = filtered.map((row) => {
      const preventivoTotale = safeNumber(row.preventivo_totale);
      const margineNetto = safeNumber(row.margine_perc) - overheadPct;
      const decision = getMarginDecision(row);
      const anomaly = getOrderAnomalySummary(row.id);
      return [
        row.order_code ?? "",
        row.cliente_nome ?? "",
        preventivoTotale.toFixed(2),
        safeNumber(row.consuntivo).toFixed(2),
        safeNumber(row.margine).toFixed(2),
        safeNumber(row.margine_perc).toFixed(1),
        overheadPct.toFixed(1),
        targetMarginPct.toFixed(1),
        margineNetto.toFixed(1),
        (preventivoTotale * (margineNetto / 100)).toFixed(2),
        safeNumber(row.costo_acquisti).toFixed(2),
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
    const totPreventivo = filtered.reduce((s, r) => s + safeNumber(r.preventivo_totale), 0);
    const totConsuntivo = filtered.reduce((s, r) => s + safeNumber(r.consuntivo), 0);
    const totMargine = filtered.reduce((s, r) => s + safeNumber(r.margine), 0);
    const avgMarginePerc = totPreventivo > 0 ? (totMargine / totPreventivo) * 100 : 0;
    const cantierInRosso = filtered.filter((r) => safeNumber(r.margine_perc) < 0).length;
    const avgMargineNettoPerc = avgMarginePerc - overheadPct;
    const riskCount = filtered.filter((r) => safeNumber(r.margine_perc) - overheadPct < targetMarginPct).length;
    const errorCost = filtered.reduce((s, r) => s + safeNumber(r.costo_errori), 0);
    const purchaseCost = filtered.reduce((s, r) => s + safeNumber(r.costo_acquisti), 0);
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
      riskCount,
      errorCost,
      purchaseCost,
      targetRecovery,
      openAnomalyCost,
      openAnomalyCount,
    };
  }, [filtered, overheadPct, targetMarginPct, anomaliesByOrder]);

  const marginControl = useMemo(() => {
    const riskRows = filtered
      .map((row) => {
        const decision = getMarginDecision(row);
        const margineNetto = safeNumber(row.margine_perc) - overheadPct;
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
      ? `${riskRows.length} commesse sono sotto soglia. Gap economico rispetto al target netto ${targetMarginPct.toFixed(1)}%: ${formatCurrency(kpi.targetRecovery)}.`
      : `Le commesse filtrate sono sopra il target netto ${targetMarginPct.toFixed(1)}%.`;

    return { riskRows: riskRows.slice(0, 5), topCauses, insight };
  }, [filtered, overheadPct, targetMarginPct, anomaliesByOrder, kpi.targetRecovery]);

  const recoveryPlan = useMemo(() => {
    const anomalyToVerify = Math.min(kpi.openAnomalyCost, kpi.targetRecovery);
    const compensationGap = Math.max(0, kpi.targetRecovery - anomalyToVerify);
    const avgPerPriorityOrder = marginControl.riskRows.length > 0
      ? kpi.targetRecovery / marginControl.riskRows.length
      : 0;
    return {
      anomalyToVerify,
      compensationGap,
      avgPerPriorityOrder,
    };
  }, [kpi.openAnomalyCost, kpi.targetRecovery, marginControl.riskRows.length]);

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
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-white to-orange-50/40 px-3 sm:px-6 py-3 sm:py-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-2.5 sm:gap-3">
          <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-400 text-white flex items-center justify-center shrink-0 shadow-[0_4px_12px_rgba(249,115,22,0.3)]">
            <BarChart3 className="h-4 w-4 sm:h-5 sm:w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-2xl font-bold text-slate-900 tracking-tight leading-tight">Marginalità Cantieri</h1>
            <p className="hidden sm:block text-sm text-slate-500 mt-0.5">
              Controlla preventivo, acquisti, errori e overhead per capire quali commesse stanno erodendo margine.
            </p>
          </div>
        </div>
          <div className="flex flex-wrap gap-1.5 sm:gap-2">
            <Button variant="outline" size="sm" onClick={exportFilteredCsv} disabled={isLoading || filtered.length === 0} className="shrink-0" aria-label="Esporta vista CSV">
              <FileDown className="h-3.5 w-3.5 sm:mr-1.5" />
              <span className="hidden sm:inline">Esporta vista</span>
            </Button>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="shrink-0" aria-label="Aggiorna dati">
              <RefreshCw className={cn("h-3.5 w-3.5 sm:mr-1.5", isFetching && "animate-spin")} />
              <span className="hidden sm:inline">Aggiorna dati</span>
            </Button>
          </div>
        </div>
      </div>

      <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="overflow-hidden border-slate-200 bg-[#173b67] text-white shadow-sm">
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
                Target netto {targetMarginPct.toFixed(1)}%
              </Badge>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-white/10 bg-white/10 p-3">
                <p className="text-xs font-semibold uppercase text-blue-100">Gap dal target</p>
                <p className="mt-1 text-2xl font-bold">{formatCurrency(kpi.targetRecovery)}</p>
                <p className="text-xs text-blue-100/80">margine mancante rispetto al target, non credito certo</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/10 p-3">
                <p className="text-xs font-semibold uppercase text-blue-100">Anomalie da verificare</p>
                <p className="mt-1 text-2xl font-bold">{kpi.openAnomalyCount}</p>
                <p className="text-xs text-blue-100/80">{formatCurrency(kpi.openAnomalyCost)} da validare o contestare</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/10 p-3">
                <p className="text-xs font-semibold uppercase text-blue-100">Commesse sotto soglia</p>
                <p className="mt-1 text-2xl font-bold">{marginControl.riskRows.length}</p>
                <p className="text-xs text-blue-100/80">ordinate per impatto sul margine netto</p>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.07] p-4">
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-sm font-semibold">Come leggere il gap</p>
                  <p className="mt-1 text-xs leading-relaxed text-blue-100/80">
                    Non tutto il margine perso è recuperabile. Qui calcolo quanto manca al target netto
                    ({targetMarginPct.toFixed(1)}%) dopo overhead ({overheadPct.toFixed(1)}%) e separo le azioni:
                    anomalie da validare, costi da bloccare, extra lavori o varianti da fatturare.
                  </p>
                </div>
                <Badge className="w-fit border border-white/20 bg-white/10 text-white hover:bg-white/10">
                  Media {formatCurrency(recoveryPlan.avgPerPriorityOrder)} / priorità
                </Badge>
              </div>
              <div className="mt-4 grid gap-2 md:grid-cols-3">
                <div className="rounded-xl border border-white/10 bg-slate-950/20 p-3">
                  <p className="text-xs font-semibold uppercase text-orange-200">1. Perdite da validare</p>
                  <p className="mt-1 text-lg font-bold">{formatCurrency(recoveryPlan.anomalyToVerify)}</p>
                  <p className="text-xs text-blue-100/75">errori, reclami fornitore o cause da confermare prima di imputare</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-slate-950/20 p-3">
                  <p className="text-xs font-semibold uppercase text-orange-200">2. Gap da compensare</p>
                  <p className="mt-1 text-lg font-bold">{formatCurrency(recoveryPlan.compensationGap)}</p>
                  <p className="text-xs text-blue-100/75">varianti cliente, extra lavori approvati, sconti acquisto o stop costi</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-slate-950/20 p-3">
                  <p className="text-xs font-semibold uppercase text-orange-200">3. Intervieni in ordine</p>
                  <p className="mt-1 text-lg font-bold">{marginControl.riskRows.length}</p>
                  <p className="text-xs text-blue-100/75">prima anomalie aperte, poi acquisti, poi varianti e costi residui</p>
                </div>
              </div>
            </div>
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
            <h2 className="text-lg font-semibold text-[#1E3A5F]">Performance per Sede</h2>
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

      {/* ── KPI Strip ──────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <OperationalKpiCard
          label="Preventivo Totale"
          value={formatCurrency(kpi.totPreventivo)}
          hint={`${filtered.length} ordini`}
          icon={Euro}
          tone="blue"
          isLoading={isLoading}
        />
        <OperationalKpiCard
          label="Consuntivo Totale"
          value={formatCurrency(kpi.totConsuntivo)}
          hint="acquisti + errori"
          icon={BarChart3}
          tone="slate"
          isLoading={isLoading}
        />
        <OperationalKpiCard
          label="Margine Lordo"
          value={formatCurrency(kpi.totMargine)}
          icon={kpi.totMargine >= 0 ? TrendingUp : TrendingDown}
          tone={kpi.totMargine >= 0 ? "green" : "red"}
          isLoading={isLoading}
        />
        <OperationalKpiCard
          label="Margine Medio %"
          value={`${kpi.avgMarginePerc.toFixed(1)}%`}
          hint={kpi.cantierInRosso > 0 ? `${kpi.cantierInRosso} in perdita` : "Tutti positivi"}
          icon={kpi.cantierInRosso > 0 ? AlertTriangle : CheckCircle2}
          tone={kpi.avgMarginePerc >= 15 ? "green" : kpi.avgMarginePerc >= 0 ? "amber" : "red"}
          isLoading={isLoading}
        />
        <OperationalKpiCard
          label={`Margine Netto Medio (−${overheadPct}%)`}
          value={`${kpi.avgMargineNettoPerc.toFixed(1)}%`}
          hint="dopo overhead fissi"
          icon={kpi.avgMargineNettoPerc >= 10 ? TrendingUp : TrendingDown}
          tone={kpi.avgMargineNettoPerc >= 10 ? "green" : kpi.avgMargineNettoPerc >= 0 ? "amber" : "red"}
          isLoading={isLoading}
        />
        <OperationalKpiCard
          label="A rischio"
          value={String(kpi.riskCount)}
          hint={`netto sotto ${targetMarginPct.toFixed(1)}%`}
          icon={AlertTriangle}
          tone={kpi.riskCount > 0 ? "red" : "green"}
          isLoading={isLoading}
        />
      </div>

      <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-sm shadow-sm lg:grid-cols-4">
        <div>
          <p className="text-xs font-semibold uppercase text-muted-foreground">Acquisti registrati</p>
          <p className="text-lg font-bold">{formatCurrency(kpi.purchaseCost)}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase text-muted-foreground">Errori / anomalie</p>
          <p className={cn("text-lg font-bold", kpi.errorCost > 0 ? "text-red-600" : "text-green-600")}>{formatCurrency(kpi.errorCost)}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase text-muted-foreground">Priorità operativa</p>
          <p className="text-sm font-medium">
            {kpi.riskCount > 0
              ? `${kpi.riskCount} commesse richiedono controllo costi, anomalie e varianti.`
              : "Nessuna commessa sotto soglia nella vista corrente."}
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase text-muted-foreground">Causa ricorrente</p>
          <p className="text-sm font-medium">
            {marginControl.topCauses[0]
              ? `${marginControl.topCauses[0].cause} · ${formatCurrency(marginControl.topCauses[0].amount)}`
              : "Nessuna anomalia classificata nella vista."}
          </p>
        </div>
      </div>

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
          <label className="text-sm text-muted-foreground whitespace-nowrap">Overhead fissi %</label>
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
              <p className="text-xs max-w-[200px]">Percentuale di costi fissi aziendali da allocare su ogni commessa per calcolare il margine netto reale.</p>
            </TooltipContent>
          </Tooltip>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground whitespace-nowrap">Target netto %</label>
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
              <p className="text-xs max-w-[220px]">Soglia minima di marginalità netta usata per calcolare il gap dal target e ordinare le priorità operative.</p>
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
                  <SortableTableHead className="text-right" align="right" active={sort.key === "margine"} direction={sort.direction} onClick={() => handleSort("margine")}>Margine €</SortableTableHead>
                  <SortableTableHead className="text-center w-32" align="center" active={sort.key === "marginePerc"} direction={sort.direction} onClick={() => handleSort("marginePerc")}>Margine %</SortableTableHead>
                  <SortableTableHead className="text-right" align="right" active={sort.key === "overhead"} direction={sort.direction} onClick={() => handleSort("overhead")}>Overhead alloc.</SortableTableHead>
                  <SortableTableHead className="text-right" align="right" active={sort.key === "margineNetto"} direction={sort.direction} onClick={() => handleSort("margineNetto")}>Margine netto</SortableTableHead>
                  <SortableTableHead className="text-right" align="right" active={sort.key === "acquisti"} direction={sort.direction} onClick={() => handleSort("acquisti")}>Acquisti</SortableTableHead>
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
                  const costoErrori = safeNumber(row.costo_errori);
                  const margineNetto = marginePerc - overheadPct;
                  const margineNettoAbs = preventivoTotale * (margineNetto / 100);
                  const overheadAllocato = preventivoTotale * (overheadPct / 100);
                  const decision = getMarginDecision(row);
                  const anomaly = getOrderAnomalySummary(row.id);
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
                          <MarginHealthBadge perc={margineNetto} />
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
                        {formatCurrency(margine)}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex flex-col items-center gap-1">
                          <MargineBadge perc={marginePerc} />
                          <Progress
                            value={clampPercentage(marginePerc)}
                            className="h-1 w-20"
                            indicatorClassName={MargineProgressClass(marginePerc)}
                          />
                        </div>
                      </TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">
                        {formatCurrency(overheadAllocato)}
                      </TableCell>
                      <TableCell className={cn("text-right font-semibold text-sm", MargineColorClass(margineNetto))}>
                        {formatCurrency(margineNettoAbs)}
                        <span className="text-xs ml-1">({margineNetto.toFixed(1)}%)</span>
                      </TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">
                        {costoAcquisti > 0 ? formatCurrency(costoAcquisti) : "–"}
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
            const decision = getMarginDecision(row);
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
                  <MargineBadge perc={marginePerc} />
                </div>
                <MarginHealthBadge perc={marginePerc - overheadPct} />
                {decision.tone !== "green" && (
                  <div className="rounded-lg border border-orange-100 bg-orange-50 px-3 py-2 text-xs text-orange-800">
                    <span className="font-semibold">{decision.label}:</span> {decision.detail}
                  </div>
                )}

                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <p className="text-muted-foreground">Preventivo</p>
                    <p className="font-medium">{formatCurrency(preventivoTotale)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Consuntivo</p>
                    <p className="font-medium">{formatCurrency(consuntivo)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Margine</p>
                    <p className={cn("font-semibold", MargineColorClass(marginePerc))}>
                      {formatCurrency(margine)}
                    </p>
                  </div>
                </div>

                <Progress
                  value={clampPercentage(marginePerc)}
                  className="h-1.5"
                  indicatorClassName={MargineProgressClass(marginePerc)}
                />
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
