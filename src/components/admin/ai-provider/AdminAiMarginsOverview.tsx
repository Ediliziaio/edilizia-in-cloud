// MP05-FIX — SuperAdmin AI margins overview: KPI 30gg + breakdown per task.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, TrendingUp, DollarSign, Users, Zap } from "lucide-react";

interface UsageRow {
  cost_real_eur: number | null;
  cost_billed_eur: number | null;
  margin_eur: number | null;
  company_id: string | null;
  task_kind: string;
}

interface TaskStats {
  n: number;
  real: number;
  billed: number;
  margin: number;
}

export function AdminAiMarginsOverview() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "ai-margins-30d"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - 30);
      const { data, error } = await supabase
        .from("ai_model_usage_log")
        .select("cost_real_eur, cost_billed_eur, margin_eur, company_id, task_kind")
        .gte("ts", since.toISOString())
        .eq("ok", true)
        .eq("credits_deducted", true);
      if (error) throw error;
      const rows = (data ?? []) as UsageRow[];

      const byTask = new Map<string, TaskStats>();
      for (const r of rows) {
        const cur = byTask.get(r.task_kind) ?? { n: 0, real: 0, billed: 0, margin: 0 };
        cur.n += 1;
        cur.real += Number(r.cost_real_eur ?? 0);
        cur.billed += Number(r.cost_billed_eur ?? 0);
        cur.margin += Number(r.margin_eur ?? 0);
        byTask.set(r.task_kind, cur);
      }

      return {
        total_real: rows.reduce((s, r) => s + Number(r.cost_real_eur ?? 0), 0),
        total_billed: rows.reduce((s, r) => s + Number(r.cost_billed_eur ?? 0), 0),
        total_margin: rows.reduce((s, r) => s + Number(r.margin_eur ?? 0), 0),
        n_calls: rows.length,
        n_companies: new Set(rows.map((r) => r.company_id).filter(Boolean)).size,
        by_task: Array.from(byTask.entries()).sort((a, b) => b[1].margin - a[1].margin),
      };
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) return null;

  const marginPct = data.total_billed > 0
    ? ((data.total_margin / data.total_billed) * 100).toFixed(1)
    : "0";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Costo reale 30gg</p>
                <p className="text-2xl font-bold mt-1">€ {data.total_real.toFixed(4)}</p>
              </div>
              <DollarSign className="h-5 w-5 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Ricavi azienda 30gg</p>
                <p className="text-2xl font-bold mt-1 text-emerald-600">
                  € {data.total_billed.toFixed(4)}
                </p>
              </div>
              <TrendingUp className="h-5 w-5 text-emerald-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Margine netto</p>
                <p className="text-2xl font-bold mt-1 text-primary">
                  € {data.total_margin.toFixed(4)}
                </p>
                <p className="text-xs text-muted-foreground">({marginPct}%)</p>
              </div>
              <Zap className="h-5 w-5 text-primary" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Chiamate / Aziende</p>
                <p className="text-2xl font-bold mt-1">{data.n_calls}</p>
                <p className="text-xs text-muted-foreground">{data.n_companies} aziende</p>
              </div>
              <Users className="h-5 w-5 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Margine per task (30gg)</CardTitle>
        </CardHeader>
        <CardContent>
          {data.by_task.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nessuna chiamata AI registrata negli ultimi 30 giorni.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b">
                    <th className="pb-2">Task</th>
                    <th className="pb-2 text-right">Chiamate</th>
                    <th className="pb-2 text-right">Reale €</th>
                    <th className="pb-2 text-right">Fatturato €</th>
                    <th className="pb-2 text-right">Margine €</th>
                    <th className="pb-2 text-right">Margine %</th>
                  </tr>
                </thead>
                <tbody>
                  {data.by_task.map(([taskKind, s]) => (
                    <tr key={taskKind} className="border-b last:border-0">
                      <td className="py-2 font-mono text-xs">{taskKind}</td>
                      <td className="text-right">{s.n}</td>
                      <td className="text-right">€ {s.real.toFixed(4)}</td>
                      <td className="text-right">€ {s.billed.toFixed(4)}</td>
                      <td className="text-right text-emerald-600 font-medium">
                        € {s.margin.toFixed(4)}
                      </td>
                      <td className="text-right">
                        {s.billed > 0 ? ((s.margin / s.billed) * 100).toFixed(1) : "0"}%
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
