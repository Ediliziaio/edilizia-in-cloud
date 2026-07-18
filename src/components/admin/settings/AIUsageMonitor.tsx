import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { escapeCsvCell } from "@/lib/csvExport";
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
  Bot, ChevronDown, ChevronRight, Download, RefreshCw, Settings2, AlertCircle, TrendingUp, Euro,
  Layers,
} from "lucide-react";
import { toast } from "sonner";
import {
  useAIUsageMonitor, type AIUsageSummary, type AIUsageTopModel,
} from "@/hooks/useAIUsageMonitor";
import { AIPricingValidator } from "@/components/admin/settings/AIPricingValidator";
import { Sparkline } from "@/components/admin/ai-shared/Sparkline";
import { cn } from "@/lib/utils";

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
          <div className="overflow-x-auto">
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
          </div>
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
  const [expanded, setExpanded] = useState(false);
  const hasDrilldown = row.models_breakdown.length > 0;
  const hasTrend = row.daily_trend.length >= 2;

  return (
    <>
      <button
        type="button"
        onClick={() => hasDrilldown && setExpanded((e) => !e)}
        className={cn(
          "w-full grid grid-cols-[16px_minmax(0,1.4fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(0,0.7fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(0,1.1fr)] gap-2 items-center px-3 py-2.5 text-sm border-b last:border-0 text-left",
          hasDrilldown ? "hover:bg-accent/30 cursor-pointer" : "cursor-default opacity-90",
        )}
        aria-expanded={expanded}
      >
        <span className="text-muted-foreground">
          {hasDrilldown ? (
            expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />
          ) : null}
        </span>
        <span className="font-medium truncate">{row.company_name}</span>
        <span className="text-xs font-mono">{EUR.format(row.today_cost_eur)}</span>
        <span className="text-xs font-mono font-medium">{EUR.format(row.month_cost_eur)}</span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {NUM.format(row.month_requests)}
        </span>
        <span className="text-xs font-mono text-emerald-600 dark:text-emerald-400 tabular-nums">
          {EUR.format(row.month_revenue_eur)}
        </span>
        <span className="flex items-center">
          {hasTrend ? (
            <Sparkline
              data={row.daily_trend.map((d) => ({ date: d.date, value: d.cost_eur }))}
              tooltipPrefix="Costo giornaliero"
              formatValue={(v) => EUR.format(v)}
              trendDirection="lower-is-better"
              width={70}
              height={20}
            />
          ) : (
            <span className="text-[10px] text-muted-foreground">—</span>
          )}
        </span>
        <span className="flex items-center gap-1.5 min-w-0">
          <Badge variant="outline" className="text-[10px] shrink-0">
            {row.top_provider}
          </Badge>
          <span className="text-xs text-muted-foreground truncate">{row.top_model}</span>
        </span>
      </button>

      {expanded && hasDrilldown && (
        <div className="bg-muted/30 border-b px-12 py-3">
          <div className="flex items-center gap-2 mb-2">
            <Layers className="h-3.5 w-3.5 text-muted-foreground" />
            <p className="text-xs font-medium text-muted-foreground">
              Breakdown per modello — {row.models_breakdown.length} modell{row.models_breakdown.length === 1 ? "o" : "i"} usat{row.models_breakdown.length === 1 ? "o" : "i"}
            </p>
          </div>
          <div className="rounded-md border bg-background overflow-hidden">
            <div className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,0.9fr)_minmax(0,0.6fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(0,0.6fr)] gap-2 px-3 py-1.5 text-[10px] font-medium text-muted-foreground bg-muted/40 border-b">
              <span>Modello</span>
              <span>Provider</span>
              <span className="text-right">Richieste</span>
              <span className="text-right">Costo</span>
              <span className="text-right">Ricavi</span>
              <span className="text-right">Share</span>
            </div>
            {row.models_breakdown.map((m) => (
              <div
                key={`${m.provider}|${m.model}`}
                className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,0.9fr)_minmax(0,0.6fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(0,0.6fr)] gap-2 px-3 py-1.5 text-xs border-b last:border-0 hover:bg-muted/20"
              >
                <span className="font-mono truncate" title={m.model}>{m.model}</span>
                <span>
                  <Badge variant="outline" className="text-[10px]">{m.provider}</Badge>
                </span>
                <span className="text-right tabular-nums text-muted-foreground">{NUM.format(m.requests)}</span>
                <span className="text-right tabular-nums font-mono">{EUR.format(m.cost_eur)}</span>
                <span className="text-right tabular-nums font-mono text-emerald-600 dark:text-emerald-400">
                  {EUR.format(m.revenue_eur)}
                </span>
                <span className="text-right tabular-nums text-muted-foreground">{m.share_pct.toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

/** Card top modelli globali (cross-company) — utile per top spend platform-wide */
function TopModelsCard({ topModels }: { topModels: AIUsageTopModel[] }) {
  if (topModels.length === 0) return null;
  const top = topModels.slice(0, 5);
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Layers className="h-4 w-4" /> Top 5 modelli per costo (platform-wide)
        </CardTitle>
        <CardDescription className="text-xs">
          Quale modello sta consumando più budget complessivo. Usa per decidere se cambiare il routing in <code className="bg-muted px-1 rounded">AI Config → Routing</code>.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0 pb-2 space-y-1.5">
        {top.map((m, idx) => (
          <div
            key={`${m.provider}|${m.model}`}
            className="grid grid-cols-[24px_minmax(0,1.6fr)_minmax(0,0.8fr)_minmax(0,0.6fr)_minmax(0,0.8fr)_minmax(0,0.6fr)_minmax(0,0.8fr)] gap-2 items-center px-2 py-1.5 text-xs hover:bg-muted/30 rounded"
          >
            <span className="text-muted-foreground tabular-nums">#{idx + 1}</span>
            <span className="font-mono truncate" title={m.model}>{m.model}</span>
            <span><Badge variant="outline" className="text-[10px]">{m.provider}</Badge></span>
            <span className="text-right tabular-nums text-muted-foreground">{NUM.format(m.requests)}</span>
            <span className="text-right tabular-nums font-mono font-medium">{EUR.format(m.cost_eur)}</span>
            <span className="text-right tabular-nums text-muted-foreground">{m.companies_using} co.</span>
            <span className="text-right tabular-nums text-muted-foreground">{m.share_pct.toFixed(1)}%</span>
          </div>
        ))}
      </CardContent>
    </Card>
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
  return escapeCsvCell(v, ",");
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

  // Memo `summaries` per evitare nuovo riferimento a ogni render (le useMemo
  // sotto altrimenti ricomputerebbero ad ogni render anche con stessi dati)
  const summaries = useMemo(() => data?.summaries ?? [], [data?.summaries]);
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

  const downloadCSV = (csvContent: string, filenameSuffix: string) => {
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ai-usage-${filenameSuffix}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportCSV = () => {
    if (filteredSummaries.length === 0) return;
    const header = [
      "Azienda",
      "Costo Oggi (EUR)",
      "Costo Mese (EUR)",
      "Ricavi Mese (EUR)",
      "Margine Mese (EUR)",
      "Richieste Mese",
      "Top Provider",
      "Top Modello",
    ].join(",");
    const rows = filteredSummaries.map((r) =>
      [
        csvEscape(r.company_name),
        csvEscape(r.today_cost_eur.toFixed(4)),
        csvEscape(r.month_cost_eur.toFixed(4)),
        csvEscape(r.month_revenue_eur.toFixed(4)),
        csvEscape(r.month_margin_eur.toFixed(4)),
        csvEscape(r.month_requests),
        csvEscape(r.top_provider),
        csvEscape(r.top_model),
      ].join(","),
    );
    downloadCSV([header, ...rows].join("\r\n"), "summary");
  };

  /** Export drill-down completo: una riga per (azienda \u00D7 modello). Pesante ma utile per pivot. */
  const handleExportDrilldownCSV = () => {
    if (filteredSummaries.length === 0) return;
    const header = [
      "Azienda",
      "Provider",
      "Modello",
      "Richieste",
      "Costo (EUR)",
      "Ricavi (EUR)",
      "Margine (EUR)",
      "Share %",
    ].join(",");
    const rows: string[] = [];
    for (const company of filteredSummaries) {
      if (company.models_breakdown.length === 0) {
        // Fallback: include la company anche se non ha breakdown (es. solo render)
        rows.push([
          csvEscape(company.company_name),
          csvEscape(company.top_provider),
          csvEscape(company.top_model),
          csvEscape(company.month_requests),
          csvEscape(company.month_cost_eur.toFixed(4)),
          csvEscape(company.month_revenue_eur.toFixed(4)),
          csvEscape(company.month_margin_eur.toFixed(4)),
          "100.0",
        ].join(","));
        continue;
      }
      for (const m of company.models_breakdown) {
        rows.push([
          csvEscape(company.company_name),
          csvEscape(m.provider),
          csvEscape(m.model),
          csvEscape(m.requests),
          csvEscape(m.cost_eur.toFixed(4)),
          csvEscape(m.revenue_eur.toFixed(4)),
          csvEscape(m.margin_eur.toFixed(4)),
          csvEscape(m.share_pct.toFixed(1)),
        ].join(","));
      }
    }
    downloadCSV([header, ...rows].join("\r\n"), "drilldown");
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

      {/* ── Diagnostic banner: dettaglio fonti dati per debug.
          Mostrato quando ci sono errori o quando i dati sembrano mancanti
          (0 righe / molti render senza cost). */}
      {data?.diagnostic && (
        (() => {
          const d = data.diagnostic;
          const totalRows = d.ai_usage_log_rows + d.render_sessions_rows;
          const hasErrors = d.ai_usage_log_error || d.render_sessions_error;
          const renderHasZeroCost = d.render_sessions_completed > 0 && d.render_sessions_with_cost === 0;
          // Mostra il banner se: errori, oppure 0 dati totali, oppure render senza cost
          if (!hasErrors && totalRows > 0 && !renderHasZeroCost) return null;
          return (
            <Alert variant={hasErrors ? "destructive" : "default"}>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs space-y-2">
                <p className="font-medium">Diagnostica fonti dati</p>
                <ul className="list-disc pl-5 space-y-0.5">
                  <li>
                    <code className="bg-muted px-1 rounded">ai_usage_log</code>: {d.ai_usage_log_rows} righe
                    {d.ai_usage_log_error && (
                      <span className="text-destructive"> · errore: {d.ai_usage_log_error}</span>
                    )}
                  </li>
                  <li>
                    <code className="bg-muted px-1 rounded">render_sessions</code>: {d.render_sessions_rows} righe totali
                    {d.render_sessions_rows > 0 && (
                      <span className="text-muted-foreground">
                        {" "}({d.render_sessions_completed} completate · {d.render_sessions_with_cost} con costo &gt; 0
                        {d.render_sessions_zero_cost > 0 && ` · ${d.render_sessions_zero_cost} a costo 0`}
                        {d.render_sessions_used_legacy_cost > 0 && ` · ${d.render_sessions_used_legacy_cost} via cost_real legacy`})
                      </span>
                    )}
                    {d.render_sessions_error && (
                      <span className="text-destructive"> · errore: {d.render_sessions_error}</span>
                    )}
                  </li>
                </ul>

                {/* Suggerimenti contestuali in base allo stato */}
                {d.ai_usage_log_error?.includes("not find the table") && (
                  <p className="text-amber-700 dark:text-amber-400">
                    ⚠️ La tabella <code className="bg-muted px-1 rounded">ai_usage_log</code> non esiste.
                    Esegui la migration <code className="bg-muted px-1 rounded">20260822000003_ai_usage_log.sql</code>{" "}
                    per attivare il tracking di Chat / Voice / Doc Analysis.
                  </p>
                )}
                {renderHasZeroCost && (
                  <p className="text-amber-700 dark:text-amber-400">
                    ⚠️ {d.render_sessions_completed} render completati ma <strong>nessuno ha il costo registrato</strong>.
                    Cause probabili:
                    {" "}<strong>(a)</strong> migration economics non applicata (le edge function aggiornano solo legacy fields,
                    cadendo su <code className="bg-muted px-1 rounded">cost_real</code> = 0);
                    {" "}<strong>(b)</strong> la edge function generate-render non ha popolato{" "}
                    <code className="bg-muted px-1 rounded">cost_real_api</code>{" "}
                    (verifica <code className="bg-muted px-1 rounded">captureRealCost</code>);
                    {" "}<strong>(c)</strong> i provider rispondono senza usage info.
                    Apri il network dev tools e cerca la response di <code className="bg-muted px-1 rounded">generate-render</code>.
                  </p>
                )}
                {d.render_sessions_rows === 0 && !d.render_sessions_error && totalRows === 0 && (
                  <p className="text-muted-foreground">
                    Nessun dato. Verifica che le RLS policy su{" "}
                    <code className="bg-muted px-1 rounded">render_sessions</code> permettano SELECT al super_admin
                    e che il filtro periodo includa le date dei test.
                  </p>
                )}
              </AlertDescription>
            </Alert>
          );
        })()
      )}

      {/* KPIs — riga 1: costi/aziende/top spender · riga 2: revenue/margine */}
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

      {/* KPIs riga 2 — Revenue & Margin */}
      {!isLoading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <KpiCard
            icon={Euro}
            label="Ricavi totali (mese)"
            value={EUR.format(kpis?.total_revenue_month ?? 0)}
            sub="Quanto le aziende hanno pagato per AI"
          />
          <KpiCard
            icon={TrendingUp}
            label="Margine netto (mese)"
            value={EUR.format(kpis?.total_margin_month ?? 0)}
            sub={`Ricavi − costi API`}
          />
          <KpiCard
            icon={TrendingUp}
            label="Margine %"
            value={`${(kpis?.margin_pct_month ?? 0).toFixed(1)}%`}
            sub={
              (kpis?.margin_pct_month ?? 0) >= 50
                ? "Margine sano"
                : (kpis?.margin_pct_month ?? 0) >= 20
                  ? "Margine basso"
                  : (kpis?.margin_pct_month ?? 0) > 0
                    ? "⚠️ Margine critico"
                    : "Nessun ricavo"
            }
          />
        </div>
      )}

      {/* Breakdown per Feature AI */}
      {!isLoading && data?.featureBreakdown && data.featureBreakdown.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Bot className="h-4 w-4" /> Costi/Ricavi per Feature AI
            </CardTitle>
            <CardDescription className="text-xs">
              Aggregato per categoria — utile per capire quale prodotto AI consuma di più
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-2">
            <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {data.featureBreakdown.map((fb) => {
                const marginPct = fb.revenue_eur > 0
                  ? Math.round((fb.margin_eur / fb.revenue_eur) * 100)
                  : 0;
                const FEATURE_LABELS: Record<typeof fb.feature, string> = {
                  render: "🖼 Render AI",
                  chat: "💬 Chat AI",
                  voice: "🎙 Voice / TTS",
                  doc_analysis: "🔎 Doc Analysis / RAG",
                  automation: "⚡ Automation",
                  other: "❓ Altro",
                };
                return (
                  <div key={fb.feature} className="rounded-lg border p-3 space-y-1.5 hover:bg-muted/20 transition-colors">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">{FEATURE_LABELS[fb.feature]}</p>
                      <span className="text-[10px] text-muted-foreground">{NUM.format(fb.requests)} req.</span>
                    </div>
                    <div className="grid grid-cols-3 gap-1 text-[10px]">
                      <div>
                        <p className="text-muted-foreground">Costo</p>
                        <p className="font-mono font-medium">{EUR.format(fb.cost_eur)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Ricavi</p>
                        <p className="font-mono font-medium text-emerald-600 dark:text-emerald-400">
                          {EUR.format(fb.revenue_eur)}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Margine</p>
                        <p className={cn(
                          "font-mono font-medium",
                          fb.margin_eur > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive",
                        )}>
                          {marginPct > 0 ? "+" : ""}{marginPct}%
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 🆕 Top 5 modelli platform-wide */}
      {!isLoading && data?.topModels && (
        <TopModelsCard topModels={data.topModels} />
      )}

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
          /* Export CSV (summary + drill-down) nascosti su mobile (feedback_no_mobile_export) */
          <div className="hidden sm:flex items-center gap-1.5 ml-auto">
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={handleExportCSV}
              title="CSV con 1 riga per azienda (summary)"
            >
              <Download className="h-3.5 w-3.5 mr-1.5" />
              CSV summary
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={handleExportDrilldownCSV}
              title="CSV con 1 riga per (azienda × modello) — utile per pivot table"
            >
              <Download className="h-3.5 w-3.5 mr-1.5" />
              CSV drill-down
            </Button>
          </div>
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
          {/* Header — grid 8 colonne (matcha UsageRow espandibile: chevron+7) */}
          <div className="grid grid-cols-[16px_minmax(0,1.4fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(0,0.7fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(0,1.1fr)] gap-2 px-3 py-2 text-xs font-medium text-muted-foreground bg-muted/40 border-b">
            <span></span>
            <span>Azienda</span>
            <span>Costo oggi</span>
            <span>Costo mese</span>
            <span>Richieste</span>
            <span>Ricavi mese</span>
            <span>Trend 7d</span>
            <span>Top modello</span>
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

      {/* AI pricing & validation hub (render + markup per task + agenti AI) */}
      <AIPricingValidator />

      {/* Threshold Configuration */}
      <AIUsageThresholdsPanel />
    </div>
  );
}
