import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { exportToCSV } from "@/lib/csvExport";
import { formatCurrency } from "@/lib/formatters";
import { subDays, format } from "date-fns";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  AlertTriangle,
  Download,
  Loader2,
  MousePointerClick,
  Target,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";

type PeriodDays = 7 | 30 | 90;
type ClickRow = {
  id: string;
  created_at: string | null;
  converted: boolean | null;
  dedupe_key: string | null;
  device_hash: string | null;
  landing_page: string | null;
  utm_campaign: string | null;
  utm_medium: string | null;
  utm_source: string | null;
};
type ConversionRow = {
  created_at: string;
  status: string;
  revenue: number | null;
  commission_amount: number | null;
  fraud_status: string | null;
  source_click_id: string | null;
};

type KpiCardProps = {
  title: string;
  value: string;
  note: string;
  icon: typeof MousePointerClick;
  delta?: number;
};

const statusCountsAsCustomer = (status: string | null | undefined) =>
  ["active", "paying", "approved"].includes(String(status || "").toLowerCase());

const formatRate = (value: number) => `${Number.isFinite(value) ? value.toFixed(1) : "0.0"}%`;

const getDelta = (current: number, previous: number) => {
  if (previous <= 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
};

function KpiCard({ title, value, note, icon: Icon, delta }: KpiCardProps) {
  const hasDelta = typeof delta === "number";
  const positive = (delta || 0) >= 0;
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-4 p-5">
        <div>
          <p className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
            <Icon className="h-3.5 w-3.5" /> {title}
          </p>
          <p className="mt-2 text-2xl font-bold">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{note}</p>
        </div>
        {hasDelta && (
          <Badge variant="outline" className={positive ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}>
            {positive ? "+" : ""}{delta.toFixed(0)}%
          </Badge>
        )}
      </CardContent>
    </Card>
  );
}

export default function PartnerPerformance() {
  const { user } = useAuth();
  const [periodDays, setPeriodDays] = useState<PeriodDays>(30);

  const { data: referrer, isLoading: referrerLoading } = useQuery({
    queryKey: ["my-referrer-performance", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("referrers")
        .select("id, total_clicks, total_conversions, conversion_rate, total_earned, total_paid")
        .eq("user_id", user!.id)
        .maybeSingle();
      return data;
    },
  });

  const { data: clicks = [], isLoading: clicksLoading } = useQuery({
    queryKey: ["partner-performance-clicks", referrer?.id, periodDays],
    enabled: !!referrer?.id,
    queryFn: async () => {
      const from = subDays(new Date(), periodDays * 2).toISOString();
      const { data, error } = await supabase
        .from("referral_clicks")
        .select("id, created_at, converted, dedupe_key, device_hash, landing_page, utm_campaign, utm_medium, utm_source")
        .eq("referrer_id", referrer!.id)
        .gte("created_at", from);
      if (error) throw error;
      return (data || []) as ClickRow[];
    },
  });

  const { data: conversions = [], isLoading: conversionsLoading } = useQuery({
    queryKey: ["partner-performance-conversions", referrer?.id, periodDays],
    enabled: !!referrer?.id,
    queryFn: async () => {
      const from = subDays(new Date(), periodDays * 2).toISOString();
      const { data, error } = await supabase
        .from("referral_conversions")
        .select("created_at, status, revenue, commission_amount, fraud_status, source_click_id")
        .eq("referrer_id", referrer!.id)
        .gte("created_at", from);
      if (error) throw error;
      return (data || []) as ConversionRow[];
    },
  });

  const isLoading = referrerLoading || clicksLoading || conversionsLoading;
  const periodWindow = useMemo(() => {
    const date = new Date();
    return {
      now: date,
      currentFrom: subDays(date, periodDays),
      previousFrom: subDays(date, periodDays * 2),
    };
  }, [periodDays]);
  const { now, currentFrom, previousFrom } = periodWindow;

  const currentClicks = useMemo(
    () => clicks.filter((click) => Boolean(click.created_at && new Date(click.created_at) >= currentFrom)),
    [clicks, currentFrom],
  );
  const previousClicks = useMemo(
    () => clicks.filter((click) => {
      if (!click.created_at) return false;
      const date = new Date(click.created_at);
      return date >= previousFrom && date < currentFrom;
    }),
    [clicks, currentFrom, previousFrom],
  );
  const currentConversions = useMemo(
    () => conversions.filter((conversion) => new Date(conversion.created_at) >= currentFrom),
    [conversions, currentFrom],
  );
  const previousConversions = useMemo(
    () => conversions.filter((conversion) => {
      const date = new Date(conversion.created_at);
      return date >= previousFrom && date < currentFrom;
    }),
    [conversions, currentFrom, previousFrom],
  );

  const clickById = useMemo(() => new Map(clicks.map((click) => [click.id, click])), [clicks]);

  const daily = useMemo(() => {
    return Array.from({ length: periodDays }, (_, index) => {
      const day = subDays(now, periodDays - 1 - index);
      const key = format(day, "yyyy-MM-dd");
      const dayClicks = currentClicks.filter((click) => click.created_at?.startsWith(key)).length;
      const dayConversions = currentConversions.filter((conversion) => conversion.created_at?.startsWith(key)).length;
      const revenue = currentConversions
        .filter((conversion) => conversion.created_at?.startsWith(key))
        .reduce((sum, conversion) => sum + Number(conversion.revenue || 0), 0);
      return {
        date: format(day, periodDays > 30 ? "dd/MM" : "dd MMM"),
        click: dayClicks,
        conversioni: dayConversions,
        revenue,
      };
    });
  }, [currentClicks, currentConversions, now, periodDays]);

  const sourceRows = useMemo(() => {
    const map = new Map<string, {
      source: string;
      campaign: string;
      medium: string;
      clicks: number;
      convertedClicks: number;
      conversions: number;
      revenue: number;
      commission: number;
      flagged: number;
    }>();

    currentClicks.forEach((click) => {
      const source = click.utm_source || "direct";
      const campaign = click.utm_campaign || "senza campagna";
      const medium = click.utm_medium || "n/d";
      const key = `${source}__${campaign}__${medium}`;
      const row = map.get(key) || { source, campaign, medium, clicks: 0, convertedClicks: 0, conversions: 0, revenue: 0, commission: 0, flagged: 0 };
      row.clicks += 1;
      if (click.converted) row.convertedClicks += 1;
      map.set(key, row);
    });

    currentConversions.forEach((conversion) => {
      const click = conversion.source_click_id ? clickById.get(conversion.source_click_id) : undefined;
      const source = click?.utm_source || "non tracciata";
      const campaign = click?.utm_campaign || "senza campagna";
      const medium = click?.utm_medium || "n/d";
      const key = `${source}__${campaign}__${medium}`;
      const row = map.get(key) || { source, campaign, medium, clicks: 0, convertedClicks: 0, conversions: 0, revenue: 0, commission: 0, flagged: 0 };
      row.conversions += 1;
      row.revenue += Number(conversion.revenue || 0);
      row.commission += Number(conversion.commission_amount || 0);
      if (conversion.fraud_status && conversion.fraud_status !== "clear") row.flagged += 1;
      map.set(key, row);
    });

    return Array.from(map.values())
      .map((row) => ({ ...row, rate: row.clicks > 0 ? (row.conversions / row.clicks) * 100 : 0 }))
      .sort((a, b) => b.commission - a.commission || b.revenue - a.revenue || b.clicks - a.clicks);
  }, [clickById, currentClicks, currentConversions]);

  const chartSources = sourceRows.slice(0, 6).map((row) => ({
    source: row.campaign === "senza campagna" ? row.source : `${row.source} · ${row.campaign}`,
    count: row.clicks,
  }));

  const currentRevenue = currentConversions.reduce((sum, item) => sum + Number(item.revenue || 0), 0);
  const currentCommission = currentConversions.reduce((sum, item) => sum + Number(item.commission_amount || 0), 0);
  const previousCommission = previousConversions.reduce((sum, item) => sum + Number(item.commission_amount || 0), 0);
  const currentCustomers = currentConversions.filter((conversion) => statusCountsAsCustomer(conversion.status)).length;
  const conversionRate = currentClicks.length > 0 ? (currentConversions.length / currentClicks.length) * 100 : Number(referrer?.conversion_rate || 0);
  const previousRate = previousClicks.length > 0 ? (previousConversions.length / previousClicks.length) * 100 : 0;
  const duplicateSignals = currentClicks.filter((click) => click.dedupe_key || click.device_hash).length;
  const flaggedConversions = currentConversions.filter((conversion) => conversion.fraud_status && conversion.fraud_status !== "clear").length;
  const bestSource = sourceRows[0];
  const leakySource = sourceRows.find((row) => row.clicks >= Math.max(5, currentClicks.length * 0.15) && row.conversions === 0);

  const insights = [
    currentClicks.length === 0 ? "Nessun click nel periodo: crea una campagna dedicata o condividi il link partner." : "",
    conversionRate < previousRate ? `Conversion rate in calo: ${formatRate(previousRate)} -> ${formatRate(conversionRate)}.` : "",
    leakySource ? `${leakySource.source} porta traffico ma nessuna conversione: rivedi messaggio o landing.` : "",
    flaggedConversions > 0 ? `${flaggedConversions} conversione/i con controllo frode: verifica prima di considerarle definitive.` : "",
    duplicateSignals > currentClicks.length * 0.25 && currentClicks.length > 0 ? "Molti click hanno segnali duplicati: attenzione a traffico ripetuto dallo stesso dispositivo." : "",
    bestSource && bestSource.conversions > 0 ? `Canale migliore: ${bestSource.source} con ${bestSource.conversions} conversione/i e ${formatCurrency(bestSource.commission)} commissioni.` : "",
  ].filter(Boolean);

  const exportPerformance = () => {
    if (sourceRows.length === 0) return;
    exportToCSV(
      sourceRows.map((row) => ({
        source: row.source,
        campaign: row.campaign,
        medium: row.medium,
        clicks: String(row.clicks),
        conversions: String(row.conversions),
        rate: formatRate(row.rate),
        revenue: row.revenue.toFixed(2),
        commission: row.commission.toFixed(2),
        flagged: String(row.flagged),
      })),
      [
        { key: "source", label: "Sorgente" },
        { key: "campaign", label: "Campagna" },
        { key: "medium", label: "Medium" },
        { key: "clicks", label: "Click" },
        { key: "conversions", label: "Conversioni" },
        { key: "rate", label: "Tasso" },
        { key: "revenue", label: "Revenue" },
        { key: "commission", label: "Commissioni" },
        { key: "flagged", label: "Controlli frode" },
      ],
      `performance-partner-${periodDays}g.csv`,
    );
  };

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  if (!referrer) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <TrendingUp className="mx-auto mb-4 h-12 w-12 opacity-40" />
            <h1 className="text-xl font-semibold text-foreground">Performance non disponibili</h1>
            <p className="mt-2 text-sm">Il tuo account non è ancora associato a un profilo partner attivo.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Performance</h1>
          <p className="text-sm text-muted-foreground">
            Funnel, canali, conversioni e commissioni con confronto sul periodo precedente.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Tabs value={String(periodDays)} onValueChange={(value) => setPeriodDays(Number(value) as PeriodDays)}>
            <TabsList>
              <TabsTrigger value="7">7g</TabsTrigger>
              <TabsTrigger value="30">30g</TabsTrigger>
              <TabsTrigger value="90">90g</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button variant="outline" size="sm" onClick={exportPerformance} disabled={sourceRows.length === 0}>
            <Download className="mr-2 h-4 w-4" /> Export
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard title={`Click ${periodDays}g`} value={String(currentClicks.length)} note={`${previousClicks.length} nel periodo precedente`} icon={MousePointerClick} delta={getDelta(currentClicks.length, previousClicks.length)} />
        <KpiCard title="Conversioni" value={String(currentConversions.length)} note={`${currentCustomers} clienti attivi/paganti`} icon={Users} delta={getDelta(currentConversions.length, previousConversions.length)} />
        <KpiCard title="Conversion rate" value={formatRate(conversionRate)} note={`${formatRate(previousRate)} nel periodo precedente`} icon={Target} delta={conversionRate - previousRate} />
        <KpiCard title="Commissioni" value={formatCurrency(currentCommission)} note={`${formatCurrency(previousCommission)} nel periodo precedente`} icon={Wallet} delta={getDelta(currentCommission, previousCommission)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Andamento click, conversioni e revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={daily}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={periodDays > 30 ? 18 : 8} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                <Area type="monotone" dataKey="click" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.18)" name="Click" />
                <Area type="monotone" dataKey="conversioni" stroke="#10b981" fill="#10b98122" name="Conversioni" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base">
              Funnel
              <Badge variant="outline">{formatCurrency(currentRevenue)}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              { label: "Click", value: currentClicks.length, percent: 100 },
              { label: "Conversioni", value: currentConversions.length, percent: currentClicks.length ? (currentConversions.length / currentClicks.length) * 100 : 0 },
              { label: "Clienti attivi", value: currentCustomers, percent: currentConversions.length ? (currentCustomers / currentConversions.length) * 100 : 0 },
              { label: "Commissioni", value: formatCurrency(currentCommission), percent: currentRevenue ? Math.min((currentCommission / currentRevenue) * 100, 100) : 0 },
            ].map((step) => (
              <div key={step.label} className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>{step.label}</span>
                  <span className="font-medium">{step.value}</span>
                </div>
                <Progress value={step.percent} />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Sorgenti e campagne</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {sourceRows.length === 0 ? (
              <div className="px-6 py-12 text-center text-sm text-muted-foreground">
                Nessun dato nel periodo selezionato.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Sorgente</TableHead>
                      <TableHead>Campagna</TableHead>
                      <TableHead className="text-right">Click</TableHead>
                      <TableHead className="text-right">Conv.</TableHead>
                      <TableHead className="text-right">Tasso</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                      <TableHead className="text-right">Comm.</TableHead>
                      <TableHead>Stato</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sourceRows.map((row) => (
                      <TableRow key={`${row.source}-${row.campaign}-${row.medium}`}>
                        <TableCell className="font-medium">{row.source}</TableCell>
                        <TableCell>
                          <div>{row.campaign}</div>
                          <div className="text-xs text-muted-foreground">{row.medium}</div>
                        </TableCell>
                        <TableCell className="text-right">{row.clicks}</TableCell>
                        <TableCell className="text-right">{row.conversions}</TableCell>
                        <TableCell className="text-right">{formatRate(row.rate)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(row.revenue)}</TableCell>
                        <TableCell className="text-right font-semibold">{formatCurrency(row.commission)}</TableCell>
                        <TableCell>
                          {row.flagged > 0 ? (
                            <Badge variant="destructive">{row.flagged} controlli</Badge>
                          ) : row.conversions > 0 ? (
                            <Badge variant="default">Converte</Badge>
                          ) : (
                            <Badge variant="secondary">Da ottimizzare</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Canali migliori</CardTitle>
            </CardHeader>
            <CardContent>
              {chartSources.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">Nessun dato sorgente</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={chartSources} layout="vertical" margin={{ left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="source" width={100} tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                    <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} name="Click" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Insight operativi</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {insights.length === 0 ? (
                <div className="flex gap-3 rounded-lg border bg-emerald-50 p-3 text-sm text-emerald-800">
                  <TrendingUp className="mt-0.5 h-4 w-4" />
                  Il periodo è stabile: continua a spingere i canali migliori.
                </div>
              ) : (
                insights.slice(0, 5).map((insight) => (
                  <div key={insight} className="flex gap-3 rounded-lg border bg-muted/30 p-3 text-sm">
                    {insight.includes("calo") || insight.includes("nessuna") || insight.includes("frode") ? (
                      <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-600" />
                    ) : (
                      <TrendingUp className="mt-0.5 h-4 w-4 text-emerald-600" />
                    )}
                    <span>{insight}</span>
                  </div>
                ))
              )}
              {conversionRate < previousRate && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <TrendingDown className="h-3.5 w-3.5" /> Priorità: controlla sorgenti con tanti click e zero conversioni.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
