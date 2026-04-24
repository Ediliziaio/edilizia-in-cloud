import React, { useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  useWeightedPipeline,
  useSalesForecast,
  useStalledOpportunities,
  useSalesVelocity,
  useSellerPerformance,
  useConversionBySource,
  useTopLeads,
} from "@/hooks/useSalesOS";
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
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  Legend,
} from "recharts";
import {
  TrendingUp,
  AlertTriangle,
  Users,
  Target,
  Zap,
  Loader2,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { formatCurrencyCompact } from "@/lib/formatters";
import { DealHealthOverview } from "@/components/opportunities/DealHealthOverview";
import { getPeriodRange, PERIOD_OPTIONS, type SalesOSPeriod } from "@/lib/salesOSPeriod";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, MousePointerClick } from "lucide-react";

// ─── Utilities ───────────────────────────────────────────────────────────────

const fmt = (v: number) =>
  new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(v);

const pct = (v: number) => `${v.toFixed(1)}%`;

// ─── WidgetState: loading / error / empty helper (Sprint 1.3) ──────────────
function WidgetState({
  loading, error, empty, loadingText = "Caricamento...", emptyText = "Nessun dato", height = 200,
}: {
  loading?: boolean; error?: Error | null | unknown; empty?: boolean;
  loadingText?: string; emptyText?: string; height?: number;
}) {
  const baseClass = `flex items-center justify-center`;
  const hStyle = { minHeight: `${height}px` };
  if (loading) {
    return (
      <div className={baseClass} style={hStyle}>
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">{loadingText}</span>
      </div>
    );
  }
  if (error) {
    const msg = (error as { message?: string })?.message ?? "Errore caricamento dati";
    return (
      <div className={`${baseClass} flex-col gap-2 px-4 text-center`} style={hStyle}>
        <AlertTriangle className="h-5 w-5 text-red-500" />
        <p className="text-sm text-red-600 font-medium">Impossibile caricare i dati</p>
        <p className="text-xs text-muted-foreground max-w-xs break-words">{msg}</p>
      </div>
    );
  }
  if (empty) {
    return (
      <div className={`${baseClass} text-sm text-muted-foreground`} style={hStyle}>
        {emptyText}
      </div>
    );
  }
  return null;
}

// ─── SalesVelocityCard ────────────────────────────────────────────────────────

function SalesVelocityCard({ companyId, daysBack, periodLabel }: { companyId: string; daysBack: number; periodLabel: string }) {
  const { data: velocity, isLoading, isError, error } = useSalesVelocity(companyId, daysBack);

  if (isLoading || isError || !velocity) {
    return (
      <Card>
        <CardContent>
          <WidgetState
            loading={isLoading}
            error={isError ? error : null}
            empty={!isLoading && !isError && !velocity}
            loadingText="Calcolo velocità..."
            emptyText="Nessun dato disponibile"
            height={100}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          Sales Velocity
          <span className="text-xs text-muted-foreground font-normal">({periodLabel.toLowerCase()})</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">
          {fmt(velocity.sales_velocity)}
          <span className="text-sm font-normal text-muted-foreground ml-1">/giorno</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3 text-sm">
          <div>
            <p className="font-semibold">{velocity.open_opportunities}</p>
            <span className="text-muted-foreground">Opp. aperte</span>
          </div>
          <div>
            <p className="font-semibold">{pct(velocity.win_rate)}</p>
            <span className="text-muted-foreground">Win rate</span>
          </div>
          <div>
            <p className="font-semibold">{fmt(velocity.avg_deal_size)}</p>
            <span className="text-muted-foreground">Avg deal size</span>
          </div>
          <div>
            <p className="font-semibold">{velocity.avg_cycle_days}gg</p>
            <span className="text-muted-foreground">Ciclo medio</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── WeightedPipelineChart ────────────────────────────────────────────────────

function WeightedPipelineChart({ companyId }: { companyId: string }) {
  const { data: stages, isLoading, isError, error } = useWeightedPipeline(companyId);
  const navigate = useNavigate();

  if (isLoading || isError || !stages || stages.length === 0) {
    return (
      <Card>
        <CardContent>
          <WidgetState
            loading={isLoading}
            error={isError ? error : null}
            empty={!isLoading && !isError && (!stages || stages.length === 0)}
            loadingText="Caricamento pipeline..."
            emptyText="Nessuna opportunità aperta."
            height={240}
          />
        </CardContent>
      </Card>
    );
  }

  const chartData = stages.map((s) => ({
    name:
      s.stage_name.length > 12
        ? s.stage_name.slice(0, 12) + "…"
        : s.stage_name,
    stage_id: s.stage_id,
    pipeline_id: s.pipeline_id,
    "Valore totale": Math.round(s.total_value),
    "Valore pesato": Math.round(s.weighted_value),
    "N° opp": s.opportunity_count,
    "Prob %": s.avg_probability,
  }));

  const handleBarClick = (data: { pipeline_id?: string; stage_id?: string }) => {
    if (!data?.pipeline_id) return;
    const params = new URLSearchParams({
      pipeline: data.pipeline_id,
      status: "open",
    });
    navigate(`/azienda/marketing/opportunita?${params.toString()}`);
  };

  return (
    <div className="space-y-4">
      <p className="text-[10px] text-muted-foreground flex items-center gap-1">
        <MousePointerClick className="h-3 w-3" /> Clicca una colonna per filtrare le opportunità
      </p>
      <ResponsiveContainer width="100%" height={250}>
        <BarChart data={chartData} onClick={(e: any) => {
          const payload = e?.activePayload?.[0]?.payload;
          if (payload) handleBarClick(payload);
        }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={formatCurrencyCompact} />
          <Tooltip
            formatter={(value: number, name: string) =>
              name === "Prob %" ? [`${value}%`, name] : [fmt(value), name]
            }
          />
          <Legend />
          <Bar dataKey="Valore totale" fill="hsl(var(--muted-foreground))" opacity={0.4} radius={[2, 2, 0, 0]} style={{ cursor: "pointer" }} />
          <Bar dataKey="Valore pesato" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} style={{ cursor: "pointer" }} />
        </BarChart>
      </ResponsiveContainer>
      <div className="grid grid-cols-2 gap-4 text-center">
        <div>
          <p className="text-lg font-bold">
            {fmt(stages.reduce((a, s) => a + s.total_value, 0))}
          </p>
          <p className="text-xs text-muted-foreground">Valore totale pipeline</p>
        </div>
        <div>
          <p className="text-lg font-bold">
            {fmt(stages.reduce((a, s) => a + s.weighted_value, 0))}
          </p>
          <p className="text-xs text-muted-foreground">Valore pesato</p>
        </div>
      </div>
    </div>
  );
}

// ─── SalesForecastChart ───────────────────────────────────────────────────────

function SalesForecastChart({ companyId }: { companyId: string }) {
  const { data: forecast, isLoading, isError, error } = useSalesForecast(companyId, 3);

  if (isLoading || isError || !forecast || forecast.length === 0) {
    return (
      <Card>
        <CardContent>
          <WidgetState
            loading={isLoading}
            error={isError ? error : null}
            empty={!isLoading && !isError && (!forecast || forecast.length === 0)}
            loadingText="Calcolo forecast..."
            emptyText="Nessuna opportunità con data chiusura impostata."
            height={180}
          />
        </CardContent>
      </Card>
    );
  }

  const chartData = forecast.map((f) => ({
    mese: new Date(f.forecast_month).toLocaleDateString("it-IT", {
      month: "short",
      year: "2-digit",
    }),
    "Atteso": Math.round(f.expected_revenue),
    "Pesato": Math.round(f.weighted_revenue),
    "N° opp": f.opportunity_count,
  }));

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis dataKey="mese" tick={{ fontSize: 11 }} />
        <YAxis
          tick={{ fontSize: 11 }}
          tickFormatter={formatCurrencyCompact}
        />
        <Tooltip formatter={(value: number, name: string) => [fmt(value), name]} />
        <Legend />
        <Line type="monotone" dataKey="Atteso" stroke="hsl(var(--muted-foreground))" strokeDasharray="5 5" />
        <Line type="monotone" dataKey="Pesato" stroke="hsl(var(--primary))" strokeWidth={2} />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ─── StalledOpportunitiesPanel ────────────────────────────────────────────────

function StalledOpportunitiesPanel({ companyId }: { companyId: string }) {
  const { data: stalled, isLoading, isError, error } = useStalledOpportunities(companyId);
  const navigate = useNavigate();

  if (isLoading || isError) {
    return (
      <WidgetState
        loading={isLoading}
        error={isError ? error : null}
        loadingText="Analisi opportunità ferme..."
        height={160}
      />
    );
  }

  if (!stalled || stalled.length === 0)
    return (
      <div className="text-center py-8 space-y-1">
        <span className="text-3xl">✅</span>
        <p className="text-sm text-muted-foreground">Nessuna opportunità ferma — ottimo lavoro!</p>
      </div>
    );

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Opportunità</TableHead>
          <TableHead>Stage</TableHead>
          <TableHead>Ferma da</TableHead>
          <TableHead>Threshold</TableHead>
          <TableHead className="text-right">Valore</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {stalled.map((s) => (
          <TableRow
            key={s.opportunity_id}
            className="cursor-pointer hover:bg-muted/50"
            onClick={() => navigate(`/azienda/marketing/opportunita?opportunity_id=${s.opportunity_id}`)}
          >
            <TableCell>
              <p className="font-medium text-sm">{s.opportunity_name}</p>
              {s.contact_name && (
                <p className="text-xs text-muted-foreground">{s.contact_name}</p>
              )}
            </TableCell>
            <TableCell>{s.stage_name}</TableCell>
            <TableCell>
              <Badge
                variant={
                  s.days_stalled > s.stalled_threshold * 2
                    ? "destructive"
                    : "secondary"
                }
                className="text-xs"
              >
                {s.days_stalled}gg
              </Badge>
            </TableCell>
            <TableCell>
              {s.stalled_threshold}gg
            </TableCell>
            <TableCell className="text-right">
              {fmt(s.value)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// ─── SellerComparisonTable ────────────────────────────────────────────────────

function SellerComparisonTable({
  companyId,
  dateFrom,
  dateTo,
}: {
  companyId: string;
  dateFrom: string;
  dateTo: string;
}) {
  const navigate = useNavigate();
  const { data: sellers, isLoading, isError, error } = useSellerPerformance(
    companyId,
    dateFrom,
    dateTo
  );

  if (isLoading || isError) {
    return (
      <WidgetState
        loading={isLoading}
        error={isError ? error : null}
        loadingText="Analisi team vendite..."
        height={160}
      />
    );
  }

  if (!sellers || sellers.length === 0)
    return (
      <div className="text-center py-8">
        <p className="text-sm text-muted-foreground">Nessun dato venditori per il periodo selezionato.</p>
      </div>
    );

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Venditore</TableHead>
          <TableHead className="text-right">Vinte</TableHead>
          <TableHead className="text-right">Aperte</TableHead>
          <TableHead className="text-right">Win rate</TableHead>
          <TableHead className="text-right">Valore vinto</TableHead>
          <TableHead>Target mese</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sellers.map((s) => (
          <TableRow
            key={s.assigned_to ?? "unassigned"}
            className={s.assigned_to ? "cursor-pointer hover:bg-muted/50" : ""}
            onClick={() =>
              s.assigned_to &&
              navigate(`/azienda/marketing/opportunita?assigned_to=${s.assigned_to}`)
            }
          >
            <TableCell className="font-medium">
              {s.display_name}
            </TableCell>
            <TableCell className="text-right">
              <Badge variant={s.won_count > 0 ? "default" : "secondary"}>
                {s.won_count}
              </Badge>
            </TableCell>
            <TableCell className="text-right">{s.open_count}</TableCell>
            <TableCell className="text-right">
              {pct(s.win_rate)}
            </TableCell>
            <TableCell className="text-right">
              {fmt(s.won_value)}
            </TableCell>
            <TableCell>
              {s.target_amount > 0 ? (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span>
                      {fmt(s.won_value)} / {fmt(s.target_amount)}
                    </span>
                    <span
                      className={
                        s.target_achievement >= 100
                          ? "text-green-600 font-bold"
                          : ""
                      }
                    >
                      {pct(s.target_achievement)}
                    </span>
                  </div>
                  <Progress value={Math.min(s.target_achievement, 100)} className="h-2" />
                </div>
              ) : (
                <span className="text-xs text-muted-foreground">No target</span>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// ─── ConversionBySourceChart ──────────────────────────────────────────────────

function ConversionBySourceChart({ companyId, dateFrom }: { companyId: string; dateFrom: string | null }) {
  const navigate = useNavigate();
  const { data: sources, isLoading, isError, error } = useConversionBySource(companyId, dateFrom);

  if (isLoading || isError) {
    return (
      <WidgetState
        loading={isLoading}
        error={isError ? error : null}
        loadingText="Analisi fonti lead..."
        height={200}
      />
    );
  }

  if (!sources || sources.length === 0)
    return (
      <div className="text-center py-8">
        <p className="text-sm text-muted-foreground">Nessun dato fonte lead disponibile.</p>
      </div>
    );

  const chartData = sources.slice(0, 8).map((s) => ({
    fonte:
      s.source.length > 15 ? s.source.slice(0, 15) + "…" : s.source,
    Opportunità: s.total_opportunities,
    "Chiuse vinte": s.won_opportunities,
    "Win rate %": parseFloat(s.win_rate.toFixed(1)),
  }));

  const goSource = (src: string) =>
    navigate(`/azienda/marketing/opportunita?source=${encodeURIComponent(src)}`);

  return (
    <div className="space-y-4">
      <p className="text-[10px] text-muted-foreground flex items-center gap-1">
        <MousePointerClick className="h-3 w-3" /> Clicca una barra o una fonte per filtrare le opportunità
      </p>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart
          data={chartData}
          onClick={(e: any) => {
            const src = e?.activePayload?.[0]?.payload?.fonte;
            const orig = sources.find((x) => (x.source.length > 15 ? x.source.slice(0, 15) + "…" : x.source) === src);
            if (orig) goSource(orig.source);
          }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="fonte" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Legend />
          <Tooltip
            formatter={(value: number, name: string) =>
              name === "Win rate %"
                ? [`${value.toFixed(1)}%`, name]
                : [value, name]
            }
          />
          <Bar dataKey="Opportunità" fill="hsl(var(--muted-foreground))" opacity={0.5} radius={[2, 2, 0, 0]} style={{ cursor: "pointer" }} />
          <Bar dataKey="Chiuse vinte" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} style={{ cursor: "pointer" }} />
        </BarChart>
      </ResponsiveContainer>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {sources.slice(0, 4).map((s) => (
          <button
            key={s.source}
            onClick={() => goSource(s.source)}
            className="text-center rounded-md p-2 hover:bg-muted/60 transition"
          >
            <p className="text-xs text-muted-foreground truncate">{s.source}</p>
            <p className="text-sm font-semibold">
              {fmt(s.total_won_value)}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── TopLeadsTable ────────────────────────────────────────────────────────────

function TopLeadsTable({ companyId }: { companyId: string }) {
  const navigate = useNavigate();
  const { data: leads, isLoading, isError, error } = useTopLeads(companyId, 10);

  if (isLoading || isError) {
    return (
      <WidgetState
        loading={isLoading}
        error={isError ? error : null}
        loadingText="Calcolo lead score..."
        height={160}
      />
    );
  }

  if (!leads || leads.length === 0)
    return (
      <div className="text-center py-8">
        <p className="text-sm text-muted-foreground">Nessun lead con score disponibile.</p>
      </div>
    );

  const tierColor: Record<string, string> = {
    A: "bg-green-100 text-green-800",
    B: "bg-blue-100 text-blue-800",
    C: "bg-yellow-100 text-yellow-800",
    D: "bg-gray-100 text-gray-800",
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Lead</TableHead>
          <TableHead>Tier ICP</TableHead>
          <TableHead>Score</TableHead>
          <TableHead>Fonte</TableHead>
          <TableHead className="text-right">Opp. aperte</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {leads.map((lead) => (
          <TableRow
            key={lead.id}
            className="cursor-pointer hover:bg-muted/50"
            onClick={() => navigate(`/azienda/marketing/contatti/${lead.id}`)}
          >
            <TableCell>
              <p className="font-medium text-sm">{lead.full_name}</p>
              {lead.company_name && (
                <p className="text-xs text-muted-foreground">{lead.company_name}</p>
              )}
            </TableCell>
            <TableCell>
              {lead.icp_tier ? (
                <Badge className={tierColor[lead.icp_tier] ?? ""}>
                  {lead.icp_tier}
                </Badge>
              ) : (
                "—"
              )}
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-2">
                <div className="w-16">
                  <Progress value={lead.lead_score} className="h-2" />
                </div>
                <span className="text-sm font-semibold">
                  {lead.lead_score}
                </span>
              </div>
            </TableCell>
            <TableCell>
              {lead.source ?? "—"}
            </TableCell>
            <TableCell className="text-right">
              {lead.open_opportunities_count > 0 ? (
                <Badge>{lead.open_opportunities_count}</Badge>
              ) : (
                "0"
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// ─── SalesOSDashboard (pagina principale) ────────────────────────────────────

export default function SalesOSDashboard() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id ?? null;
  const [activeTab, setActiveTab] = useState("pipeline");
  const [period, setPeriod] = useState<SalesOSPeriod>("30d");

  const range = useMemo(() => getPeriodRange(period), [period]);

  if (!companyId)
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-2 text-muted-foreground">
        <Target className="h-8 w-8 opacity-40" />
        <span>Seleziona un'azienda per visualizzare Sales OS.</span>
      </div>
    );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Target className="h-6 w-6 text-primary" />
              Sales OS
            </h1>
            <p className="text-sm text-muted-foreground">
              Centro di comando commerciale
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <Select value={period} onValueChange={(v) => setPeriod(v as SalesOSPeriod)}>
            <SelectTrigger className="w-[180px] h-9">
              <SelectValue placeholder="Periodo" />
            </SelectTrigger>
            <SelectContent>
              {PERIOD_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* KPI Bar — sempre visibile */}
      <SalesVelocityCard companyId={companyId} daysBack={range.daysBack} periodLabel={range.label} />

      {/* Tabs principali */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-4 w-full max-w-lg">
          <TabsTrigger value="pipeline" className="flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5" />
            Pipeline
          </TabsTrigger>
          <TabsTrigger value="stalled" className="flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />
            Ferme
          </TabsTrigger>
          <TabsTrigger value="team" className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" />
            Team
          </TabsTrigger>
          <TabsTrigger value="analisi" className="flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5" />
            Analisi
          </TabsTrigger>
        </TabsList>

        {/* TAB: Pipeline & Forecast */}
        <TabsContent value="pipeline" className="space-y-4 mt-4">
          {/* Deal Health Overview */}
          <DealHealthOverview companyId={companyId} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Target className="h-4 w-4 text-primary" />
                  Pipeline Pesata per Stage
                </CardTitle>
              </CardHeader>
              <CardContent>
                <WeightedPipelineChart companyId={companyId} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-green-500" />
                  Forecast Prossimi 3 Mesi
                </CardTitle>
              </CardHeader>
              <CardContent>
                <SalesForecastChart companyId={companyId} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* TAB: Opportunità ferme */}
        <TabsContent value="stalled" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                Opportunità Ferme — Richiede Attenzione
              </CardTitle>
            </CardHeader>
            <CardContent>
              <StalledOpportunitiesPanel companyId={companyId} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB: Team / Venditori */}
        <TabsContent value="team" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                Confronto Venditori — Mese Corrente
              </CardTitle>
            </CardHeader>
            <CardContent>
              <SellerComparisonTable companyId={companyId} dateFrom={range.dateFrom} dateTo={range.dateTo} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Target className="h-4 w-4 text-primary" />
                Top Lead per Score
              </CardTitle>
            </CardHeader>
            <CardContent>
              <TopLeadsTable companyId={companyId} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB: Analisi conversione */}
        <TabsContent value="analisi" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">
                Conversione per Fonte Lead
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ConversionBySourceChart companyId={companyId} dateFrom={range.dateFrom} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
