import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Phone, MessageSquare, Bot, CreditCard, TrendingUp, Clock } from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

interface Analytics {
  chiamate: { totali: number; completate: number; durata_media_sec: number; tasso_risposta: number };
  chat: { totali: number; messaggi_totali: number; durata_media_sec: number };
  agenti: { tipo: string; count: number }[];
  crediti: { totale_consumato: number; transazioni: number };
  serie_chiamate: { data: string; count: number }[];
  serie_chat: { data: string; count: number }[];
}

const PIE_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--accent-foreground))",
  "hsl(var(--muted-foreground))",
  "hsl(var(--destructive))",
];

const TIPO_LABELS: Record<string, string> = {
  vocale: "Vocale",
  chat: "Chat",
  whatsapp: "WhatsApp",
  campagna: "Campagna",
};

export function StatisticheTab() {
  const companyId = useEffectiveCompanyId();
  const [giorni, setGiorni] = useState("30");

  const { data: analytics, isLoading } = useQuery({
    queryKey: ["ai-analytics", companyId, giorni],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_ai_analytics" as never, {
        p_company_id: companyId!,
        p_giorni: parseInt(giorni),
      } as never);
      if (error) throw error;
      return data as unknown as Analytics;
    },
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-[300px]" />
      </div>
    );
  }

  if (!analytics) {
    return <p className="text-muted-foreground text-center py-12">Nessun dato disponibile</p>;
  }

  const kpis = [
    { label: "Chiamate", value: analytics.chiamate.totali, icon: Phone, color: "text-primary", bg: "bg-primary/10" },
    { label: "Tasso Risposta", value: `${Math.round(analytics.chiamate.tasso_risposta)}%`, icon: TrendingUp, color: "text-primary", bg: "bg-primary/10" },
    { label: "Chat", value: analytics.chat.totali, icon: MessageSquare, color: "text-accent-foreground", bg: "bg-accent/50" },
    { label: "Durata Media", value: `${Math.round(analytics.chiamate.durata_media_sec)}s`, icon: Clock, color: "text-accent-foreground", bg: "bg-accent/50" },
    { label: "Crediti Usati", value: analytics.crediti.totale_consumato.toFixed(1), icon: CreditCard, color: "text-primary", bg: "bg-primary/10" },
    { label: "Agenti Attivi", value: analytics.agenti.reduce((s, a) => s + a.count, 0), icon: Bot, color: "text-accent-foreground", bg: "bg-accent/50" },
  ];

  const pieData = analytics.agenti.map((a) => ({
    name: TIPO_LABELS[a.tipo] || a.tipo,
    value: a.count,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-foreground">Statistiche AI</h2>
        <Select value={giorni} onValueChange={setGiorni}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Ultimi 7 giorni</SelectItem>
            <SelectItem value="30">Ultimi 30 giorni</SelectItem>
            <SelectItem value="90">Ultimi 90 giorni</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <Card key={kpi.label}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${kpi.bg}`}>
                  <Icon className={`h-4 w-4 ${kpi.color}`} />
                </div>
                <div>
                  <p className="text-lg font-bold text-foreground leading-tight">{kpi.value}</p>
                  <p className="text-[11px] text-muted-foreground">{kpi.label}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Calls BarChart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Phone className="h-4 w-4" /> Chiamate per Giorno
            </CardTitle>
          </CardHeader>
          <CardContent>
            {analytics.serie_chiamate.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={analytics.serie_chiamate}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="data" tick={{ fontSize: 10 }} className="text-muted-foreground" />
                  <YAxis tick={{ fontSize: 10 }} className="text-muted-foreground" />
                  <Tooltip
                    contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                    labelStyle={{ color: "hsl(var(--foreground))" }}
                  />
                  <Bar dataKey="count" name="Chiamate" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">Nessun dato</p>
            )}
          </CardContent>
        </Card>

        {/* Chat LineChart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare className="h-4 w-4" /> Chat per Giorno
            </CardTitle>
          </CardHeader>
          <CardContent>
            {analytics.serie_chat.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={analytics.serie_chat}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="data" tick={{ fontSize: 10 }} className="text-muted-foreground" />
                  <YAxis tick={{ fontSize: 10 }} className="text-muted-foreground" />
                  <Tooltip
                    contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                    labelStyle={{ color: "hsl(var(--foreground))" }}
                  />
                  <Line type="monotone" dataKey="count" name="Chat" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ fill: "hsl(var(--primary))", r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">Nessun dato</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Pie Chart — Agent Distribution */}
      {pieData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Bot className="h-4 w-4" /> Distribuzione Agenti per Tipo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                  dataKey="value"
                  label={({ name, value }) => `${name}: ${value}`}
                >
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
