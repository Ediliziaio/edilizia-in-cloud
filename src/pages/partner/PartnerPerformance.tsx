import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, MousePointerClick, TrendingUp, Users, Wallet } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { subDays, format } from "date-fns";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type ClickRow = { created_at: string; utm_source: string | null };
type ConversionRow = { created_at: string; status: string; revenue: number | null; commission_amount: number | null };

export default function PartnerPerformance() {
  const { user } = useAuth();

  const { data: referrer, isLoading: referrerLoading } = useQuery({
    queryKey: ["my-referrer-performance", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("referrers")
        .select("id, total_clicks, total_conversions, conversion_rate, total_earned, total_paid")
        .eq("user_id", user!.id)
        .maybeSingle();
      return data;
    },
  });

  const { data: clicks = [], isLoading: clicksLoading } = useQuery({
    queryKey: ["partner-performance-clicks", referrer?.id],
    enabled: !!referrer?.id,
    queryFn: async () => {
      const from = subDays(new Date(), 30).toISOString();
      const { data, error } = await supabase
        .from("referral_clicks")
        .select("created_at, utm_source")
        .eq("referrer_id", referrer!.id)
        .gte("created_at", from);
      if (error) throw error;
      return (data || []) as ClickRow[];
    },
  });

  const { data: conversions = [], isLoading: conversionsLoading } = useQuery({
    queryKey: ["partner-performance-conversions", referrer?.id],
    enabled: !!referrer?.id,
    queryFn: async () => {
      const from = subDays(new Date(), 30).toISOString();
      const { data, error } = await (supabase as any)
        .from("referral_conversions")
        .select("created_at, status, revenue, commission_amount")
        .eq("referrer_id", referrer!.id)
        .gte("created_at", from);
      if (error) throw error;
      return (data || []) as ConversionRow[];
    },
  });

  const isLoading = referrerLoading || clicksLoading || conversionsLoading;

  const daily = useMemo(() => {
    return Array.from({ length: 30 }, (_, index) => {
      const day = subDays(new Date(), 29 - index);
      const key = format(day, "yyyy-MM-dd");
      const dayClicks = clicks.filter((c) => c.created_at?.startsWith(key)).length;
      const dayConversions = conversions.filter((c) => c.created_at?.startsWith(key)).length;
      const revenue = conversions
        .filter((c) => c.created_at?.startsWith(key))
        .reduce((sum, c) => sum + Number(c.revenue || 0), 0);
      return {
        date: format(day, "dd/MM"),
        click: dayClicks,
        conversioni: dayConversions,
        revenue,
      };
    });
  }, [clicks, conversions]);

  const sources = useMemo(() => {
    const map = new Map<string, number>();
    clicks.forEach((click) => map.set(click.utm_source || "direct", (map.get(click.utm_source || "direct") || 0) + 1));
    return Array.from(map.entries())
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [clicks]);

  const monthRevenue = conversions.reduce((sum, item) => sum + Number(item.revenue || 0), 0);
  const monthCommission = conversions.reduce((sum, item) => sum + Number(item.commission_amount || 0), 0);
  const conversionRate = clicks.length > 0 ? (conversions.length / clicks.length) * 100 : Number(referrer?.conversion_rate || 0);

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  return (
    <div className="space-y-6 p-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Performance</h1>
        <p className="text-sm text-muted-foreground">Click, conversioni, revenue e canali degli ultimi 30 giorni.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground flex items-center gap-1"><MousePointerClick className="h-3 w-3" /> Click 30g</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{clicks.length}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground flex items-center gap-1"><Users className="h-3 w-3" /> Conversioni 30g</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{conversions.length}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground flex items-center gap-1"><TrendingUp className="h-3 w-3" /> Conversion rate</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{conversionRate.toFixed(1)}%</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground flex items-center gap-1"><Wallet className="h-3 w-3" /> Commissioni 30g</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{formatCurrency(monthCommission)}</p></CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Andamento click e conversioni</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={daily}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                <Area type="monotone" dataKey="click" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.18)" name="Click" />
                <Area type="monotone" dataKey="conversioni" stroke="#10b981" fill="#10b98122" name="Conversioni" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              Sorgenti
              <Badge variant="outline">{formatCurrency(monthRevenue)} revenue</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {sources.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-10">Nessun dato sorgente</p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={sources} layout="vertical" margin={{ left: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="source" width={80} tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} name="Click" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
