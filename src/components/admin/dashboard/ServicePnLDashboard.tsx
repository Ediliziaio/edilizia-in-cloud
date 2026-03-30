import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/formatters";
import { TrendingUp, Mail, MessageSquare, Bot } from "lucide-react";

interface PnLRow {
  month: string;
  service: string;
  units_sent: number;
  revenue_eur: number;
  cost_eur: number;
  margin_eur: number;
  margin_pct: number;
}

const SERVICE_META: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  email:     { label: "Email Marketing", icon: Mail,         color: "bg-blue-500/10 text-blue-700" },
  whatsapp:  { label: "WhatsApp",        icon: MessageSquare, color: "bg-green-500/10 text-green-700" },
  ai_agents: { label: "Agenti AI",       icon: Bot,          color: "bg-purple-500/10 text-purple-700" },
};

function marginBadgeClass(pct: number): string {
  if (pct >= 60) return "bg-emerald-100 text-emerald-800";
  if (pct >= 40) return "bg-yellow-100 text-yellow-800";
  return "bg-red-100 text-red-800";
}

export function ServicePnLDashboard() {
  const currentMonth = new Date().toISOString().slice(0, 7); // "YYYY-MM"

  const { data: rows, isLoading } = useQuery({
    queryKey: ["superadmin-service-pnl"],
    queryFn: async (): Promise<PnLRow[]> => {
      const { data, error } = await supabase
        .from("superadmin_service_pnl" as never)
        .select("*")
        .order("month", { ascending: false })
        .limit(36);
      if (error) throw error;
      return (data as unknown as PnLRow[]) ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const currentRows = (rows ?? []).filter((r) => r.month?.startsWith(currentMonth));

  const totalRevenue = currentRows.reduce((s, r) => s + (r.revenue_eur ?? 0), 0);
  const totalCost    = currentRows.reduce((s, r) => s + (r.cost_eur ?? 0), 0);
  const totalMargin  = currentRows.reduce((s, r) => s + (r.margin_eur ?? 0), 0);
  const totalMarginPct = totalRevenue > 0 ? Math.round((totalMargin / totalRevenue) * 100) : 0;

  if (isLoading) {
    return <Skeleton className="h-[400px] w-full" />;
  }

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-l-4 border-l-emerald-500/60">
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <TrendingUp className="h-3.5 w-3.5" /> Ricavi Totali (mese corrente)
            </div>
            <p className="text-2xl font-bold">{formatCurrency(totalRevenue)}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-orange-500/60">
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <TrendingUp className="h-3.5 w-3.5" /> Costi Provider
            </div>
            <p className="text-2xl font-bold">{formatCurrency(totalCost)}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-blue-500/60">
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <TrendingUp className="h-3.5 w-3.5" /> Margine Netto
            </div>
            <div className="flex items-center gap-2">
              <p className="text-2xl font-bold">{formatCurrency(totalMargin)}</p>
              <Badge className={marginBadgeClass(totalMarginPct)}>{totalMarginPct}%</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Per-service breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4" /> P&amp;L per Servizio — Mese Corrente
          </CardTitle>
          <CardDescription>Dati dalla materialized view aggiornata ogni ora.</CardDescription>
        </CardHeader>
        <CardContent>
          {currentRows.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Nessun dato disponibile per il mese corrente.</p>
          ) : (
            <div className="space-y-3">
              {currentRows.map((row) => {
                const meta = SERVICE_META[row.service] ?? { label: row.service, icon: TrendingUp, color: "bg-gray-100 text-gray-700" };
                const Icon = meta.icon;
                const pct = row.margin_pct ?? 0;
                return (
                  <div key={row.service} className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`rounded-md p-1.5 ${meta.color}`}>
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="font-semibold text-sm">{meta.label}</span>
                        <Badge variant="outline" className="text-[10px]">
                          {Number(row.units_sent ?? 0).toLocaleString("it-IT")} unità
                        </Badge>
                      </div>
                      <Badge className={`${marginBadgeClass(pct)} text-xs font-bold`}>
                        Margine {pct}%
                      </Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div className="bg-muted/40 rounded-md p-3">
                        <p className="text-[10px] text-muted-foreground mb-1">Ricavo</p>
                        <p className="font-semibold text-sm">{formatCurrency(row.revenue_eur ?? 0)}</p>
                      </div>
                      <div className="bg-muted/40 rounded-md p-3">
                        <p className="text-[10px] text-muted-foreground mb-1">Costo Provider</p>
                        <p className="font-semibold text-sm">{formatCurrency(row.cost_eur ?? 0)}</p>
                      </div>
                      <div className="bg-muted/40 rounded-md p-3">
                        <p className="text-[10px] text-muted-foreground mb-1">Margine</p>
                        <p className="font-semibold text-sm text-emerald-700">{formatCurrency(row.margin_eur ?? 0)}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
