// MP05-FIX — SuperAdmin: breakdown spesa/margine per-azienda.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

interface CompanyStats {
  company_id: string;
  n_calls: number;
  cost_real_eur: number;
  cost_billed_eur: number;
  margin_eur: number;
  company_name?: string;
}

export function AdminAiPerCompanyTable() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "ai-by-company-30d"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - 30);
      const { data, error } = await supabase
        .from("ai_model_usage_log")
        .select("company_id, cost_real_eur, cost_billed_eur, margin_eur")
        .gte("ts", since.toISOString())
        .eq("ok", true)
        .eq("credits_deducted", true)
        .not("company_id", "is", null);
      if (error) throw error;

      const map = new Map<string, CompanyStats>();
      for (const r of data ?? []) {
        const id = r.company_id as string;
        const cur = map.get(id) ?? {
          company_id: id,
          n_calls: 0,
          cost_real_eur: 0,
          cost_billed_eur: 0,
          margin_eur: 0,
        };
        cur.n_calls += 1;
        cur.cost_real_eur += Number(r.cost_real_eur ?? 0);
        cur.cost_billed_eur += Number(r.cost_billed_eur ?? 0);
        cur.margin_eur += Number(r.margin_eur ?? 0);
        map.set(id, cur);
      }

      const stats = Array.from(map.values()).sort((a, b) => b.margin_eur - a.margin_eur);

      // Lookup nomi (batch)
      if (stats.length > 0) {
        const ids = stats.map((s) => s.company_id);
        const { data: companies } = await supabase
          .from("companies")
          .select("id, name")
          .in("id", ids);
        const nameMap = new Map(
          (companies ?? []).map((c) => [c.id, c.name as string]),
        );
        for (const s of stats) s.company_name = nameMap.get(s.company_id) ?? "—";
      }

      return stats;
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Margine per azienda (30gg)</CardTitle>
      </CardHeader>
      <CardContent>
        {(data?.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nessuna chiamata AI addebitata negli ultimi 30 giorni.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b">
                  <th className="pb-2">Azienda</th>
                  <th className="pb-2 text-right">Chiamate</th>
                  <th className="pb-2 text-right">Reale €</th>
                  <th className="pb-2 text-right">Fatturato €</th>
                  <th className="pb-2 text-right">Margine €</th>
                  <th className="pb-2 text-right">Margine %</th>
                </tr>
              </thead>
              <tbody>
                {(data ?? []).map((s) => (
                  <tr key={s.company_id} className="border-b last:border-0">
                    <td className="py-2 font-medium">{s.company_name}</td>
                    <td className="text-right">{s.n_calls}</td>
                    <td className="text-right">€ {s.cost_real_eur.toFixed(4)}</td>
                    <td className="text-right">€ {s.cost_billed_eur.toFixed(4)}</td>
                    <td className="text-right text-emerald-600 font-medium">
                      € {s.margin_eur.toFixed(4)}
                    </td>
                    <td className="text-right">
                      {s.cost_billed_eur > 0
                        ? ((s.margin_eur / s.cost_billed_eur) * 100).toFixed(1)
                        : "0"}
                      %
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
