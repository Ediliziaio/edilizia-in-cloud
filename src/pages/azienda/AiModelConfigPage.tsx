// MP05 — Pagina configurazione modelli AI per company.

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Info,
  Zap,
  Loader2,
  RefreshCcw,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import {
  TASK_META,
  useAiModelCatalog,
  useAiModelConfig,
  useAiUsageStats,
  useUpdateAiModelConfig,
  useSyncOpenRouterCatalog,
  type TaskKind,
} from "@/hooks/ai-provider";

const PRIORITY_TASKS: TaskKind[] = [
  "bot_operativo_titolare",
  "bot_operativo_operaio",
  "assistenza_clienti",
  "lead_qualificazione",
  "vision_ddt",
  "vision_cantiere",
  "parse_rapportino",
  "computo_metrico",
  "bank_categorize",
  "chat_routine",
];

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string | number;
  icon: typeof Zap;
  tone?: "ok" | "warn" | "bad" | "neutral";
}) {
  const color =
    tone === "ok"
      ? "text-emerald-600"
      : tone === "warn"
      ? "text-amber-600"
      : tone === "bad"
      ? "text-red-600"
      : "text-foreground";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
          </div>
          <Icon className={`h-5 w-5 ${color}`} />
        </div>
      </CardContent>
    </Card>
  );
}

export default function AiModelConfigPage() {
  const { data: catalog, isLoading: loadingCatalog } = useAiModelCatalog();
  const { data: configs, isLoading: loadingConfig } = useAiModelConfig();
  const { data: stats } = useAiUsageStats({ days: 30 });
  const updateMut = useUpdateAiModelConfig();
  const syncMut = useSyncOpenRouterCatalog();

  const whitelisted = useMemo(
    () => (catalog ?? []).filter((m) => m.whitelisted && m.status === "active"),
    [catalog],
  );

  const configByTask = useMemo(() => {
    const map = new Map<TaskKind, (typeof configs)[number] | undefined>();
    for (const c of configs ?? []) {
      map.set(c.task_kind as TaskKind, c);
    }
    return map;
  }, [configs]);

  if (loadingCatalog || loadingConfig) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const successRatePct = ((stats?.success_rate ?? 1) * 100).toFixed(1);
  const tone =
    (stats?.success_rate ?? 1) >= 0.99
      ? "ok"
      : (stats?.success_rate ?? 1) >= 0.95
      ? "warn"
      : "bad";

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-5xl mx-auto">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Zap className="h-6 w-6 text-primary" />
            Configurazione Modelli AI
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Scegli quale modello usare per ogni tipo di operazione. Modelli
            premium (Claude, GPT-4o) costano di più ma performano meglio su
            tool calling complesso; modelli economici (Kimi, DeepSeek) costano
            fino a 10× meno su task semplici.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => syncMut.mutate()}
          disabled={syncMut.isPending}
        >
          {syncMut.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCcw className="mr-2 h-4 w-4" />
          )}
          Sincronizza catalogo
        </Button>
      </div>

      {/* Stats 30gg */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Richieste 30gg"
          value={stats?.total_requests ?? 0}
          icon={TrendingUp}
        />
        <StatCard
          label="Costo 30gg"
          value={`$ ${(stats?.total_cost_usd ?? 0).toFixed(4)}`}
          icon={Zap}
        />
        <StatCard
          label="Tasso successo"
          value={`${successRatePct}%`}
          icon={CheckCircle2}
          tone={tone}
        />
        <StatCard
          label="Fallback attivati"
          value={stats?.fallback_count ?? 0}
          icon={AlertCircle}
          tone={(stats?.fallback_count ?? 0) > 0 ? "warn" : "neutral"}
        />
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription className="text-sm">
          La configurazione <b>globale</b> (badge grigio) vale per tutte le
          aziende. Salvando qui sovrascrivi con un <b>override company</b>
          {" "}(badge blu) che si applica solo alla tua azienda. I modelli si
          sincronizzano via OpenRouter — clicca "Sincronizza catalogo" per
          aggiornare prezzi.
        </AlertDescription>
      </Alert>

      {whitelisted.length === 0 && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Nessun modello nel catalogo. Clicca "Sincronizza catalogo" per
            importare da OpenRouter (richiede <code>OPENROUTER_API_KEY</code>
            {" "}configurata in Supabase secrets).
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-3">
        {PRIORITY_TASKS.map((kind) => {
          const config = configByTask.get(kind);
          const meta = TASK_META[kind];
          const source = config?.source ?? "global";

          return (
            <Card key={kind}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <CardTitle className="text-base">
                        {meta.label}
                      </CardTitle>
                      <Badge
                        variant={source === "company" ? "default" : "secondary"}
                        className="text-xs"
                      >
                        {source === "company" ? "Override azienda" : "Globale"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {meta.desc}
                    </p>
                  </div>
                  <Switch
                    checked={config?.enabled ?? true}
                    onCheckedChange={(enabled) =>
                      updateMut.mutate({
                        task_kind: kind,
                        primary_model: config?.primary_model,
                        enabled,
                      })
                    }
                    aria-label={`Abilita task ${meta.label}`}
                  />
                </div>
              </CardHeader>
              <CardContent className="pt-0 space-y-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label>Modello primario</Label>
                    <Select
                      value={config?.primary_model ?? ""}
                      onValueChange={(v) =>
                        updateMut.mutate({
                          task_kind: kind,
                          primary_model: v,
                        })
                      }
                      disabled={whitelisted.length === 0}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Scegli modello..." />
                      </SelectTrigger>
                      <SelectContent>
                        {whitelisted.map((m) => (
                          <SelectItem key={m.model_id} value={m.model_id}>
                            <div className="flex items-center justify-between gap-3 w-full">
                              <span>{m.display_name ?? m.model_id}</span>
                              <span className="text-xs text-muted-foreground ml-2">
                                ${Number(m.pricing_input_usd_1m ?? 0).toFixed(2)}/1M in
                                {" · "}
                                ${Number(m.pricing_output_usd_1m ?? 0).toFixed(2)}/1M out
                              </span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Costo max per chiamata ($)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      defaultValue={Number(config?.max_cost_usd_per_call ?? 0.2)}
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (v !== Number(config?.max_cost_usd_per_call ?? 0.2)) {
                          updateMut.mutate({
                            task_kind: kind,
                            primary_model: config?.primary_model,
                            max_cost_usd_per_call: v,
                          });
                        }
                      }}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {stats && stats.by_model.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Uso per modello (30gg)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {stats.by_model.map((m) => (
                <div
                  key={m.model}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="font-mono text-xs">{m.model}</span>
                  <span className="text-muted-foreground">
                    {m.count} chiamate · ${m.cost_usd.toFixed(4)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
