import React, { useState } from "react";
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
import { Button } from "@/components/ui/button";
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

// ─── Utilities ───────────────────────────────────────────────────────────────

const fmt = (v: number) =>
  new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(v);

const pct = (v: number) => `${v.toFixed(1)}%`;

// ─── SalesVelocityCard ────────────────────────────────────────────────────────

function SalesVelocityCard({ companyId }: { companyId: string }) {
  const { data: velocity, isLoading } = useSalesVelocity(companyId);

  if (isLoading)
    return (
      <Card>
        <CardContent className="h-24 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">Calcolo velocità...</span>
        </CardContent>
      </Card>
    );

  if (!velocity) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          Sales Velocity
          <span className="text-xs text-muted-foreground font-normal">(ultimi 90gg)</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">
          {fmt(velocity.sales_velocity)}
          <span className="text-sm font-normal text-muted-foreground ml-1">/giorno</span>
        </div>
        <div className="grid grid-cols-4 gap-4 mt-3 text-sm">
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
  const { data: stages, isLoading } = useWeightedPipeline(companyId);

  if (isLoading)
    return (
      <Card>
        <CardContent className="h-64 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">Caricamento pipeline...</span>
        </CardContent>
      </Card>
    );

  if (!stages || stages.length === 0)
    return (
      <Card>
        <CardContent className="h-64 flex items-center justify-center text-sm text-muted-foreground">
          Nessuna opportunità aperta.
        </CardContent>
      </Card>
    );

  const chartData = stages.map((s) => ({
    name:
      s.stage_name.length > 12
        ? s.stage_name.slice(0, 12) + "…"
        : s.stage_name,
    "Valore totale": Math.round(s.total_value),
    "Valore pesato": Math.round(s.weighted_value),
    "N° opp": s.opportunity_count,
    "Prob %": s.avg_probability,
  }));

  return (
    <div className="space-y-4">
      <ResponsiveContainer width="100%" height={250}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`} />
          <Tooltip
            formatter={(value: number, name: string) =>
              name === "Prob %" ? [`${value}%`, name] : [fmt(value), name]
            }
          />
          <Legend />
          <Bar dataKey="Valore totale" fill="hsl(var(--muted-foreground))" opacity={0.4} radius={[2, 2, 0, 0]} />
          <Bar dataKey="Valore pesato" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} />
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
  const { data: forecast, isLoading } = useSalesForecast(companyId, 3);

  if (isLoading)
    return (
      <Card>
        <CardContent className="h-48 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">Calcolo forecast...</span>
        </CardContent>
      </Card>
    );

  if (!forecast || forecast.length === 0)
    return (
      <Card>
        <CardContent className="h-48 flex items-center justify-center text-sm text-muted-foreground">
          Nessuna opportunità con data chiusura impostata.
        </CardContent>
      </Card>
    );

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
          tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`}
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
  const { data: stalled, isLoading } = useStalledOpportunities(companyId);
  const navigate = useNavigate();

  if (isLoading)
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Analisi opportunità ferme...</span>
      </div>
    );

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
            onClick={() => navigate(`/azienda/marketing/opportunita`)}
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

function SellerComparisonTable({ companyId }: { companyId: string }) {
  const now = new Date();
  const { data: sellers, isLoading } = useSellerPerformance(
    companyId,
    now.getFullYear(),
    now.getMonth() + 1
  );

  if (isLoading)
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Analisi team vendite...</span>
      </div>
    );

  if (!sellers || sellers.length === 0)
    return (
      <div className="text-center py-8">
        <p className="text-sm text-muted-foreground">Nessun dato venditori per questo mese.</p>
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
          <TableRow key={s.assigned_to ?? "unassigned"}>
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

function ConversionBySourceChart({ companyId }: { companyId: string }) {
  const { data: sources, isLoading } = useConversionBySource(companyId);

  if (isLoading)
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Analisi fonti lead...</span>
      </div>
    );

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

  return (
    <div className="space-y-4">
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={chartData}>
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
          <Bar dataKey="Opportunità" fill="hsl(var(--muted-foreground))" opacity={0.5} radius={[2, 2, 0, 0]} />
          <Bar dataKey="Chiuse vinte" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {sources.slice(0, 4).map((s) => (
          <div key={s.source} className="text-center">
            <p className="text-xs text-muted-foreground">{s.source}</p>
            <p className="text-sm font-semibold">
              {fmt(s.total_won_value)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── TopLeadsTable ────────────────────────────────────────────────────────────

function TopLeadsTable({ companyId }: { companyId: string }) {
  const { data: leads, isLoading } = useTopLeads(companyId, 10);

  if (isLoading)
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Calcolo lead score...</span>
      </div>
    );

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
          <TableRow key={lead.id}>
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

  if (!companyId)
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Caricamento dati azienda...</span>
      </div>
    );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
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
      </div>

      {/* KPI Bar — sempre visibile */}
      <SalesVelocityCard companyId={companyId} />

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
              <SellerComparisonTable companyId={companyId} />
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
              <ConversionBySourceChart companyId={companyId} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
