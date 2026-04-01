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
} from "lucide-react";
import { cn } from "@/lib/utils";

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
  const [overheadPct, setOverheadPct] = useState(20);
  const [drillRow, setDrillRow] = useState<MarginalitaRow | null>(null);

  const { data: rows = [], isLoading, error } = useQuery({
    queryKey: ["marginalita-cantieri", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_ordine_marginalita")
        .select("*")
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data || []) as MarginalitaRow[];
    },
    enabled: !!companyId,
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

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
    return result;
  }, [rows, annoFilter, search]);

  // ── KPI aggregati (su filtered) ──────────────────────────────
  const kpi = useMemo(() => {
    const totPreventivo = filtered.reduce((s, r) => s + r.preventivo_totale, 0);
    const totConsuntivo = filtered.reduce((s, r) => s + r.consuntivo, 0);
    const totMargine = filtered.reduce((s, r) => s + r.margine, 0);
    const avgMarginePerc = totPreventivo > 0 ? (totMargine / totPreventivo) * 100 : 0;
    const cantierInRosso = filtered.filter((r) => r.margine_perc < 0).length;
    const avgMargineNettoPerc = avgMarginePerc - overheadPct;
    return { totPreventivo, totConsuntivo, totMargine, avgMarginePerc, cantierInRosso, avgMargineNettoPerc };
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
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Marginalità Cantieri</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Confronto preventivo vs consuntivo in tempo reale. I costi includono ordini d'acquisto ed errori registrati.
        </p>
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
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
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
      </div>

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
            onChange={(e) => setOverheadPct(Number(e.target.value))}
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
            <p className="text-sm text-destructive p-4 text-center">Errore nel caricamento dati.</p>
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
                  <TableHead>Ordine</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="text-right">Preventivo</TableHead>
                  <TableHead className="text-right">Consuntivo</TableHead>
                  <TableHead className="text-right">Margine €</TableHead>
                  <TableHead className="text-center w-32">Margine %</TableHead>
                  <TableHead className="text-right">Overhead alloc.</TableHead>
                  <TableHead className="text-right">Margine netto</TableHead>
                  <TableHead className="text-right">Acquisti</TableHead>
                  <TableHead className="text-right">Errori</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((row) => {
                  const margineNetto = row.margine_perc - overheadPct;
                  const margineNettoAbs = row.preventivo_totale * (margineNetto / 100);
                  const overheadAllocato = row.preventivo_totale * (overheadPct / 100);
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
                      <TableCell className="text-right font-medium">{formatCurrency(row.preventivo_totale)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.consuntivo)}</TableCell>
                      <TableCell className={cn("text-right font-semibold", MargineColorClass(row.margine_perc))}>
                        {formatCurrency(row.margine)}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex flex-col items-center gap-1">
                          <MargineBadge perc={row.margine_perc} />
                          <Progress
                            value={Math.min(Math.max(row.margine_perc, 0), 100)}
                            className="h-1 w-20"
                            indicatorClassName={MargineProgressClass(row.margine_perc)}
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
                        {row.costo_acquisti > 0 ? formatCurrency(row.costo_acquisti) : "–"}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {row.costo_errori > 0 ? (
                          <span className="text-red-600">{formatCurrency(row.costo_errori)}</span>
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
          <p className="text-sm text-destructive text-center py-8">Errore nel caricamento dati.</p>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
            <HardHat className="h-10 w-10 text-muted-foreground/40" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">
              {rows.length === 0 ? "Crea il primo ordine per vedere i dati di marginalità." : "Nessun cantiere corrisponde ai filtri."}
            </p>
          </div>
        ) : (
          filtered.map((row) => (
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
                  <MargineBadge perc={row.margine_perc} />
                </div>

                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <p className="text-muted-foreground">Preventivo</p>
                    <p className="font-medium">{formatCurrency(row.preventivo_totale)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Consuntivo</p>
                    <p className="font-medium">{formatCurrency(row.consuntivo)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Margine</p>
                    <p className={cn("font-semibold", MargineColorClass(row.margine_perc))}>
                      {formatCurrency(row.margine)}
                    </p>
                  </div>
                </div>

                <Progress
                  value={Math.min(Math.max(row.margine_perc, 0), 100)}
                  className="h-1.5"
                  indicatorClassName={MargineProgressClass(row.margine_perc)}
                />
              </CardContent>
            </Card>
          ))
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
