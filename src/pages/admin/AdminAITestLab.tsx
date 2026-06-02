/**
 * AdminAITestLab — AI Test Lab dashboard per super_admin.
 *
 * Confronto costi/latency/quality dei modelli AI usati nelle 7 feature
 * (silvio_admin_chat, silvio_chat cliente, ai-quote-from-capture, ecc.)
 *
 * Legge da `ai_test_runs` aggregato. KPI per modello:
 *  - Costo medio per chiamata
 *  - Latency p50/p95
 *  - User rating medio (1-5 stelle)
 *  - Numero chiamate
 *  - Costo cumulativo periodo
 *
 * Gating: solo super_admin (route in adminRoutes.tsx con RequireSuperAdmin).
 */

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { escapeCsvCell } from "@/lib/csvExport";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Coins, Zap, Star, FlaskConical, TrendingUp, RefreshCw, Brain, Database,
  ChevronDown, ChevronRight, Download, CheckCircle2, XCircle, Beaker,
} from "lucide-react";
import { Sparkline } from "@/components/admin/ai-shared/Sparkline";

type Period = "24h" | "7d" | "30d" | "90d";

interface DailyTrendPoint {
  date: string; // YYYY-MM-DD
  cost_usd: number;
  calls: number;
  avg_latency_ms: number;
}

interface RecentCall {
  id: string;
  created_at: string;
  cost_usd: number;
  latency_ms: number;
  user_rating: number | null;
  input_tokens: number;
  output_tokens: number;
  status: string | null;
  error: string | null;
}

interface ModelStat {
  model_id: string;
  provider: string;
  feature: string;
  n_calls: number;
  total_cost_usd: number;
  avg_cost_usd: number;
  avg_latency_ms: number;
  p50_latency_ms: number;
  p95_latency_ms: number;
  avg_rating: number | null;
  rated_count: number;
  avg_input_tokens: number;
  avg_output_tokens: number;
  last_call_at: string;
  // 🆕 trend giornaliero per sparkline + drill-down ultime chiamate
  daily_trend: DailyTrendPoint[];
  recent_calls: RecentCall[];
}

const FEATURE_LABELS: Record<string, string> = {
  silvio_admin_chat: "Silvio Superadmin",
  silvio_chat: "Silvio Cliente",
  ai_quote_from_capture: "Preventivo da foto",
  ai_orchestrator: "Council orchestrator",
  doc_router: "Document router",
  computo_ai_extract: "Estrazione computo",
};

const PROVIDER_COLORS: Record<string, string> = {
  anthropic: "bg-orange-100 text-orange-700 border-orange-300",
  openai: "bg-emerald-100 text-emerald-700 border-emerald-300",
  google: "bg-blue-100 text-blue-700 border-blue-300",
  moonshotai: "bg-violet-100 text-violet-700 border-violet-300",
  deepseek: "bg-cyan-100 text-cyan-700 border-cyan-300",
  "x-ai": "bg-slate-100 text-slate-700 border-slate-300",
  "meta-llama": "bg-indigo-100 text-indigo-700 border-indigo-300",
  mistralai: "bg-rose-100 text-rose-700 border-rose-300",
};

const fmtUSD = (v: number, decimals = 4) =>
  `$${Number(v).toFixed(decimals)}`;

const fmtMs = (v: number) =>
  v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${Math.round(v)}ms`;

export default function AdminAITestLab() {
  const [period, setPeriod] = useState<Period>("7d");
  const [feature, setFeature] = useState<string>("all");

  const { data: stats, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["admin-ai-test-lab-stats", period, feature],
    refetchInterval: 60_000,
    queryFn: async () => {
      // Aggregazione client-side: prendiamo righe grezze + group by model+feature
      // (per dataset piccoli funziona; se cresce molto, si può creare RPC dedicato)
      const since = new Date(Date.now() - parsePeriodMs(period)).toISOString();

      let q = supabase
        .from("ai_test_runs")
        .select("*")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(5000);

      if (feature !== "all") q = q.eq("feature", feature);

      const { data, error } = await q;
      if (error) throw error;

      // Group by (model_id, feature)
      const groups = new Map<string, ModelStat>();
      // 🆕 Buffer per drill-down: ultime calls + daily trend per ogni gruppo
      const dailyByKey = new Map<string, Map<string, { cost: number; calls: number; latency_sum: number }>>();
      const recentByKey = new Map<string, RecentCall[]>();

      const dayKey = (d: Date) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${dd}`;
      };

      for (const row of data ?? []) {
        const r = row as Record<string, unknown>;
        const key = `${r.model_id}__${r.feature}`;
        const existing = groups.get(key);
        const latency = Number(r.latency_ms ?? 0);
        const cost = Number(r.cost_usd ?? 0);
        const rating = r.user_rating != null ? Number(r.user_rating) : null;
        const createdAt = String(r.created_at);

        // 🆕 daily trend
        const dailyMap = dailyByKey.get(key) ?? new Map();
        const dk = dayKey(new Date(createdAt));
        const dEntry = dailyMap.get(dk) ?? { cost: 0, calls: 0, latency_sum: 0 };
        dEntry.cost += cost;
        dEntry.calls += 1;
        dEntry.latency_sum += latency;
        dailyMap.set(dk, dEntry);
        dailyByKey.set(key, dailyMap);

        // 🆕 recent calls (max 10 per gruppo, già ordinato desc dalla query)
        const recents = recentByKey.get(key) ?? [];
        if (recents.length < 10) {
          recents.push({
            id: String(r.id ?? `${key}-${recents.length}`),
            created_at: createdAt,
            cost_usd: cost,
            latency_ms: latency,
            user_rating: rating,
            input_tokens: Number(r.input_tokens ?? 0),
            output_tokens: Number(r.output_tokens ?? 0),
            status: r.status != null ? String(r.status) : null,
            error: r.error != null ? String(r.error) : null,
          });
          recentByKey.set(key, recents);
        }

        if (!existing) {
          groups.set(key, {
            model_id: String(r.model_id),
            provider: String(r.provider ?? "unknown"),
            feature: String(r.feature),
            n_calls: 1,
            total_cost_usd: cost,
            avg_cost_usd: cost,
            avg_latency_ms: latency,
            p50_latency_ms: latency,
            p95_latency_ms: latency,
            avg_rating: rating,
            rated_count: rating !== null ? 1 : 0,
            avg_input_tokens: Number(r.input_tokens ?? 0),
            avg_output_tokens: Number(r.output_tokens ?? 0),
            last_call_at: createdAt,
            daily_trend: [],
            recent_calls: [],
          });
        } else {
          existing.n_calls += 1;
          existing.total_cost_usd += cost;
          existing.avg_cost_usd = existing.total_cost_usd / existing.n_calls;
          existing.avg_latency_ms = (existing.avg_latency_ms * (existing.n_calls - 1) + latency) / existing.n_calls;
          existing.avg_input_tokens = (existing.avg_input_tokens * (existing.n_calls - 1) + Number(r.input_tokens ?? 0)) / existing.n_calls;
          existing.avg_output_tokens = (existing.avg_output_tokens * (existing.n_calls - 1) + Number(r.output_tokens ?? 0)) / existing.n_calls;
          if (rating !== null) {
            const prev = existing.avg_rating ?? 0;
            const prevCount = existing.rated_count;
            existing.avg_rating = (prev * prevCount + rating) / (prevCount + 1);
            existing.rated_count = prevCount + 1;
          }
        }
      }

      // Calcola p50/p95 per group
      const latencyByKey = new Map<string, number[]>();
      for (const row of data ?? []) {
        const r = row as Record<string, unknown>;
        const key = `${r.model_id}__${r.feature}`;
        if (!latencyByKey.has(key)) latencyByKey.set(key, []);
        latencyByKey.get(key)!.push(Number(r.latency_ms ?? 0));
      }
      for (const [key, arr] of latencyByKey) {
        arr.sort((a, b) => a - b);
        const stat = groups.get(key);
        if (stat) {
          stat.p50_latency_ms = arr[Math.floor(arr.length * 0.5)] ?? 0;
          stat.p95_latency_ms = arr[Math.floor(arr.length * 0.95)] ?? arr[arr.length - 1] ?? 0;
        }
      }

      // 🆕 Riempie daily_trend (incluso giorni a 0 nel range richiesto) e recent_calls
      const periodStart = new Date(Date.now() - parsePeriodMs(period));
      periodStart.setHours(0, 0, 0, 0);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      for (const [key, stat] of groups) {
        const dailyMap = dailyByKey.get(key) ?? new Map();
        const trend: DailyTrendPoint[] = [];
        const cursor = new Date(periodStart);
        while (cursor <= today) {
          const k = dayKey(cursor);
          const v = dailyMap.get(k);
          trend.push({
            date: k,
            cost_usd: v?.cost ?? 0,
            calls: v?.calls ?? 0,
            avg_latency_ms: v && v.calls > 0 ? v.latency_sum / v.calls : 0,
          });
          cursor.setDate(cursor.getDate() + 1);
          if (trend.length > 95) break; // safety
        }
        stat.daily_trend = trend;
        stat.recent_calls = recentByKey.get(key) ?? [];
      }

      return Array.from(groups.values()).sort((a, b) => b.total_cost_usd - a.total_cost_usd);
    },
  });

  // Totali aggregati
  const totals = (stats ?? []).reduce(
    (acc, s) => ({
      n_calls: acc.n_calls + s.n_calls,
      total_cost: acc.total_cost + s.total_cost_usd,
      models: acc.models.add(s.model_id),
    }),
    { n_calls: 0, total_cost: 0, models: new Set<string>() }
  );

  // 🆕 Export CSV: 1 riga per (modello × feature)
  const handleExportCSV = () => {
    if (!stats || stats.length === 0) return;
    const header = [
      "Modello",
      "Provider",
      "Feature",
      "N° calls",
      "Costo totale (USD)",
      "Costo medio (USD)",
      "P50 (ms)",
      "P95 (ms)",
      "Avg rating",
      "Rated count",
      "Avg input tokens",
      "Avg output tokens",
      "Last call",
    ].join(",");
    const escape = (v: string | number | null | undefined) => escapeCsvCell(v, ",");
    const rows = stats.map((s) =>
      [
        escape(s.model_id),
        escape(s.provider),
        escape(s.feature),
        escape(s.n_calls),
        escape(s.total_cost_usd.toFixed(6)),
        escape(s.avg_cost_usd.toFixed(6)),
        escape(Math.round(s.p50_latency_ms)),
        escape(Math.round(s.p95_latency_ms)),
        escape(s.avg_rating?.toFixed(2) ?? ""),
        escape(s.rated_count),
        escape(Math.round(s.avg_input_tokens)),
        escape(Math.round(s.avg_output_tokens)),
        escape(s.last_call_at),
      ].join(","),
    );
    const csv = [header, ...rows].join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ai-test-lab-${period}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <FlaskConical className="h-8 w-8 text-violet-600" />
          <div>
            <h1 className="text-2xl font-bold">AI Test Lab</h1>
            <p className="text-sm text-muted-foreground">
              Confronto costi/latency/quality per ogni modello AI
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <SmokeTestButton onComplete={() => refetch()} />
          <KbIngestButton />
          {stats && stats.length > 0 && (
            <Button variant="outline" size="sm" onClick={handleExportCSV} title="Esporta confronto modelli in CSV">
              <Download className="h-4 w-4 mr-2" />
              CSV
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
            Aggiorna
          </Button>
        </div>
      </div>

      {/* Filtro periodo */}
      <Tabs value={period} onValueChange={(v) => setPeriod(v as Period)}>
        <TabsList>
          <TabsTrigger value="24h">Ultime 24h</TabsTrigger>
          <TabsTrigger value="7d">7 giorni</TabsTrigger>
          <TabsTrigger value="30d">30 giorni</TabsTrigger>
          <TabsTrigger value="90d">90 giorni</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Filtro feature — scroll-x mobile, wrap su sm+ */}
      <Tabs value={feature} onValueChange={setFeature}>
        <TabsList className="h-auto overflow-x-auto sm:flex-wrap whitespace-nowrap [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1">
          <TabsTrigger value="all">Tutte le feature</TabsTrigger>
          {Object.entries(FEATURE_LABELS).map(([k, v]) => (
            <TabsTrigger key={k} value={k}>{v}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* KPI top-line */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Chiamate totali</p>
                <p className="text-2xl font-bold mt-1">{totals.n_calls.toLocaleString("it-IT")}</p>
              </div>
              <Zap className="h-5 w-5 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Costo totale</p>
                <p className="text-2xl font-bold mt-1 text-emerald-600">{fmtUSD(totals.total_cost, 4)}</p>
              </div>
              <Coins className="h-5 w-5 text-emerald-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Modelli usati</p>
                <p className="text-2xl font-bold mt-1">{totals.models.size}</p>
              </div>
              <FlaskConical className="h-5 w-5 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Costo medio/call</p>
                <p className="text-2xl font-bold mt-1">
                  {totals.n_calls > 0 ? fmtUSD(totals.total_cost / totals.n_calls, 4) : "—"}
                </p>
              </div>
              <TrendingUp className="h-5 w-5 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabella modelli */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Confronto modelli</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-2">
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
            </div>
          ) : !stats || stats.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              Nessuna chiamata AI nel periodo selezionato.
              <br />
              <span className="text-xs">I dati arrivano automaticamente da silvio-admin-chat e altre edge function tracciate.</span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 w-6"></th>
                    <th className="px-3 py-2 text-left">Modello</th>
                    <th className="px-3 py-2 text-left">Feature</th>
                    <th className="px-3 py-2 text-right">N° calls</th>
                    <th className="px-3 py-2 text-right">Costo medio</th>
                    <th className="px-3 py-2 text-right">Costo totale</th>
                    <th className="px-3 py-2 text-right">P50</th>
                    <th className="px-3 py-2 text-right">P95</th>
                    <th className="px-3 py-2 text-right">Rating</th>
                    <th className="px-3 py-2 text-left">Trend costo</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.map((s) => (
                    <ModelStatRow key={`${s.model_id}__${s.feature}`} stat={s} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * ModelStatRow — riga espandibile per la tabella confronto modelli.
 * Click → drill-down con sparkline + ultime 10 chiamate.
 */
function ModelStatRow({ stat }: { stat: ModelStat }) {
  const [expanded, setExpanded] = useState(false);
  const providerColor = PROVIDER_COLORS[stat.provider] ?? "bg-muted text-muted-foreground";
  const hasData = stat.daily_trend.length >= 2 || stat.recent_calls.length > 0;

  return (
    <>
      <tr
        className={`border-t hover:bg-muted/30 ${hasData ? "cursor-pointer" : ""}`}
        onClick={() => hasData && setExpanded((e) => !e)}
      >
        <td className="px-2 py-2 text-muted-foreground">
          {hasData ? (
            expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />
          ) : null}
        </td>
        <td className="px-3 py-2">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={`text-[10px] ${providerColor}`}>
              {stat.provider}
            </Badge>
            <span className="font-mono text-xs">{stat.model_id.split("/").slice(1).join("/")}</span>
          </div>
        </td>
        <td className="px-3 py-2 text-xs text-muted-foreground">
          {FEATURE_LABELS[stat.feature] ?? stat.feature}
        </td>
        <td className="px-3 py-2 text-right font-mono text-xs">{stat.n_calls}</td>
        <td className="px-3 py-2 text-right font-mono text-xs">{fmtUSD(stat.avg_cost_usd, 6)}</td>
        <td className="px-3 py-2 text-right font-mono text-xs font-semibold">{fmtUSD(stat.total_cost_usd, 4)}</td>
        <td className="px-3 py-2 text-right font-mono text-xs">{fmtMs(stat.p50_latency_ms)}</td>
        <td className="px-3 py-2 text-right font-mono text-xs text-amber-600">{fmtMs(stat.p95_latency_ms)}</td>
        <td className="px-3 py-2 text-right">
          {stat.avg_rating != null ? (
            <span className="inline-flex items-center gap-1 text-xs">
              <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
              {stat.avg_rating.toFixed(1)}
              <span className="text-muted-foreground">({stat.rated_count})</span>
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </td>
        <td className="px-3 py-2">
          {stat.daily_trend.length >= 2 ? (
            <Sparkline
              data={stat.daily_trend.map((d) => ({ date: d.date, value: d.cost_usd }))}
              tooltipPrefix="Costo del giorno"
              formatValue={(v) => fmtUSD(v, 4)}
              trendDirection="lower-is-better"
              width={80}
              height={20}
            />
          ) : (
            <span className="text-[10px] text-muted-foreground">—</span>
          )}
        </td>
      </tr>

      {expanded && hasData && (
        <tr className="bg-muted/20">
          <td colSpan={10} className="px-6 py-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Trend giornaliero esteso (sparkline grande) */}
              <div className="rounded-md border bg-background p-3">
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  Costo giornaliero · ultimi {stat.daily_trend.length} giorni
                </p>
                <div className="flex items-center justify-between gap-3">
                  <Sparkline
                    data={stat.daily_trend.map((d) => ({ date: d.date, value: d.cost_usd }))}
                    width={240}
                    height={40}
                    trendDirection="lower-is-better"
                    showLastValue
                    formatValue={(v) => fmtUSD(v, 4)}
                  />
                  <div className="text-right text-[10px] space-y-0.5">
                    <p className="text-muted-foreground">
                      Avg: <span className="font-mono">{fmtUSD(stat.daily_trend.reduce((s, d) => s + d.cost_usd, 0) / Math.max(stat.daily_trend.length, 1), 4)}</span>
                    </p>
                    <p className="text-muted-foreground">
                      Picco: <span className="font-mono">{fmtUSD(Math.max(...stat.daily_trend.map((d) => d.cost_usd), 0), 4)}</span>
                    </p>
                  </div>
                </div>
                <p className="text-xs font-medium text-muted-foreground mt-3 mb-1">
                  Latenza media giornaliera
                </p>
                <Sparkline
                  data={stat.daily_trend.map((d) => ({ date: d.date, value: d.avg_latency_ms }))}
                  width={240}
                  height={32}
                  trendDirection="lower-is-better"
                  showLastValue
                  formatValue={(v) => fmtMs(v)}
                />
              </div>

              {/* Ultime 10 chiamate */}
              <div className="rounded-md border bg-background overflow-hidden">
                <p className="text-xs font-medium text-muted-foreground px-3 py-2 border-b bg-muted/30">
                  Ultime {stat.recent_calls.length} chiamate
                </p>
                <div className="max-h-60 overflow-y-auto">
                  <table className="w-full text-[11px]">
                    <thead className="text-[10px] text-muted-foreground bg-muted/20">
                      <tr>
                        <th className="px-2 py-1 text-left">Data</th>
                        <th className="px-2 py-1 text-right">Costo</th>
                        <th className="px-2 py-1 text-right">Latency</th>
                        <th className="px-2 py-1 text-right">Tokens (in/out)</th>
                        <th className="px-2 py-1 text-right">Rating</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stat.recent_calls.map((c) => (
                        <tr key={c.id} className="border-t">
                          <td className="px-2 py-1 text-muted-foreground tabular-nums">
                            {new Date(c.created_at).toLocaleString("it-IT", {
                              day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
                            })}
                          </td>
                          <td className="px-2 py-1 text-right font-mono">{fmtUSD(c.cost_usd, 6)}</td>
                          <td className="px-2 py-1 text-right font-mono text-amber-600">{fmtMs(c.latency_ms)}</td>
                          <td className="px-2 py-1 text-right font-mono text-muted-foreground tabular-nums">
                            {c.input_tokens.toLocaleString("it-IT")}/{c.output_tokens.toLocaleString("it-IT")}
                          </td>
                          <td className="px-2 py-1 text-right">
                            {c.user_rating != null ? (
                              <span className="inline-flex items-center gap-0.5">
                                <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />
                                {c.user_rating}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/**
 * SmokeTestButton — invoca test-ai-models-suite per verificare che ogni
 * modello OpenRouter allowed risponda correttamente. Output salvato anche in
 * `ai_test_runs` con feature='smoke_test_models' (visibile nella tabella).
 */
interface SmokeTestResult {
  model_id: string;
  provider: string;
  ok: boolean;
  latency_ms?: number;
  cost_usd?: number;
  tokens?: { in: number; out: number };
  answer_preview?: string;
  error?: string;
}
interface SmokeTestResponse {
  tested: number;
  success: number;
  failed: number;
  duration_ms: number;
  mode: string;
  total_allowed_models: number;
  results: SmokeTestResult[];
  summary_by_provider: Record<string, { ok: number; failed: number }>;
}

function SmokeTestButton({ onComplete }: { onComplete?: () => void }) {
  const [open, setOpen] = useState(false);
  const [response, setResponse] = useState<SmokeTestResponse | null>(null);
  const [mode, setMode] = useState<"recommended" | "top10" | "all">("recommended");

  const mutation = useMutation({
    mutationFn: async (m: typeof mode) => {
      const { data, error } = await supabase.functions.invoke<SmokeTestResponse>(
        "test-ai-models-suite",
        { body: { mode: m, concurrency: 5 } },
      );
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const errMaybe = (data as any)?.error;
      if (errMaybe) throw new Error(String(errMaybe));
      return data!;
    },
    onSuccess: (data) => {
      setResponse(data);
      setOpen(true);
      toast.success(
        `Smoke test completato: ${data.success}/${data.tested} modelli OK`,
        { description: `Durata ${(data.duration_ms / 1000).toFixed(1)}s · costo totale ~$${data.results.reduce((s, r) => s + (r.cost_usd ?? 0), 0).toFixed(4)}` },
      );
      onComplete?.();
    },
    onError: (e) => toast.error("Smoke test fallito", { description: String(e) }),
  });

  const start = (m: typeof mode) => {
    setMode(m);
    setResponse(null);
    mutation.mutate(m);
  };

  return (
    <>
      <div className="flex gap-1">
        <Button
          variant="outline"
          size="sm"
          onClick={() => start("recommended")}
          disabled={mutation.isPending}
          title="Smoke test su 1 modello per provider (max 20)"
        >
          {mutation.isPending && mode === "recommended" ? (
            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Beaker className="h-4 w-4 mr-2" />
          )}
          {mutation.isPending && mode === "recommended" ? "Testing..." : "Test 20"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => start("all")}
          disabled={mutation.isPending}
          title="Smoke test su TUTTI i modelli allowed (~50-100, ~5 min, ~$0.20)"
          className="text-xs"
        >
          {mutation.isPending && mode === "all" ? "Testing all..." : "all"}
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Beaker className="h-5 w-5 text-violet-600" />
              Risultati Smoke Test ({response?.mode})
            </DialogTitle>
            <DialogDescription>
              {response ? (
                <>
                  {response.success}/{response.tested} OK ·{" "}
                  durata {(response.duration_ms / 1000).toFixed(1)}s ·{" "}
                  {response.total_allowed_models} modelli allowed totali ·{" "}
                  costo ~${response.results.reduce((s, r) => s + (r.cost_usd ?? 0), 0).toFixed(4)}
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>

          {response && (
            <div className="space-y-3">
              {/* Summary per provider */}
              <div className="rounded-md border p-3 bg-muted/20">
                <p className="text-xs font-medium mb-2">Per provider:</p>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(response.summary_by_provider)
                    .sort(([, a], [, b]) => b.ok + b.failed - (a.ok + a.failed))
                    .map(([p, s]) => (
                      <Badge
                        key={p}
                        variant={s.failed === 0 ? "default" : "destructive"}
                        className="text-[10px]"
                      >
                        {p}: {s.ok}/{s.ok + s.failed}
                      </Badge>
                    ))}
                </div>
              </div>

              {/* Tabella risultati */}
              <div className="rounded-md border overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-muted/30 text-[10px] uppercase">
                    <tr>
                      <th className="px-2 py-1.5 text-left">Modello</th>
                      <th className="px-2 py-1.5 text-center w-8">OK</th>
                      <th className="px-2 py-1.5 text-right">Latenza</th>
                      <th className="px-2 py-1.5 text-right">Costo</th>
                      <th className="px-2 py-1.5 text-left">Risposta / Errore</th>
                    </tr>
                  </thead>
                  <tbody>
                    {response.results.map((r) => (
                      <tr key={r.model_id} className={`border-t ${r.ok ? "" : "bg-rose-50 dark:bg-rose-950/20"}`}>
                        <td className="px-2 py-1 font-mono">{r.model_id}</td>
                        <td className="px-2 py-1 text-center">
                          {r.ok ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 mx-auto" />
                          ) : (
                            <XCircle className="h-3.5 w-3.5 text-rose-600 mx-auto" />
                          )}
                        </td>
                        <td className="px-2 py-1 text-right tabular-nums">
                          {r.latency_ms ? `${r.latency_ms}ms` : "—"}
                        </td>
                        <td className="px-2 py-1 text-right tabular-nums font-mono">
                          {r.cost_usd ? `$${r.cost_usd.toFixed(6)}` : "—"}
                        </td>
                        <td className="px-2 py-1 text-muted-foreground truncate max-w-xs">
                          {r.ok ? r.answer_preview : <span className="text-rose-700 dark:text-rose-400">{r.error}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * KB Ingest button — invoca silvio-kb-ingest-mega leggendo il file dal bucket.
 * Operazione una-tantum / re-ingest dopo update del file MEGA_CERVELLO.
 */
function KbIngestButton() {
  const [stats, setStats] = useState<{
    total_chunks?: number;
    inserted?: number;
    skipped_dedup?: number;
    errors?: number;
    sections_covered?: string[];
  } | null>(null);

  const ingestMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("silvio-kb-ingest-mega", {
        body: { replace_existing: true, storage_path: "admin/mega-cervello.md" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      setStats(data?.summary ?? null);
      toast.success(
        `KB ingerita: ${data?.summary?.inserted ?? 0} chunks aggiunti`,
        { description: `Sezioni coperte: ${(data?.summary?.sections_covered ?? []).length}` }
      );
    },
    onError: (e) => {
      toast.error("Errore ingestion", { description: String(e) });
    },
  });

  const handleIngest = () => {
    const confirmed = window.confirm(
      "Reimportare MEGA_CERVELLO? L'operazione sostituisce i chunk esistenti, puo durare diversi minuti e va lanciata solo dopo aver aggiornato il file sorgente."
    );
    if (!confirmed) return;
    ingestMutation.mutate();
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="default"
        size="sm"
        onClick={handleIngest}
        disabled={ingestMutation.isPending}
        className="bg-violet-600 hover:bg-violet-700"
        title="Reimporta la knowledge base operativa di Silvio"
      >
        {ingestMutation.isPending ? (
          <Brain className="h-4 w-4 mr-2 animate-pulse" />
        ) : (
          <Database className="h-4 w-4 mr-2" />
        )}
        {ingestMutation.isPending ? "Ingesting..." : "Importa MEGA_CERVELLO"}
      </Button>
      {stats && (
        <span className="text-[10px] text-muted-foreground">
          {stats.inserted}/{stats.total_chunks} chunks · {stats.sections_covered?.length ?? 0} sez.
        </span>
      )}
    </div>
  );
}

function parsePeriodMs(p: Period): number {
  const map: Record<Period, number> = {
    "24h": 24 * 60 * 60 * 1000,
    "7d": 7 * 24 * 60 * 60 * 1000,
    "30d": 30 * 24 * 60 * 60 * 1000,
    "90d": 90 * 24 * 60 * 60 * 1000,
  };
  return map[p];
}
