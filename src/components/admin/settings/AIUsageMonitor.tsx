import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Bot, Download, RefreshCw, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { useAIUsageMonitor, type AIUsageSummary } from "@/hooks/useAIUsageMonitor";

// ─── Thresholds ──────────────────────────────────────────

interface AIUsageThreshold {
  id: string;
  plan_id: string;
  daily_limit_eur: number;
  monthly_limit_eur: number;
}

const PLAN_LABELS: Record<string, string> = {
  "__default__": "Default",
  "basic": "Basic",
  "pro": "Pro",
  "enterprise": "Enterprise",
};

function useAIUsageThresholds() {
  const qc = useQueryClient();

  const { data = [], isLoading } = useQuery({
    queryKey: ["admin", "ai-usage-thresholds"],
    queryFn: async (): Promise<AIUsageThreshold[]> => {
      const { data, error } = await (supabase
        .from("ai_usage_thresholds" as never)
        .select("id, plan_id, daily_limit_eur, monthly_limit_eur")
        .order("plan_id" as never) as unknown as Promise<{ data: AIUsageThreshold[] | null; error: { message: string } | null }>);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    staleTime: 60_000,
  });

  const updateThreshold = useMutation({
    mutationFn: async ({ id, daily_limit_eur, monthly_limit_eur }: { id: string; daily_limit_eur: number; monthly_limit_eur: number }) => {
      const { error } = await (supabase
        .from("ai_usage_thresholds" as never)
        .update({ daily_limit_eur, monthly_limit_eur, updated_at: new Date().toISOString() } as never)
        .eq("id" as never, id) as unknown as Promise<{ error: { message: string } | null }>);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Soglia aggiornata");
      void qc.invalidateQueries({ queryKey: ["admin", "ai-usage-thresholds"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return { thresholds: data, isLoading, updateThreshold };
}

function ThresholdRow({ row }: { row: AIUsageThreshold }) {
  const { updateThreshold } = useAIUsageThresholds();
  const [daily, setDaily] = useState(String(row.daily_limit_eur));
  const [monthly, setMonthly] = useState(String(row.monthly_limit_eur));
  const [editing, setEditing] = useState(false);

  const handleSave = () => {
    const d = parseFloat(daily);
    const m = parseFloat(monthly);
    if (isNaN(d) || isNaN(m)) { toast.error("Valori non validi"); return; }
    updateThreshold.mutate({ id: row.id, daily_limit_eur: d, monthly_limit_eur: m });
    setEditing(false);
  };

  return (
    <tr className="border-b last:border-0">
      <td className="px-4 py-2 font-medium">{PLAN_LABELS[row.plan_id] ?? row.plan_id}</td>
      <td className="px-4 py-2 text-right">
        {editing ? (
          <Input type="number" value={daily} onChange={e => setDaily(e.target.value)} className="h-7 w-24 text-xs text-right ml-auto" min={0} />
        ) : (
          <span className="font-mono text-sm">€{Number(row.daily_limit_eur).toFixed(2)}</span>
        )}
      </td>
      <td className="px-4 py-2 text-right">
        {editing ? (
          <Input type="number" value={monthly} onChange={e => setMonthly(e.target.value)} className="h-7 w-28 text-xs text-right ml-auto" min={0} />
        ) : (
          <span className="font-mono text-sm">€{Number(row.monthly_limit_eur).toFixed(2)}</span>
        )}
      </td>
      <td className="px-4 py-2 text-right">
        {editing ? (
          <div className="flex gap-1 justify-end">
            <Button size="sm" className="h-7 text-xs px-2" onClick={handleSave} disabled={updateThreshold.isPending}>
              Salva
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs px-2" onClick={() => { setEditing(false); setDaily(String(row.daily_limit_eur)); setMonthly(String(row.monthly_limit_eur)); }}>
              Annulla
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditing(true)}>
            Modifica
          </Button>
        )}
      </td>
    </tr>
  );
}

function AIUsageThresholdsPanel() {
  const { thresholds, isLoading } = useAIUsageThresholds();

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <Settings2 className="h-4 w-4" />
          Soglie Alert per Piano
        </CardTitle>
        <CardDescription className="text-xs">
          L'edge function <code>check-ai-usage-alerts</code> invia email al super_admin se una soglia viene superata
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-4 space-y-2">{[1,2,3,4].map(i => <Skeleton key={i} className="h-8 w-full" />)}</div>
        ) : thresholds.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">Nessuna soglia configurata. Esegui la migrazione SQL.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left px-4 py-2 font-medium">Piano</th>
                <th className="text-right px-4 py-2 font-medium">Soglia Giornaliera</th>
                <th className="text-right px-4 py-2 font-medium">Soglia Mensile</th>
                <th className="text-right px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {thresholds.map(row => <ThresholdRow key={row.id} row={row} />)}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

const EUR = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 4 });
const NUM = new Intl.NumberFormat("it-IT");

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-xl font-bold mt-1 truncate">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function UsageRow({ row }: { row: AIUsageSummary }) {
  return (
    <div className="grid grid-cols-6 gap-2 items-center px-3 py-2.5 text-sm border-b last:border-0 hover:bg-accent/20">
      <span className="font-medium truncate col-span-1">{row.company_name}</span>
      <span className="text-xs font-mono">{EUR.format(row.today_cost_eur)}</span>
      <span className="text-xs font-mono font-medium">{EUR.format(row.month_cost_eur)}</span>
      <span className="text-xs text-muted-foreground">{NUM.format(row.month_requests)}</span>
      <span>
        <Badge variant="outline" className="text-xs">
          {row.top_provider}
        </Badge>
      </span>
      <span className="text-xs text-muted-foreground truncate">{row.top_model}</span>
    </div>
  );
}

export function AIUsageMonitor() {
  const [provider, setProvider] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const { data, isLoading, refetch } = useAIUsageMonitor({
    provider,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  });

  const summaries = data?.summaries ?? [];
  const kpis = data?.kpis;

  const handleExportCSV = () => {
    const header = "Azienda,Costo Oggi (€),Costo Mese (€),Richieste Mese,Provider,Modello\n";
    const rows = summaries
      .map(
        (r) =>
          `"${r.company_name}",${r.today_cost_eur.toFixed(4)},${r.month_cost_eur.toFixed(4)},${r.month_requests},"${r.top_provider}","${r.top_model}"`
      )
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ai-usage-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-4 w-24 mb-2" />
                <Skeleton className="h-6 w-16" />
              </CardContent>
            </Card>
          ))
        ) : (
          <>
            <KpiCard label="Costo totale oggi" value={EUR.format(kpis?.total_cost_today ?? 0)} />
            <KpiCard label="Costo totale mese" value={EUR.format(kpis?.total_cost_month ?? 0)} />
            <KpiCard
              label="Aziende attive oggi"
              value={NUM.format(kpis?.active_companies_today ?? 0)}
            />
            <KpiCard
              label="Richieste questo mese"
              value={NUM.format(kpis?.total_requests_month ?? 0)}
            />
          </>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <Select value={provider} onValueChange={setProvider}>
          <SelectTrigger className="h-8 text-xs w-36">
            <SelectValue placeholder="Provider" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti i provider</SelectItem>
            <SelectItem value="openai">OpenAI</SelectItem>
            <SelectItem value="anthropic">Anthropic</SelectItem>
            <SelectItem value="elevenlabs">ElevenLabs</SelectItem>
            <SelectItem value="other">Altro</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1">
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="h-8 text-xs w-36"
          />
          <span className="text-xs text-muted-foreground">→</span>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="h-8 text-xs w-36"
          />
        </div>

        <Button
          variant="outline"
          size="sm"
          className="h-8"
          onClick={() => void refetch()}
          disabled={isLoading}
        >
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isLoading ? "animate-spin" : ""}`} />
          Aggiorna
        </Button>

        {summaries.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 ml-auto"
            onClick={handleExportCSV}
          >
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Esporta CSV
          </Button>
        )}
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Bot className="h-4 w-4" />
            Utilizzo AI per Azienda
            <Badge variant="secondary" className="text-xs ml-auto">
              {summaries.length} aziende
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {/* Header */}
          <div className="grid grid-cols-6 gap-2 px-3 py-2 text-xs font-medium text-muted-foreground bg-muted/40 border-b">
            <span>Azienda</span>
            <span>Costo oggi</span>
            <span>Costo mese</span>
            <span>Richieste mese</span>
            <span>Provider</span>
            <span>Modello</span>
          </div>

          {isLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : summaries.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <Bot className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Nessun utilizzo AI registrato nel periodo selezionato</p>
              <p className="text-xs mt-1">
                I dati vengono registrati quando le aziende usano funzionalità AI
              </p>
            </div>
          ) : (
            <div>
              {summaries.map((row) => (
                <UsageRow key={row.company_id} row={row} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Threshold Configuration */}
      <AIUsageThresholdsPanel />
    </div>
  );
}
