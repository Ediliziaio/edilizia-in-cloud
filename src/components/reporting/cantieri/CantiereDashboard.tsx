import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { formatCurrency } from "@/lib/formatters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  HardHat,
  TrendingUp,
  Euro,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ArrowUpRight,
  BarChart2,
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
  stato?: string;
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
  if (isLoading) return <Skeleton className="h-28 w-full rounded-xl" />;
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
            <p className={cn("text-2xl font-bold mt-1", colorClass)}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          <div className="bg-primary/10 rounded-lg p-2">
            <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ stato }: { stato: string }) {
  const map: Record<string, { label: string; className: string }> = {
    active: { label: "Attivo", className: "bg-green-100 text-green-800" },
    completed: { label: "Completato", className: "bg-blue-100 text-blue-800" },
    paused: { label: "In pausa", className: "bg-yellow-100 text-yellow-800" },
    cancelled: { label: "Annullato", className: "bg-red-100 text-red-800" },
    draft: { label: "Bozza", className: "bg-muted text-muted-foreground" },
  };
  const s = map[stato] ?? { label: stato, className: "bg-muted text-muted-foreground" };
  return <Badge className={cn("text-xs font-medium border-0", s.className)}>{s.label}</Badge>;
}

export default function CantiereDashboard() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["cantiere-dashboard", companyId],
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
  });

  // Also fetch orders for status info
  const { data: orders = [] } = useQuery({
    queryKey: ["orders-dashboard-status", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, status, total_amount, work_start_date, work_end_date")
        .eq("company_id", companyId!)
        .limit(500);
      if (error) throw error;
      return (data || []) as { id: string; status: string; total_amount: number | null; work_start_date: string | null; work_end_date: string | null }[];
    },
    enabled: !!companyId,
    staleTime: 2 * 60 * 1000,
  });

  const kpis = useMemo(() => {
    if (!rows.length) return { totale: 0, ricavi: 0, margine: 0, marginePerc: 0, attivi: 0, inRitardo: 0 };
    const totale = rows.length;
    const ricavi = rows.reduce((s, r) => s + (r.preventivo_totale ?? 0), 0);
    const margine = rows.reduce((s, r) => s + (r.margine ?? 0), 0);
    const marginePerc = ricavi > 0 ? (margine / ricavi) * 100 : 0;

    const today = new Date().toLocaleDateString("en-CA");
    const attivi = orders.filter((o) => o.status === "active").length;
    const inRitardo = orders.filter(
      (o) => o.work_end_date && o.work_end_date < today && o.status === "active"
    ).length;

    return { totale, ricavi, margine, marginePerc, attivi, inRitardo };
  }, [rows, orders]);

  // Status breakdown from orders
  const statusBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const o of orders) {
      counts[o.status] = (counts[o.status] ?? 0) + 1;
    }
    return counts;
  }, [orders]);

  // Top 5 by margine
  const top5 = useMemo(() => {
    return [...rows].sort((a, b) => (b.margine ?? 0) - (a.margine ?? 0)).slice(0, 5);
  }, [rows]);

  // Bottom 5 (lowest margine %)
  const bottom5 = useMemo(() => {
    return [...rows].sort((a, b) => (a.margine_perc ?? 0) - (b.margine_perc ?? 0)).slice(0, 5);
  }, [rows]);

  if (!companyId) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <HardHat className="h-6 w-6 text-primary" aria-hidden="true" />
        <div>
          <h2 className="text-lg font-semibold">Dashboard Cantieri</h2>
          <p className="text-sm text-muted-foreground">Panoramica KPI di tutti i cantieri aziendali</p>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <KPICard label="Totale cantieri" value={String(kpis.totale)} icon={HardHat} isLoading={isLoading} />
        <KPICard label="Attivi" value={String(kpis.attivi)} icon={CheckCircle2} colorClass="text-green-600" isLoading={isLoading} />
        <KPICard label="In ritardo" value={String(kpis.inRitardo)} icon={AlertTriangle} colorClass={kpis.inRitardo > 0 ? "text-red-600" : ""} isLoading={isLoading} />
        <KPICard label="Ricavi totali" value={formatCurrency(kpis.ricavi)} icon={Euro} colorClass="text-primary" isLoading={isLoading} />
        <KPICard label="Margine totale" value={formatCurrency(kpis.margine)} icon={TrendingUp} colorClass={kpis.margine >= 0 ? "text-green-600" : "text-red-600"} isLoading={isLoading} />
        <KPICard label="Margine medio" value={`${kpis.marginePerc.toFixed(1)}%`} icon={BarChart2} colorClass={kpis.marginePerc >= 20 ? "text-green-600" : kpis.marginePerc >= 10 ? "text-amber-600" : "text-red-600"} isLoading={isLoading} />
      </div>

      {/* Status breakdown */}
      {!isLoading && Object.keys(statusBreakdown).length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Distribuzione per stato</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {Object.entries(statusBreakdown).map(([stato, count]) => (
                <div key={stato} className="flex items-center gap-2">
                  <StatusBadge stato={stato} />
                  <span className="text-sm font-semibold">{count}</span>
                  <span className="text-xs text-muted-foreground">
                    ({orders.length > 0 ? Math.round((count / orders.length) * 100) : 0}%)
                  </span>
                </div>
              ))}
            </div>
            <Progress
              value={orders.length > 0 ? ((statusBreakdown["completed"] ?? 0) / orders.length) * 100 : 0}
              className="mt-3 h-2"
              aria-label="Percentuale completati"
            />
            <p className="text-xs text-muted-foreground mt-1">
              {statusBreakdown["completed"] ?? 0} su {orders.length} completati
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        {/* Top 5 per margine */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
              <TrendingUp className="h-4 w-4 text-green-600" aria-hidden="true" />
              Top 5 — Miglior margine
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="space-y-2 p-4">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-full" />)}
              </div>
            ) : top5.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Nessun cantiere</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cantiere</TableHead>
                    <TableHead className="text-right">Margine</TableHead>
                    <TableHead className="text-right">%</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {top5.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <Link
                          to={`/azienda/ordini/${r.id}`}
                          className="text-sm font-medium hover:underline flex items-center gap-1"
                        >
                          {r.order_code ? `#${r.order_code}` : r.description?.slice(0, 20) ?? "—"}
                          <ArrowUpRight className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                        </Link>
                      </TableCell>
                      <TableCell className="text-right text-sm font-semibold text-green-600">
                        {formatCurrency(r.margine)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge className="bg-green-100 text-green-800 border-0 text-xs">
                          +{(r.margine_perc ?? 0).toFixed(1)}%
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Bottom 5 per margine % */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4 text-amber-500" aria-hidden="true" />
              Bottom 5 — Margine più basso
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="space-y-2 p-4">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-full" />)}
              </div>
            ) : bottom5.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Nessun cantiere</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cantiere</TableHead>
                    <TableHead className="text-right">Margine</TableHead>
                    <TableHead className="text-right">%</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bottom5.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <Link
                          to={`/azienda/ordini/${r.id}`}
                          className="text-sm font-medium hover:underline flex items-center gap-1"
                        >
                          {r.order_code ? `#${r.order_code}` : r.description?.slice(0, 20) ?? "—"}
                          <ArrowUpRight className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                        </Link>
                      </TableCell>
                      <TableCell className={cn("text-right text-sm font-semibold", (r.margine ?? 0) < 0 ? "text-red-600" : "text-amber-600")}>
                        {formatCurrency(r.margine)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge
                          className={cn(
                            "border-0 text-xs",
                            (r.margine_perc ?? 0) < 0 ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"
                          )}
                        >
                          {(r.margine_perc ?? 0).toFixed(1)}%
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Timeline scadenze */}
      {!isLoading && orders.filter((o) => o.work_end_date && o.status === "active").length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-primary" aria-hidden="true" />
              Cantieri attivi — Scadenze prossime
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cantiere</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Fine lavori</TableHead>
                  <TableHead>Stato</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders
                  .filter((o) => o.work_end_date && o.status === "active")
                  .sort((a, b) => (a.work_end_date ?? "").localeCompare(b.work_end_date ?? ""))
                  .slice(0, 8)
                  .map((o) => {
                    const row = rows.find((r) => r.id === o.id);
                    const today = new Date().toLocaleDateString("en-CA");
                    const isLate = o.work_end_date! < today;
                    const daysLeft = o.work_end_date
                      ? Math.round((new Date(o.work_end_date).getTime() - Date.now()) / 86400000)
                      : null;
                    return (
                      <TableRow key={o.id}>
                        <TableCell>
                          <Link to={`/azienda/ordini/${o.id}`} className="text-sm font-medium hover:underline flex items-center gap-1">
                            {row?.order_code ? `#${row.order_code}` : row?.description?.slice(0, 24) ?? "—"}
                            <ArrowUpRight className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                          </Link>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{row?.cliente_nome ?? "—"}</TableCell>
                        <TableCell className={cn("text-sm", isLate ? "text-red-600 font-medium" : "")}>
                          {o.work_end_date ? new Date(o.work_end_date).toLocaleDateString("it-IT") : "—"}
                          {daysLeft !== null && (
                            <span className="ml-1 text-xs text-muted-foreground">
                              {isLate ? `(${Math.abs(daysLeft)}gg ritardo)` : `(${daysLeft}gg)`}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <StatusBadge stato={o.status} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
