// SuperAdmin AI economics dashboard — costi REALI OpenRouter vs fatturato vs margine.
// Tutti i dati vengono dall'RPC `get_ai_economics_dashboard` che aggrega:
//   • KPI globali (con confronto periodo precedente)
//   • Breakdown per provider (OpenAI/Anthropic/Google/Mistral/...)
//   • Breakdown per modello (top 20)
//   • Top 10 aziende
//   • Breakdown per task
//   • Trend giornaliero ultimi 30gg
//   • Render economics (sistema separato)
//   • Data quality (% costi reali vs stimati)

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { escapeCsvCell } from "@/lib/csvExport";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Loader2,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Wallet,
  Coins,
  AlertTriangle,
  CheckCircle2,
  Image as ImageIcon,
  RefreshCw,
  Download,
  Banknote,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip as ChartTooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { format } from "date-fns";
import { it } from "date-fns/locale";

import { useIsMobile } from "@/hooks/use-mobile";
type Period = "oggi" | "settimana" | "mese" | "anno" | "all";

interface KPI {
  cost_real_eur: number;
  cost_billed_eur: number;
  margin_eur: number;
  margin_pct: number;
  n_calls: number;
  n_companies: number;
  tokens_total: number;
  avg_cost_per_call_eur: number;
}

interface KpiPrev {
  cost_real_eur: number;
  cost_billed_eur: number;
  margin_eur: number;
  n_calls: number;
}

interface ProviderRow {
  provider: string;
  n_calls: number;
  cost_real_eur: number;
  cost_billed_eur: number;
  margin_eur: number;
  margin_pct: number;
  tokens_total: number;
  avg_markup_x: number;
}

interface ModelRow {
  model_used: string;
  provider: string;
  n_calls: number;
  cost_real_eur: number;
  cost_billed_eur: number;
  margin_eur: number;
  margin_pct: number;
  avg_markup_x: number;
  avg_cost_per_call_usd: number;
  avg_tokens: number;
}

interface CompanyRow {
  company_id: string;
  company_name: string;
  n_calls: number;
  cost_real_eur: number;
  cost_billed_eur: number;
  margin_eur: number;
  margin_pct: number;
}

interface TaskRow {
  task_kind: string;
  display_label: string;
  n_calls: number;
  cost_real_eur: number;
  cost_billed_eur: number;
  margin_eur: number;
  margin_pct: number;
}

interface DailyRow {
  day: string;
  n_calls: number;
  cost_real_eur: number;
  cost_billed_eur: number;
  margin_eur: number;
}

interface RenderStats {
  n_renders: number;
  cost_real_eur: number;
  cost_billed_eur: number;
  revenue_eur: number;        // cash effettivo da consume
  margin_eur: number;
  margin_pct: number;
  topup_eur: number;
  note?: string;
}

interface TopupStats {
  n_topups: number;
  topup_eur: number;
  n_bonus: number;
  bonus_eur: number;
  n_companies: number;
}

interface CoverageStats {
  centralized: number;
  direct: number;
  pct_centralized: number;
}

interface DataQuality {
  n_calls_total: number;
  n_calls_real_cost: number;
  n_calls_estimated: number;
  pct_real: number;
}

interface DashboardData {
  period: Period;
  since: string;
  now: string;
  kpi: KPI;
  kpi_prev: KpiPrev;
  by_provider: ProviderRow[];
  by_model: ModelRow[];
  by_company: CompanyRow[];
  by_task: TaskRow[];
  daily_trend: DailyRow[];
  render: RenderStats;
  topup: TopupStats;
  coverage: CoverageStats;
  data_quality: DataQuality;
  usd_eur_rate: number;
  is_super_admin: boolean;
}

const PERIOD_LABELS: Record<Period, string> = {
  oggi: "Oggi",
  settimana: "7 giorni",
  mese: "30 giorni",
  anno: "12 mesi",
  all: "Sempre",
};

/**
 * Formattazione EUR con precisione adattiva:
 *  - €0 → "€0,00"
 *  - €0.0001 → "€0,0001" (4 decimali)
 *  - €0.50 → "€0,50" (2 decimali)
 *  - €1234.56 → "€1.234,56"
 * Risolve il problema "€0.00" che nascondeva micro-costi.
 */
const fmtEur = (v: number, forceDecimals?: number) => {
  let decimals = forceDecimals ?? 2;
  if (forceDecimals === undefined) {
    if (v === 0) decimals = 2;
    else if (Math.abs(v) < 0.01) decimals = 6;
    else if (Math.abs(v) < 1) decimals = 4;
    else if (Math.abs(v) < 100) decimals = 2;
    else decimals = 0;
  }
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals, useGrouping: "always" }).format(v);
};

const fmtNum = (v: number) =>
  new Intl.NumberFormat("it-IT").format(v);

const fmtPct = (v: number) =>
  `${v.toFixed(1)}%`;

/** Esporta dati come CSV (separatore ; per Excel italiano) */
function downloadCsv(filename: string, rows: Array<Record<string, unknown>>) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => escapeCsvCell(v as string | number | null | undefined, ";");
  const csv = [
    headers.join(";"),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(";")),
  ].join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Calcola variazione % rispetto al periodo precedente */
function calcDelta(current: number, previous: number): { pct: number; sign: "up" | "down" | "flat" } {
  if (previous === 0) return { pct: current > 0 ? 100 : 0, sign: current > 0 ? "up" : "flat" };
  const pct = ((current - previous) / previous) * 100;
  return {
    pct: Math.abs(pct),
    sign: pct > 0.5 ? "up" : pct < -0.5 ? "down" : "flat",
  };
}

export function AdminAiMarginsOverview() {
  const isMobile = useIsMobile();
  const [period, setPeriod] = useState<Period>("mese");

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["admin-ai-economics", period],
    refetchInterval: 60_000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("get_ai_economics_dashboard", {
        p_period: period,
        p_company_id: null,
      });
      if (error) throw error;
      return data as DashboardData;
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-sm text-destructive">Errore caricamento: {String((error as Error)?.message ?? "dati non disponibili")}</p>
        </CardContent>
      </Card>
    );
  }

  const k = data.kpi;
  const kp = data.kpi_prev;
  const dq = data.data_quality;

  const deltaCost = calcDelta(k.cost_real_eur, kp.cost_real_eur);
  const deltaRevenue = calcDelta(k.cost_billed_eur, kp.cost_billed_eur);
  const deltaMargin = calcDelta(k.margin_eur, kp.margin_eur);
  const deltaCalls = calcDelta(k.n_calls, kp.n_calls);

  // Trend chart data
  const chartData = (data.daily_trend ?? []).map((d) => ({
    day: format(new Date(d.day), "dd/MM", { locale: it }),
    "Costo reale": Number(d.cost_real_eur),
    "Fatturato": Number(d.cost_billed_eur),
    "Margine": Number(d.margin_eur),
  }));

  return (
    <div className="space-y-4">
      {/* HEADER + filtro periodo + refresh */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Costi & Margini AI</h3>
          <p className="text-xs text-muted-foreground">
            Costi reali OpenRouter (header <code className="px-1 rounded bg-muted">x-or-cost</code>)
            vs fatturato aziende. Tasso USD→EUR: <strong>{data.usd_eur_rate.toFixed(2)}</strong>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
            <Button
              key={p}
              size="sm"
              variant={period === p ? "default" : "outline"}
              onClick={() => setPeriod(p)}
              className="h-8 text-xs"
            >
              {PERIOD_LABELS[p]}
            </Button>
          ))}
          <Button
            size="icon"
            variant="ghost"
            onClick={() => refetch()}
            disabled={isFetching}
            className="h-8 w-8 ml-1"
            title="Aggiorna"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* COVERAGE BANNER — % chiamate centralizzate vs dirette (cost leakage) */}
      {data.coverage && (data.coverage.centralized + data.coverage.direct) > 0 && data.coverage.pct_centralized < 80 && (
        <Card className="border-rose-300 bg-rose-50/50 dark:bg-rose-950/20">
          <CardContent className="p-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-rose-600 mt-0.5 shrink-0" />
            <div className="text-xs">
              <p className="font-medium text-rose-900 dark:text-rose-200">
                Cost leakage: solo {data.coverage.pct_centralized}% delle chiamate AI passa dal sistema centralizzato
              </p>
              <p className="text-rose-800 dark:text-rose-300 mt-0.5">
                {data.coverage.direct} chiamate non sono tracciate via <code>ai-provider</code>.
                I numeri di costo reale sono <strong>incompleti</strong> — wrappare le edge functions dirette
                (kb-ingest, parse-rapportino, ai-genera-preventivo-v2, ecc.).
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Data quality alert */}
      {dq.n_calls_total > 0 && dq.pct_real < 95 && (
        <Card className="border-amber-300 bg-amber-50/50 dark:bg-amber-950/20">
          <CardContent className="p-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
            <div className="text-xs">
              <p className="font-medium text-amber-900 dark:text-amber-200">
                Solo {dq.pct_real}% delle chiamate ha costo reale da OpenRouter
              </p>
              <p className="text-amber-800 dark:text-amber-300 mt-0.5">
                {dq.n_calls_estimated} chiamate hanno costo stimato (header <code>x-or-cost</code> assente).
                I numeri di costo reale potrebbero essere imprecisi.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {dq.n_calls_total > 0 && dq.pct_real >= 95 && (
        <Card className="border-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/20">
          <CardContent className="p-2.5 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <p className="text-xs text-emerald-800 dark:text-emerald-300">
              {dq.pct_real}% delle chiamate ha costo REALE da OpenRouter — dati affidabili
            </p>
          </CardContent>
        </Card>
      )}

      {/* KPI 4 colonne */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          label="Costo OpenRouter"
          value={fmtEur(k.cost_real_eur)}
          subValue={`${fmtNum(k.n_calls)} chiamate`}
          delta={deltaCost}
          icon={<Wallet className="h-5 w-5" />}
          tone="neutral"
        />
        <KpiCard
          label="Fatturato aziende"
          value={fmtEur(k.cost_billed_eur)}
          subValue={`${fmtNum(k.n_companies)} aziende`}
          delta={deltaRevenue}
          icon={<DollarSign className="h-5 w-5" />}
          tone="emerald"
        />
        <KpiCard
          label="Margine netto"
          value={fmtEur(k.margin_eur)}
          subValue={`${fmtPct(k.margin_pct)} margine`}
          delta={deltaMargin}
          icon={<Coins className="h-5 w-5" />}
          tone="primary"
        />
        <KpiCard
          label="Costo medio/call"
          value={fmtEur(k.avg_cost_per_call_eur)}
          subValue={`${fmtNum(k.tokens_total)} tokens`}
          delta={deltaCalls}
          icon={<TrendingUp className="h-5 w-5" />}
          tone="neutral"
        />
      </div>

      {/* RENDER STATS — sistema separato gpt-image-1 */}
      {data.render && data.render.n_renders > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <ImageIcon className="h-4 w-4 text-violet-600" />
              Render AI (separato — gpt-image-1, Gemini Flash QA)
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
            <div>
              <p className="text-muted-foreground">N. render</p>
              <p className="font-semibold text-base">{fmtNum(data.render.n_renders)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Costo OpenAI</p>
              <p className="font-semibold text-base">{fmtEur(data.render.cost_real_eur)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Fatturato crediti</p>
              <p className="font-semibold text-base">{fmtEur(data.render.cost_billed_eur)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Margine</p>
              <p className="font-semibold text-base text-primary">
                {fmtEur(data.render.margin_eur)}
              </p>
              <p className="text-[10px] text-muted-foreground">{fmtPct(data.render.margin_pct)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Cash riconosciuto</p>
              <p className="font-semibold text-base text-emerald-600">
                {fmtEur(data.render.revenue_eur)}
              </p>
              <p className="text-[10px] text-muted-foreground">da consume crediti</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* TOPUP STATS — ricariche AI in periodo */}
      {data.topup && (data.topup.n_topups > 0 || data.topup.n_bonus > 0) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Banknote className="h-4 w-4 text-emerald-600" />
              Cash flow crediti AI
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div>
              <p className="text-muted-foreground">Ricariche</p>
              <p className="font-semibold text-base">{fmtNum(data.topup.n_topups)}</p>
              <p className="text-[10px] text-muted-foreground">{data.topup.n_companies} aziende</p>
            </div>
            <div>
              <p className="text-muted-foreground">€ ricariche</p>
              <p className="font-semibold text-base text-emerald-600">
                {fmtEur(data.topup.topup_eur)}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Bonus erogati</p>
              <p className="font-semibold text-base">{fmtNum(data.topup.n_bonus)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">€ bonus</p>
              <p className="font-semibold text-base text-amber-600">
                {fmtEur(data.topup.bonus_eur)}
              </p>
              <p className="text-[10px] text-muted-foreground">costo per noi</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* TREND CHART */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Trend giornaliero (30gg)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `€${v}`} />
                  <ChartTooltip
                    formatter={(v: number) => fmtEur(v)}
                    contentStyle={{ fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="Costo reale" stroke="#94a3b8" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="Fatturato" stroke="#10b981" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="Margine" stroke="#3b82f6" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* TABELLE — provider / modello / azienda / task */}
      <Tabs defaultValue="provider" className="w-full">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <TabsList className="grid grid-cols-4 w-full sm:w-auto">
            <TabsTrigger value="provider" className="text-xs">Provider</TabsTrigger>
            <TabsTrigger value="model" className="text-xs">Modelli</TabsTrigger>
            <TabsTrigger value="company" className="text-xs">Aziende</TabsTrigger>
            <TabsTrigger value="task" className="text-xs">Task</TabsTrigger>
          </TabsList>
          {/* Niente export su telefono. */}
          {!isMobile && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs gap-1.5 hidden sm:inline-flex"
              onClick={() => {
                const today = new Date().toISOString().slice(0, 10);
                const allRows = [
                  ...((data.by_provider ?? []).map((r) => ({ tipo: "provider", chiave: r.provider, ...r }))),
                  ...((data.by_model ?? []).map((r) => ({ tipo: "modello", chiave: r.model_used, ...r }))),
                  ...((data.by_company ?? []).map((r) => ({ tipo: "azienda", chiave: r.company_name, ...r }))),
                  ...((data.by_task ?? []).map((r) => ({ tipo: "task", chiave: r.display_label, ...r }))),
                ];
                downloadCsv(`ai-economics-${period}-${today}.csv`, allRows);
              }}
              disabled={!data.kpi.n_calls}
            >
              <Download className="h-3.5 w-3.5" />
              Esporta CSV
            </Button>
          )}
        </div>

        <TabsContent value="provider" className="mt-3">
          <ProviderTable rows={data.by_provider ?? []} />
        </TabsContent>
        <TabsContent value="model" className="mt-3">
          <ModelTable rows={data.by_model ?? []} />
        </TabsContent>
        <TabsContent value="company" className="mt-3">
          <CompanyTable rows={data.by_company ?? []} />
        </TabsContent>
        <TabsContent value="task" className="mt-3">
          <TaskTable rows={data.by_task ?? []} />
        </TabsContent>
      </Tabs>

      {k.n_calls === 0 && (
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-sm text-muted-foreground">
              Nessuna chiamata AI nel periodo selezionato.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              I dati appariranno automaticamente man mano che l'AI viene usata.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// KpiCard — card riusabile con delta vs periodo precedente
// ─────────────────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  subValue,
  delta,
  icon,
  tone,
}: {
  label: string;
  value: string;
  subValue?: string;
  delta?: { pct: number; sign: "up" | "down" | "flat" };
  icon: React.ReactNode;
  tone: "neutral" | "emerald" | "primary";
}) {
  const valueColor =
    tone === "emerald" ? "text-emerald-600"
    : tone === "primary" ? "text-primary"
    : "";

  const iconColor =
    tone === "emerald" ? "text-emerald-600"
    : tone === "primary" ? "text-primary"
    : "text-muted-foreground";

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className={`text-xl font-bold mt-1 truncate ${valueColor}`}>{value}</p>
            <div className="flex items-center gap-1.5 mt-1">
              {subValue && (
                <p className="text-[10px] text-muted-foreground">{subValue}</p>
              )}
              {delta && delta.sign !== "flat" && (
                <Badge
                  variant="outline"
                  className={`text-[9px] px-1 py-0 h-4 ${
                    delta.sign === "up"
                      ? "border-emerald-300 text-emerald-700 bg-emerald-50"
                      : "border-rose-300 text-rose-700 bg-rose-50"
                  }`}
                >
                  {delta.sign === "up" ? (
                    <TrendingUp className="h-2.5 w-2.5 mr-0.5" />
                  ) : (
                    <TrendingDown className="h-2.5 w-2.5 mr-0.5" />
                  )}
                  {delta.pct.toFixed(0)}%
                </Badge>
              )}
            </div>
          </div>
          <div className={iconColor}>{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ProviderTable — breakdown per provider (OpenAI, Anthropic, ...)
// ─────────────────────────────────────────────────────────────────────────────

function ProviderTable({ rows }: { rows: ProviderRow[] }) {
  if (rows.length === 0) {
    return <EmptyTable message="Nessun provider attivo nel periodo." />;
  }
  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b bg-muted/30">
                <th className="px-3 py-2">Provider</th>
                <th className="px-3 py-2 text-right">Chiamate</th>
                <th className="px-3 py-2 text-right">Costo reale</th>
                <th className="px-3 py-2 text-right">Fatturato</th>
                <th className="px-3 py-2 text-right">Margine</th>
                <th className="px-3 py-2 text-right">Markup eff.</th>
                <th className="px-3 py-2 text-right">% margine</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.provider} className="border-b last:border-0">
                  <td className="px-3 py-2 font-medium">{r.provider}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{fmtNum(r.n_calls)}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{fmtEur(r.cost_real_eur)}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{fmtEur(r.cost_billed_eur)}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs text-emerald-600 font-medium">
                    {fmtEur(r.margin_eur)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs">×{r.avg_markup_x.toFixed(1)}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{fmtPct(r.margin_pct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ModelTable — breakdown per modello specifico
// ─────────────────────────────────────────────────────────────────────────────

function ModelTable({ rows }: { rows: ModelRow[] }) {
  if (rows.length === 0) {
    return <EmptyTable message="Nessun modello usato nel periodo." />;
  }
  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b bg-muted/30">
                <th className="px-3 py-2">Modello</th>
                <th className="px-3 py-2 text-right">Calls</th>
                <th className="px-3 py-2 text-right">€/call ($)</th>
                <th className="px-3 py-2 text-right">Costo</th>
                <th className="px-3 py-2 text-right">Fatturato</th>
                <th className="px-3 py-2 text-right">Margine</th>
                <th className="px-3 py-2 text-right">Markup</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.model_used} className="border-b last:border-0">
                  <td className="px-3 py-2">
                    <div className="flex flex-col">
                      <span className="font-mono text-xs truncate max-w-[200px]">{r.model_used}</span>
                      <span className="text-[10px] text-muted-foreground">{r.provider}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{fmtNum(r.n_calls)}</td>
                  <td className="px-3 py-2 text-right font-mono text-[10px] text-muted-foreground">
                    ${r.avg_cost_per_call_usd.toFixed(6)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{fmtEur(r.cost_real_eur)}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{fmtEur(r.cost_billed_eur)}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs text-emerald-600 font-medium">
                    {fmtEur(r.margin_eur)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Badge
                      variant="outline"
                      className={`text-[9px] font-mono ${
                        r.avg_markup_x >= 4 ? "border-emerald-300 text-emerald-700 bg-emerald-50"
                        : r.avg_markup_x >= 2 ? "border-blue-300 text-blue-700 bg-blue-50"
                        : "border-amber-300 text-amber-700 bg-amber-50"
                      }`}
                    >
                      ×{r.avg_markup_x.toFixed(1)}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CompanyTable — top spenders
// ─────────────────────────────────────────────────────────────────────────────

function CompanyTable({ rows }: { rows: CompanyRow[] }) {
  if (rows.length === 0) {
    return <EmptyTable message="Nessuna azienda ha consumato AI nel periodo." />;
  }
  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b bg-muted/30">
                <th className="px-3 py-2">Azienda</th>
                <th className="px-3 py-2 text-right">Calls</th>
                <th className="px-3 py-2 text-right">Costo reale</th>
                <th className="px-3 py-2 text-right">Fatturato</th>
                <th className="px-3 py-2 text-right">Margine</th>
                <th className="px-3 py-2 text-right">% margine</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.company_id} className="border-b last:border-0">
                  <td className="px-3 py-2 font-medium truncate max-w-[200px]">{r.company_name}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{fmtNum(r.n_calls)}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{fmtEur(r.cost_real_eur)}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{fmtEur(r.cost_billed_eur)}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs text-emerald-600 font-medium">
                    {fmtEur(r.margin_eur)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{fmtPct(r.margin_pct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TaskTable — breakdown per task_kind
// ─────────────────────────────────────────────────────────────────────────────

function TaskTable({ rows }: { rows: TaskRow[] }) {
  if (rows.length === 0) {
    return <EmptyTable message="Nessun task attivo nel periodo." />;
  }
  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b bg-muted/30">
                <th className="px-3 py-2">Task</th>
                <th className="px-3 py-2 text-right">Calls</th>
                <th className="px-3 py-2 text-right">Costo reale</th>
                <th className="px-3 py-2 text-right">Fatturato</th>
                <th className="px-3 py-2 text-right">Margine</th>
                <th className="px-3 py-2 text-right">% margine</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.task_kind} className="border-b last:border-0">
                  <td className="px-3 py-2">
                    <div className="flex flex-col">
                      <span className="font-medium text-xs">{r.display_label}</span>
                      <span className="text-[10px] text-muted-foreground font-mono">{r.task_kind}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{fmtNum(r.n_calls)}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{fmtEur(r.cost_real_eur)}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{fmtEur(r.cost_billed_eur)}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs text-emerald-600 font-medium">
                    {fmtEur(r.margin_eur)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{fmtPct(r.margin_pct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyTable({ message }: { message: string }) {
  return (
    <Card>
      <CardContent className="p-6 text-center">
        <p className="text-xs text-muted-foreground">{message}</p>
      </CardContent>
    </Card>
  );
}
