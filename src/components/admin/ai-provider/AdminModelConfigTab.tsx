// MP05-FIX — SuperAdmin: scelta modello primary + fallback chain per task_kind.
// Scrive in ai_model_config con company_id=NULL (global only).

import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, RefreshCcw, Lock } from "lucide-react";
import { toast } from "sonner";
import {
  useAiModelCatalog,
  useSyncOpenRouterCatalog,
  TASK_META,
  type TaskKind,
} from "@/hooks/ai-provider";

const TASKS: TaskKind[] = [
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
  // Task del rendering AI (migration 20270514180000): esistono e sono usati
  // a runtime, ma prima erano invisibili e non modificabili da questa tab.
  "render_image_edit",
  "render_scene_analysis",
  "render_image_qa",
  "default",
];

interface ConfigRow {
  id: string;
  task_kind: string;
  primary_model: string;
  fallback_chain: string[] | null;
  max_cost_usd_per_call: number;
  temperature: number;
  max_tokens: number;
  enabled: boolean;
}

export function AdminModelConfigTab() {
  const qc = useQueryClient();
  const { data: catalog, isLoading: loadingCatalog } = useAiModelCatalog();
  const sync = useSyncOpenRouterCatalog();

  const { data: configs, isLoading: loadingConfig } = useQuery({
    queryKey: ["admin", "ai-model-config"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_model_config")
        .select("*")
        .is("company_id", null)
        .order("task_kind");
      if (error) throw error;
      return (data ?? []) as unknown as ConfigRow[];
    },
  });

  const updateMut = useMutation({
    mutationFn: async (payload: { task_kind: TaskKind } & Partial<ConfigRow>) => {
      const { task_kind, ...rest } = payload;
      const { error } = await supabase
        .from("ai_model_config")
        .upsert(
          {
            company_id: null,
            task_kind,
            primary_model: rest.primary_model ?? "openai/gpt-4o-mini",
            ...rest,
          } as never,
          { onConflict: "task_kind" },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "ai-model-config"] });
      toast.success("Configurazione piattaforma aggiornata");
    },
    onError: (e: Error) => toast.error(`Errore: ${e.message}`),
  });

  const whitelisted = useMemo(
    () => (catalog ?? []).filter((m) => m.whitelisted && m.status === "active"),
    [catalog],
  );

  const configByTask = useMemo(() => {
    const map = new Map<string, ConfigRow>();
    for (const c of configs ?? []) map.set(c.task_kind, c);
    return map;
  }, [configs]);

  if (loadingCatalog || loadingConfig) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Alert>
        <Lock className="h-4 w-4" />
        <AlertDescription className="text-sm">
          🔒 <strong>Configurazione piattaforma</strong> — visibile e modificabile solo da SuperAdmin AEDIX. Le aziende clienti non vedono né selezionano il modello. Questa scelta impatta qualità e costo reale di ogni task.
        </AlertDescription>
      </Alert>

      <div className="flex items-center justify-end">
        <Button
          variant="outline"
          onClick={() => sync.mutate()}
          disabled={sync.isPending}
        >
          {sync.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCcw className="mr-2 h-4 w-4" />
          )}
          Sync catalogo
        </Button>
      </div>

      {whitelisted.length === 0 && (
        <Alert variant="destructive">
          <AlertDescription>
            Nessun modello whitelisted nel catalogo. Esegui "Sync catalogo"
            (richiede OPENROUTER_API_KEY settato).
          </AlertDescription>
        </Alert>
      )}

      {TASKS.map((task) => {
        const config = configByTask.get(task);
        const meta = TASK_META[task];
        return (
          <Card key={task}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <CardTitle className="text-base">{meta.label}</CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">{meta.desc}</p>
                  <code className="text-xs text-muted-foreground">{task}</code>
                </div>
                <Switch
                  checked={config?.enabled ?? true}
                  onCheckedChange={(enabled) =>
                    updateMut.mutate({
                      task_kind: task,
                      primary_model: config?.primary_model,
                      enabled,
                    })
                  }
                  aria-label={`Abilita ${meta.label}`}
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
                      updateMut.mutate({ task_kind: task, primary_model: v })
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
                              ${Number(m.pricing_input_usd_1m ?? 0).toFixed(2)}/1M in · ${Number(m.pricing_output_usd_1m ?? 0).toFixed(2)}/1M out
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
                          task_kind: task,
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
  );
}
