import { useCallback, useMemo, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  RefreshCw,
  RotateCcw,
  Search,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { exportToCSV } from "@/lib/csvExport";
import { formatCurrency } from "@/lib/formatters";
import {
  FORECAST_CATEGORIES,
  calendarDate,
  forecastExportRows,
  forecastWeeks,
  meanCollectionDelay,
  moveDay,
  projectForecast,
  validDay,
  type ForecastCategory,
  type ForecastMovement,
  type ForecastScenario,
} from "@/lib/finance/forecastLedger";
import type { ForecastDataset } from "@/hooks/useForecastLedger";
import { cn } from "@/lib/utils";

// ─── Formati ────────────────────────────────────────────────────────────────────────────────
const money = (cents: number | null): string =>
  cents == null ? "Non disponibile" : formatCurrency(cents / 100);
const shortDate = (date: string | null): string =>
  date
    ? calendarDate(date).toLocaleDateString("it-IT", {
        day: "numeric",
        month: "short",
      })
    : "Da definire";
const fullDate = (date: string): string =>
  calendarDate(date).toLocaleDateString("it-IT", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
const compact = (cents: number): string =>
  new Intl.NumberFormat("it-IT", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(cents / 100);
const sum = (rows: ForecastMovement[]) =>
  rows.reduce((total, m) => total + m.cents, 0);
/** Colori dai token del tema (index.css), così il grafico segue chiaro e scuro. */
const tone = {
  in: "hsl(var(--success))",
  out: "hsl(var(--destructive))",
  balance: "hsl(var(--primary))",
  threshold: "hsl(var(--warning))",
  axis: "hsl(var(--muted-foreground))",
  grid: "hsl(var(--border))",
};
const section = "rounded-xl border bg-card text-card-foreground";
const selectClass = "h-9 min-w-0 rounded-md border bg-background px-2 text-xs";

// ─── Filtri comuni, nell'URL ────────────────────────────────────────────────────────────────
const TABS = [
  ["panoramica", "Panoramica"],
  ["settimane", "Settimane"],
  ["movimenti", "Movimenti"],
  ["da-sistemare", "Da sistemare"],
  ["incassato", "Incassato"],
  ["fonti", "Fonti e ipotesi"],
] as const;
type TabKey = (typeof TABS)[number][0];
const HORIZONS = [30, 60, 90, 180] as const;
type ScenarioKey = "puntuali" | "reale" | "15" | "30";
const DEFAULT_THRESHOLD = 500000;
interface Filters {
  tab: TabKey;
  horizon: number;
  threshold: number;
  scenario: ScenarioKey;
  estimates: boolean;
  overdueIn: boolean;
  overdueOut: boolean;
  order: string;
  category: string;
  source: string;
}
const thresholdKey = (companyId: string) =>
  `forecast-threshold-v1:${companyId}`;
function storedThreshold(companyId: string): number {
  try {
    const own = localStorage.getItem(thresholdKey(companyId));
    if (own != null && Number(own) >= 0) return Number(own);
    // Le preferenze della versione precedente della pagina tenevano anche la soglia.
    const old = JSON.parse(
      localStorage.getItem(`forecast-preferences-v1:${companyId}`) || "null",
    );
    if (Number.isFinite(old?.threshold) && old.threshold >= 0)
      return old.threshold;
  } catch {
    /* preferenza facoltativa */
  }
  return DEFAULT_THRESHOLD;
}
function readFilters(params: URLSearchParams, companyId: string): Filters {
  const tab = params.get("scheda");
  const horizon = Number(params.get("giorni"));
  const soglia = params.get("soglia");
  const scenario = params.get("scenario");
  return {
    tab: TABS.some(([key]) => key === tab) ? (tab as TabKey) : "panoramica",
    horizon: (HORIZONS as readonly number[]).includes(horizon) ? horizon : 90,
    threshold:
      soglia != null && soglia !== "" && Number(soglia) >= 0
        ? Math.round(Number(soglia) * 100)
        : storedThreshold(companyId),
    scenario: ["reale", "15", "30"].includes(scenario ?? "")
      ? (scenario as ScenarioKey)
      : "puntuali",
    estimates: params.get("stime") !== "0",
    overdueIn: params.get("incassi-scaduti") === "1",
    overdueOut: params.get("uscite-scadute") === "1",
    order: params.get("commessa") ?? "",
    category: params.get("categoria") ?? "",
    source: params.get("fonte") ?? "",
  };
}

// ─── Date spostate a mano per un incasso: solo simulazione, solo su questo dispositivo ────────
const overridesKey = (companyId: string) =>
  `forecast-spostamenti-v1:${companyId}`;
function readOverrides(companyId: string): Record<string, string> {
  try {
    const raw = JSON.parse(
      localStorage.getItem(overridesKey(companyId)) || "{}",
    ) as Record<string, unknown> | null;
    return Object.fromEntries(
      Object.entries(raw ?? {}).filter(
        (e): e is [string, string] =>
          typeof e[1] === "string" && !!validDay(e[1]),
      ),
    );
  } catch {
    return {};
  }
}

// ─── Pezzi di interfaccia ───────────────────────────────────────────────────────────────────
function Metric({
  label,
  value,
  detail,
  danger = false,
}: {
  label: string;
  value: string;
  detail: string;
  danger?: boolean;
}) {
  return (
    <div className="min-w-0 px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 break-words text-lg font-semibold tabular-nums sm:text-xl",
          danger && "text-destructive",
        )}
      >
        {value}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}
function EmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center gap-1 p-6 text-center">
      <Check className="h-5 w-5 text-muted-foreground" aria-hidden />
      <p className="text-sm font-medium">{title}</p>
      <p className="max-w-md text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
function SourceIssues({
  issues,
  onRefresh,
  refreshing,
}: {
  issues: string[];
  onRefresh: () => void;
  refreshing: boolean;
}) {
  if (!issues.length) return null;
  return (
    <div
      role="alert"
      className="flex flex-col gap-2 rounded-lg border border-warning/50 bg-warning/10 p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
    >
      <p>
        <strong>Previsione incompleta.</strong> Non si sono caricate:{" "}
        {issues.join(", ")}. I numeri riguardano solo i dati letti.
      </p>
      <Button
        size="sm"
        variant="outline"
        onClick={onRefresh}
        disabled={refreshing}
        className="shrink-0"
      >
        Riprova il caricamento
      </Button>
    </div>
  );
}
function Toggle({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  children: ReactNode;
}) {
  return (
    <label className="flex min-h-9 cursor-pointer items-center gap-2 whitespace-nowrap text-xs">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-primary"
      />
      {children}
    </label>
  );
}

type MovementView =
  | "piano"
  | "tutti"
  | "incassi-scaduti"
  | "uscite-scadute"
  | "senza-data"
  | "stime"
  | "doppioni";
const VIEWS: [MovementView, string][] = [
  ["piano", "Nel piano"],
  ["tutti", "Tutti i movimenti aperti"],
  ["incassi-scaduti", "Incassi scaduti"],
  ["uscite-scadute", "Uscite scadute"],
  ["senza-data", "Senza data"],
  ["stime", "Stime"],
  ["doppioni", "Possibili doppioni"],
];

export function ForecastWorkspace({
  data,
  onRefresh,
  refreshing = false,
}: {
  data: ForecastDataset;
  onRefresh: () => void;
  refreshing?: boolean;
}) {
  const [params, setParams] = useSearchParams();
  const f = useMemo(
    () => readFilters(params, data.companyId),
    [params, data.companyId],
  );
  const setFilter = useCallback(
    (changes: Record<string, string | null>) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [key, value] of Object.entries(changes))
            if (value == null || value === "") next.delete(key);
            else next.set(key, value);
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );
  const setThreshold = (cents: number) => {
    setFilter({ soglia: String(cents / 100) });
    try {
      localStorage.setItem(thresholdKey(data.companyId), String(cents));
    } catch {
      /* preferenza facoltativa */
    }
  };
  const resetFilters = () => {
    setParams(
      (prev) => {
        const next = new URLSearchParams();
        const tab = prev.get("scheda");
        if (tab) next.set("scheda", tab);
        return next;
      },
      { replace: true },
    );
    try {
      localStorage.removeItem(thresholdKey(data.companyId));
    } catch {
      /* preferenza facoltativa */
    }
  };
  const [overrides, setOverrides] = useState(() =>
    readOverrides(data.companyId),
  );
  const saveOverrides = (next: Record<string, string>) => {
    setOverrides(next);
    try {
      localStorage.setItem(overridesKey(data.companyId), JSON.stringify(next));
    } catch {
      /* simulazione facoltativa */
    }
  };
  const [view, setView] = useState<MovementView>("piano");
  const [period, setPeriod] = useState<{ start: string; end: string } | null>(
    null,
  );
  const [chartPeriod, setChartPeriod] = useState<{
    start: string;
    end: string;
  } | null>(null);
  const [granularity, setGranularity] = useState<"giorni" | "settimane">(
    "giorni",
  );

  const delay = useMemo(
    () => meanCollectionDelay(data.collected, data.today),
    [data.collected, data.today],
  );
  const delayDays =
    f.scenario === "reale"
      ? (delay.days ?? 0)
      : f.scenario === "puntuali"
        ? 0
        : Number(f.scenario);
  const scenario: ForecastScenario = useMemo(
    () => ({
      delayDays,
      includeEstimates: f.estimates,
      includeOverdueIncome: f.overdueIn,
      includeOverdueExpense: f.overdueOut,
      dateOverrides: overrides,
    }),
    [delayDays, f.estimates, f.overdueIn, f.overdueOut, overrides],
  );
  const filtered = !!(f.order || f.category || f.source);
  const movements = useMemo(
    () =>
      data.movements.filter(
        (m) =>
          (!f.order || m.orderId === f.order) &&
          (!f.category || m.category === f.category) &&
          (!f.source || m.source === f.source),
      ),
    [data.movements, f.order, f.category, f.source],
  );
  const projection = useMemo(
    () =>
      projectForecast(
        movements,
        data.opening.cents,
        data.today,
        f.horizon,
        f.threshold,
        scenario,
      ),
    [
      movements,
      data.opening.cents,
      data.today,
      f.horizon,
      f.threshold,
      scenario,
    ],
  );
  const weeks = useMemo(() => forecastWeeks(projection.days), [projection]);
  const orders = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of data.movements)
      if (m.orderId && !map.has(m.orderId))
        map.set(m.orderId, m.orderLabel || "Commessa senza codice");
    return [...map].sort((a, b) => a[1].localeCompare(b[1], "it"));
  }, [data.movements]);
  const sources = useMemo(
    () => [...new Set(data.movements.map((m) => m.source))].sort(),
    [data.movements],
  );
  const categories = useMemo(() => {
    const present = new Set(data.movements.map((m) => m.category));
    return (Object.keys(FORECAST_CATEGORIES) as ForecastCategory[]).filter(
      (c) => present.has(c),
    );
  }, [data.movements]);

  // Scaduti: contati sui movimenti, a prescindere dagli interruttori (che decidono solo il piano).
  const [overdueIncome, overdueExpense] = useMemo(() => {
    const overdue = (direction: "in" | "out") =>
      movements.filter(
        (m) =>
          m.direction === direction &&
          !m.possibleDuplicate &&
          !!m.date &&
          m.date < data.today,
      );
    return [overdue("in"), overdue("out")];
  }, [movements, data.today]);
  const estimatesIncluded = projection.included.filter((m) => m.estimated);
  // Vecchio = il conto aggiornato meno di recente, tra quelli che hanno una data, è fermo a
  // prima di ieri. I conti senza data si segnalano a parte: non spengono e non accendono l'avviso.
  const bankOld =
    data.opening.source === "banca" &&
    !!data.opening.updatedAt &&
    data.opening.updatedAt.slice(0, 10) < moveDay(data.today, -1);
  const undatedAccounts =
    data.opening.source === "banca" ? (data.opening.undatedAccounts ?? 0) : 0;
  const bankNote = bankOld
    ? `Il saldo bancario è aggiornato al ${shortDate(data.opening.updatedAt)}: sincronizza i conti in Tesoreria.`
    : undatedAccounts
      ? `${undatedAccounts === 1 ? "Un conto non ha" : `${undatedAccounts} conti non hanno`} la data di aggiornamento del saldo: verificalo in Tesoreria.`
      : null;
  const incomplete = data.issues.length > 0;
  const issues = (
    <SourceIssues
      issues={data.issues}
      onRefresh={onRefresh}
      refreshing={refreshing}
    />
  );
  const openMovements = (
    next: MovementView,
    range?: { start: string; end: string },
  ) => {
    setView(next);
    setPeriod(range ?? null);
    setFilter({ scheda: "movimenti" });
  };
  const exportPlan = () => {
    const rows = forecastExportRows(
      projection,
      data.opening.cents,
      f.threshold,
      scenario,
    ).map((row) => ({
      ...row,
      dal: data.today,
      al: moveDay(data.today, f.horizon - 1),
      filtri: [
        f.order &&
          `Commessa ${orders.find(([id]) => id === f.order)?.[1] ?? f.order}`,
        f.category && FORECAST_CATEGORIES[f.category as ForecastCategory],
        f.source && `Fonte ${f.source}`,
      ]
        .filter(Boolean)
        .join(" · "),
      qualita_dati: incomplete
        ? `Incompleto: ${data.issues.join(", ")}`
        : "Fonti caricate",
      aggiornamento: data.updatedAt,
    }));
    const labels: Record<string, string> = {
      data: "Data prevista",
      descrizione: "Descrizione",
      controparte: "Controparte",
      categoria: "Categoria",
      direzione: "Direzione",
      importo: "Importo EUR",
      fonte: "Fonte",
      stima: "Stima",
      inclusione: "Inclusione nel piano",
      note: "Note",
      saldo_iniziale: "Saldo iniziale EUR",
      soglia: "Soglia EUR",
      ritardo_giorni: "Ritardo incassi (giorni)",
      dal: "Dal",
      al: "Al",
      filtri: "Filtri",
      qualita_dati: "Qualità dati",
      aggiornamento: "Aggiornato il",
    };
    exportToCSV(
      rows,
      Object.entries(labels).map(([key, label]) => ({ key, label })),
      `previsionale-${data.today}-${f.horizon}gg.csv`,
    );
  };

  // Grafico: barre entrate/uscite del giorno o della settimana, linea del saldo.
  const chartRows = useMemo(
    () =>
      granularity === "giorni"
        ? projection.days.map((d) => ({
            start: d.date,
            end: d.date,
            label: shortDate(d.date),
            income: d.income,
            expense: -d.expense,
            balance: d.balance,
          }))
        : weeks.map((w) => ({
            start: w.start,
            end: w.end,
            label: shortDate(w.start),
            income: w.income,
            expense: -w.expense,
            balance: w.balance,
          })),
    [granularity, projection.days, weeks],
  );
  const minimumRow =
    projection.minimumDate == null
      ? undefined
      : chartRows.find(
          (r) =>
            r.start <= projection.minimumDate! &&
            projection.minimumDate! <= r.end,
        );
  const chartMovements = chartPeriod
    ? projection.included.filter(
        (m) =>
          m.date && m.date >= chartPeriod.start && m.date <= chartPeriod.end,
      )
    : [];
  const listRows = useMemo(() => {
    if (period)
      return projection.included.filter(
        (m) => m.date && m.date >= period.start && m.date <= period.end,
      );
    switch (view) {
      case "piano":
        return projection.included;
      case "incassi-scaduti":
        return overdueIncome;
      case "uscite-scadute":
        return overdueExpense;
      case "senza-data":
        return projection.undated;
      case "stime":
        return movements.filter((m) => m.estimated);
      case "doppioni":
        return projection.possibleDuplicates;
      default: {
        const planned = new Map(projection.included.map((m) => [m.id, m]));
        return movements.map((m) => planned.get(m.id) ?? m);
      }
    }
  }, [period, view, projection, movements, overdueIncome, overdueExpense]);
  const todo: {
    key: MovementView;
    title: string;
    rows: ForecastMovement[];
    hint: string;
    fix: { to: string; label: string } | null;
  }[] = [
    {
      key: "incassi-scaduti",
      title: "Incassi scaduti",
      rows: overdueIncome,
      hint: f.overdueIn
        ? "Inclusi nel piano da oggi (interruttore attivo)."
        : "Fuori dal piano finché non li includi: sollecita il cliente o segna l’incasso.",
      fix: { to: "/azienda/scadenzario", label: "Apri Scadenzario" },
    },
    {
      key: "uscite-scadute",
      title: "Uscite scadute non segnate pagate",
      rows: overdueExpense,
      hint: f.overdueOut
        ? "Incluse nel piano da oggi (interruttore attivo)."
        : "Fuori dal piano: se le hai già pagate segnale pagate, altrimenti includile.",
      fix: { to: "/azienda/costi", label: "Apri Spese" },
    },
    {
      key: "senza-data",
      title: "Movimenti senza data",
      rows: projection.undated,
      hint: "Non entrano nel saldo: aggiungi la scadenza nel documento di origine.",
      fix: null,
    },
    {
      key: "stime",
      title: "Stime incluse",
      rows: estimatesIncluded,
      hint: "Stipendi, ricorrenze, ODA, IVA: verifica importi e date.",
      fix: null,
    },
    {
      key: "doppioni",
      title: "Possibili doppioni",
      rows: projection.possibleDuplicates,
      hint: "Fatture di commessa non collegate a una rata: collegale per contarle una volta sola.",
      fix: { to: "/azienda/ordini", label: "Apri Commesse" },
    },
  ];

  return (
    <div className="space-y-4 pb-8" data-testid="forecast-workspace">
      <header className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-lg font-bold leading-6">Previsionale di cassa</h1>
          <p
            className="mt-0.5 text-xs text-muted-foreground"
            role="status"
            aria-live="polite"
          >
            {refreshing
              ? "Caricamento dei dati in corso…"
              : `La cassa che avrai, dal ${fullDate(data.today)}. Dati caricati alle ${new Date(data.updatedAt).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}.`}
          </p>
        </div>
        <div className="flex gap-2 print:hidden">
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={refreshing}
          >
            <RefreshCw
              className={cn("mr-2 h-4 w-4", refreshing && "animate-spin")}
            />
            {refreshing ? "Aggiornamento" : "Aggiorna"}
          </Button>
          <Button size="sm" onClick={exportPlan}>
            <Download className="mr-2 h-4 w-4" />
            Esporta piano
          </Button>
        </div>
      </header>

      {/* Barra filtri comune a tutte le schede */}
      <div
        role="group"
        aria-label="Filtri del previsionale"
        className={cn(
          section,
          "flex flex-wrap items-center gap-x-4 gap-y-2 p-3 print:hidden",
        )}
      >
        <div
          className="flex rounded-md bg-muted p-0.5"
          role="group"
          aria-label="Orizzonte previsione"
        >
          {HORIZONS.map((days) => (
            <button
              key={days}
              aria-pressed={f.horizon === days}
              onClick={() =>
                setFilter({ giorni: days === 90 ? null : String(days) })
              }
              className={cn(
                "min-h-8 rounded px-2.5 text-xs tabular-nums",
                f.horizon === days && "bg-background font-semibold shadow-sm",
              )}
            >
              {days} giorni
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          Soglia €
          <Input
            aria-label="Soglia di sicurezza in euro"
            type="number"
            min="0"
            step="100"
            value={f.threshold / 100}
            onChange={(e) =>
              setThreshold(
                Math.max(0, Math.round(Number(e.target.value) * 100)),
              )
            }
            className="h-9 w-28 text-right tabular-nums"
          />
        </label>
        <select
          aria-label="Scenario incassi"
          className={selectClass}
          value={f.scenario}
          onChange={(e) =>
            setFilter({
              scenario: e.target.value === "puntuali" ? null : e.target.value,
            })
          }
        >
          <option value="puntuali">Incassi puntuali</option>
          <option value="reale" disabled={delay.days == null}>
            {delay.days == null
              ? "Ritardo medio reale (non disponibile)"
              : `Ritardo medio reale (${delay.days} giorni)`}
          </option>
          <option value="15">Incassi +15 giorni</option>
          <option value="30">Incassi +30 giorni</option>
        </select>
        <Toggle
          checked={f.estimates}
          onChange={(v) => setFilter({ stime: v ? null : "0" })}
        >
          Includi stime
        </Toggle>
        <Toggle
          checked={f.overdueIn}
          onChange={(v) => setFilter({ "incassi-scaduti": v ? "1" : null })}
        >
          Includi incassi scaduti
        </Toggle>
        <Toggle
          checked={f.overdueOut}
          onChange={(v) => setFilter({ "uscite-scadute": v ? "1" : null })}
        >
          Includi uscite scadute
        </Toggle>
        <select
          aria-label="Commessa"
          className={cn(selectClass, "max-w-[12rem]")}
          value={f.order}
          onChange={(e) => setFilter({ commessa: e.target.value })}
        >
          <option value="">Tutte le commesse</option>
          {orders.map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
        <select
          aria-label="Categoria"
          className={selectClass}
          value={f.category}
          onChange={(e) => setFilter({ categoria: e.target.value })}
        >
          <option value="">Tutte le categorie</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {FORECAST_CATEGORIES[c]}
            </option>
          ))}
        </select>
        <select
          aria-label="Fonte"
          className={selectClass}
          value={f.source}
          onChange={(e) => setFilter({ fonte: e.target.value })}
        >
          <option value="">Tutte le fonti</option>
          {sources.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <Button
          variant="ghost"
          size="sm"
          onClick={resetFilters}
          className="h-9"
        >
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          Azzera
        </Button>
      </div>
      {filtered && (
        <p className="text-xs text-muted-foreground">
          Vista filtrata: il saldo parte dalla disponibilità di tutta l’azienda
          e somma solo i movimenti scelti.
        </p>
      )}
      {(bankNote || data.opening.warning) && (
        <p
          role="status"
          className="rounded-lg border border-warning/50 bg-warning/10 px-3 py-2 text-sm"
        >
          {data.opening.warning || bankNote}{" "}
          <Link className="font-semibold underline" to="/azienda/tesoreria">
            Apri Tesoreria
          </Link>
        </p>
      )}

      <Tabs
        value={f.tab}
        onValueChange={(tab) =>
          setFilter({ scheda: tab === "panoramica" ? null : tab })
        }
      >
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0 print:hidden">
          <TabsList className="h-auto w-max justify-start">
            {TABS.map(([value, label]) => (
              <TabsTrigger
                key={value}
                value={value}
                className="min-h-9 px-3 text-xs sm:text-sm"
              >
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {/* ── Panoramica ── */}
        <TabsContent value="panoramica" className="mt-4 space-y-4">
          {issues}
          <div
            className={cn(
              section,
              "grid grid-cols-2 lg:grid-cols-4 lg:divide-x [&>*:nth-child(-n+2)]:border-b lg:[&>*:nth-child(-n+2)]:border-b-0",
            )}
          >
            <Metric
              label="Disponibilità oggi"
              value={money(data.opening.cents)}
              detail={
                data.opening.source === "banca"
                  ? `Banca${data.opening.updatedAt ? ` · al ${shortDate(data.opening.updatedAt)}` : ""}`
                  : data.opening.source === "prima-nota"
                    ? "Prima Nota · saldo fino a oggi"
                    : "Collega un conto o completa la Prima Nota"
              }
            />
            <Metric
              label="Punto più basso"
              value={money(projection.minimum)}
              detail={
                projection.minimumDate
                  ? `Il ${shortDate(projection.minimumDate)} · nei ${f.horizon} giorni`
                  : "Serve un saldo di partenza"
              }
              danger={!!projection.need}
            />
            <Metric
              label="Ti mancano"
              value={money(projection.need)}
              detail={`per restare sopra ${money(f.threshold)}`}
              danger={!!projection.need}
            />
            <Metric
              label="Incassi scaduti da sollecitare"
              value={money(sum(overdueIncome))}
              detail={`${overdueIncome.length} ${overdueIncome.length === 1 ? "incasso" : "incassi"} oltre la scadenza`}
            />
          </div>
          <div
            className={cn(
              "flex flex-col justify-between gap-3 rounded-xl border p-4 sm:flex-row sm:items-center",
              projection.need
                ? "border-destructive/40 bg-destructive/5"
                : "bg-muted/40",
            )}
          >
            <div>
              <p className="text-xs text-muted-foreground">
                {delayDays
                  ? `Simulazione · incassi in ritardo di ${delayDays} giorni`
                  : "Piano delle scadenze"}
              </p>
              <h2 className="mt-0.5 text-base font-semibold">
                {data.opening.cents == null
                  ? "Completa il saldo per conoscere la cassa futura"
                  : projection.firstBelow
                    ? `Sotto la soglia dal ${shortDate(projection.firstBelow)}`
                    : "La cassa prevista resta sopra la soglia"}
              </h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {data.opening.cents == null
                  ? "Entrate e uscite sono consultabili. Il saldo non viene sostituito con uno zero."
                  : `A fine periodo: ${money(projection.finalBalance)} · flusso del periodo: ${money(projection.net)}.`}
              </p>
              {data.opening.cents != null && (incomplete || bankNote) && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {incomplete
                    ? `Verifica prima di decidere: mancano ${data.issues.join(", ")}.`
                    : bankNote}
                </p>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => openMovements("piano")}
            >
              Esamina i movimenti
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
          <section className={cn(section, "overflow-hidden")}>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold">Andamento della cassa</h2>
                <p className="text-xs text-muted-foreground">
                  Entrate{" "}
                  <strong className="tabular-nums text-success">
                    {money(projection.income)}
                  </strong>{" "}
                  · Uscite{" "}
                  <strong className="tabular-nums text-destructive">
                    {money(projection.expense)}
                  </strong>{" "}
                  · Tocca una barra per vedere i movimenti.
                </p>
              </div>
              <div className="flex rounded-md bg-muted p-0.5">
                {(["giorni", "settimane"] as const).map((g) => (
                  <button
                    key={g}
                    aria-pressed={granularity === g}
                    onClick={() => {
                      setGranularity(g);
                      setChartPeriod(null);
                    }}
                    className={cn(
                      "min-h-8 rounded px-2.5 text-xs",
                      granularity === g &&
                        "bg-background font-semibold shadow-sm",
                    )}
                  >
                    {g === "giorni" ? "Per giorno" : "Per settimana"}
                  </button>
                ))}
              </div>
            </div>
            {data.opening.cents == null ? (
              <div className="flex min-h-[240px] flex-col items-center justify-center gap-3 p-6 text-center">
                <p className="text-sm text-muted-foreground">
                  Il grafico del saldo richiede una disponibilità iniziale.
                </p>
                <Button asChild variant="outline" size="sm">
                  <Link to="/azienda/tesoreria">Completa in Tesoreria</Link>
                </Button>
              </div>
            ) : (
              <div
                className="h-[300px] w-full px-1 py-3 sm:px-3"
                aria-label="Grafico saldo con entrate e uscite"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={chartRows}
                    margin={{ top: 16, right: 8, left: 0, bottom: 0 }}
                    stackOffset="sign"
                    onClick={(state) => {
                      const index = Number(
                        (state as { activeTooltipIndex?: number | string } | null)
                          ?.activeTooltipIndex,
                      );
                      const row = Number.isInteger(index)
                        ? chartRows[index]
                        : undefined;
                      if (row) setChartPeriod({ start: row.start, end: row.end });
                    }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 6"
                      vertical={false}
                      stroke={tone.grid}
                    />
                    <XAxis
                      dataKey="label"
                      minTickGap={32}
                      tickLine={false}
                      axisLine={false}
                      fontSize={11}
                      stroke={tone.axis}
                    />
                    <YAxis
                      yAxisId="saldo"
                      width={60}
                      tickFormatter={compact}
                      tickLine={false}
                      axisLine={false}
                      fontSize={11}
                      stroke={tone.axis}
                    />
                    <YAxis yAxisId="flussi" orientation="right" hide />
                    <Tooltip
                      formatter={(value: number, name: string) => [
                        money(Math.abs(value)),
                        name === "income"
                          ? "Entrate"
                          : name === "expense"
                            ? "Uscite"
                            : "Saldo",
                      ]}
                      contentStyle={{
                        borderRadius: 8,
                        fontSize: 12,
                        background: "hsl(var(--popover))",
                        borderColor: "hsl(var(--border))",
                        color: "hsl(var(--popover-foreground))",
                      }}
                    />
                    <ReferenceLine
                      yAxisId="saldo"
                      y={f.threshold}
                      stroke={tone.threshold}
                      strokeDasharray="5 5"
                      label={{
                        value: "Soglia",
                        position: "insideTopRight",
                        fill: tone.axis,
                        fontSize: 10,
                      }}
                    />
                    <ReferenceLine
                      yAxisId="saldo"
                      y={0}
                      stroke={tone.axis}
                      strokeOpacity={0.5}
                    />
                    <Bar
                      yAxisId="flussi"
                      dataKey="income"
                      stackId="flussi"
                      fill={tone.in}
                      fillOpacity={0.55}
                      isAnimationActive={false}
                      cursor="pointer"
                    />
                    <Bar
                      yAxisId="flussi"
                      dataKey="expense"
                      stackId="flussi"
                      fill={tone.out}
                      fillOpacity={0.55}
                      isAnimationActive={false}
                      cursor="pointer"
                    />
                    <Line
                      yAxisId="saldo"
                      type="stepAfter"
                      dataKey="balance"
                      stroke={tone.balance}
                      strokeWidth={2.5}
                      dot={false}
                      isAnimationActive={false}
                    />
                    {minimumRow && projection.minimum != null && (
                      <ReferenceDot
                        yAxisId="saldo"
                        x={minimumRow.label}
                        y={projection.minimum}
                        r={5}
                        fill={tone.out}
                        stroke="hsl(var(--background))"
                        label={{
                          value: `Minimo ${compact(projection.minimum)} · ${shortDate(projection.minimumDate)}`,
                          position: "bottom",
                          fill: tone.axis,
                          fontSize: 10,
                        }}
                      />
                    )}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
            {chartPeriod && (
              <div className="border-t" aria-label="Movimenti del periodo scelto">
                <div className="flex items-center justify-between gap-2 px-4 py-2">
                  <p className="text-sm font-medium">
                    {chartPeriod.start === chartPeriod.end
                      ? fullDate(chartPeriod.start)
                      : `${shortDate(chartPeriod.start)} – ${shortDate(chartPeriod.end)}`}{" "}
                    · {chartMovements.length} movimenti
                  </p>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openMovements("piano", chartPeriod)}
                    >
                      Apri in Movimenti
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Chiudi il periodo"
                      onClick={() => setChartPeriod(null)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                {chartMovements.length ? (
                  <ul className="divide-y border-t">
                    {chartMovements.slice(0, 12).map((m) => (
                      <li
                        key={m.id}
                        className="flex items-center justify-between gap-3 px-4 py-2 text-sm"
                      >
                        <Link
                          to={m.href}
                          className="min-w-0 truncate hover:underline"
                        >
                          {m.description}
                          <span className="ml-2 text-xs text-muted-foreground">
                            {m.counterparty || m.source}
                          </span>
                        </Link>
                        <span
                          className={cn(
                            "shrink-0 tabular-nums",
                            m.direction === "in"
                              ? "text-success"
                              : "text-destructive",
                          )}
                        >
                          {m.direction === "in" ? "+" : "−"}
                          {money(m.cents)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="px-4 pb-3 text-xs text-muted-foreground">
                    Nessun movimento in questo periodo.
                  </p>
                )}
              </div>
            )}
          </section>
        </TabsContent>

        {/* ── Settimane ── */}
        <TabsContent value="settimane" className="mt-4 space-y-3">
          {issues}
          <div className={cn(section, "overflow-hidden")}>
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full text-sm">
                <caption className="sr-only">
                  Piano settimanale con minimo giornaliero e saldo finale
                </caption>
                <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr>
                    {[
                      "Settimana",
                      "Entrate",
                      "Uscite",
                      "Minimo giornaliero",
                      "Saldo finale",
                    ].map((label, i) => (
                      <th
                        key={label}
                        className={cn(
                          "px-4 py-2 font-medium",
                          i > 0 && "text-right",
                        )}
                      >
                        {label}
                      </th>
                    ))}
                    <th>
                      <span className="sr-only">Dettaglio</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {weeks.map((w) => {
                    const below = w.minimum != null && w.minimum < f.threshold;
                    return (
                      <tr
                        key={w.start}
                        className={cn("border-t", below && "bg-destructive/5")}
                      >
                        <td className="px-4 py-2 text-xs">
                          {shortDate(w.start)} – {shortDate(w.end)}
                          {below && (
                            <span className="ml-2 rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] text-destructive">
                              sotto soglia
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums text-success">
                          {money(w.income)}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums text-destructive">
                          {money(w.expense)}
                        </td>
                        <td
                          className={cn(
                            "px-4 py-2 text-right font-medium tabular-nums",
                            below && "text-destructive",
                          )}
                        >
                          {money(w.minimum)}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {money(w.balance)}
                        </td>
                        <td className="pr-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Apri movimenti ${shortDate(w.start)}`}
                            onClick={() =>
                              openMovements("piano", {
                                start: w.start,
                                end: w.end,
                              })
                            }
                          >
                            <ArrowRight className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="divide-y sm:hidden">
              {weeks.map((w) => {
                const below = w.minimum != null && w.minimum < f.threshold;
                return (
                  <button
                    key={w.start}
                    className={cn(
                      "w-full px-4 py-3 text-left",
                      below && "bg-destructive/5",
                    )}
                    aria-label={`Apri settimana ${shortDate(w.start)}`}
                    onClick={() =>
                      openMovements("piano", { start: w.start, end: w.end })
                    }
                  >
                    <span className="flex items-center justify-between text-sm font-medium">
                      {shortDate(w.start)} – {shortDate(w.end)}
                      <ArrowRight
                        className="h-4 w-4 text-muted-foreground"
                        aria-hidden
                      />
                    </span>
                    <span className="mt-1 grid grid-cols-3 gap-2 text-xs tabular-nums">
                      <span className="text-success">+{money(w.income)}</span>
                      <span className="text-destructive">
                        −{money(w.expense)}
                      </span>
                      <span
                        className={cn("text-right", below && "text-destructive")}
                      >
                        {money(w.balance)}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </TabsContent>

        {/* ── Movimenti ── */}
        <TabsContent value="movimenti" className="mt-4 space-y-3">
          {issues}
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Movimenti da mostrare"
              className={cn(selectClass, "h-10 text-sm")}
              value={view}
              onChange={(e) => {
                setView(e.target.value as MovementView);
                setPeriod(null);
              }}
            >
              {VIEWS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            {period && (
              <span className="flex items-center gap-1 text-sm">
                Periodo {shortDate(period.start)} – {shortDate(period.end)}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPeriod(null)}
                >
                  Rimuovi filtro periodo
                </Button>
              </span>
            )}
            {Object.keys(overrides).length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => saveOverrides({})}
              >
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                Ripristina tutte le date ({Object.keys(overrides).length})
              </Button>
            )}
          </div>
          <MovementList
            key={`${view}:${period?.start ?? ""}`}
            rows={listRows}
            today={data.today}
            overrides={overrides}
            onMove={(id, date) => {
              const next = { ...overrides };
              if (date) next[id] = date;
              else delete next[id];
              saveOverrides(next);
            }}
            emptyHint={
              view === "piano"
                ? "Nessun movimento nel periodo: allarga l’orizzonte o togli i filtri."
                : "Niente in questa vista. Prova un’altra vista o togli i filtri comuni."
            }
          />
        </TabsContent>

        {/* ── Da sistemare ── */}
        <TabsContent value="da-sistemare" className="mt-4 space-y-3">
          {issues}
          <div className={cn(section, "divide-y")}>
            {todo.every((t) => !t.rows.length) ? (
              <EmptyState
                title="Niente da sistemare"
                hint="Scadenze, date e collegamenti sono a posto per il piano scelto."
              />
            ) : (
              todo.map((t) => (
                <div
                  key={t.key}
                  className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {t.title}{" "}
                      <span className="tabular-nums text-muted-foreground">
                        · {t.rows.length} · {money(sum(t.rows))}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">{t.hint}</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {t.fix && (
                      <Button asChild variant="ghost" size="sm">
                        <Link to={t.fix.to}>{t.fix.label}</Link>
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!t.rows.length}
                      aria-label={`Vedi ${t.title}`}
                      onClick={() => openMovements(t.key)}
                    >
                      Vedi
                      <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </TabsContent>

        {/* ── Incassato ── */}
        <TabsContent value="incassato" className="mt-4 space-y-3">
          {issues}
          <IncassatoTab data={data} delay={delay} />
        </TabsContent>

        {/* ── Fonti e ipotesi ── */}
        <TabsContent value="fonti" className="mt-4 space-y-3">
          {issues}
          <div className={cn(section, "space-y-3 p-4 text-sm leading-relaxed")}>
            <div>
              <h2 className="font-semibold">Cosa entra nel piano</h2>
              <p className="mt-1 text-muted-foreground">
                Partenza:{" "}
                {data.opening.source === "banca"
                  ? "saldo disponibile dei conti attivi (se manca, il saldo contabile)"
                  : data.opening.source === "prima-nota"
                    ? "saldo della Prima Nota fino a oggi"
                    : "nessun saldo: collega un conto in Tesoreria"}
                . Entrate: rate delle commesse con la regola della scheda
                commessa, fatture e scadenze attive non coperte da una rata,
                Blocca prezzo. Uscite: spese, scadenzario, pagamenti ai
                fornitori degli articoli, ODA aperti o ricevuti senza spesa,
                squadre esterne, provvigioni, cedolini, F24 registrati, stima
                IVA.
              </p>
            </div>
            <div>
              <h2 className="font-semibold">Come</h2>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
                <li>
                  Importi di cassa: IVA inclusa ove prevista, solo i residui non
                  saldati; ritenuta applicata alle commesse con bonus.
                </li>
                <li>
                  Incassi e uscite scaduti restano fuori dal piano (spesso sono
                  già pagati ma non segnati) ed entrano oggi solo con gli
                  interruttori.
                </li>
                <li>
                  Le fatture di una commessa non collegate a nessuna rata
                  restano fuori come possibili doppioni.
                </li>
                <li>
                  I movimenti senza data restano fuori e sono elencati in «Da
                  sistemare».
                </li>
                <li>
                  Ritardo medio reale:{" "}
                  {delay.days == null
                    ? "non disponibile"
                    : `${delay.days} giorni`}
                  , da {delay.samples} incassi degli ultimi 12 mesi con una
                  data attesa.
                </li>
                <li>
                  Soglia, scenario e date spostate a mano sono simulazioni: non
                  cambiano scadenze o pagamenti registrati.
                </li>
                <li>
                  Il minimo è a fine giornata: non rappresenta l’ordine dei
                  bonifici nello stesso giorno.
                </li>
              </ul>
            </div>
            {data.warnings.length > 0 && (
              <div>
                <h2 className="font-semibold">Ipotesi sulle stime</h2>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
                  {data.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Ultimo caricamento:{" "}
              {new Date(data.updatedAt).toLocaleString("it-IT")}. I margini
              delle commesse sono in{" "}
              <Link className="underline" to="/azienda/ordini?tab=marginalita">
                Commesse → Marginalità
              </Link>
              .
            </p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function IncassatoTab({
  data,
  delay,
}: {
  data: ForecastDataset;
  delay: { days: number | null; samples: number };
}) {
  const collected = data.collected.filter(
    (m) =>
      m.date && m.date >= moveDay(data.today, -366) && m.date <= data.today,
  );
  const month = sum(
    collected.filter((m) => m.date?.slice(0, 7) === data.today.slice(0, 7)),
  );
  return (
    <>
      <div className={cn(section, "grid grid-cols-2 divide-x")}>
        <Metric
          label="Incassato nel mese"
          value={money(month)}
          detail="Importi registrati, senza ripetere lo stesso pagamento"
        />
        <Metric
          label="Ritardo medio reale"
          value={
            delay.days == null ? "Non disponibile" : `${delay.days} giorni`
          }
          detail={`${delay.samples} incassi con scadenza collegata · ultimi 12 mesi`}
        />
      </div>
      <MovementList
        rows={collected}
        today={data.today}
        collected
        emptyHint="Nessun incasso registrato negli ultimi 12 mesi: registra gli incassi in Prima Nota o sulle rate."
      />
    </>
  );
}

type SortKey = "data-asc" | "data-desc" | "importo-desc" | "importo-asc";
function MovementList({
  rows,
  today,
  collected = false,
  overrides = {},
  onMove,
  emptyHint,
}: {
  rows: ForecastMovement[];
  today: string;
  collected?: boolean;
  overrides?: Record<string, string>;
  onMove?: (id: string, date: string | null) => void;
  emptyHint: string;
}) {
  const [search, setSearch] = useState("");
  const [direction, setDirection] = useState("all");
  const [sort, setSort] = useState<SortKey>(
    collected ? "data-desc" : "data-asc",
  );
  const [page, setPage] = useState(1);
  const filtered = useMemo(() => {
    const needle = search.toLocaleLowerCase("it-IT");
    const list = rows.filter(
      (m) =>
        (direction === "all" || m.direction === direction) &&
        `${m.description} ${m.counterparty} ${m.source} ${m.orderLabel ?? ""} ${FORECAST_CATEGORIES[m.category]}`
          .toLocaleLowerCase("it-IT")
          .includes(needle),
    );
    const byDate = (a: ForecastMovement, b: ForecastMovement) =>
      (a.date ?? "9999").localeCompare(b.date ?? "9999");
    return [...list].sort((a, b) =>
      sort === "data-asc"
        ? byDate(a, b)
        : sort === "data-desc"
          ? byDate(b, a)
          : sort === "importo-desc"
            ? b.cents - a.cents
            : a.cents - b.cents,
    );
  }, [rows, search, direction, sort]);
  const pages = Math.max(1, Math.ceil(filtered.length / 25));
  const currentPage = Math.min(page, pages);
  const visible = filtered.slice((currentPage - 1) * 25, currentPage * 25);
  const income = sum(filtered.filter((m) => m.direction === "in"));
  const expenses = sum(filtered.filter((m) => m.direction === "out"));
  const status = (m: ForecastMovement) =>
    collected
      ? "Registrato"
      : m.possibleDuplicate
        ? "Possibile doppione"
        : !m.date
          ? "Senza data"
          : overrides[m.id]
            ? "Data spostata"
            : m.date < today
              ? "Scaduto"
              : m.estimated
                ? "Stima"
                : "Programmato";
  const exportView = () =>
    exportToCSV(
      filtered.map((m) => ({
        data: m.date ?? "",
        descrizione: m.description,
        controparte: m.counterparty ?? "",
        commessa: m.orderLabel ?? "",
        categoria: FORECAST_CATEGORIES[m.category],
        fonte: m.source,
        stato: status(m),
        direzione: m.direction === "in" ? "Entrata" : "Uscita",
        importo: (m.cents / 100).toFixed(2),
        data_attesa: m.expectedDate ?? "",
        note: m.note ?? "",
      })),
      [
        {
          key: "data",
          label: collected ? "Data registrazione" : "Data prevista",
        },
        { key: "descrizione", label: "Descrizione" },
        { key: "controparte", label: "Controparte" },
        { key: "commessa", label: "Commessa" },
        { key: "categoria", label: "Categoria" },
        { key: "fonte", label: "Fonte" },
        { key: "stato", label: "Stato" },
        { key: "direzione", label: "Direzione" },
        { key: "importo", label: "Importo EUR" },
        { key: "data_attesa", label: "Data attesa" },
        { key: "note", label: "Note" },
      ],
      `previsionale-${collected ? "incassato" : "movimenti"}-vista-${today}.csv`,
    );
  // Solo gli incassi si spostano a mano: è la domanda «e se questo cliente paga dopo?».
  const moveControl = (m: ForecastMovement) =>
    !collected && onMove && m.direction === "in" && !m.possibleDuplicate ? (
      <span className="mt-1 flex items-center gap-1">
        <input
          type="date"
          aria-label={`Sposta incasso: ${m.description}`}
          title="Sposta la data di questo incasso solo nella simulazione"
          value={overrides[m.id] ?? m.date ?? ""}
          onChange={(e) => onMove(m.id, validDay(e.target.value))}
          className="h-7 rounded border bg-background px-1 text-[11px] tabular-nums"
        />
        {overrides[m.id] && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-[11px]"
            onClick={() => onMove(m.id, null)}
          >
            Ripristina
          </Button>
        )}
      </span>
    ) : null;
  return (
    <div className={cn(section, "overflow-hidden")}>
      <div className="flex flex-col gap-2 border-b p-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            aria-label="Cerca nei movimenti"
            placeholder="Cerca descrizione, cliente, commessa o fonte"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="h-9 pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {!collected && (
            <select
              aria-label="Direzione movimenti"
              className={selectClass}
              value={direction}
              onChange={(e) => {
                setDirection(e.target.value);
                setPage(1);
              }}
            >
              <option value="all">Entrate e uscite</option>
              <option value="in">Solo entrate</option>
              <option value="out">Solo uscite</option>
            </select>
          )}
          <select
            aria-label="Ordina movimenti"
            className={selectClass}
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
          >
            <option value="data-asc">Data: prima le vicine</option>
            <option value="data-desc">Data: prima le lontane</option>
            <option value="importo-desc">Importo: dal più alto</option>
            <option value="importo-asc">Importo: dal più basso</option>
          </select>
          <Button
            variant="outline"
            size="sm"
            onClick={exportView}
            disabled={!filtered.length}
            className="h-9"
            title="Esporta tutti i movimenti che corrispondono ai filtri, anche nelle altre pagine"
          >
            <Download className="mr-1.5 h-4 w-4" aria-hidden />
            Esporta vista
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 px-4 py-2 text-xs text-muted-foreground">
        <span>{filtered.length} movimenti</span>
        <span>
          Entrate:{" "}
          <strong className="tabular-nums text-success">{money(income)}</strong>
        </span>
        {!collected && (
          <span>
            Uscite:{" "}
            <strong className="tabular-nums text-destructive">
              {money(expenses)}
            </strong>
          </span>
        )}
      </div>
      {!visible.length ? (
        <EmptyState title="Nessun movimento in questa vista" hint={emptyHint} />
      ) : (
        <>
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full text-sm">
              <thead className="border-y bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  {["Data", "Movimento", "Fonte e stato", "Importo"].map(
                    (label, i) => (
                      <th
                        key={label}
                        className={cn(
                          "px-3 py-2 font-medium",
                          i === 3 && "text-right",
                        )}
                      >
                        {label}
                      </th>
                    ),
                  )}
                  <th>
                    <span className="sr-only">Apri la voce</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((m) => (
                  <tr key={m.id} className="border-b last:border-0">
                    <td className="whitespace-nowrap px-3 py-2 align-top text-xs tabular-nums">
                      {shortDate(m.date)}
                      {m.expectedDate && m.expectedDate !== m.date && (
                        <p className="mt-0.5 text-[10px] text-muted-foreground">
                          Atteso {fullDate(m.expectedDate)}
                        </p>
                      )}
                      {moveControl(m)}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <p className="font-medium">{m.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {[
                          m.counterparty || FORECAST_CATEGORIES[m.category],
                          m.orderLabel,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      {m.note && (
                        <p className="mt-0.5 max-w-md text-[11px] text-muted-foreground">
                          {m.note}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top text-xs">
                      <p>{m.source}</p>
                      <span className="mt-1 inline-block rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        {status(m)}
                      </span>
                    </td>
                    <td
                      className={cn(
                        "whitespace-nowrap px-3 py-2 text-right align-top font-medium tabular-nums",
                        m.direction === "in"
                          ? "text-success"
                          : "text-destructive",
                      )}
                    >
                      {m.direction === "in" ? "+" : "−"}
                      {money(m.cents)}
                    </td>
                    <td className="pr-2 align-top">
                      <Button asChild size="icon" variant="ghost">
                        <Link
                          to={m.href}
                          aria-label={`Apri fonte: ${m.description}`}
                        >
                          <ArrowUpRight className="h-4 w-4" />
                        </Link>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="divide-y sm:hidden">
            {visible.map((m) => (
              <li key={m.id} className="px-4 py-3">
                <Link
                  to={m.href}
                  className="flex items-start justify-between gap-3"
                >
                  <span className="min-w-0">
                    <span className="block break-words text-sm font-medium">
                      {m.description}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {m.counterparty || FORECAST_CATEGORIES[m.category]}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "shrink-0 text-sm font-semibold tabular-nums",
                      m.direction === "in"
                        ? "text-success"
                        : "text-destructive",
                    )}
                  >
                    {m.direction === "in" ? "+" : "−"}
                    {money(m.cents)}
                  </span>
                </Link>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {shortDate(m.date)} · {m.source} · {status(m)}
                </p>
                {m.note && (
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {m.note}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="flex items-center justify-between border-t px-3 py-2 text-xs text-muted-foreground">
        <span>
          Pagina {currentPage} di {pages}
        </span>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Pagina precedente"
            disabled={currentPage <= 1}
            onClick={() => setPage(currentPage - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Pagina successiva"
            disabled={currentPage >= pages}
            onClick={() => setPage(currentPage + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
