import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { formatCurrency } from "@/lib/formatters";
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
  TrendingUp,
  TrendingDown,
  Search,
  Euro,
  BarChart3,
  AlertTriangle,
  CheckCircle2,
  ArrowUpRight,
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

  const { data: rows = [], isLoading, error } = useQuery({
    queryKey: ["marginalita-cantieri", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_ordine_marginalita" as any)
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
    return { totPreventivo, totConsuntivo, totMargine, avgMarginePerc, cantierInRosso };
  }, [filtered]);

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Marginalità Cantieri</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Confronto preventivo vs consuntivo in tempo reale. I costi includono ordini d'acquisto ed errori registrati.
        </p>
      </div>

      {/* ── KPI Strip ──────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
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
      </div>

      {/* ── Filtri ─────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cerca ordine, cliente..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
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
            <p className="text-sm text-muted-foreground text-center py-12">Nessun cantiere trovato.</p>
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
                  <TableHead className="text-right">Acquisti</TableHead>
                  <TableHead className="text-right">Errori</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((row) => (
                  <TableRow key={row.id} className="group">
                    <TableCell>
                      <Link
                        to={`/azienda/ordini/${row.id}`}
                        className="flex items-center gap-1 hover:text-primary font-medium"
                      >
                        {row.order_code ? `#${row.order_code}` : "–"}
                        <ArrowUpRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </Link>
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
                ))}
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
          <p className="text-sm text-muted-foreground text-center py-8">Nessun cantiere trovato.</p>
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
    </div>
  );
}
