import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import MargineVociDetail from "@/components/marginalita/MargineVociDetail";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { formatCurrency } from "@/lib/formatters";
import { SedeFilterBar } from "@/components/sedi/SedeFilterBar";
import { SedeMargineCard } from "@/components/sedi/SedeMargineCard";
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

function KPICard({
  label,
  value,
  sub,
  icon: Icon,
  colorClass = "",
  isLoading,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  colorClass?: string;
  isLoading: boolean;
}) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{label}</p>
            {isLoading ? (
              <Skeleton className="h-7 w-28 mt-1" />
            ) : (
              <p className={cn("text-2xl font-bold tracking-tight mt-0.5 truncate", colorClass)}>{value}</p>
            )}
            {sub && !isLoading && (
              <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
            )}
          </div>
          <div className={cn(
            "rounded-lg p-2 shrink-0",
            colorClass === "text-green-600" && "bg-green-100",
            colorClass === "text-amber-600" && "bg-amber-100",
            colorClass === "text-red-600" && "bg-red-100",
            !colorClass && "bg-muted",
          )}>
            <Icon className={cn("h-5 w-5", colorClass || "text-muted-foreground")} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function MarginalitaCantieri() {
  const companyId = useEffectiveCompanyId();
  const [search, setSearch] = useState("");
  const [annoFilter, setAnnoFilter] = useState<string>("tutti");
  const [healthFilter, setHealthFilter] = useState<"tutti" | "critici" | "sotto_target" | "sani">("tutti");
  const [overheadPct, setOverheadPct] = useState(20);
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
      if (healthFilter === "sotto_target") return netto >= 0 && netto < 10;
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
  }, [rows, annoFilter, search, healthFilter, overheadPct, sort]);

  const handleSort = (key: MarginalitaSortKey) => {
    setSort((current) => ({
      key,
      direction: current.key === key && current.direction === "asc" ? "desc" : "asc",
    }));
  };

  // ── KPI aggregati (su filtered) ──────────────────────────────
  const kpi = useMemo(() => {
    const totPreventivo = filtered.reduce((s, r) => s + safeNumber(r.preventivo_totale), 0);
    const totConsuntivo = filtered.reduce((s, r) => s + safeNumber(r.consuntivo), 0);
    const totMargine = filtered.reduce((s, r) => s + safeNumber(r.margine), 0);
    const avgMarginePerc = totPreventivo > 0 ? (totMargine / totPreventivo) * 100 : 0;
    const cantierInRosso = filtered.filter((r) => safeNumber(r.margine_perc) < 0).length;
    const avgMargineNettoPerc = avgMarginePerc - overheadPct;
    const riskCount = filtered.filter((r) => safeNumber(r.margine_perc) - overheadPct < 10).length;
    const errorCost = filtered.reduce((s, r) => s + safeNumber(r.costo_errori), 0);
    const purchaseCost = filtered.reduce((s, r) => s + safeNumber(r.costo_acquisti), 0);
    return { totPreventivo, totConsuntivo, totMargine, avgMarginePerc, cantierInRosso, avgMargineNettoPerc, riskCount, errorCost, purchaseCost };
  }, [filtered, overheadPct]);

  const { sediSelezionate, periodo } = useSedeFilter();
  const { data: sediData, isLoading: sediLoading } = useSediAnalytics({
    da: periodo.da,
    a:  periodo.a,
  });
  const sediVisibili = (sediData?.sedi ?? [])
    .filter((s) => sediSelezionate.length === 0 || sediSelezionate.includes(s.sede_id))
    .sort((a, b) => b.margine_pct - a.margine_pct);

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200 bg-white px-4 sm:px-6 pt-5 pb-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-400 text-white flex items-center justify-center shrink-0 shadow-[0_4px_12px_rgba(249,115,22,0.3)]">
            <BarChart3 className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight leading-tight">Marginalità Cantieri</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Controlla preventivo, acquisti, errori e overhead per capire quali commesse stanno erodendo margine.
            </p>
          </div>
        </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="shrink-0">
            <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", isFetching && "animate-spin")} />
            Aggiorna dati
          </Button>
        </div>
      </div>

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
        <KPICard
          label="Preventivo Totale"
          value={formatCurrency(kpi.totPreventivo)}
          sub={`${filtered.length} ordini`}
          icon={Euro}
          isLoading={isLoading}
        />
        <KPICard
          label="Consuntivo Totale"
          value={formatCurrency(kpi.totConsuntivo)}
          sub="acquisti + errori"
          icon={BarChart3}
          isLoading={isLoading}
        />
        <KPICard
          label="Margine Lordo"
          value={formatCurrency(kpi.totMargine)}
          icon={kpi.totMargine >= 0 ? TrendingUp : TrendingDown}
          colorClass={kpi.totMargine >= 0 ? "text-green-600" : "text-red-600"}
          isLoading={isLoading}
        />
        <KPICard
          label="Margine Medio %"
          value={`${kpi.avgMarginePerc.toFixed(1)}%`}
          sub={kpi.cantierInRosso > 0 ? `${kpi.cantierInRosso} in perdita` : "Tutti positivi"}
          icon={kpi.cantierInRosso > 0 ? AlertTriangle : CheckCircle2}
          colorClass={kpi.avgMarginePerc >= 15 ? "text-green-600" : kpi.avgMarginePerc >= 0 ? "text-amber-600" : "text-red-600"}
          isLoading={isLoading}
        />
        <KPICard
          label={`Margine Netto Medio (−${overheadPct}%)`}
          value={`${kpi.avgMargineNettoPerc.toFixed(1)}%`}
          sub="dopo overhead fissi"
          icon={kpi.avgMargineNettoPerc >= 10 ? TrendingUp : TrendingDown}
          colorClass={kpi.avgMargineNettoPerc >= 10 ? "text-green-600" : kpi.avgMargineNettoPerc >= 0 ? "text-amber-600" : "text-red-600"}
          isLoading={isLoading}
        />
        <KPICard
          label="A rischio"
          value={String(kpi.riskCount)}
          sub="netto sotto 10%"
          icon={AlertTriangle}
          colorClass={kpi.riskCount > 0 ? "text-red-600" : "text-green-600"}
          isLoading={isLoading}
        />
      </div>

      <div className="grid gap-3 rounded-lg border bg-slate-50/70 p-3 text-sm lg:grid-cols-3">
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
              ? `${kpi.riskCount} commesse richiedono controllo costi e acquisti.`
              : "Nessuna commessa sotto soglia nella vista corrente."}
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
      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cerca ordine, cliente..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
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
                "px-3 py-1.5 rounded-md text-sm border transition-colors",
                healthFilter === item.key
                  ? "bg-slate-900 text-white border-slate-900"
                  : "border-border text-muted-foreground hover:bg-muted",
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
                "px-3 py-1.5 rounded-md text-sm border transition-colors",
                annoFilter === anno
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:bg-muted",
              )}
            >
              {anno === "tutti" ? "Tutti" : anno}
            </button>
          ))}
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
                        <MarginHealthBadge perc={margineNetto} />
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
