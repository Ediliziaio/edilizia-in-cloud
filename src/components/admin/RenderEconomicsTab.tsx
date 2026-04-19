// ============================================================================
// RenderEconomicsTab — SuperAdmin Render Economics (Supermaster Parte B5)
//
// Integrato come 4° tab in AdminRevenueDashboard. NO nuova voce sidebar.
//
// Mostra:
//   1. Selettore periodo (7/30/90 giorni)
//   2. KPI globali: render, costo, ricavo, margine, margin %, aziende negative
//   3. Serie giornaliera cost vs revenue (line chart recharts)
//   4. Provider breakdown (tabella)
//   5. Top 5 per volume / Top 5 per margine / Bottom 5 per margine
//   6. Tabella completa aziende ordinate per margine ASC (peggiori prima)
// ============================================================================

import { useState, useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import {
  AlertTriangle, ImageIcon, RefreshCw, Loader2,
  TrendingDown, TrendingUp, DollarSign, Award,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

import {
  useRenderEconomicsGlobal,
  useRenderEconomicsByCompany,
} from "@/hooks/useRenderEconomics";
import { format } from "date-fns";
import { it } from "date-fns/locale";

// ── Formatter ──────────────────────────────────────────────────────────────

const eur = (v: number) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(v || 0);
const eur4 = (v: number) =>
  new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(v || 0);
const num = (v: number) =>
  new Intl.NumberFormat("it-IT").format(v || 0);

function marginBadgeClass(margin: number): string {
  if (margin > 0) return "bg-emerald-100 text-emerald-700 border-emerald-200";
  if (margin === 0) return "bg-muted text-muted-foreground";
  return "bg-destructive/15 text-destructive border-destructive/30";
}

// ── KPI Card ───────────────────────────────────────────────────────────────

function KpiCard(props: {
  label: string;
  value: string;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "neutral" | "positive" | "negative" | "warning";
}) {
  const { label, value, subtitle, icon: Icon, tone = "neutral" } = props;
  const toneClasses = {
    neutral: "text-primary",
    positive: "text-emerald-600",
    negative: "text-destructive",
    warning: "text-amber-600",
  }[tone];
  return (
    <Card>
      <CardContent className="p-4 md:p-5 flex items-center gap-3">
        <div className="rounded-full bg-muted p-2.5">
          <Icon className={`h-5 w-5 ${toneClasses}`} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground truncate">{label}</p>
          <p className={`text-xl md:text-2xl font-bold ${toneClasses} font-mono`}>{value}</p>
          {subtitle && (
            <p className="text-[11px] text-muted-foreground truncate">{subtitle}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Top 5 list mini ────────────────────────────────────────────────────────

function MiniList(props: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  rows: Array<{ company_id: string; company_name: string; value: string; marginTone?: boolean; marginValue?: number }>;
  empty: string;
}) {
  const { title, icon: Icon, rows, empty } = props;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">{empty}</p>
        ) : (
          <ul className="space-y-1.5">
            {rows.map((r, i) => (
              <li
                key={r.company_id}
                className="flex items-center justify-between text-sm gap-2 px-2 py-1.5 rounded hover:bg-accent/40"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="text-xs font-mono text-muted-foreground w-5 flex-none">
                    {i + 1}.
                  </span>
                  <span className="truncate">{r.company_name}</span>
                </div>
                {r.marginTone && typeof r.marginValue === "number" ? (
                  <Badge variant="outline" className={`font-mono text-xs ${marginBadgeClass(r.marginValue)}`}>
                    {r.value}
                  </Badge>
                ) : (
                  <span className="font-mono text-xs tabular-nums">{r.value}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ── Main component ────────────────────────────────────────────────────────

export function RenderEconomicsTab() {
  const [days, setDays] = useState<number>(30);

  const globalQ = useRenderEconomicsGlobal(days);
  const companiesQ = useRenderEconomicsByCompany(days);

  const isLoading = globalQ.isLoading || companiesQ.isLoading;
  const isFetching = globalQ.isFetching || companiesQ.isFetching;
  const hasError = globalQ.error || companiesQ.error;

  const refetch = () => {
    void globalQ.refetch();
    void companiesQ.refetch();
  };

  const totals = globalQ.data?.totals;
  const negativeCount = globalQ.data?.companies_with_negative_margin_count ?? 0;
  const providers = globalQ.data?.provider_breakdown ?? [];
  const topVol = globalQ.data?.top_5_by_volume ?? [];
  const topMargin = globalQ.data?.top_5_by_margin ?? [];
  const botMargin = globalQ.data?.bottom_5_by_margin ?? [];
  const companies = companiesQ.data ?? [];

  const dailyFormatted = useMemo(() => {
    const daily = globalQ.data?.daily ?? [];
    return daily.map((d) => ({
      ...d,
      label: format(new Date(d.day), "dd MMM", { locale: it }),
    }));
  }, [globalQ.data?.daily]);

  return (
    <div className="space-y-5 md:space-y-6">
      {/* Header + controlli */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">
            Guadagno reale per render AI (costo API vs ricavo credito consumato FIFO)
          </p>
          <p className="text-xs text-muted-foreground">
            Periodo: {format(new Date(globalQ.data?.period?.from ?? Date.now()), "dd MMM yyyy", { locale: it })}
            {" → "}
            {format(new Date(globalQ.data?.period?.to ?? Date.now()), "dd MMM yyyy", { locale: it })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Ultimi 7 giorni</SelectItem>
              <SelectItem value="30">Ultimi 30 giorni</SelectItem>
              <SelectItem value="90">Ultimi 90 giorni</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={refetch}
            disabled={isFetching}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
            Aggiorna
          </Button>
        </div>
      </div>

      {/* Error state */}
      {hasError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Errore caricamento economics:{" "}
            {(globalQ.error as Error | null)?.message ||
              (companiesQ.error as Error | null)?.message ||
              "errore sconosciuto"}
          </AlertDescription>
        </Alert>
      )}

      {/* Alert margine negativo */}
      {!isLoading && negativeCount > 0 && (
        <Alert className="border-amber-300 bg-amber-50">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-800">
            <span className="font-semibold">{negativeCount}</span>
            {negativeCount === 1 ? " azienda" : " aziende"} con margine negativo nel periodo.
            Rivedi pricing o fallback provider.
          </AlertDescription>
        </Alert>
      )}

      {/* Loading skeleton */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* KPI globali */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <KpiCard
              label="Render totali"
              value={num(totals?.total_renders ?? 0)}
              icon={ImageIcon}
              tone="neutral"
            />
            <KpiCard
              label="Costo reale"
              value={eur(totals?.total_cost ?? 0)}
              icon={TrendingDown}
              tone="warning"
            />
            <KpiCard
              label="Ricavo"
              value={eur(totals?.total_revenue ?? 0)}
              icon={DollarSign}
              tone="positive"
            />
            <KpiCard
              label="Margine"
              value={eur(totals?.total_margin ?? 0)}
              icon={(totals?.total_margin ?? 0) >= 0 ? TrendingUp : TrendingDown}
              tone={(totals?.total_margin ?? 0) >= 0 ? "positive" : "negative"}
            />
            <KpiCard
              label="Margine %"
              value={`${(totals?.margin_pct ?? 0).toFixed(1)}%`}
              icon={Award}
              tone={(totals?.margin_pct ?? 0) >= 40 ? "positive" : "warning"}
            />
            <KpiCard
              label="Aziende negative"
              value={num(negativeCount)}
              icon={AlertTriangle}
              tone={negativeCount > 0 ? "negative" : "neutral"}
            />
          </div>

          {/* Daily chart */}
          {dailyFormatted.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Andamento giornaliero</CardTitle>
                <CardDescription>Costo reale vs ricavo per giorno</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={dailyFormatted}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 11 }}
                        stroke="hsl(var(--muted-foreground))"
                      />
                      <YAxis
                        tick={{ fontSize: 11 }}
                        stroke="hsl(var(--muted-foreground))"
                        tickFormatter={(v: number) => `€${v.toFixed(2)}`}
                      />
                      <Tooltip
                        formatter={(v: number) => eur4(v)}
                        labelStyle={{ color: "hsl(var(--foreground))" }}
                        contentStyle={{
                          backgroundColor: "hsl(var(--background))",
                          border: "1px solid hsl(var(--border))",
                        }}
                      />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="cost"
                        name="Costo"
                        stroke="hsl(var(--destructive))"
                        strokeWidth={2}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="revenue"
                        name="Ricavo"
                        stroke="hsl(142 71% 45%)"
                        strokeWidth={2}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="margin"
                        name="Margine"
                        stroke="hsl(var(--primary))"
                        strokeWidth={2}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Provider breakdown */}
          {providers.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Breakdown per Provider AI</CardTitle>
                <CardDescription>Costo, ricavo, margine per provider</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Provider</TableHead>
                      <TableHead className="text-right">Render</TableHead>
                      <TableHead className="text-right">Costo</TableHead>
                      <TableHead className="text-right">Ricavo</TableHead>
                      <TableHead className="text-right">Margine</TableHead>
                      <TableHead className="text-right">Margine %</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {providers.map((p) => {
                      const pct = p.revenue_total > 0 ? (p.margin_total / p.revenue_total) * 100 : 0;
                      return (
                        <TableRow key={p.provider}>
                          <TableCell className="font-medium capitalize">{p.provider}</TableCell>
                          <TableCell className="text-right font-mono">{num(p.renders_count)}</TableCell>
                          <TableCell className="text-right font-mono">{eur(p.cost_total)}</TableCell>
                          <TableCell className="text-right font-mono">{eur(p.revenue_total)}</TableCell>
                          <TableCell className={`text-right font-mono font-medium ${p.margin_total < 0 ? "text-destructive" : "text-emerald-600"}`}>
                            {eur(p.margin_total)}
                          </TableCell>
                          <TableCell className={`text-right font-mono ${pct < 0 ? "text-destructive" : ""}`}>
                            {pct.toFixed(1)}%
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Top/Bottom lists */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <MiniList
              title="Top 5 per volume"
              icon={ImageIcon}
              rows={topVol.map((c) => ({
                company_id: c.company_id,
                company_name: c.company_name,
                value: num(c.renders_count),
              }))}
              empty="Nessun dato nel periodo."
            />
            <MiniList
              title="Top 5 per margine"
              icon={TrendingUp}
              rows={topMargin.map((c) => ({
                company_id: c.company_id,
                company_name: c.company_name,
                value: eur(c.margin_eur),
                marginTone: true,
                marginValue: c.margin_eur,
              }))}
              empty="Nessun dato nel periodo."
            />
            <MiniList
              title="Peggiori per margine"
              icon={AlertTriangle}
              rows={botMargin.map((c) => ({
                company_id: c.company_id,
                company_name: c.company_name,
                value: eur(c.margin_eur),
                marginTone: true,
                marginValue: c.margin_eur,
              }))}
              empty="Nessuna azienda con margine negativo."
            />
          </div>

          {/* Full company table */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Dettaglio per azienda</CardTitle>
              <CardDescription>
                Ordinato per margine crescente (priorità intervento).{" "}
                {companies.length > 0 && `${companies.length} aziende`}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {companies.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground text-sm">
                  <ImageIcon className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p>Nessuna attività render nel periodo selezionato.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Azienda</TableHead>
                        <TableHead className="text-right">Render</TableHead>
                        <TableHead className="text-right">Costo</TableHead>
                        <TableHead className="text-right">Ricavo</TableHead>
                        <TableHead className="text-right">Margine</TableHead>
                        <TableHead className="text-right">Margine %</TableHead>
                        <TableHead className="text-right">Costo/render</TableHead>
                        <TableHead className="text-right hidden md:table-cell">Ultima attività</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {companies.map((c) => (
                        <TableRow key={c.company_id}>
                          <TableCell className="font-medium">{c.company_name}</TableCell>
                          <TableCell className="text-right font-mono">{num(c.renders_count)}</TableCell>
                          <TableCell className="text-right font-mono">{eur(c.cost_total_eur)}</TableCell>
                          <TableCell className="text-right font-mono">{eur(c.revenue_total_eur)}</TableCell>
                          <TableCell className={`text-right font-mono font-medium ${c.margin_total_eur < 0 ? "text-destructive" : "text-emerald-600"}`}>
                            {eur(c.margin_total_eur)}
                          </TableCell>
                          <TableCell className={`text-right font-mono ${c.margin_pct < 0 ? "text-destructive" : ""}`}>
                            {c.margin_pct.toFixed(1)}%
                          </TableCell>
                          <TableCell className="text-right font-mono text-muted-foreground">
                            {eur4(c.avg_cost_per_render)}
                          </TableCell>
                          <TableCell className="text-right hidden md:table-cell text-xs text-muted-foreground">
                            {c.last_activity ? format(new Date(c.last_activity), "dd MMM HH:mm", { locale: it }) : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
