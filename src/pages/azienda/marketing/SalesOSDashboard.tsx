import { useState } from "react";
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
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid,
} from "recharts";
import { Zap, AlertTriangle, Users, Target, Clock, Loader2, TrendingUp } from "lucide-react";
import { fmtCur } from "@/components/marketing/dashboard/utils";

const pct = (v: number) => `${v.toFixed(1)}%`;

// ── Sales Velocity Card ──
function SalesVelocityCard({ companyId }: { companyId: string }) {
  const { data: velocity, isLoading } = useSalesVelocity(companyId);

  if (isLoading) return (
    <Card><CardContent className="h-24 flex items-center justify-center">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </CardContent></Card>
  );
  if (!velocity) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" /> Sales Velocity (ultimi 90gg)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{fmtCur(velocity.sales_velocity)}/giorno</div>
        <div className="grid grid-cols-3 gap-4 mt-3 text-sm">
          <div><span className="text-muted-foreground">Opp. aperte</span><p className="font-semibold">{velocity.open_opportunities}</p></div>
          <div><span className="text-muted-foreground">Win rate</span><p className="font-semibold">{pct(velocity.win_rate)}</p></div>
          <div><span className="text-muted-foreground">Ciclo medio</span><p className="font-semibold">{velocity.avg_cycle_days.toFixed(0)}gg</p></div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Weighted Pipeline Chart ──
function WeightedPipelineChart({ companyId }: { companyId: string }) {
  const { data: pipeline, isLoading } = useWeightedPipeline(companyId);

  if (isLoading) return <Card><CardContent className="h-64 flex items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></CardContent></Card>;

  const totalWeighted = (pipeline ?? []).reduce((s, r) => s + r.weighted_value, 0);
  const totalExpected = (pipeline ?? []).reduce((s, r) => s + r.total_value, 0);

  const chartData = (pipeline ?? []).map((stage) => ({
    name: stage.stage_name.length > 12 ? stage.stage_name.slice(0, 12) + "…" : stage.stage_name,
    "Valore totale": stage.total_value,
    "Forecast pesato": stage.weighted_value,
  }));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Pipeline Pesata per Stage</CardTitle>
        <p className="text-xs text-muted-foreground">
          Forecast pesato <span className="font-semibold text-foreground">{fmtCur(totalWeighted)}</span> su {fmtCur(totalExpected)} totali
        </p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
            <Tooltip formatter={(value: number, name: string) => [fmtCur(value), name]} />
            <Bar dataKey="Valore totale" fill="hsl(var(--muted-foreground))" opacity={0.4} radius={[2, 2, 0, 0]} />
            <Bar dataKey="Forecast pesato" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

// ── Sales Forecast Chart ──
function SalesForecastChart({ companyId }: { companyId: string }) {
  const { data: forecast, isLoading } = useSalesForecast(companyId);

  if (isLoading) return <Card><CardContent className="h-48 flex items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></CardContent></Card>;
  if (!forecast?.length) return (
    <Card><CardContent className="h-48 flex items-center justify-center flex-col gap-2">
      <Target className="h-8 w-8 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">Nessun forecast disponibile.</p>
      <p className="text-xs text-muted-foreground">Aggiungi date di chiusura prevista alle opportunità aperte.</p>
    </CardContent></Card>
  );

  const chartData = forecast.map((m) => ({
    mese: new Date(m.forecast_month).toLocaleDateString("it-IT", { month: "short", year: "2-digit" }),
    Atteso: m.expected_revenue,
    Pesato: m.weighted_revenue,
  }));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-green-500" /> Forecast Commerciale Pesato (3 mesi)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="mese" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
            <Tooltip formatter={(value: number, name: string) => [fmtCur(value), name]} />
            <Line type="monotone" dataKey="Atteso" stroke="hsl(var(--muted-foreground))" strokeDasharray="5 5" />
            <Line type="monotone" dataKey="Pesato" stroke="hsl(var(--primary))" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

// ── Stalled Opportunities Panel ──
function StalledOpportunitiesPanel({ companyId }: { companyId: string }) {
  const { data: stalled, isLoading } = useStalledOpportunities(companyId);

  if (isLoading) return <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  if (!stalled?.length) return <p className="text-sm text-muted-foreground text-center py-8">Nessuna opportunità ferma. Pipeline attiva! 🎉</p>;

  const shown = stalled.slice(0, 10);
  const remaining = stalled.length - shown.length;

  return (
    <div className="space-y-2">
      {shown.map((opp) => (
        <div key={opp.opportunity_id} className="flex items-center justify-between p-3 rounded-lg border bg-background">
          <div>
            <p className="text-sm font-medium">{opp.opportunity_name}</p>
            <p className="text-xs text-muted-foreground">
              {opp.contact_name} • Stage: {opp.stage_name}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold">{fmtCur(opp.value)}</span>
            <Badge variant="destructive" className="text-xs whitespace-nowrap">
              <Clock className="h-3 w-3 mr-1" />
              {opp.days_stalled}gg ferma
            </Badge>
          </div>
        </div>
      ))}
      {remaining > 0 && <p className="text-xs text-muted-foreground text-center">+{remaining} altre opportunità ferme</p>}
    </div>
  );
}

// ── Seller Comparison Table ──
function SellerComparisonTable({ companyId }: { companyId: string }) {
  const now = new Date();
  const { data: sellers, isLoading } = useSellerPerformance(companyId, now.getFullYear(), now.getMonth() + 1);

  if (isLoading) return <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  if (!sellers?.length) return <p className="text-sm text-muted-foreground text-center py-8">Nessun dato venditore disponibile per questo mese.</p>;

  const medals = ["🥇", "🥈", "🥉"];

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Venditore</TableHead>
          <TableHead className="text-right">Chiuse</TableHead>
          <TableHead className="text-right">Fatturato</TableHead>
          <TableHead className="text-right">Win Rate</TableHead>
          <TableHead className="text-right">Target</TableHead>
          <TableHead className="text-right">Raggiungimento</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sellers.map((s, i) => (
          <TableRow key={s.assigned_to ?? "unassigned"}>
            <TableCell className="font-medium">
              {i < 3 && <span className="mr-1">{medals[i]}</span>}
              {s.display_name}
            </TableCell>
            <TableCell className="text-right">
              <Badge variant={s.won_count > 0 ? "default" : "secondary"}>{s.won_count}</Badge>
            </TableCell>
            <TableCell className="text-right">{fmtCur(s.won_value)}</TableCell>
            <TableCell className={`text-right ${s.win_rate >= 50 ? "text-green-600 font-medium" : "text-muted-foreground"}`}>
              {pct(s.win_rate)}
            </TableCell>
            <TableCell className="text-right">{s.target_amount > 0 ? fmtCur(s.target_amount) : "—"}</TableCell>
            <TableCell className="text-right">
              {s.target_amount > 0 ? (
                <span className={s.target_achievement >= 100 ? "text-green-600 font-bold" : ""}>
                  {pct(s.target_achievement)}
                </span>
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

// ── Conversion By Source Chart ──
function ConversionBySourceChart({ companyId }: { companyId: string }) {
  const { data: sources, isLoading } = useConversionBySource(companyId);

  if (isLoading) return <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  if (!sources?.length) return <p className="text-sm text-muted-foreground text-center py-8">Nessun dato fonte lead disponibile.</p>;

  const chartData = sources.slice(0, 8).map((s) => ({
    fonte: s.source,
    Vinte: s.total_won_value,
  }));

  return (
    <div className="space-y-4">
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={chartData} layout="vertical">
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis type="number" tick={{ fontSize: 11 }} />
          <YAxis type="category" dataKey="fonte" tick={{ fontSize: 11 }} width={100} />
          <Tooltip formatter={(value: number) => fmtCur(value)} />
          <Bar dataKey="Vinte" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Top Leads Table ──
function TopLeadsTable({ companyId }: { companyId: string }) {
  const { data: leads, isLoading } = useTopLeads(companyId);

  if (isLoading) return <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  if (!leads?.length) return <p className="text-sm text-muted-foreground text-center py-8">Nessun lead con score disponibile.</p>;

  const tierColors: Record<string, string> = {
    A: "bg-green-100 text-green-800 border-green-200",
    B: "bg-blue-100 text-blue-800 border-blue-200",
    C: "bg-yellow-100 text-yellow-800 border-yellow-200",
    D: "bg-muted text-muted-foreground",
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Lead</TableHead>
          <TableHead>Tier ICP</TableHead>
          <TableHead className="text-right">Score</TableHead>
          <TableHead>Fonte</TableHead>
          <TableHead className="text-right">Opp. aperte</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {leads.slice(0, 10).map((lead) => (
          <TableRow key={lead.id}>
            <TableCell>
              <p className="font-medium text-sm">{lead.full_name}</p>
              {lead.company_name && <p className="text-xs text-muted-foreground">{lead.company_name}</p>}
            </TableCell>
            <TableCell>
              {lead.icp_tier ? (
                <Badge className={tierColors[lead.icp_tier] ?? ""}>Tier {lead.icp_tier}</Badge>
              ) : "—"}
            </TableCell>
            <TableCell className="text-right font-semibold">{lead.lead_score}</TableCell>
            <TableCell className="text-sm">{lead.source ?? "—"}</TableCell>
            <TableCell className="text-right">
              {lead.open_opportunities_count > 0 ? (
                <Badge>{lead.open_opportunities_count}</Badge>
              ) : "0"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// ── Main Dashboard ──
export default function SalesOSDashboard() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const [activeTab, setActiveTab] = useState("pipeline");

  if (!companyId) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Sales OS</h1>
        <p className="text-sm text-muted-foreground">Centro di comando commerciale</p>
      </div>

      <SalesVelocityCard companyId={companyId} />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-4 w-full max-w-lg">
          <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
          <TabsTrigger value="stalled" className="flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" /> Ferme
          </TabsTrigger>
          <TabsTrigger value="team" className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" /> Team
          </TabsTrigger>
          <TabsTrigger value="analisi">Analisi</TabsTrigger>
        </TabsList>

        <TabsContent value="pipeline" className="space-y-4 mt-4">
          <WeightedPipelineChart companyId={companyId} />
          <SalesForecastChart companyId={companyId} />
        </TabsContent>

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

        <TabsContent value="team" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Confronto Venditori — Mese Corrente</CardTitle>
            </CardHeader>
            <CardContent>
              <SellerComparisonTable companyId={companyId} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Top Lead per Score</CardTitle>
            </CardHeader>
            <CardContent>
              <TopLeadsTable companyId={companyId} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analisi" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Conversione per Fonte Lead</CardTitle>
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
