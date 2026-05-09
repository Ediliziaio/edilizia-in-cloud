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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Coins, Zap, Star, FlaskConical, TrendingUp, RefreshCw, Brain, Database,
} from "lucide-react";

type Period = "24h" | "7d" | "30d" | "90d";

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
      for (const row of data ?? []) {
        const r = row as Record<string, unknown>;
        const key = `${r.model_id}__${r.feature}`;
        const existing = groups.get(key);
        const latency = Number(r.latency_ms ?? 0);
        const cost = Number(r.cost_usd ?? 0);
        const rating = r.user_rating != null ? Number(r.user_rating) : null;

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
            last_call_at: String(r.created_at),
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
          <KbIngestButton />
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

      {/* Filtro feature */}
      <Tabs value={feature} onValueChange={setFeature}>
        <TabsList className="flex-wrap h-auto">
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
                    <th className="px-3 py-2 text-left">Modello</th>
                    <th className="px-3 py-2 text-left">Feature</th>
                    <th className="px-3 py-2 text-right">N° calls</th>
                    <th className="px-3 py-2 text-right">Costo medio</th>
                    <th className="px-3 py-2 text-right">Costo totale</th>
                    <th className="px-3 py-2 text-right">P50</th>
                    <th className="px-3 py-2 text-right">P95</th>
                    <th className="px-3 py-2 text-right">Rating</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.map((s) => {
                    const providerColor = PROVIDER_COLORS[s.provider] ?? "bg-muted text-muted-foreground";
                    return (
                      <tr key={`${s.model_id}__${s.feature}`} className="border-t hover:bg-muted/30">
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className={`text-[10px] ${providerColor}`}>
                              {s.provider}
                            </Badge>
                            <span className="font-mono text-xs">{s.model_id.split("/").slice(1).join("/")}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {FEATURE_LABELS[s.feature] ?? s.feature}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs">{s.n_calls}</td>
                        <td className="px-3 py-2 text-right font-mono text-xs">{fmtUSD(s.avg_cost_usd, 6)}</td>
                        <td className="px-3 py-2 text-right font-mono text-xs font-semibold">{fmtUSD(s.total_cost_usd, 4)}</td>
                        <td className="px-3 py-2 text-right font-mono text-xs">{fmtMs(s.p50_latency_ms)}</td>
                        <td className="px-3 py-2 text-right font-mono text-xs text-amber-600">{fmtMs(s.p95_latency_ms)}</td>
                        <td className="px-3 py-2 text-right">
                          {s.avg_rating != null ? (
                            <span className="inline-flex items-center gap-1 text-xs">
                              <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                              {s.avg_rating.toFixed(1)}
                              <span className="text-muted-foreground">({s.rated_count})</span>
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
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
