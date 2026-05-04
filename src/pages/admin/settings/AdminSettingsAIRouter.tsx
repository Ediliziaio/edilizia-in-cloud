/**
 * AdminSettingsAIRouter — Configurazione SuperAdmin per AI Router via OpenRouter.
 *
 * Sezioni:
 *   1. API Key OpenRouter (input + test connessione)
 *   2. Tabella task → modello (config primary + fallback chain)
 *   3. Stima costi mensile basata su usage storico
 *   4. Quick stats: chiamate, tokens, costo, % fallback
 *
 * Solo super_admin (RLS gia' protegge ai_router_config).
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  Key, Zap, AlertTriangle, CheckCircle2, RefreshCw,
  TrendingDown, DollarSign, Activity, Pencil, ExternalLink, Eye, EyeOff,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface RouterConfig {
  id: string;
  task_key: string;
  task_label: string;
  task_description: string | null;
  primary_model: string;
  fallback_models: string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  default_params: any;
  category: string;
  estimated_cost_per_million: number | null;
  enabled: boolean;
}

const CATEGORY_LABEL: Record<string, string> = {
  extraction:     "Estrazione",
  generation:     "Generazione",
  analysis:       "Analisi",
  classification: "Classificazione",
};

const CATEGORY_COLOR: Record<string, string> = {
  extraction:     "bg-blue-50 text-blue-700",
  generation:     "bg-violet-50 text-violet-700",
  analysis:       "bg-amber-50 text-amber-700",
  classification: "bg-emerald-50 text-emerald-700",
};

// Modelli OpenRouter consigliati raggruppati per fascia
const RECOMMENDED_MODELS = [
  {
    group: "💰 Economico (< $0.50/1M)",
    models: [
      { id: "deepseek/deepseek-chat-v3.1",       label: "DeepSeek V3.1 — $0.27/1M", cost: 0.27 },
      { id: "meta-llama/llama-3.3-70b-instruct", label: "Llama 3.3 70B — $0.38/1M", cost: 0.38 },
      { id: "google/gemini-flash-1.5-8b",        label: "Gemini Flash 1.5 8B — $0.04/1M", cost: 0.04 },
    ],
  },
  {
    group: "⚖️ Bilanciato ($0.50–$2/1M)",
    models: [
      { id: "openai/gpt-4o-mini",          label: "GPT-4o-mini — $0.60/1M",      cost: 0.60 },
      { id: "anthropic/claude-haiku-4.5",  label: "Claude Haiku 4.5 — $1.00/1M", cost: 1.00 },
      { id: "google/gemini-flash-1.5",     label: "Gemini Flash 1.5 — $0.30/1M", cost: 0.30 },
    ],
  },
  {
    group: "🧠 Premium ($2+/1M)",
    models: [
      { id: "anthropic/claude-sonnet-4.5", label: "Claude Sonnet 4.5 — $3/1M",  cost: 3.00 },
      { id: "openai/gpt-4o",               label: "GPT-4o — $5/1M",              cost: 5.00 },
      { id: "anthropic/claude-opus-4.7",   label: "Claude Opus 4.7 — $15/1M",   cost: 15.00 },
    ],
  },
  {
    group: "🤖 Auto-routing",
    models: [
      { id: "openrouter/auto", label: "Auto (sceglie il migliore)", cost: 0 },
    ],
  },
];

const ALL_MODELS = RECOMMENDED_MODELS.flatMap((g) => g.models);

export default function AdminSettingsAIRouter() {
  const queryClient = useQueryClient();
  const [showKey, setShowKey] = useState(false);
  const [editTask, setEditTask] = useState<RouterConfig | null>(null);

  // ── API Key OpenRouter (gestita via platform_settings) ───────────────
  const { data: apiKeySettings } = useQuery({
    queryKey: ["openrouter-api-key-status"],
    queryFn: async () => {
      const { data } = await supabase
        .from("platform_settings")
        .select("key, value")
        .in("key", ["openrouter_api_key_set", "openrouter_enabled"]);
      const map = new Map((data ?? []).map((s) => [s.key, s.value]));
      return {
        keySet: map.get("openrouter_api_key_set") === "true",
        enabled: map.get("openrouter_enabled") === "true",
      };
    },
  });

  const [newApiKey, setNewApiKey] = useState("");

  const saveApiKey = useMutation({
    mutationFn: async (key: string) => {
      // La key reale va nei secrets Supabase (Edge function env). Qui salviamo
      // solo un flag "key_set=true" per la UI. L'admin deve poi configurare
      // il secret OPENROUTER_API_KEY tramite Supabase dashboard o CLI.
      if (!key.startsWith("sk-or-v1-") && key !== "") {
        throw new Error("Formato chiave non valido (deve iniziare con sk-or-v1-)");
      }
      // Test la chiave chiamando OpenRouter /api/v1/key
      if (key) {
        const res = await fetch("https://openrouter.ai/api/v1/key", {
          headers: { Authorization: `Bearer ${key}` },
        });
        if (!res.ok) {
          throw new Error(`Chiave non valida (HTTP ${res.status})`);
        }
        const info = await res.json();
        toast.success(`Chiave valida — Limite: $${info.data?.limit ?? "?"} · Usato: $${(info.data?.usage ?? 0).toFixed(4)}`);
      }
      // Marca come "configurata" via platform_settings
      await supabase.from("platform_settings").upsert(
        [
          { key: "openrouter_api_key_set", value: key ? "true" : "false" },
          { key: "openrouter_enabled", value: "true" },
        ],
        { onConflict: "key" },
      );
    },
    onSuccess: () => {
      setNewApiKey("");
      queryClient.invalidateQueries({ queryKey: ["openrouter-api-key-status"] });
      toast.success("Configurazione salvata. Ricorda di settare il secret OPENROUTER_API_KEY su Supabase per attivare le edge functions.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ── Config router (tabella task → modello) ────────────────────────────
  const { data: configs, isLoading } = useQuery({
    queryKey: ["ai-router-configs"],
    queryFn: async () => {
      const { data, error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("ai_router_config" as any)
        .select("*")
        .order("estimated_cost_per_million", { ascending: true });
      if (error) throw error;
      return data as RouterConfig[];
    },
  });

  // ── Stats usage ultimi 30gg ────────────────────────────────────────────
  const { data: stats } = useQuery({
    queryKey: ["ai-router-stats-30d"],
    queryFn: async () => {
      const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("ai_router_usage_log" as any)
        .select("task_key, total_tokens, cost_usd, used_primary, status")
        .gte("created_at", from);
      const rows = (data ?? []) as Array<{
        task_key: string; total_tokens: number; cost_usd: number;
        used_primary: boolean; status: string;
      }>;
      const total_calls = rows.length;
      const total_tokens = rows.reduce((s, r) => s + r.total_tokens, 0);
      const total_cost = rows.reduce((s, r) => s + Number(r.cost_usd ?? 0), 0);
      const success_rate = total_calls > 0
        ? rows.filter((r) => r.status === "success").length / total_calls
        : 0;
      const fallback_rate = total_calls > 0
        ? rows.filter((r) => !r.used_primary).length / total_calls
        : 0;
      return { total_calls, total_tokens, total_cost, success_rate, fallback_rate };
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Zap className="h-6 w-6 text-primary" />
          AI Router · OpenRouter
        </h1>
        <p className="text-muted-foreground">
          Routing intelligente verso il modello AI piu' economico per ogni task. Una API key, 200+ modelli.
        </p>
      </div>

      {/* ── KPI cards ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard
          icon={<Activity className="h-4 w-4" />}
          label="Chiamate (30gg)"
          value={stats?.total_calls.toLocaleString("it-IT") ?? "—"}
          tone="blue"
        />
        <KpiCard
          icon={<DollarSign className="h-4 w-4" />}
          label="Costo totale (30gg)"
          value={stats ? `$${stats.total_cost.toFixed(2)}` : "—"}
          tone="emerald"
        />
        <KpiCard
          icon={<TrendingDown className="h-4 w-4" />}
          label="Token totali"
          value={
            stats?.total_tokens
              ? stats.total_tokens > 1_000_000
                ? `${(stats.total_tokens / 1_000_000).toFixed(2)}M`
                : (stats.total_tokens / 1000).toFixed(1) + "K"
              : "—"
          }
          tone="violet"
        />
        <KpiCard
          icon={<RefreshCw className="h-4 w-4" />}
          label="Tasso fallback"
          value={stats ? `${(stats.fallback_rate * 100).toFixed(1)}%` : "—"}
          tone={stats && stats.fallback_rate > 0.05 ? "amber" : "emerald"}
        />
      </div>

      {/* ── API Key ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Key className="h-4 w-4" /> Chiave API OpenRouter
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {apiKeySettings?.keySet ? (
            <Alert className="border-emerald-300 bg-emerald-50">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <AlertDescription className="text-emerald-900">
                <strong>Chiave configurata.</strong> Le edge functions usano OpenRouter per il routing.
              </AlertDescription>
            </Alert>
          ) : (
            <Alert className="border-amber-300 bg-amber-50">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-900">
                <strong>Chiave non configurata.</strong> Le edge functions usano i provider direttamente
                (OpenAI/Anthropic) con costi maggiori.
              </AlertDescription>
            </Alert>
          )}

          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Label className="text-xs">Inserisci nuova chiave OpenRouter</Label>
              <div className="relative">
                <Input
                  type={showKey ? "text" : "password"}
                  placeholder="sk-or-v1-..."
                  value={newApiKey}
                  onChange={(e) => setNewApiKey(e.target.value)}
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                  onClick={() => setShowKey((v) => !v)}
                >
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Crea la chiave su{" "}
                <a
                  href="https://openrouter.ai/keys"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-0.5 text-primary underline"
                >
                  openrouter.ai/keys <ExternalLink className="h-3 w-3" />
                </a>
                . Verra' validata chiamando OpenRouter prima di salvare.
              </p>
            </div>
            <Button
              onClick={() => saveApiKey.mutate(newApiKey)}
              disabled={!newApiKey || saveApiKey.isPending}
            >
              {saveApiKey.isPending && <RefreshCw className="mr-1.5 h-4 w-4 animate-spin" />}
              Valida & Salva
            </Button>
          </div>

          <Alert className="border-blue-300 bg-blue-50/50">
            <AlertTriangle className="h-4 w-4 text-blue-700" />
            <AlertDescription className="text-blue-900 text-xs">
              <strong>Importante:</strong> dopo aver validato la chiave qui, devi anche
              configurarla come secret <code className="rounded bg-blue-100 px-1">OPENROUTER_API_KEY</code> su
              Supabase (dashboard → Project Settings → Edge Functions → Secrets) per
              far funzionare le edge functions.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* ── Tabella task → modello ─────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Mapping task → modello</CardTitle>
          <p className="text-xs text-muted-foreground">
            Per ogni operazione AI del sistema scegli il modello primary + catena fallback.
            Modelli economici (DeepSeek, Llama) per estrazioni, Claude/GPT-4 per task complessi.
          </p>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-64" />
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Task</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Primary Model</TableHead>
                    <TableHead>Fallback chain</TableHead>
                    <TableHead className="text-right">Costo/1M</TableHead>
                    <TableHead className="w-12 text-center">Attivo</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(configs ?? []).map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{c.task_label}</p>
                          <p className="font-mono text-[10px] text-muted-foreground">{c.task_key}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn("text-[10px]", CATEGORY_COLOR[c.category])}>
                          {CATEGORY_LABEL[c.category] ?? c.category}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{c.primary_model}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {c.fallback_models?.length > 0 ? (
                            c.fallback_models.map((m, i) => (
                              <Badge key={i} variant="outline" className="font-mono text-[10px]">
                                {m}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-xs text-muted-foreground italic">—</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {c.estimated_cost_per_million != null
                          ? `$${Number(c.estimated_cost_per_million).toFixed(2)}`
                          : "—"}
                      </TableCell>
                      <TableCell className="text-center">
                        <TaskEnabledSwitch config={c} />
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => setEditTask(c)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Edit Dialog ────────────────────────────────────────── */}
      {editTask && (
        <EditTaskDialog
          task={editTask}
          onClose={() => setEditTask(null)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ["ai-router-configs"] });
            setEditTask(null);
          }}
        />
      )}
    </div>
  );
}

// ── Componenti helper ─────────────────────────────────────────────────────

function KpiCard({
  icon, label, value, tone,
}: {
  icon: React.ReactNode; label: string; value: string;
  tone: "blue" | "emerald" | "violet" | "amber";
}) {
  const palette: Record<typeof tone, string> = {
    blue:    "bg-blue-50",
    emerald: "bg-emerald-50",
    violet:  "bg-violet-50",
    amber:   "bg-amber-50",
  };
  return (
    <Card className={cn("border-0", palette[tone])}>
      <CardContent className="p-3">
        <div className="flex items-center gap-2 text-muted-foreground">
          {icon}
          <p className="text-[10px] uppercase tracking-wide">{label}</p>
        </div>
        <p className="mt-1 text-xl font-bold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}

function TaskEnabledSwitch({ config }: { config: RouterConfig }) {
  const queryClient = useQueryClient();
  const toggle = useMutation({
    mutationFn: async (enabled: boolean) => {
      const { error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("ai_router_config" as any)
        .update({ enabled })
        .eq("id", config.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ai-router-configs"] }),
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Switch
      checked={config.enabled}
      onCheckedChange={(v) => toggle.mutate(v)}
      disabled={toggle.isPending}
    />
  );
}

function EditTaskDialog({
  task, onClose, onSaved,
}: { task: RouterConfig; onClose: () => void; onSaved: () => void }) {
  const [primary, setPrimary] = useState(task.primary_model);
  const [fallbacks, setFallbacks] = useState<string[]>(task.fallback_models ?? []);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("ai_router_config" as any)
        .update({
          primary_model: primary,
          fallback_models: fallbacks,
        })
        .eq("id", task.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Config salvata"); onSaved(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const addFallback = () => setFallbacks([...fallbacks, "openai/gpt-4o-mini"]);
  const removeFallback = (i: number) => setFallbacks(fallbacks.filter((_, idx) => idx !== i));
  const updateFallback = (i: number, v: string) =>
    setFallbacks(fallbacks.map((m, idx) => (idx === i ? v : m)));

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Modifica · {task.task_label}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-xs">Primary model</Label>
            <ModelSelect value={primary} onChange={setPrimary} />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Modello tentato per primo. Sceglilo cost-optimized per il task.
            </p>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label className="text-xs">Fallback chain ({fallbacks.length})</Label>
              <Button variant="outline" size="sm" onClick={addFallback}>
                + Aggiungi fallback
              </Button>
            </div>
            <div className="space-y-2">
              {fallbacks.map((m, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-4">{i + 1}.</span>
                  <ModelSelect value={m} onChange={(v) => updateFallback(i, v)} />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => removeFallback(i)}
                  >
                    ✕
                  </Button>
                </div>
              ))}
              {fallbacks.length === 0 && (
                <p className="rounded-md border border-dashed p-2 text-center text-xs text-muted-foreground">
                  Nessun fallback. Se primary fallisce, il task fallisce.
                </p>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending && <RefreshCw className="mr-1.5 h-4 w-4 animate-spin" />}
            Salva
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ModelSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {RECOMMENDED_MODELS.map((g) => (
          <div key={g.group}>
            <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {g.group}
            </p>
            {g.models.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                <span className="font-mono text-xs">{m.label}</span>
              </SelectItem>
            ))}
          </div>
        ))}
      </SelectContent>
    </Select>
  );
}
