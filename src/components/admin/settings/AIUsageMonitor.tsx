import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Bot, Download, RefreshCw, Settings2, AlertCircle, TrendingUp, Euro,
} from "lucide-react";
import { toast } from "sonner";
import {
  useAIUsageMonitor, type AIUsageSummary,
} from "@/hooks/useAIUsageMonitor";

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

const THRESHOLDS_KEY = ["admin", "ai-usage-thresholds"] as const;

/**
 * FIX: prima il hook veniva istanziato 2 volte (una in AIUsageThresholdsPanel,
 * una in ciascun ThresholdRow per la mutation), generando useQuery duplicate
 * e refetch inutili. Ora split: query list + mutation separate.
 */
function useThresholdsList() {
  return useQuery({
    queryKey: THRESHOLDS_KEY,
    queryFn: async (): Promise<AIUsageThreshold[]> => {
      const { data, error } = await (supabase
        .from("ai_usage_thresholds" as never)
        .select("id, plan_id, daily_limit_eur, monthly_limit_eur")
        .order("plan_id" as never) as unknown as Promise<{
        data: AIUsageThreshold[] | null;
        error: { message: string } | null;
      }>);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    staleTime: 60_000,
  });
}

function useUpdateThreshold() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id, daily_limit_eur, monthly_limit_eur,
    }: {
      id: string;
      daily_limit_eur: number;
      monthly_limit_eur: number;
    }) => {
      const { error } = await (supabase
        .from("ai_usage_thresholds" as never)
        .update({
          daily_limit_eur,
          monthly_limit_eur,
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id" as never, id) as unknown as Promise<{
        error: { message: string } | null;
      }>);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Soglia aggiornata");
      void qc.invalidateQueries({ queryKey: THRESHOLDS_KEY });
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

function ThresholdRow({
  row,
  onSave,
  isSaving,
}: {
  row: AIUsageThreshold;
  onSave: (payload: {
    id: string;
    daily_limit_eur: number;
    monthly_limit_eur: number;
  }) => void;
  isSaving: boolean;
}) {
  const [daily, setDaily] = useState(String(row.daily_limit_eur));
  const [monthly, setMonthly] = useState(String(row.monthly_limit_eur));
  const [editing, setEditing] = useState(false);

  // FIX: se i valori arrivano aggiornati dal server (es. dopo refetch) e non siamo
  // in editing, sincronizziamo il local state. Prima rimanevano stale.
  useEffect(() => {
    if (!editing) {
      setDaily(String(row.daily_limit_eur));
      setMonthly(String(row.monthly_limit_eur));
    }
  }, [row.daily_limit_eur, row.monthly_limit_eur, editing]);

  const handleSave = () => {
    const d = parseFloat(daily);
    const m = parseFloat(monthly);
    if (isNaN(d) || isNaN(m)) {
      toast.error("Valori non validi");
      return;
    }
    if (d < 0 || m < 0) {
      toast.error("I valori non possono essere negativi");
      return;
    }
    if (d > m) {
      toast.error("La soglia giornaliera non può superare quella mensile");
      return;
    }
    onSave({ id: row.id, daily_limit_eur: d, monthly_limit_eur: m });
    setEditing(false);
  };

  const handleCancel = () => {
    setEditing(false);
    setDaily(String(row.daily_limit_eur));
    setMonthly(String(row.monthly_limit_eur));
  };

  return (
    <tr className="border-b last:border-0">
      <td className="px-4 py-2 font-medium">
        {PLAN_LABELS[row.plan_id] ?? row.plan_id}
      </td>
      <td className="px-4 py-2 text-right">
        {editing ? (
          <Input
            type="number"
            value={daily}
            onChange={(e) => setDaily(e.target.value)}
            className="h-7 w-24 text-xs text-right ml-auto"
            min={0}
            step={0.5}
          />
        ) : (
          <span className="font-mono text-sm">
            €{Number(row.daily_limit_eur).toFixed(2)}
          </span>
        )}
      </td>
      <td className="px-4 py-2 text-right">
        {editing ? (
          <Input
            type="number"
            value={monthly}
            onChange={(e) => setMonthly(e.target.value)}
            className="h-7 w-28 text-xs text-right ml-auto"
            min={0}
            step={5}
          />
        ) : (
          <span className="font-mono text-sm">
            €{Number(row.monthly_limit_eur).toFixed(2)}
          </span>
        )}
      </td>
      <td className="px-4 py-2 text-right">
        {editing ? (
          <div className="flex gap-1 justify-end">
            <Button
              size="sm"
              className="h-7 text-xs px-2"
              onClick={handleSave}
              disabled={isSaving}
            >
              {isSaving ? "..." : "Salva"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs px-2"
              onClick={handleCancel}
              disabled={isSaving}
            >
              Annulla
            </Button>
          </div>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            onClick={() => setEditing(true)}
          >
            Modifica
          </Button>
        )}
      </td>
    </tr>
  );
}

function AIUsageThresholdsPanel() {
  const { data: thresholds = [], isLoading } = useThresholdsList();
  const updateThreshold = useUpdateThreshold();

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <Settings2 className="h-4 w-4" />
          Soglie Alert per Piano
        </CardTitle>
        <CardDescription className="text-xs">
          L'edge function <code>check-ai-usage-alerts</code> invia email al super_admin
          se una soglia viene superata
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-4 space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : thresholds.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            Nessuna soglia configurata. Esegui la migrazione SQL.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left px-4 py-2 font-medium">Piano</th>
                <th className="text-right px-4 py-2 font-medium">
                  Soglia Giornaliera
                </th>
                <th className="text-right px-4 py-2 font-medium">Soglia Mensile</th>
                <th className="text-right px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {thresholds.map((row) => (
                <ThresholdRow
                  key={row.id}
                  row={row}
                  onSave={(payload) => updateThreshold.mutate(payload)}
                  isSaving={updateThreshold.isPending}
                />
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

const EUR = new Intl.NumberFormat("it-IT", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 4,
});
const NUM = new Intl.NumberFormat("it-IT");

function KpiCard({
  label, value, sub, icon: Icon,
}: {
  label: string;
  value: string;
  sub?: string;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground mb-1">
          {Icon && <Icon className="h-3.5 w-3.5" />}
          <p className="text-xs">{label}</p>
        </div>
        <p className="text-xl font-bold mt-0 truncate">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5 truncate">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function UsageRow({ row }: { row: AIUsageSummary }) {
  return (
    <div className="grid grid-cols-6 gap-2 items-center px-3 py-2.5 text-sm border-b last:border-0 hover:bg-accent/20">
      <span className="font-medium truncate col-span-1">{row.company_name}</span>
      <span className="text-xs font-mono">{EUR.format(row.today_cost_eur)}</span>
      <span className="text-xs font-mono font-medium">
        {EUR.format(row.month_cost_eur)}
      </span>
      <span className="text-xs text-muted-foreground">
        {NUM.format(row.month_requests)}
      </span>
      <span>
        <Badge variant="outline" className="text-xs">
          {row.top_provider}
        </Badge>
      </span>
      <span className="text-xs text-muted-foreground truncate">{row.top_model}</span>
    </div>
  );
}

// ─── Period presets ──────────────────────────────────────

type PeriodPreset = "today" | "7d" | "30d" | "month" | "custom";

function presetToRange(p: PeriodPreset): { dateFrom: string; dateTo: string } {
  const today = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  switch (p) {
    case "today":
      return { dateFrom: fmt(today), dateTo: fmt(today) };
    case "7d": {
      const from = new Date(today);
      from.setDate(from.getDate() - 6);
      return { dateFrom: fmt(from), dateTo: fmt(today) };
    }
    case "30d": {
      const from = new Date(today);
      from.setDate(from.getDate() - 29);
      return { dateFrom: fmt(from), dateTo: fmt(today) };
    }
    case "month": {
      const from = new Date(today.getFullYear(), today.getMonth(), 1);
      return { dateFrom: fmt(from), dateTo: fmt(today) };
    }
    case "custom":
      return { dateFrom: "", dateTo: "" };
  }
}

function csvEscape(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function AIUsageMonitor() {
  const [provider, setProvider] = useState("all");
  const [period, setPeriod] = useState<PeriodPreset>("30d");
  const [dateFrom, setDateFrom] = useState(() => presetToRange("30d").dateFrom);
  const [dateTo, setDateTo] = useState(() => presetToRange("30d").dateTo);
  const [search, setSearch] = useState("");

  // FIX: validazione range date — se from > to lanciamo toast e non triggeriamo query
  const invalidRange =
    dateFrom && dateTo && new Date(dateFrom) > new Date(dateTo);

  useEffect(() => {
    if (invalidRange) {
      toast.error("Intervallo date non valido: data iniziale > data finale");
    }
  }, [invalidRange]);

  const handlePresetChange = (p: PeriodPreset) => {
    setPeriod(p);
    if (p !== "custom") {
      const r = presetToRange(p);
      setDateFrom(r.dateFrom);
      setDateTo(r.dateTo);
    }
  };

  const { data, isLoading, isRefetching, refetch } = useAIUsageMonitor({
    provider,
    dateFrom: !invalidRange && dateFrom ? dateFrom : undefined,
    dateTo: !invalidRange && dateTo ? dateTo : undefined,
  });

  const summaries = data?.summaries ?? [];
  const kpis = data?.kpis;

  const filteredSummaries = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return summaries;
    return summaries.filter(
      (s) =>
        s.company_name.toLowerCase().includes(q) ||
        s.top_provider.toLowerCase().includes(q) ||
        s.top_model.toLowerCase().includes(q),
    );
  }, [summaries, search]);

  const topSpender = useMemo(() => {
    if (summaries.length === 0) return null;
    return summaries.reduce((prev, cur) =>
      cur.month_cost_eur > prev.month_cost_eur ? cur : prev,
    );
  }, [summaries]);

  const avgPerCompany = useMemo(() => {
    if (summaries.length === 0) return 0;
    const total = summaries.reduce((acc, s) => acc + s.month_cost_eur, 0);
    return total / summaries.length;
  }, [summaries]);

  const handleExportCSV = () => {
    if (filteredSummaries.length === 0) return;
    const header = [
      "Azienda",
      "Costo Oggi (EUR)",
      "Costo Mese (EUR)",
      "Richieste Mese",
      "Top Provider",
      "Top Modello",
    ].join(",");
    const rows = filteredSummaries.map((r) =>
      [
        csvEscape(r.company_name),
        csvEscape(r.today_cost_eur.toFixed(4)),
        csvEscape(r.month_cost_eur.toFixed(4)),
        csvEscape(r.month_requests),
        csvEscape(r.top_provider),
        csvEscape(r.top_model),
      ].join(","),
    );
    const csv = [header, ...rows].join("\r\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ai-usage-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {invalidRange && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Intervallo date non valido. I dati mostrati potrebbero non essere filtrati.
          </AlertDescription>
        </Alert>
      )}

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
            <KpiCard
              icon={Euro}
              label="Costo totale oggi"
              value={EUR.format(kpis?.total_cost_today ?? 0)}
            />
            <KpiCard
              icon={Euro}
              label="Costo totale mese"
              value={EUR.format(kpis?.total_cost_month ?? 0)}
              sub={
                summaries.length > 0
                  ? `Media azienda: ${EUR.format(avgPerCompany)}`
                  : undefined
              }
            />
            <KpiCard
              icon={Bot}
              label="Aziende attive oggi"
              value={NUM.format(kpis?.active_companies_today ?? 0)}
              sub={
                summaries.length > 0
                  ? `${summaries.length} nel periodo`
                  : undefined
              }
            />
            <KpiCard
              icon={TrendingUp}
              label="Top spender"
              value={topSpender?.company_name ?? "—"}
              sub={
                topSpender
                  ? EUR.format(topSpender.month_cost_eur)
                  : "nessun dato"
              }
            />
          </>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <Select value={period} onValueChange={(v) => handlePresetChange(v as PeriodPreset)}>
          <SelectTrigger className="h-8 text-xs w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Oggi</SelectItem>
            <SelectItem value="7d">Ultimi 7 giorni</SelectItem>
            <SelectItem value="30d">Ultimi 30 giorni</SelectItem>
            <SelectItem value="month">Mese corrente</SelectItem>
            <SelectItem value="custom">Personalizzato</SelectItem>
          </SelectContent>
        </Select>

        {period === "custom" && (
          <div className="flex items-center gap-1">
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="h-8 text-xs w-36"
              max={dateTo || undefined}
            />
            <span className="text-xs text-muted-foreground">→</span>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="h-8 text-xs w-36"
              min={dateFrom || undefined}
            />
          </div>
        )}

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

        <Input
          placeholder="Cerca azienda / modello..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 text-xs w-48"
        />

        <Button
          variant="outline"
          size="sm"
          className="h-8"
          onClick={() => void refetch()}
          disabled={isLoading || isRefetching}
        >
          <RefreshCw
            className={`h-3.5 w-3.5 mr-1.5 ${
              isLoading || isRefetching ? "animate-spin" : ""
            }`}
          />
          Aggiorna
        </Button>

        {filteredSummaries.length > 0 && (
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
              {filteredSummaries.length}
              {filteredSummaries.length !== summaries.length
                ? ` di ${summaries.length}`
                : ""}{" "}
              aziende
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
          ) : filteredSummaries.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <Bot className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">
                {search
                  ? "Nessun risultato per la ricerca"
                  : "Nessun utilizzo AI registrato nel periodo selezionato"}
              </p>
              <p className="text-xs mt-1">
                I dati vengono registrati quando le aziende usano funzionalità AI
              </p>
            </div>
          ) : (
            <div>
              {filteredSummaries.map((row) => (
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
