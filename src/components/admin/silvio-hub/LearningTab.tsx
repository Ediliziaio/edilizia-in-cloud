/**
 * LearningTab — self-improvement log + force run
 * Estratto da SilvioAdminHub.tsx (refactor monolite → sub-component).
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Zap } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { GroundednessCard } from "./GroundednessCard";
import { LearningReview } from "./LearningReview";

interface LearningLog {
  id: string;
  run_at: string;
  period_start: string;
  period_end: string;
  runs_analyzed: number;
  gold_added: number;
  avoid_added: number;
  promoted_to_memory: number;
  duration_ms: number;
  ok: boolean;
  errors: unknown;
}

export function LearningTab() {
  const queryClient = useQueryClient();

  const logsQuery = useQuery({
    queryKey: ["silvio-self-improvement-log"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("silvio_self_improvement_log")
        .select("*")
        .order("run_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as LearningLog[];
    },
  });

  const runMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke(
        "silvio-self-improvement",
        {
          body: { source: "manual_hub", days: 7 },
        },
      );
      if (error) throw error;
      if (data?.ok !== true || Number(data?.errors_count ?? 0) > 0) {
        throw new Error(data?.error ?? `Elaborazione incompleta (${data?.errors_count ?? 0} errori). Controlla lo storico.`);
      }
      return data;
    },
    onSuccess: (data) => {
      const d = data as {
        gold_added?: number;
        avoid_added?: number;
        promoted_to_memory?: number;
      };
      toast.success(
        `Self-improvement completato — +${d?.gold_added ?? 0} gold, +${d?.avoid_added ?? 0} avoid, ${d?.promoted_to_memory ?? 0} promossi a memoria`,
      );
    },
    onError: (e) =>
      toast.error("Errore self-improvement", { description: String(e) }),
    onSettled: () => {
      // Partial runs can have saved data too: refresh on success AND failure.
      queryClient.invalidateQueries({ queryKey: ["silvio-self-improvement-log"] });
      queryClient.invalidateQueries({ queryKey: ["silvio-persona-memory"] });
      queryClient.invalidateQueries({ queryKey: ["silvio-learning-review"] });
    },
  });

  const logs = logsQuery.data ?? [];
  const last = logs[0];

  return (
    <div className="space-y-3">
      <GroundednessCard />
      <Card className="border-orange-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Zap className="h-4 w-4 text-orange-500" />
            Self-improvement loop
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Analizza le risposte valutate 👍/👎 degli ultimi 7 giorni e registra
            esempi utili o da evitare, da verificare qui sotto prima di trasformarli
            in memoria. L'esecuzione automatica dipende dalla
            configurazione del server: lo storico mostra gli esiti registrati,
            non conferma che la pianificazione sia attiva.
          </p>
          {last && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              <div className="p-2 rounded bg-emerald-50 border border-emerald-200">
                <div className="text-[10px] text-muted-foreground">
                  Gold last run
                </div>
                <div className="font-bold text-emerald-700">
                  +{last.gold_added}
                </div>
              </div>
              <div className="p-2 rounded bg-rose-50 border border-rose-200">
                <div className="text-[10px] text-muted-foreground">
                  Avoid last run
                </div>
                <div className="font-bold text-rose-700">
                  +{last.avoid_added}
                </div>
              </div>
              <div className="p-2 rounded bg-violet-50 border border-violet-200">
                <div className="text-[10px] text-muted-foreground">
                  Promossi a memoria
                </div>
                <div className="font-bold text-violet-700">
                  {last.promoted_to_memory}
                </div>
              </div>
              <div className="p-2 rounded bg-sky-50 border border-sky-200">
                <div className="text-[10px] text-muted-foreground">
                  Run analizzati
                </div>
                <div className="font-bold text-sky-700">
                  {last.runs_analyzed}
                </div>
              </div>
            </div>
          )}
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={() => runMutation.mutate()}
              disabled={runMutation.isPending}
              className="bg-orange-600 hover:bg-orange-700"
            >
              <Zap
                className={`h-4 w-4 mr-1 ${runMutation.isPending ? "animate-pulse" : ""}`}
              />
              {runMutation.isPending ? "In esecuzione…" : "Esegui ora"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <LearningReview />
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Storico run</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {logsQuery.isLoading ? (
            <Skeleton className="h-32" />
          ) : logsQuery.isError ? (
            <div role="alert" className="p-4 text-sm text-destructive">
              Impossibile caricare lo storico. Non significa che non ci siano esecuzioni.
              <Button size="sm" variant="outline" className="ml-2" onClick={() => logsQuery.refetch()}>Riprova</Button>
            </div>
          ) : logs.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Nessuna esecuzione registrata. Puoi avviarla con "Esegui ora".
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Data</th>
                    <th className="px-3 py-2 text-right">Analizzati</th>
                    <th className="px-3 py-2 text-right">Gold</th>
                    <th className="px-3 py-2 text-right">Avoid</th>
                    <th className="px-3 py-2 text-right">Promossi</th>
                    <th className="px-3 py-2 text-right">Durata</th>
                    <th className="px-3 py-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((l) => (
                    <tr key={l.id} className="border-t hover:bg-muted/20">
                      <td className="px-3 py-2 text-xs">
                        {format(new Date(l.run_at), "dd MMM yyyy HH:mm", {
                          locale: it,
                        })}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs">
                        {l.runs_analyzed}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-emerald-700">
                        +{l.gold_added}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-rose-700">
                        +{l.avoid_added}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-violet-700">
                        {l.promoted_to_memory}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-muted-foreground">
                        {(l.duration_ms / 1000).toFixed(1)}s
                      </td>
                      <td className="px-3 py-2">
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${l.ok ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}
                        >
                          {l.ok ? "✓ ok" : "✗ errors"}
                        </Badge>
                        {!l.ok && Array.isArray(l.errors) && l.errors.length > 0 && (
                          <details className="mt-1 max-w-xs text-xs">
                            <summary className="cursor-pointer">Dettagli errore</summary>
                            <ul className="mt-1 space-y-1 break-words">
                              {l.errors.slice(0, 5).map((entry: { error?: string }, index: number) => (
                                <li key={index}>{String(entry?.error ?? "Errore non specificato").slice(0, 300)}</li>
                              ))}
                            </ul>
                          </details>
                        )}
                      </td>
                    </tr>
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
