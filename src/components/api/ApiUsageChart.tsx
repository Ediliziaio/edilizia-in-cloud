import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useState } from "react";
import { Activity, CheckCircle, XCircle, Clock } from "lucide-react";

interface ApiKey {
  id: string;
  name: string;
  is_active: boolean;
}

export function ApiUsageChart({ keys }: { keys: ApiKey[] }) {
  const [selectedKey, setSelectedKey] = useState<string>("all");
  const [days, setDays] = useState(30);

  const { data, isLoading } = useQuery({
    queryKey: ["api-usage", selectedKey, days],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("api-gateway", {
        body: {
          action: "get_usage_stats",
          key_id: selectedKey === "all" ? undefined : selectedKey,
          days,
        },
      });
      if (error) throw error;
      return data as { daily: any[]; totals: { total: number; success: number; failed: number } };
    },
  });

  const totals = data?.totals || { total: 0, success: 0, failed: 0 };
  const errorRate = totals.total > 0 ? ((totals.failed / totals.total) * 100).toFixed(1) : "0";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Select value={selectedKey} onValueChange={setSelectedKey}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Tutte le chiavi" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutte le chiavi</SelectItem>
            {keys.filter(k => k.is_active).map(k => (
              <SelectItem key={k.id} value={k.id}>{k.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10"><Activity className="h-5 w-5 text-primary" /></div>
              <div>
                <p className="text-2xl font-bold">{totals.total.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Richieste totali</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10"><CheckCircle className="h-5 w-5 text-green-600" /></div>
              <div>
                <p className="text-2xl font-bold">{totals.success.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Riuscite</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-destructive/10"><XCircle className="h-5 w-5 text-destructive" /></div>
              <div>
                <p className="text-2xl font-bold">{errorRate}%</p>
                <p className="text-xs text-muted-foreground">Tasso errore</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Richieste giornaliere</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="h-[300px] flex items-center justify-center text-muted-foreground">Caricamento...</div>
          ) : !data?.daily?.length ? (
            <div className="h-[300px] flex items-center justify-center text-muted-foreground">Nessun dato disponibile</div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data.daily}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="date" tickFormatter={(d) => new Date(d).toLocaleDateString("it-IT", { day: "2-digit", month: "short" })} className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }}
                  labelFormatter={(d) => new Date(d).toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: "numeric" })}
                />
                <Bar dataKey="successful_requests" name="Riuscite" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="failed_requests" name="Fallite" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
