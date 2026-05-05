/**
 * SilvioCustomerLTVPanel — Dashboard LTV + Churn Risk
 *
 * Mostra:
 *   - Top 10 clienti per LTV predetto 12m
 *   - Top 10 clienti a rischio churn (con azione consigliata)
 *   - Pulsante "Ricalcola LTV" che chiama edge ai-customer-ltv
 *
 * Permessi: super_admin / company_admin / salesperson
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Sparkles, TrendingUp, AlertTriangle, RefreshCw, Loader2,
  Crown, UserMinus, Calendar,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/formatters";

interface LTVRow {
  cliente: string;
  ordini_totali: number;
  fatturato_storico: number;
  ticket_medio?: number;
  ltv_12m: number;
  churn_risk: string;
  azione_consigliata: string;
  gg_inattivo?: number;
  ultimo_ordine_data?: string;
  ordine: number;
}

const CHURN_BADGE: Record<string, string> = {
  basso: "bg-emerald-100 text-emerald-700 border-emerald-300",
  medio: "bg-amber-100 text-amber-700 border-amber-300",
  alto: "bg-rose-100 text-rose-700 border-rose-300",
  perso: "bg-zinc-200 text-zinc-700 border-zinc-400",
};

export function SilvioCustomerLTVPanel() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const qc = useQueryClient();
  const [tab, setTab] = useState<"value" | "risk">("value");

  const { data: topValue, isLoading: loadingValue } = useQuery({
    queryKey: ["ltv_top_value", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase.rpc("silvio_top_value_customers" as never, {
        p_company_id: companyId, p_limit: 10,
      } as never);
      if (error) throw error;
      return (data ?? []) as unknown as LTVRow[];
    },
    enabled: !!companyId,
    staleTime: 5 * 60_000,
  });

  const { data: topRisk, isLoading: loadingRisk } = useQuery({
    queryKey: ["ltv_top_risk", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase.rpc("silvio_top_at_risk_customers" as never, {
        p_company_id: companyId, p_limit: 10,
      } as never);
      if (error) throw error;
      return (data ?? []) as unknown as LTVRow[];
    },
    enabled: !!companyId,
    staleTime: 5 * 60_000,
  });

  const recomputeMutation = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("Company id mancante");
      const { data, error } = await supabase.functions.invoke("ai-customer-ltv", {
        body: { company_id: companyId, ai_enrich_top: 5 },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error ?? "Calcolo fallito");
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["ltv_top_value", companyId] });
      qc.invalidateQueries({ queryKey: ["ltv_top_risk", companyId] });
      toast.success(
        `LTV ricalcolato: ${data.summary?.clienti_analizzati ?? "—"} clienti · LTV totale 12m € ${
          (data.summary?.ltv_totale_12m_eur ?? 0).toLocaleString("it-IT")
        }`,
      );
    },
    onError: (err) => toast.error(`Errore: ${err instanceof Error ? err.message : String(err)}`),
  });

  if (!companyId) return null;

  return (
    <Card className="border-l-4 border-l-violet-500">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-violet-600" />
              Customer LTV & Churn — Silvio AI
            </CardTitle>
            <CardDescription className="text-xs mt-1">
              Predizione lifetime value 12m + clienti a rischio inattività.
            </CardDescription>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => recomputeMutation.mutate()}
            disabled={recomputeMutation.isPending}
            className="gap-1"
          >
            {recomputeMutation.isPending
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <RefreshCw className="h-3.5 w-3.5" />}
            Ricalcola
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        <Tabs value={tab} onValueChange={(v) => setTab(v as "value" | "risk")}>
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="value" className="gap-1">
              <Crown className="h-3.5 w-3.5" /> Top Valore
            </TabsTrigger>
            <TabsTrigger value="risk" className="gap-1">
              <UserMinus className="h-3.5 w-3.5" /> A Rischio
              {(topRisk?.length ?? 0) > 0 && (
                <Badge variant="outline" className="ml-1 h-5 px-1.5 text-[10px] bg-rose-100 text-rose-700">
                  {topRisk!.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="value" className="mt-3 space-y-1">
            {loadingValue ? (
              <Skeleton className="h-48 w-full" />
            ) : (topValue?.length ?? 0) === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-8">
                Nessun dato. Clicca <strong>Ricalcola</strong> per analizzare i clienti.
              </div>
            ) : (
              topValue!.map((r) => (
                <div
                  key={r.cliente + r.ordine}
                  className="grid grid-cols-12 gap-2 items-center px-2 py-2 rounded text-xs hover:bg-muted/40 border-b last:border-b-0"
                >
                  <div className="col-span-1 flex items-center justify-center">
                    {r.ordine === 1 && <Crown className="h-4 w-4 text-amber-500" />}
                    {r.ordine > 1 && <span className="text-muted-foreground font-mono">#{r.ordine}</span>}
                  </div>
                  <div className="col-span-4 truncate font-medium">{r.cliente}</div>
                  <div className="col-span-2 text-right">
                    <div className="text-[10px] text-muted-foreground">Ordini</div>
                    <div className="font-mono">{r.ordini_totali}</div>
                  </div>
                  <div className="col-span-2 text-right">
                    <div className="text-[10px] text-muted-foreground">Storico</div>
                    <div className="font-mono">{formatCurrency(r.fatturato_storico)}</div>
                  </div>
                  <div className="col-span-2 text-right">
                    <div className="text-[10px] text-muted-foreground">LTV 12m</div>
                    <div className="font-mono font-semibold text-violet-700">
                      {formatCurrency(r.ltv_12m)}
                    </div>
                  </div>
                  <div className="col-span-1 flex justify-end">
                    <Badge variant="outline" className={cn("text-[10px]", CHURN_BADGE[r.churn_risk] ?? "")}>
                      {r.churn_risk}
                    </Badge>
                  </div>
                </div>
              ))
            )}
          </TabsContent>

          <TabsContent value="risk" className="mt-3 space-y-1">
            {loadingRisk ? (
              <Skeleton className="h-48 w-full" />
            ) : (topRisk?.length ?? 0) === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-8 flex flex-col items-center gap-1">
                <TrendingUp className="h-8 w-8 text-emerald-500" />
                Nessun cliente a rischio churn. Ottimo!
              </div>
            ) : (
              topRisk!.map((r) => (
                <div
                  key={r.cliente + r.ordine}
                  className="px-2 py-2 rounded text-xs hover:bg-muted/40 border-b last:border-b-0"
                >
                  <div className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-5 truncate font-medium flex items-center gap-1">
                      <AlertTriangle className={cn(
                        "h-3.5 w-3.5",
                        r.churn_risk === "alto" && "text-rose-600",
                        r.churn_risk === "medio" && "text-amber-600",
                        r.churn_risk === "perso" && "text-zinc-500",
                      )} />
                      {r.cliente}
                    </div>
                    <div className="col-span-3 text-right">
                      <div className="text-[10px] text-muted-foreground">Ultimo ordine</div>
                      <div className="font-mono">
                        {r.ultimo_ordine_data
                          ? new Date(r.ultimo_ordine_data).toLocaleDateString("it-IT", {
                              month: "short", year: "numeric",
                            })
                          : "—"}
                      </div>
                    </div>
                    <div className="col-span-2 text-right">
                      <div className="text-[10px] text-muted-foreground">Inattivo</div>
                      <div className="font-mono">{r.gg_inattivo ?? "—"}gg</div>
                    </div>
                    <div className="col-span-2 flex justify-end">
                      <Badge variant="outline" className={cn("text-[10px]", CHURN_BADGE[r.churn_risk] ?? "")}>
                        {r.churn_risk}
                      </Badge>
                    </div>
                  </div>
                  {r.azione_consigliata && (
                    <div className="text-[11px] text-violet-700 mt-1 flex items-center gap-1 pl-5">
                      <Sparkles className="h-3 w-3" />
                      {r.azione_consigliata}
                    </div>
                  )}
                </div>
              ))
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
