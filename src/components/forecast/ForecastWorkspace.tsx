import { lazy, Suspense, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Info,
  Landmark,
  RefreshCw,
  Search,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { exportToCSV } from "@/lib/csvExport";
import { formatCurrency } from "@/lib/formatters";
import {
  FORECAST_CATEGORIES,
  calendarDate,
  forecastExportRows,
  forecastWeeks,
  moveDay,
  projectForecast,
  type ForecastMovement,
  type ForecastScenario,
} from "@/lib/finance/forecastLedger";
import type { ForecastDataset } from "@/hooks/useForecastLedger";
import { cn } from "@/lib/utils";
import "./forecastWorkspace.css";

const MarginTab = lazy(() =>
  import("./MarginTab").then((m) => ({ default: m.MarginTab })),
);
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
const panel =
  "rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950";
interface Preferences {
  horizon: number;
  threshold: number;
  delay: number;
  estimates: boolean;
  overdue: boolean;
  overdueExpense: boolean;
}
const defaults: Preferences = {
  horizon: 90,
  threshold: 500000,
  delay: 0,
  estimates: true,
  overdue: false,
  overdueExpense: false,
};
interface MovementControls {
  search: string;
  direction: string;
  page: number;
}
const defaultControls: MovementControls = {
  search: "",
  direction: "all",
  page: 1,
};
function readPreferences(companyId: string): Preferences {
  try {
    const p = JSON.parse(
      localStorage.getItem(`forecast-preferences-v1:${companyId}`) || "null",
    );
    if (!p) return defaults;
    return {
      horizon: [30, 60, 90].includes(p.horizon) ? p.horizon : 90,
      threshold:
        Number.isFinite(p.threshold) && p.threshold >= 0 ? p.threshold : 500000,
      delay: [0, 15, 30].includes(p.delay) ? p.delay : 0,
      estimates: p.estimates !== false,
      overdue: p.overdue === true,
      overdueExpense: p.overdueExpense === true,
    };
  } catch {
    return defaults;
  }
}
function Metric({
  label,
  value,
  detail,
  danger = false,
  icon: Icon,
}: {
  label: string;
  value: string;
  detail: string;
  danger?: boolean;
  icon: typeof Wallet;
}) {
  return (
    <div className={cn(panel, "forecast-metric min-w-0 p-4 shadow-sm sm:p-5")}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <Icon aria-hidden className="h-4 w-4 shrink-0 text-slate-400" />
      </div>
      <p
        className={cn(
          "break-words text-xl font-semibold tracking-tight tabular-nums sm:text-2xl",
          danger && "text-rose-600",
        )}
      >
        {value}
      </p>
      <p className="mt-2 text-xs leading-relaxed text-slate-500">{detail}</p>
    </div>
  );
}
function ActionRow({
  title,
  detail,
  onClick,
}: {
  title: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="forecast-action flex min-h-16 w-full items-center justify-between gap-3 rounded-xl bg-slate-50 p-3 text-left transition-colors hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-800"
    >
      <span>
        <span className="block text-sm font-medium">{title}</span>
        <span className="mt-1 block text-[11px] leading-relaxed text-slate-500">
          {detail}
        </span>
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" />
    </button>
  );
}
export function ForecastWorkspace({
  data,
  onRefresh,
  refreshing = false,
}: {
  data: ForecastDataset;
  onRefresh: () => void;
  refreshing?: boolean;
}) {
  const [prefs, setPrefs] = useState(() => readPreferences(data.companyId));
  const [tab, setTab] = useState("cassa");
  const [chartView, setChartView] = useState("giorni");
  const [movementFilter, setMovementFilter] = useState("piano");
  const [detailControls, setDetailControls] = useState(defaultControls);
  const [collectedControls, setCollectedControls] = useState(defaultControls);
  const [weekRange, setWeekRange] = useState<{
    start: string;
    end: string;
  } | null>(null);
  const updatePrefs = (changes: Partial<Preferences>) => {
    const next = { ...prefs, ...changes };
    setPrefs(next);
    setWeekRange(null);
    try {
      localStorage.setItem(
        `forecast-preferences-v1:${data.companyId}`,
        JSON.stringify(next),
      );
    } catch {
      /* optional preferences */
    }
  };
  const scenario: ForecastScenario = useMemo(
    () => ({
      delayDays: prefs.delay,
      includeEstimates: prefs.estimates,
      includeOverdueIncome: prefs.overdue,
      includeOverdueExpense: prefs.overdueExpense,
    }),
    [prefs.delay, prefs.estimates, prefs.overdue, prefs.overdueExpense],
  );
  const projection = useMemo(
    () =>
      projectForecast(
        data.movements,
        data.opening.cents,
        data.today,
        prefs.horizon,
        prefs.threshold,
        scenario,
      ),
    [data, prefs.horizon, prefs.threshold, scenario],
  );
  const weeks = useMemo(() => forecastWeeks(projection.days), [projection]);
  const scenarios = useMemo(
    () =>
      [0, 15, 30].map((delay) => ({
        delay,
        plan: projectForecast(
          data.movements,
          data.opening.cents,
          data.today,
          prefs.horizon,
          prefs.threshold,
          { ...scenario, delayDays: delay },
        ),
      })),
    [data, prefs.horizon, prefs.threshold, scenario],
  );
  const pendingIncome = data.movements.filter(
    (m) => m.direction === "in" && (!m.date || m.date < data.today),
  );
  const overdueCount = data.movements.filter(
    (m) => m.direction === "in" && m.date && m.date < data.today,
  ).length;
  const undatedExpense = projection.undated
    .filter((m) => m.direction === "out")
    .reduce((sum, m) => sum + m.cents, 0);
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
  const overdueExpenseTotal = projection.overdueExpense.reduce(
    (sum, m) => sum + m.cents,
    0,
  );
  const duplicateTotal = projection.possibleDuplicates.reduce(
    (sum, m) => sum + m.cents,
    0,
  );
  const incomplete = data.issues.length > 0;
  const openMovements = (filter: string) => {
    setDetailControls(defaultControls);
    setMovementFilter(filter);
    setWeekRange(null);
    setTab("movimenti");
  };
  const plannedMap = useMemo(
    () => new Map(projection.included.map((m) => [m.id, m])),
    [projection],
  );
  const detailMovements = useMemo(() => {
    if (weekRange)
      return projection.included.filter(
        (m) => m.date && m.date >= weekRange.start && m.date <= weekRange.end,
      );
    if (movementFilter === "piano") return projection.included;
    if (movementFilter === "scaduti")
      return data.movements.filter(
        (m) => m.direction === "in" && m.date && m.date < data.today,
      );
    if (movementFilter === "senza-data") return projection.undated;
    if (movementFilter === "uscite-scadute") return projection.overdueExpense;
    if (movementFilter === "doppioni") return projection.possibleDuplicates;
    if (movementFilter === "stime")
      return data.movements.filter((m) => m.estimated);
    return data.movements.map((m) => plannedMap.get(m.id) ?? m);
  }, [data, projection, movementFilter, weekRange, plannedMap]);
  const collected = data.collected.filter(
    (m) =>
      m.date && m.date >= moveDay(data.today, -366) && m.date <= data.today,
  );
  const comparable = collected.filter((m) => m.date && m.expectedDate);
  const lateDays = (m: ForecastMovement) => {
    if (!m.date || !m.expectedDate) return null;
    const ordinal = (value: string) => {
      const d = calendarDate(value);
      return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
    };
    return Math.max(
      0,
      Math.round((ordinal(m.date) - ordinal(m.expectedDate)) / 86400000),
    );
  };
  const meanDelay = comparable.length
    ? Math.round(
        comparable.reduce((sum, m) => sum + lateDays(m)!, 0) /
          comparable.length,
      )
    : null;
  const exportPlan = () => {
    const rows = forecastExportRows(
      projection,
      data.opening.cents,
      prefs.threshold,
      scenario,
    ).map((row) => ({
      ...row,
      dal: data.today,
      al: moveDay(data.today, prefs.horizon - 1),
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
      qualita_dati: "Qualità dati",
      aggiornamento: "Aggiornato il",
    };
    exportToCSV(
      rows,
      Object.entries(labels).map(([key, label]) => ({ key, label })),
      `previsionale-${data.today}-${prefs.horizon}gg.csv`,
    );
  };
  return (
    <div
      className="forecast-workspace space-y-6 pb-8 text-slate-900 dark:text-slate-100"
      data-testid="forecast-workspace"
    >
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[.18em] text-slate-500">
            Finanza · Pianificazione
          </p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Previsionale
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            La cassa che avrai. Le scadenze da gestire prima.
          </p>
          <p
            className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500"
            role="status"
            aria-live="polite"
          >
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                incomplete ? "bg-amber-500" : "bg-emerald-500",
              )}
              aria-hidden
            />
            {refreshing
              ? "Caricamento dei dati in corso…"
              : `Dati caricati alle ${new Date(data.updatedAt).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`}
          </p>
        </div>
        <div className="flex gap-2 print:hidden">
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={refreshing}
            className="h-10 rounded-xl"
          >
            <RefreshCw
              className={cn("mr-2 h-4 w-4", refreshing && "animate-spin")}
            />
            {refreshing ? "Aggiornamento" : "Aggiorna"}
          </Button>
          <Button
            size="sm"
            onClick={exportPlan}
            className="h-10 rounded-xl bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900"
          >
            <Download className="mr-2 h-4 w-4" />
            Esporta piano
          </Button>
        </div>
      </header>
      {incomplete && (
        <div
          role="alert"
          className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
        >
          <strong>
            Previsione incompleta: alcune fonti non sono disponibili.
          </strong>
          <p>
            Da ricaricare: {data.issues.join(", ")}. I valori riguardano solo i
            dati letti; verifica prima di prendere decisioni.
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={onRefresh}
            disabled={refreshing}
          >
            Riprova il caricamento
          </Button>
        </div>
      )}
      {(bankNote || data.opening.warning) && (
        <div
          role="status"
          className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
        >
          {data.opening.warning || bankNote}{" "}
          <Link className="font-semibold underline" to="/azienda/tesoreria">
            Apri Tesoreria
          </Link>
        </div>
      )}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList
          data-tab-index={[
            "cassa",
            "movimenti",
            "incassato",
            "marginalita",
          ].indexOf(tab)}
          className="forecast-tabs mb-6 grid h-auto w-full grid-cols-4 rounded-xl bg-slate-100 p-1 dark:bg-slate-900 sm:w-fit sm:min-w-[440px] print:hidden"
        >
          {[
            ["cassa", "Cassa futura"],
            ["movimenti", "Movimenti"],
            ["incassato", "Incassato"],
            ["marginalita", "Marginalità"],
          ].map(([value, label]) => (
            <TabsTrigger
              key={value}
              value={value}
              className="min-h-10 rounded-lg px-1 text-[11px] sm:px-4 sm:text-sm"
            >
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="cassa" className="mt-0 space-y-5">
          <div
            className={cn(
              panel,
              "flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between print:hidden",
            )}
          >
            <div className="flex gap-1" aria-label="Orizzonte previsione">
              {[30, 60, 90].map((days) => (
                <Button
                  key={days}
                  size="sm"
                  variant={prefs.horizon === days ? "default" : "ghost"}
                  aria-pressed={prefs.horizon === days}
                  className={cn(
                    "h-10 flex-1 rounded-lg sm:flex-none",
                    prefs.horizon === days &&
                      "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900",
                  )}
                  onClick={() => updatePrefs({ horizon: days })}
                >
                  {days} giorni
                </Button>
              ))}
            </div>
            <label className="flex items-center justify-between gap-3 text-xs text-slate-500 sm:justify-start">
              Soglia di sicurezza €
              <Input
                aria-label="Soglia di sicurezza in euro"
                type="number"
                min="0"
                step="100"
                value={prefs.threshold / 100}
                onChange={(e) =>
                  updatePrefs({
                    threshold: Math.max(
                      0,
                      Math.round(Number(e.target.value) * 100),
                    ),
                  })
                }
                className="h-10 w-28 rounded-lg text-right tabular-nums"
              />
            </label>
          </div>
          <div className="forecast-metrics grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Metric
              icon={Landmark}
              label="Disponibilità di partenza"
              value={money(data.opening.cents)}
              detail={
                data.opening.source === "banca"
                  ? `Banca · disponibile ove presente${data.opening.updatedAt ? ` · ${shortDate(data.opening.updatedAt)}` : ""}`
                  : data.opening.source === "prima-nota"
                    ? "Prima Nota · saldo registrato fino a oggi"
                    : "Collega un conto o completa la Prima Nota"
              }
            />
            <Metric
              icon={Wallet}
              label={`Minimo nei ${prefs.horizon} giorni`}
              value={money(projection.minimum)}
              detail={
                projection.minimumDate
                  ? `Il ${shortDate(projection.minimumDate)} · saldo a fine giornata`
                  : "Serve un saldo di partenza"
              }
              danger={!!projection.need}
            />
            <Metric
              icon={ShieldCheck}
              label="Fabbisogno sopra soglia"
              value={money(projection.need)}
              detail={`Per mantenere almeno ${money(prefs.threshold)}`}
              danger={!!projection.need}
            />
            <Metric
              icon={CalendarDays}
              label="Incassi da confermare"
              value={money(pendingIncome.reduce((s, m) => s + m.cents, 0))}
              detail={`${pendingIncome.length} ${pendingIncome.length === 1 ? "movimento scaduto o senza data" : "movimenti scaduti o senza data"}`}
            />
          </div>
          <div
            className={cn(
              "flex flex-col justify-between gap-4 rounded-2xl p-5 sm:flex-row sm:items-center",
              projection.need
                ? "bg-rose-50 text-rose-950 dark:bg-rose-950/40 dark:text-rose-100"
                : "bg-slate-900 text-white dark:bg-slate-800",
            )}
          >
            <div>
              <p className="text-xs font-medium opacity-70">
                {incomplete
                  ? "Piano parziale"
                  : prefs.delay
                    ? `Simulazione · incassi in ritardo di ${prefs.delay} giorni`
                    : "Piano delle scadenze"}
              </p>
              <h2 className="mt-1 text-lg font-semibold tracking-tight">
                {data.opening.cents == null
                  ? "Completa il saldo per conoscere la cassa futura"
                  : projection.firstBelow
                    ? `Sotto la soglia dal ${shortDate(projection.firstBelow)}`
                    : "La cassa prevista resta sopra la soglia"}
              </h2>
              <p className="mt-1 text-sm opacity-80">
                {data.opening.cents == null
                  ? "Entrate e uscite sono consultabili. Il saldo non viene sostituito con uno zero."
                  : `A fine periodo: ${money(projection.finalBalance)} · flusso del periodo: ${money(projection.net)}.`}
              </p>
              {data.opening.cents != null && (incomplete || bankNote) && (
                <p className="mt-1 text-xs opacity-70">
                  {incomplete
                    ? `Verifica prima di decidere: mancano ${data.issues.join(", ")}.`
                    : bankNote}
                </p>
              )}
            </div>
            <Button
              variant="secondary"
              className="h-10 w-fit shrink-0 rounded-xl"
              onClick={() => openMovements("piano")}
            >
              Esamina i movimenti
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
          <section className={cn(panel, "overflow-hidden")}>
            <div className="flex flex-wrap items-start justify-between gap-3 p-5">
              <div>
                <h2 className="font-semibold">Andamento della cassa</h2>
                <p className="mt-1 text-xs text-slate-500">
                  Dal {fullDate(data.today)} al{" "}
                  {fullDate(moveDay(data.today, prefs.horizon - 1))}. Stesso
                  piano per grafico, totali ed esportazione.
                </p>
              </div>
              <div className="flex rounded-lg bg-slate-100 p-1 dark:bg-slate-900 print:hidden">
                {["giorni", "settimane"].map((view) => (
                  <button
                    key={view}
                    onClick={() => setChartView(view)}
                    aria-pressed={chartView === view}
                    className={cn(
                      "min-h-9 rounded-md px-3 text-xs capitalize",
                      chartView === view &&
                        "bg-white font-semibold shadow-sm dark:bg-slate-800",
                    )}
                  >
                    {view}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 border-y border-slate-100 px-5 py-3 text-sm dark:border-slate-800">
              <p className="text-slate-500">
                Entrate nel piano{" "}
                <strong className="ml-2 block text-emerald-600 sm:inline">
                  {money(projection.income)}
                </strong>
              </p>
              <p className="text-slate-500">
                Uscite nel piano{" "}
                <strong className="ml-2 block text-rose-600 sm:inline">
                  {money(projection.expense)}
                </strong>
              </p>
            </div>
            {chartView === "settimane" ? (
              <div className="forecast-view">
                <div className="divide-y divide-slate-100 px-4 dark:divide-slate-800 sm:hidden">
                  {weeks.map((w) => (
                    <button
                      key={w.start}
                      className={cn(
                        "forecast-week w-full rounded-lg py-4 text-left",
                        w.minimum != null &&
                          w.minimum < prefs.threshold &&
                          "text-rose-700 dark:text-rose-300",
                      )}
                      aria-label={`Apri settimana ${shortDate(w.start)}`}
                      onClick={() => {
                        setDetailControls(defaultControls);
                        setWeekRange({ start: w.start, end: w.end });
                        setMovementFilter("piano");
                        setTab("movimenti");
                      }}
                    >
                      <span className="flex items-center justify-between text-sm font-semibold">
                        {shortDate(w.start)} – {shortDate(w.end)}
                        <ArrowRight className="h-4 w-4" aria-hidden />
                      </span>
                      <span className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                        <span className="text-slate-500">
                          Entrate{" "}
                          <strong className="mt-1 block font-medium tabular-nums text-emerald-600">
                            {money(w.income)}
                          </strong>
                        </span>
                        <span className="text-slate-500">
                          Uscite{" "}
                          <strong className="mt-1 block font-medium tabular-nums text-rose-600">
                            {money(w.expense)}
                          </strong>
                        </span>
                        <span>
                          Minimo giornaliero{" "}
                          <strong className="mt-1 block font-semibold tabular-nums">
                            {money(w.minimum)}
                          </strong>
                        </span>
                        <span className="text-slate-500">
                          Saldo finale{" "}
                          <strong className="mt-1 block font-medium tabular-nums text-slate-900 dark:text-slate-100">
                            {money(w.balance)}
                          </strong>
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
                <div className="hidden overflow-x-auto p-5 sm:block">
                  <table className="w-full min-w-[670px] text-sm">
                    <caption className="sr-only">
                      Piano settimanale con minimo giornaliero e saldo finale
                    </caption>
                    <thead>
                      <tr className="border-b text-left text-xs text-slate-500">
                        {[
                          "Periodo",
                          "Entrate",
                          "Uscite",
                          "Minimo giornaliero",
                          "Saldo finale",
                        ].map((label, i) => (
                          <th
                            key={label}
                            className={cn(
                              "pb-3 font-medium",
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
                      {weeks.map((w) => (
                        <tr
                          key={w.start}
                          className={cn(
                            "border-b border-slate-100 dark:border-slate-800",
                            w.minimum != null &&
                              w.minimum < prefs.threshold &&
                              "bg-rose-50/70 dark:bg-rose-950/20",
                          )}
                        >
                          <td className="py-3 pr-3 text-xs">
                            {shortDate(w.start)} – {shortDate(w.end)}
                          </td>
                          {[w.income, w.expense, w.minimum, w.balance].map(
                            (value, i) => (
                              <td
                                key={i}
                                className={cn(
                                  "py-3 text-right tabular-nums",
                                  i === 0 && "text-emerald-600",
                                  i === 1 && "text-rose-600",
                                  i === 2 && "font-medium",
                                )}
                              >
                                {money(value)}
                              </td>
                            ),
                          )}
                          <td className="pl-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Apri movimenti ${shortDate(w.start)}`}
                              onClick={() => {
                                setDetailControls(defaultControls);
                                setWeekRange({ start: w.start, end: w.end });
                                setMovementFilter("piano");
                                setTab("movimenti");
                              }}
                            >
                              <ArrowRight className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : data.opening.cents == null ? (
              <div className="flex min-h-[260px] flex-col items-center justify-center gap-3 p-6 text-center">
                <Landmark className="h-7 w-7 text-slate-400" />
                <p className="text-sm text-slate-500">
                  Il grafico del saldo richiede una disponibilità iniziale.
                </p>
                <Button asChild variant="outline">
                  <Link to="/azienda/tesoreria">Completa in Tesoreria</Link>
                </Button>
              </div>
            ) : (
              <div
                className="forecast-view h-[290px] w-full px-1 py-5 sm:px-4"
                aria-label="Grafico saldo giornaliero"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={projection.days}
                    margin={{ top: 12, right: 12, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 6"
                      vertical={false}
                      opacity={0.25}
                    />
                    <XAxis
                      dataKey="date"
                      tickFormatter={shortDate}
                      minTickGap={45}
                      tickLine={false}
                      axisLine={false}
                      fontSize={11}
                    />
                    <YAxis
                      width={67}
                      tickFormatter={(value) =>
                        new Intl.NumberFormat("it-IT", {
                          notation: "compact",
                          maximumFractionDigits: 1,
                        }).format(value / 100)
                      }
                      tickLine={false}
                      axisLine={false}
                      fontSize={11}
                    />
                    <Tooltip
                      labelFormatter={(value) => shortDate(String(value))}
                      formatter={(value: number) => [money(value), "Saldo"]}
                      contentStyle={{ borderRadius: 12, fontSize: 12 }}
                    />
                    <ReferenceLine
                      y={prefs.threshold}
                      stroke="#d97706"
                      strokeDasharray="5 5"
                      label={{
                        value: "Soglia",
                        position: "insideTopRight",
                        fill: "#b45309",
                        fontSize: 10,
                      }}
                    />
                    <ReferenceLine y={0} stroke="#94a3b8" />
                    <Area
                      type="stepAfter"
                      dataKey="balance"
                      stroke="#2563eb"
                      fill="#3b82f6"
                      fillOpacity={0.08}
                      strokeWidth={2.5}
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>
          <div className="grid gap-5 lg:grid-cols-[1fr_1.4fr]">
            <section className={cn(panel, "p-5")}>
              <h2 className="font-semibold">Da gestire</h2>
              <p className="mt-1 text-xs text-slate-500">
                Completa queste informazioni per affinare il piano.
              </p>
              <div className="mt-4 space-y-2">
                <ActionRow
                  title="Incassi scaduti"
                  detail={`${overdueCount} da verificare · esclusi finché non confermi l’ipotesi`}
                  onClick={() => openMovements("scaduti")}
                />
                <ActionRow
                  title="Uscite scadute non segnate pagate"
                  detail={`${projection.overdueExpense.length} · ${money(overdueExpenseTotal)} · fuori dal piano finché non le includi o le segni pagate`}
                  onClick={() => openMovements("uscite-scadute")}
                />
                <ActionRow
                  title="Possibili doppioni"
                  detail={`${projection.possibleDuplicates.length} fatture · ${money(duplicateTotal)} · collegale alla rata per contarle una volta sola`}
                  onClick={() => openMovements("doppioni")}
                />
                <ActionRow
                  title="Movimenti senza data"
                  detail={`${projection.undated.length} fuori piano · ${money(undatedExpense)} di uscite`}
                  onClick={() => openMovements("senza-data")}
                />
                <ActionRow
                  title="Stime incluse"
                  detail={`${projection.included.filter((m) => m.estimated).length} movimenti · verifica importi e scadenze`}
                  onClick={() => openMovements("stime")}
                />
              </div>
            </section>
            <section className={cn(panel, "p-5")}>
              <h2 className="font-semibold">Se gli incassi ritardano</h2>
              <p className="mt-1 text-xs text-slate-500">
                Le uscite restano alle loro scadenze. Confronta il minimo di
                cassa.
              </p>
              <div className="mt-4 grid grid-cols-3 gap-2">
                {scenarios.map(({ delay, plan }) => (
                  <button
                    key={delay}
                    aria-label={
                      delay
                        ? `Simula ritardo di ${delay} giorni`
                        : "Usa scadenze programmate"
                    }
                    aria-pressed={prefs.delay === delay}
                    onClick={() => updatePrefs({ delay })}
                    className={cn(
                      "forecast-scenario rounded-xl border p-3 text-left transition-colors",
                      prefs.delay === delay
                        ? "border-blue-400 bg-blue-50 dark:bg-blue-950/30"
                        : "border-slate-200 hover:border-slate-400 dark:border-slate-800",
                    )}
                  >
                    <span className="text-[11px] text-slate-500">
                      {delay ? `+${delay} giorni` : "Puntuali"}
                    </span>
                    <p
                      className={cn(
                        "mt-2 break-words text-sm font-semibold tabular-nums sm:text-base",
                        plan.need && "text-rose-600",
                      )}
                    >
                      {money(plan.minimum)}
                    </p>
                    <span className="mt-1 block text-[10px] text-slate-500">
                      {plan.minimumDate
                        ? shortDate(plan.minimumDate)
                        : "Saldo da completare"}
                    </span>
                  </button>
                ))}
              </div>
              <div className="mt-4 space-y-3 border-t border-slate-100 pt-4 text-xs dark:border-slate-800">
                <label className="flex min-h-10 cursor-pointer items-center gap-3 leading-relaxed">
                  <input
                    type="checkbox"
                    checked={prefs.estimates}
                    onChange={(e) =>
                      updatePrefs({ estimates: e.target.checked })
                    }
                    className="h-4 w-4 accent-blue-600"
                  />
                  Includi stime di stipendi, acquisti e costi ricorrenti
                </label>
                <label className="flex min-h-10 cursor-pointer items-center gap-3 leading-relaxed">
                  <input
                    type="checkbox"
                    checked={prefs.overdue}
                    onChange={(e) => updatePrefs({ overdue: e.target.checked })}
                    className="h-4 w-4 accent-blue-600"
                  />
                  Ipotizza l’incasso degli scaduti da oggi
                </label>
                <label className="flex min-h-10 cursor-pointer items-center gap-3 leading-relaxed">
                  <input
                    type="checkbox"
                    checked={prefs.overdueExpense}
                    onChange={(e) =>
                      updatePrefs({ overdueExpense: e.target.checked })
                    }
                    className="h-4 w-4 accent-blue-600"
                  />
                  Includi le uscite scadute da oggi
                </label>
              </div>
            </section>
          </div>
          <details className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900">
            <summary className="cursor-pointer font-medium">
              Fonti e ipotesi del piano
            </summary>
            <div className="mt-3 space-y-2 leading-relaxed">
              <p>
                Importi di cassa: IVA inclusa ove prevista, residui non saldati,
                ritenuta applicata alle commesse bonus secondo la configurazione
                del gestionale. Uscite e incassi scaduti restano fuori dal piano
                (spesso sono già pagati ma non segnati) ed entrano oggi solo con
                l’ipotesi esplicita. Le fatture di una commessa non collegate a
                una rata restano fuori come possibili doppioni. I
                movimenti senza data restano esclusi e dichiarati.
              </p>
              <p>
                La soglia e gli scenari sono preferenze su questo dispositivo.
                Non modificano scadenze o pagamenti registrati.
              </p>
              {data.warnings.map((w) => (
                <p key={w}>{w}</p>
              ))}
              <p>
                Imposte future non registrate non vengono inventate. Il minimo è
                a fine giornata: non rappresenta l’ordine dei bonifici nella
                stessa giornata.
              </p>
              <p>
                Ultimo caricamento:{" "}
                {new Date(data.updatedAt).toLocaleString("it-IT")}.
              </p>
            </div>
          </details>
        </TabsContent>
        <TabsContent value="movimenti" className="mt-0 space-y-4">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-lg font-semibold">
                Movimenti da pianificare
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                I filtri cambiano il dettaglio. Saldo e grafico rappresentano
                l’intero piano.
              </p>
            </div>
            <select
              aria-label="Movimenti da mostrare"
              className="h-10 rounded-xl border bg-background px-3 text-sm"
              value={movementFilter}
              onChange={(e) => {
                setDetailControls(defaultControls);
                setMovementFilter(e.target.value);
                setWeekRange(null);
              }}
            >
              <option value="piano">Nel piano selezionato</option>
              <option value="scaduti">Incassi scaduti</option>
              <option value="uscite-scadute">Uscite scadute</option>
              <option value="doppioni">Possibili doppioni</option>
              <option value="senza-data">Senza data</option>
              <option value="stime">Stime</option>
              <option value="tutti">Tutti i movimenti aperti</option>
            </select>
          </div>
          {weekRange && (
            <p className="flex items-center gap-2 text-sm">
              Periodo {shortDate(weekRange.start)} – {shortDate(weekRange.end)}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setWeekRange(null)}
              >
                Rimuovi filtro settimana
              </Button>
            </p>
          )}
          <MovementList
            rows={detailMovements}
            today={data.today}
            controls={detailControls}
            onControlsChange={setDetailControls}
          />
        </TabsContent>
        <TabsContent value="incassato" className="mt-0 space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Entrate registrate</h2>
            <p className="mt-1 text-sm text-slate-500">
              Ultimi 12 mesi · Prima Nota e incassi collegati, senza ripetere lo
              stesso pagamento.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Metric
              icon={Wallet}
              label="Incassato nel mese"
              value={money(
                collected
                  .filter((m) => m.date?.slice(0, 7) === data.today.slice(0, 7))
                  .reduce((sum, m) => sum + m.cents, 0),
              )}
              detail="Importi registrati dalle fonti collegate"
            />
            <Metric
              icon={CalendarDays}
              label="Ritardo medio osservato"
              value={
                meanDelay == null ? "Non disponibile" : `${meanDelay} giorni`
              }
              detail={`${comparable.length} incassi con scadenza collegata · ultimi 12 mesi`}
            />
          </div>
          <MovementList
            rows={collected}
            today={data.today}
            controls={collectedControls}
            onControlsChange={setCollectedControls}
            collected
          />
        </TabsContent>
        <TabsContent value="marginalita" className="mt-0">
          <div className="mb-4 flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-500 dark:bg-slate-900">
            <Info className="h-4 w-4 shrink-0" />
            <p>
              La marginalità misura ricavi e costi delle commesse. La cassa
              dipende anche da quando incassi e paghi.
            </p>
          </div>
          <Suspense fallback={<Skeleton className="h-80 w-full" />}>
            <MarginTab />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}
function MovementList({
  rows,
  today,
  collected = false,
  controls,
  onControlsChange,
}: {
  rows: ForecastMovement[];
  today: string;
  collected?: boolean;
  controls: MovementControls;
  onControlsChange: (controls: MovementControls) => void;
}) {
  const { search, direction, page } = controls;
  const filtered = rows.filter(
    (m) =>
      (direction === "all" || m.direction === direction) &&
      `${m.description} ${m.counterparty} ${m.source} ${FORECAST_CATEGORIES[m.category]}`
        .toLocaleLowerCase("it-IT")
        .includes(search.toLocaleLowerCase("it-IT")),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / 25));
  const currentPage = Math.min(page, pages);
  const visible = filtered.slice((currentPage - 1) * 25, currentPage * 25);
  const income = filtered
    .filter((m) => m.direction === "in")
    .reduce((s, m) => s + m.cents, 0);
  const expenses = filtered
    .filter((m) => m.direction === "out")
    .reduce((s, m) => s + m.cents, 0);
  const status = (m: ForecastMovement) =>
    collected
      ? "Registrato"
      : !m.date
        ? "Senza data"
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
  return (
    <div className={cn(panel, "overflow-hidden")}>
      <div className="flex flex-col gap-3 border-b border-slate-100 p-4 dark:border-slate-800 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
          <Input
            aria-label="Cerca nei movimenti"
            placeholder="Cerca descrizione, cliente o fonte"
            value={search}
            onChange={(e) => {
              onControlsChange({
                ...controls,
                search: e.target.value,
                page: 1,
              });
            }}
            className="h-10 rounded-xl pl-9"
          />
        </div>
        {!collected && (
          <select
            aria-label="Direzione movimenti"
            className="h-10 rounded-xl border bg-background px-3 text-sm"
            value={direction}
            onChange={(e) => {
              onControlsChange({
                ...controls,
                direction: e.target.value,
                page: 1,
              });
            }}
          >
            <option value="all">Entrate e uscite</option>
            <option value="in">Solo entrate</option>
            <option value="out">Solo uscite</option>
          </select>
        )}
        <Button
          variant="outline"
          onClick={exportView}
          disabled={!filtered.length}
          className="h-10 rounded-xl"
          title="Esporta tutti i movimenti che corrispondono ai filtri, anche nelle altre pagine"
        >
          <Download className="mr-2 h-4 w-4" aria-hidden />
          Esporta vista
        </Button>
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1 px-4 py-3 text-xs text-slate-500">
        <span>{filtered.length} movimenti</span>
        <span>
          Entrate: <strong className="text-emerald-600">{money(income)}</strong>
        </span>
        {!collected && (
          <span>
            Uscite: <strong className="text-rose-600">{money(expenses)}</strong>
          </span>
        )}
      </div>
      {!visible.length ? (
        <div className="flex min-h-48 flex-col items-center justify-center gap-2 p-5 text-center">
          <Check className="h-6 w-6 text-slate-400" />
          <p className="text-sm font-medium">
            Nessun movimento in questa vista
          </p>
          <p className="text-xs text-slate-500">
            Prova un altro filtro o completa i documenti di origine.
          </p>
        </div>
      ) : (
        <>
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full text-sm">
              <thead className="border-y border-slate-100 bg-slate-50 text-left text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900">
                <tr>
                  {["Data", "Movimento", "Fonte e stato", "Importo"].map(
                    (label, i) => (
                      <th
                        key={label}
                        className={cn(
                          "p-3 font-medium",
                          i === 3 && "text-right",
                        )}
                      >
                        {label}
                      </th>
                    ),
                  )}
                  <th>
                    <span className="sr-only">Apri fonte</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((m) => (
                  <tr
                    key={m.id}
                    className="forecast-movement border-b border-slate-100 dark:border-slate-800"
                  >
                    <td className="whitespace-nowrap p-3 text-xs">
                      {shortDate(m.date)}
                      {collected && m.expectedDate && (
                        <p className="mt-1 text-[10px] text-slate-500">
                          Atteso {fullDate(m.expectedDate)}
                        </p>
                      )}
                    </td>
                    <td className="p-3">
                      <p className="font-medium">{m.description}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {m.counterparty || FORECAST_CATEGORIES[m.category]}
                      </p>
                      {m.note && (
                        <p className="mt-1 max-w-sm text-[11px] text-slate-500">
                          {m.note}
                        </p>
                      )}
                    </td>
                    <td className="p-3 text-xs">
                      <p>{m.source}</p>
                      <span className="mt-1 inline-block rounded-md bg-slate-100 px-2 py-1 text-[10px] text-slate-500 dark:bg-slate-800">
                        {status(m)}
                      </span>
                    </td>
                    <td
                      className={cn(
                        "whitespace-nowrap p-3 text-right font-medium tabular-nums",
                        m.direction === "in"
                          ? "text-emerald-600"
                          : "text-rose-600",
                      )}
                    >
                      {m.direction === "in" ? "+" : "−"}
                      {money(m.cents)}
                    </td>
                    <td className="pr-3">
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
          <div className="divide-y divide-slate-100 dark:divide-slate-800 sm:hidden">
            {visible.map((m) => (
              <Link
                key={m.id}
                to={m.href}
                className="forecast-movement block p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-words text-sm font-medium">
                      {m.description}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {m.counterparty || FORECAST_CATEGORIES[m.category]}
                    </p>
                  </div>
                  <p
                    className={cn(
                      "shrink-0 text-sm font-semibold tabular-nums",
                      m.direction === "in"
                        ? "text-emerald-600"
                        : "text-rose-600",
                    )}
                  >
                    {m.direction === "in" ? "+" : "−"}
                    {money(m.cents)}
                  </p>
                </div>
                <p className="mt-3 text-[11px] text-slate-500">
                  {shortDate(m.date)} · {m.source} · {status(m)}
                </p>
                {collected && m.expectedDate && (
                  <p className="mt-1 text-[11px] text-slate-500">
                    Atteso {fullDate(m.expectedDate)}
                  </p>
                )}
                {m.note && (
                  <p className="mt-1 text-[11px] text-slate-500">{m.note}</p>
                )}
              </Link>
            ))}
          </div>
        </>
      )}
      <div className="flex items-center justify-between border-t border-slate-100 p-3 text-xs text-slate-500 dark:border-slate-800">
        <span>
          Pagina {currentPage} di {pages}
        </span>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Pagina precedente"
            disabled={currentPage <= 1}
            onClick={() =>
              onControlsChange({ ...controls, page: currentPage - 1 })
            }
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Pagina successiva"
            disabled={currentPage >= pages}
            onClick={() =>
              onControlsChange({ ...controls, page: currentPage + 1 })
            }
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
