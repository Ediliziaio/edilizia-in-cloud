/**
 * ConsumptionByService — "Come stai usando i crediti".
 *
 * Pannello consumi per l'imprenditore: spesa e operazioni per servizio
 * (Email, AI, WhatsApp, SMS, Render) nel periodo scelto, con andamento
 * giornaliero. Fonte: RPC get_credits_usage_breakdown (SECURITY DEFINER,
 * guard membro azienda).
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { subDays, startOfMonth } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { formatEur } from "@/modules/ai-agents/lib/creditCalculator";
import {
  Mail, Bot, MessageSquare, Smartphone, Sparkles, BarChart3,
} from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";

type Periodo = "7d" | "30d" | "mese" | "90d";

const PERIOD_LABEL: Record<Periodo, string> = {
  "7d": "Ultimi 7 giorni",
  "30d": "Ultimi 30 giorni",
  mese: "Mese corrente",
  "90d": "Ultimi 90 giorni",
};

function periodoRange(p: Periodo): { from: Date; to: Date } {
  const to = new Date();
  if (p === "mese") return { from: startOfMonth(to), to };
  if (p === "7d") return { from: subDays(to, 7), to };
  if (p === "90d") return { from: subDays(to, 90), to };
  return { from: subDays(to, 30), to };
}

const SERVICE_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  email: { label: "Email Marketing", icon: <Mail className="h-4 w-4" />, color: "text-violet-600" },
  ai: { label: "Agenti AI", icon: <Bot className="h-4 w-4" />, color: "text-amber-600" },
  whatsapp: { label: "WhatsApp", icon: <MessageSquare className="h-4 w-4" />, color: "text-emerald-600" },
  sms: { label: "SMS", icon: <Smartphone className="h-4 w-4" />, color: "text-sky-600" },
  render: { label: "Render AI", icon: <Sparkles className="h-4 w-4" />, color: "text-pink-600" },
};

interface ServiceRow {
  service: string;
  spent_eur: number;
  operations: number;
}

interface DayRow {
  giorno: string;
  spent_eur: number;
}

interface BreakdownData {
  servizi: ServiceRow[];
  giorni: DayRow[];
  totale_eur: number;
  totale_operazioni: number;
}

export function ConsumptionByService() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const [periodo, setPeriodo] = useState<Periodo>("30d");

  const { data, isLoading } = useQuery({
    queryKey: ["credits-usage-breakdown", companyId, periodo],
    enabled: !!companyId,
    staleTime: 2 * 60 * 1000,
    queryFn: async (): Promise<BreakdownData> => {
      const { from, to } = periodoRange(periodo);
      const { data, error } = await supabase.rpc("get_credits_usage_breakdown" as never, {
        p_company_id: companyId,
        p_from: from.toISOString(),
        p_to: to.toISOString(),
      } as never);
      if (error) throw error;
      const parsed = data as unknown as BreakdownData;
      return {
        servizi: (parsed?.servizi ?? []).map((s) => ({
          ...s,
          spent_eur: Number(s.spent_eur ?? 0),
          operations: Number(s.operations ?? 0),
        })),
        giorni: (parsed?.giorni ?? []).map((g) => ({
          ...g,
          spent_eur: Number(g.spent_eur ?? 0),
        })),
        totale_eur: Number(parsed?.totale_eur ?? 0),
        totale_operazioni: Number(parsed?.totale_operazioni ?? 0),
      };
    },
  });

  const totale = data?.totale_eur ?? 0;
  const servizi = data?.servizi ?? [];
  const giorni = (data?.giorni ?? []).map((g) => ({
    ...g,
    label: new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "short" }).format(new Date(g.giorno)),
  }));

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="h-4 w-4 text-primary" />
              Come stai usando i crediti
            </CardTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Spesa per servizio e andamento nel periodo selezionato
            </p>
          </div>
          <Select value={periodo} onValueChange={(v) => setPeriodo(v as Periodo)}>
            <SelectTrigger className="w-44 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(PERIOD_LABEL) as Periodo[]).map((p) => (
                <SelectItem key={p} value={p}>{PERIOD_LABEL[p]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : (
          <>
            {/* Totale periodo */}
            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
              <div>
                <span className="text-xs uppercase tracking-wide text-muted-foreground">
                  Speso nel periodo
                </span>
                <p className="text-2xl font-bold tabular-nums">{formatEur(totale)}</p>
              </div>
              <div>
                <span className="text-xs uppercase tracking-wide text-muted-foreground">
                  Operazioni
                </span>
                <p className="text-2xl font-bold tabular-nums">
                  {(data?.totale_operazioni ?? 0).toLocaleString("it-IT")}
                </p>
              </div>
            </div>

            {/* Breakdown per servizio */}
            {servizi.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                Nessun consumo nel periodo selezionato.
              </p>
            ) : (
              <div className="space-y-2">
                {servizi.map((s) => {
                  const meta = SERVICE_META[s.service] ?? {
                    label: s.service, icon: <BarChart3 className="h-4 w-4" />, color: "text-muted-foreground",
                  };
                  const pct = totale > 0 ? (s.spent_eur / totale) * 100 : 0;
                  return (
                    <div key={s.service} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className={`flex items-center gap-2 font-medium ${meta.color}`}>
                          {meta.icon}
                          <span className="text-foreground">{meta.label}</span>
                          <span className="text-xs font-normal text-muted-foreground">
                            {s.operations.toLocaleString("it-IT")} operazioni
                          </span>
                        </span>
                        <span className="tabular-nums font-semibold">
                          {formatEur(s.spent_eur)}
                          <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                            ({pct.toFixed(0)}%)
                          </span>
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary/70"
                          style={{ width: `${Math.max(pct, 2)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Andamento giornaliero */}
            {giorni.length > 1 && (
              <div className="h-40 w-full pt-2">
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <AreaChart data={giorni} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.25} />
                        <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      width={50}
                      tickFormatter={(v: number) => `€${v}`}
                    />
                    <Tooltip
                      formatter={(v: number) => [formatEur(v), "Spesa"]}
                      labelFormatter={(l: string) => `Giorno: ${l}`}
                    />
                    <Area
                      type="monotone"
                      dataKey="spent_eur"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      fill="url(#spendGrad)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
