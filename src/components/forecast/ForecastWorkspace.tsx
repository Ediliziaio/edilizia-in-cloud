import { BOTTONE_SECONDARIO } from "@/components/orders/TestataScheda";
import { UniformSelect } from "@/components/ui/uniform-select";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { RiquadroNumero } from "@/components/dashboard/RiquadroNumero";
import { ForecastCashChart } from "./ForecastCashChart";
import { Ciambella } from "@/components/charts/grafici/Ciambella";
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
import { incassiScaduti } from "@/lib/finance/incassiScaduti";
import { cn } from "@/lib/utils";
import {
  compareForecastScenarios,
  forecastRisk,
  movementTotals,
} from "@/lib/finance/forecastInsights";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

// ─── Formati ────────────────────────────────────────────────────────────────────────────────
const money = (cents: number | null): string =>
  cents == null ? "Non disponibile" : formatCurrency(cents / 100);
const shortDate = (date: string | null): string =>
  date
    ? calendarDate(date).toLocaleDateString(intlCampo(), {
        day: "numeric",
        month: "short",
      })
    : "Da definire";
const fullDate = (date: string): string =>
  calendarDate(date).toLocaleDateString(intlCampo(), {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
const sum = (rows: ForecastMovement[]) =>
  rows.reduce((total, m) => total + m.cents, 0);
const section = "rounded-xl border bg-card text-card-foreground";
const selectClass = "h-8 min-w-0 rounded-md border bg-background px-2 text-xs";
const filtroEtichetta =
  "text-[11px] font-medium uppercase tracking-wide text-muted-foreground";

// ─── Filtri comuni, nell'URL ────────────────────────────────────────────────────────────────
const TABS = [
  ["panoramica", "Panoramica"],
  ["scenari", "Scenari"],
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
  vatEstimates: boolean;
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
    if (
      own != null &&
      Number.isSafeInteger(Number(own)) &&
      Number(own) >= 0 &&
      Number(own) <= 100000000000
    )
      return Number(own);
    // Le preferenze della versione precedente della pagina tenevano anche la soglia.
    const old = JSON.parse(
      localStorage.getItem(`forecast-preferences-v1:${companyId}`) || "null",
    );
    if (
      Number.isSafeInteger(old?.threshold) &&
      old.threshold >= 0 &&
      old.threshold <= 100000000000
    )
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
      soglia != null &&
      soglia !== "" &&
      Number.isFinite(Number(soglia)) &&
      Number(soglia) >= 0 &&
      Number(soglia) <= 1000000000
        ? Math.round(Number(soglia) * 100)
        : storedThreshold(companyId),
    scenario: ["reale", "15", "30"].includes(scenario ?? "")
      ? (scenario as ScenarioKey)
      : "puntuali",
    estimates: params.get("stime") !== "0",
    vatEstimates: params.get("iva-stimata") === "1",
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
  const t = useT();
  if (!issues.length) return null;
  return (
    <div
      role="alert"
      className="flex flex-col gap-2 rounded-lg border border-warning/50 bg-warning/10 p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
    >
      <p>
        <strong>{t("Previsione incompleta.")}</strong>{" "}
        {t("Non si sono caricate: {issues}. I numeri riguardano solo i dati letti.", { issues: issues.join(", ") })}
      </p>
      <Button
        size="sm"
        variant="outline"
        onClick={onRefresh}
        disabled={refreshing}
        className="shrink-0"
      >
        {t("Riprova il caricamento")}
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
  const t = useT();
  // Interruttore a pillola: acceso = pieno, spento = solo bordo.
  return (
    <button
      type="button"
      aria-pressed={checked}
      aria-label={
        typeof children === "string"
          ? t("Includi {children}", { children: children.toLowerCase() })
          : undefined
      }
      onClick={() => onChange(!checked)}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-xs transition-colors",
        checked
          ? "border-primary bg-primary/10 font-medium text-primary"
          : "bg-background text-muted-foreground hover:text-foreground",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          checked ? "bg-primary" : "bg-muted-foreground/40",
        )}
      />
      {children}
    </button>
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
  const tr = useT();
  const dentroTesoreria = useLocation().pathname.includes("/tesoreria");
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
  const [advanced, setAdvanced] = useState(
    () =>
      !!(
        f.order ||
        f.category ||
        f.source ||
        f.overdueIn ||
        f.overdueOut ||
        f.vatEstimates
      ),
  );
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
      includeVatEstimates: f.vatEstimates,
      includeOverdueIncome: f.overdueIn,
      includeOverdueExpense: f.overdueOut,
      dateOverrides: overrides,
    }),
    [
      delayDays,
      f.estimates,
      f.vatEstimates,
      f.overdueIn,
      f.overdueOut,
      overrides,
    ],
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
  // 14/11/2026: le uscite del periodo per categoria, per la ciambella sotto il grafico.
  const usciteCategoria = useMemo(() => {
    const somme = new Map<ForecastCategory, number>();
    for (const d of projection.days)
      for (const m of d.movements)
        if (m.direction === "out") somme.set(m.category, (somme.get(m.category) ?? 0) + Math.abs(m.cents));
    return [...somme].sort((a, b) => b[1] - a[1]);
  }, [projection]);
  const risk = useMemo(
    () => forecastRisk(projection, f.threshold),
    [projection, f.threshold],
  );
  const comparisons = useMemo(
    () =>
      compareForecastScenarios({
        movements,
        opening: data.opening.cents,
        today: data.today,
        horizon: f.horizon,
        threshold: f.threshold,
        scenario,
        realDelay: delay.days,
      }),
    [
      movements,
      data.opening.cents,
      data.today,
      f.horizon,
      f.threshold,
      scenario,
      delay.days,
    ],
  );
  const withoutEstimates = useMemo(
    () =>
      projectForecast(
        movements,
        data.opening.cents,
        data.today,
        f.horizon,
        f.threshold,
        { ...scenario, includeEstimates: false },
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
  // Gli incassi scaduti con la regola comune (incassiScaduti): il Cruscotto Economico legge
  // lo stesso numero dalla stessa funzione.
  const [overdueIncome, overdueExpense] = useMemo(() => [
    incassiScaduti(movements, data.today),
    movements.filter(
      (m) =>
        m.direction === "out" &&
        !m.possibleDuplicate &&
        !!m.date &&
        m.date < data.today,
    ),
  ], [movements, data.today]);
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
    ? tr("Il saldo bancario è aggiornato al {data}: sincronizza i conti in Tesoreria.", { data: shortDate(data.opening.updatedAt) })
    : undatedAccounts
      ? undatedAccounts === 1
        ? tr("Un conto non ha la data di aggiornamento del saldo: verificalo in Tesoreria.")
        : tr("{n} conti non hanno la data di aggiornamento del saldo: verificalo in Tesoreria.", { n: undatedAccounts })
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
        : `Fonti caricate; ${projection.undated.length} senza data; ${projection.possibleDuplicates.length} possibili doppioni; ${projection.included.filter((m) => m.estimated).length} stime incluse`,
      iva_stimata:
        f.estimates && f.vatEstimates ? "Inclusa, preliminare" : "Esclusa",
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
      iva_stimata: "Ipotesi IVA",
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
            withoutEstimates:
              withoutEstimates.days.find((v) => v.date === d.date)?.balance ??
              null,
          }))
        : weeks.map((w) => ({
            start: w.start,
            end: w.end,
            label: shortDate(w.start),
            income: w.income,
            expense: -w.expense,
            balance: w.balance,
            withoutEstimates:
              withoutEstimates.days.find((v) => v.date === w.end)?.balance ??
              null,
          })),
    [granularity, projection.days, weeks, withoutEstimates.days],
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
      title: tr("Incassi scaduti"),
      rows: overdueIncome,
      hint: f.overdueIn
        ? tr("Inclusi nel piano da oggi (interruttore attivo).")
        : tr("Fuori dal piano finché non li includi: sollecita il cliente o segna l’incasso."),
      fix: { to: "/azienda/scadenzario", label: tr("Apri Scadenzario") },
    },
    {
      key: "uscite-scadute",
      title: tr("Uscite scadute non segnate pagate"),
      rows: overdueExpense,
      hint: f.overdueOut
        ? tr("Incluse nel piano da oggi (interruttore attivo).")
        : tr("Fuori dal piano: se le hai già pagate segnale pagate, altrimenti includile."),
      fix: { to: "/azienda/costi", label: tr("Apri Spese") },
    },
    {
      key: "senza-data",
      title: tr("Movimenti senza data"),
      rows: projection.undated,
      hint: tr("Non entrano nel saldo: aggiungi la scadenza nel documento di origine."),
      fix: null,
    },
    {
      key: "stime",
      title: tr("Stime incluse"),
      rows: estimatesIncluded,
      hint: tr("Stipendi, ricorrenze, ODA, IVA: verifica importi e date."),
      fix: null,
    },
    {
      key: "doppioni",
      title: tr("Possibili doppioni"),
      rows: projection.possibleDuplicates,
      hint: tr("Fatture di commessa non collegate a una rata: collegale per contarle una volta sola."),
      fix: { to: "/azienda/ordini", label: tr("Apri Commesse") },
    },
  ];

  return (
    <div className="space-y-4 pb-8" data-testid="forecast-workspace">
      <header className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          {/* Dentro Tesoreria il titolo c'è già nella sua testata: due titoli
              uno sotto l'altro dicevano la stessa cosa. */}
          {!dentroTesoreria && <h1 className="text-lg font-bold leading-6 sm:text-xl">{tr("Previsionale di cassa")}</h1>}
          {/* Da computer niente frase sotto il titolo (standard delle testate, 25/11/2026):
              resta per i lettori di schermo, che sentono anche «Caricamento…». */}
          <p
            className="mt-0.5 text-xs text-muted-foreground sm:sr-only"
            role="status"
            aria-live="polite"
          >
            {refreshing
              ? tr("Caricamento dei dati in corso…")
              : tr("La cassa che avrai, dal {today}. Dati caricati alle {valore}.", { today: String(fullDate(data.today) ?? ""), valore: new Date(data.updatedAt).toLocaleTimeString(intlCampo(), { hour: "2-digit", minute: "2-digit" }) })}
          </p>
        </div>
        <div className="flex gap-2 print:hidden">
          <Button
            variant="outline"
            size="sm"
            className={BOTTONE_SECONDARIO}
            onClick={onRefresh}
            disabled={refreshing}
          >
            <RefreshCw
              className={cn(refreshing && "animate-spin")}
            />
            {refreshing ? tr("Aggiornamento") : tr("Aggiorna")}
          </Button>
          {/* Esportare è un comando secondario: contorno come gli altri, non blu pieno (25/11/2026). */}
          <Button size="sm" variant="outline" onClick={exportPlan} className={cn(BOTTONE_SECONDARIO, "max-md:hidden")}>
            <Download />
            {tr("Esporta piano")}
          </Button>
        </div>
      </header>

      {/* Barra filtri comune a tutte le schede: sopra le ipotesi del piano,
          sotto cosa entra e quali movimenti guardare. */}
      <div
        role="group"
        aria-label={tr("Filtri del previsionale")}
        className={cn(section, "divide-y print:hidden")}
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2 2xl:gap-x-5">
          <div className="flex items-center gap-2">
            <span className={filtroEtichetta}>{tr("Orizzonte")}</span>
            <div
              className="flex rounded-md bg-muted p-0.5"
              role="group"
              aria-label={tr("Orizzonte previsione")}
            >
              {HORIZONS.map((days) => (
                <button
                  key={days}
                  aria-pressed={f.horizon === days}
                  onClick={() =>
                    setFilter({ giorni: days === 90 ? null : String(days) })
                  }
                  className={cn(
                    "min-h-7 rounded px-2 text-xs tabular-nums",
                    f.horizon === days &&
                      "bg-background font-semibold shadow-sm",
                  )}
                >{tr("{days} giorni", { days: String(days ?? "") })}</button>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 max-md:hidden">
            <span className={filtroEtichetta}>{tr("Incassi")}</span>
            <UniformSelect
              aria-label={tr("Scenario incassi")}
              className={cn(selectClass, "w-40 2xl:w-52")}
              value={f.scenario}
              onChange={(e) =>
                setFilter({
                  scenario:
                    e.target.value === "puntuali" ? null : e.target.value,
                })
              }
            >
              <option value="puntuali">{tr("Incassi puntuali")}</option>
              <option value="reale" disabled={delay.days == null}>
                {delay.days == null
                  ? tr("Ritardo medio reale (non disponibile)")
                  : tr("Ritardo medio reale ({days} giorni)", { days: String(delay.days ?? "") })}
              </option>
              <option value="15">{tr("Incassi +15 giorni")}</option>
              <option value="30">{tr("Incassi +30 giorni")}</option>
            </UniformSelect>
          </label>
          <label className="flex items-center gap-2 max-md:hidden">
            <span className={filtroEtichetta}>{tr("Soglia di sicurezza")}</span>
            <div className="relative">
              <Input
                aria-label={tr("Soglia di sicurezza in euro")}
                type="number"
                min="0"
                step="100"
                value={f.threshold / 100}
                max="1000000000"
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (Number.isFinite(n) && n >= 0 && n <= 1000000000)
                    setThreshold(Math.round(n * 100));
                }}
                className="h-8 w-24 pr-7 text-right text-xs tabular-nums"
              />
              <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                €
              </span>
            </div>
          </label>
          <Button
            variant="outline"
            size="sm"
            aria-expanded={advanced}
            aria-controls="forecast-advanced"
            onClick={() => setAdvanced((v) => !v)}
            className={cn(BOTTONE_SECONDARIO, "max-md:hidden")}
          >
            {tr("Filtri avanzati")}
            {filtered
              ? tr(" · {n} attivi", { n: [f.order, f.category, f.source].filter(Boolean).length })
              : ""}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={resetFilters}
            className={cn(BOTTONE_SECONDARIO, "ml-auto text-muted-foreground max-md:hidden")}
          >
            <RotateCcw aria-hidden />
            <span className="max-2xl:sr-only">{tr("Azzera filtri")}</span>
          </Button>
        </div>
        <div id="forecast-advanced" hidden={!advanced}>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 p-3">
            <div
              className="flex flex-wrap items-center gap-1.5"
              role="group"
              aria-label={tr("Cosa includere")}
            >
              <span className={cn(filtroEtichetta, "mr-1")}>{tr("Includi")}</span>
              <Toggle
                checked={f.estimates}
                onChange={(v) => setFilter({ stime: v ? null : "0" })}
              >
                {tr("Stime")}
              </Toggle>
              <Toggle
                checked={f.overdueIn}
                onChange={(v) =>
                  setFilter({ "incassi-scaduti": v ? "1" : null })
                }
              >
                {tr("Incassi scaduti")}
              </Toggle>
              <Toggle
                checked={f.overdueOut}
                onChange={(v) =>
                  setFilter({ "uscite-scadute": v ? "1" : null })
                }
              >
                {tr("Uscite scadute")}
              </Toggle>
              <Toggle
                checked={f.vatEstimates}
                onChange={(v) => setFilter({ "iva-stimata": v ? "1" : null })}
              >
                {tr("Stima IVA preliminare")}
              </Toggle>
            </div>
            <div
              className="flex flex-wrap items-center gap-1.5"
              role="group"
              aria-label={tr("Filtra i movimenti")}
            >
              <span className={cn(filtroEtichetta, "mr-1")}>{tr("Filtra")}</span>
              <UniformSelect
                aria-label={tr("Commessa")}
                className={cn(selectClass, "w-44")}
                value={f.order}
                onChange={(e) => setFilter({ commessa: e.target.value })}
              >
                <option value="">{tr("Tutte le commesse")}</option>
                {orders.map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </UniformSelect>
              <UniformSelect
                aria-label={tr("Categoria")}
                className={cn(selectClass, "w-40")}
                value={f.category}
                onChange={(e) => setFilter({ categoria: e.target.value })}
              >
                <option value="">{tr("Tutte le categorie")}</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {FORECAST_CATEGORIES[c]}
                  </option>
                ))}
              </UniformSelect>
              <UniformSelect
                aria-label={tr("Fonte")}
                className={cn(selectClass, "w-36")}
                value={f.source}
                onChange={(e) => setFilter({ fonte: e.target.value })}
              >
                <option value="">{tr("Tutte le fonti")}</option>
                {sources.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </UniformSelect>
            </div>
            <p className="basis-full text-xs text-muted-foreground">
              {tr("La stima IVA è esclusa per impostazione iniziale; per includerla devono essere attive anche le stime. Non è una liquidazione fiscale. Spostamenti e filtri cambiano solo questa simulazione.")}
            </p>
          </div>
        </div>
      </div>
      {filtered && (
        <p className="text-xs text-muted-foreground">
          {tr("Vista filtrata: il saldo parte dalla disponibilità di tutta l’azienda e somma solo i movimenti scelti.")}
        </p>
      )}
      {(bankNote || data.opening.warning) && (
        <p
          role="status"
          className="rounded-lg border border-warning/50 bg-warning/10 px-3 py-2 text-sm"
        >
          {data.opening.warning || bankNote}{" "}
          <Link className="font-semibold underline" to="/azienda/tesoreria">
            {tr("Apri Tesoreria")}
          </Link>
        </p>
      )}

      <aside
        aria-label={tr("Qualità della previsione")}
        className={cn(
          // Da telefono resta l'avviso, senza il conto delle fonti.
          "rounded-xl border px-4 py-3 max-md:[&>*:not(:first-child)]:hidden",
          incomplete ||
            data.opening.cents === null ||
            projection.undated.length ||
            projection.possibleDuplicates.length
            ? "border-amber-200 bg-amber-50/50 dark:border-amber-500/30 dark:bg-amber-500/10"
            : "border-blue-200 bg-blue-50/30 dark:border-blue-500/30 dark:bg-blue-500/10",
        )}
      >
        <div className="flex flex-wrap items-center gap-2">
          <div className="mr-1">
            <h2 className="text-sm font-semibold">
              {incomplete ||
              data.opening.cents === null ||
              projection.undated.length ||
              projection.possibleDuplicates.length
                ? tr("Previsione da verificare")
                : tr("Fonti caricate · verifica le ipotesi")}
            </h2>
          </div>
          <Button
            variant="outline"
            size="sm"
            className={BOTTONE_SECONDARIO}
            disabled={!projection.undated.length}
            onClick={() => openMovements("senza-data")}
          >{tr("{n} senza data", { n: projection.undated.length })}</Button>
          <Button
            variant="outline"
            size="sm"
            className={BOTTONE_SECONDARIO}
            disabled={!projection.possibleDuplicates.length}
            onClick={() => openMovements("doppioni")}
          >{tr("{n} possibili doppioni", { n: projection.possibleDuplicates.length })}</Button>
          <Button
            variant="outline"
            size="sm"
            className={BOTTONE_SECONDARIO}
            disabled={!estimatesIncluded.length}
            onClick={() => openMovements("stime")}
          >{tr("{n} stime incluse", { n: estimatesIncluded.length })}</Button>
          {(!f.overdueIn || !f.overdueOut) && (
            <Button
              variant="ghost"
              size="sm"
              className={BOTTONE_SECONDARIO}
              onClick={() => setFilter({ scheda: "da-sistemare" })}
            >
              {tr("Scaduti esclusi: {n}", { n: (!f.overdueIn ? overdueIncome.length : 0) +
                (!f.overdueOut ? overdueExpense.length : 0) })}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className={cn(BOTTONE_SECONDARIO, "ml-auto")}
            onClick={() => setFilter({ scheda: "fonti" })}
          >
            {tr("Fonti e ipotesi")}
            {data.warnings.length ? ` · ${data.warnings.length}` : ""}
          </Button>
        </div>
        {!!projection.undated.length && (
          <p className="mt-2 text-xs">{tr("Senza data, fuori piano: entrate {in} · uscite {out}. Importi esposti separatamente, non compensati.", { in: String(money(movementTotals(projection.undated).in) ?? ""), out: String(money(movementTotals(projection.undated).out) ?? "") })}</p>
        )}
        {!!estimatesIncluded.length && (
          <p className="mt-1 text-xs text-muted-foreground">{tr("Stime nel piano: entrate {in} · uscite {out}.", { in: String(money(movementTotals(estimatesIncluded).in) ?? ""), out: String(money(movementTotals(estimatesIncluded).out) ?? "") })}</p>
        )}
        {f.scenario === "reale" && delay.days === null && (
          <p role="status" className="mt-1 text-xs text-amber-900">
            {tr("Storico insufficiente: il ritardo reale non è disponibile. Il grafico usa il piano puntuale, non un ritardo misurato di zero giorni.")}
          </p>
        )}
      </aside>

      <Tabs
        value={f.tab}
        onValueChange={(tab) =>
          setFilter({ scheda: tab === "panoramica" ? null : tab })
        }
      >
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0 print:hidden">
          <div className="flex flex-wrap items-start gap-2">
            <TabsList className="h-auto w-max justify-start">
              {TABS.filter(
                ([key]) => !["settimane", "incassato", "fonti"].includes(key),
              ).map(([value, label]) => (
                <TabsTrigger
                  key={value}
                  value={value}
                  className="min-h-8 px-3 text-xs"
                >
                  {tr(label)}
                  {value === "da-sistemare" &&
                    projection.undated.length +
                      projection.possibleDuplicates.length >
                      0 && (
                      <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 text-[10px] text-amber-900">
                        {projection.undated.length +
                          projection.possibleDuplicates.length}
                      </span>
                    )}
                </TabsTrigger>
              ))}
            </TabsList>
            <details
              open={["settimane", "incassato", "fonti"].includes(f.tab)}
              className="rounded-lg bg-muted/50 px-3 py-2"
            >
              <summary className="cursor-pointer text-sm">
                {tr("Dettagli e fonti")}
              </summary>
              <TabsList className="mt-2 h-auto flex-wrap">
                {TABS.filter(([key]) =>
                  ["settimane", "incassato", "fonti"].includes(key),
                ).map(([value, label]) => (
                  <TabsTrigger
                    key={value}
                    value={value}
                    className="min-h-8 text-xs"
                  >
                    {tr(label)}
                  </TabsTrigger>
                ))}
              </TabsList>
            </details>
          </div>
        </div>

        {/* ── Panoramica ── */}
        <TabsContent value="panoramica" className="mt-4 space-y-4">
          {issues}
          {/* 14/11/2026: i quattro numeri come nel Cruscotto, col colore dello
              stato (rosso se la cassa scende sotto la soglia). */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <RiquadroNumero
              etichetta={tr("Disponibilità oggi")}
              valore={money(data.opening.cents)}
              periodo={
                data.opening.source === "banca"
                  ? data.opening.updatedAt ? tr("Banca · al {data}", { data: shortDate(data.opening.updatedAt) }) : tr("Banca")
                  : data.opening.source === "prima-nota"
                    ? tr("Prima Nota · saldo fino a oggi")
                    : tr("Collega un conto o completa la Prima Nota")
              }
              tono={data.opening.cents == null ? "neutro" : data.opening.cents < 0 ? "male" : "neutro"}
              // 14/11/2026: il disponibile della banca può comprendere il fido; la Tesoreria
              // somma il saldo contabile. Se i due differiscono, si dice quanto.
              contesto={
                data.opening.dopoMovimenti && data.opening.bancaCents != null
                  // 15/11/2026: saldo dei conti vecchio, portato a oggi coi movimenti registrati dopo
                  ? tr("Conti {conti} + {n} movimenti registrati dopo ({dopo})", { conti: money(data.opening.bancaCents), n: data.opening.dopoMovimenti, dopo: money(data.opening.dopoCents ?? 0) })
                  : data.opening.source === "banca" && data.opening.contabileCents != null && data.opening.cents != null
                  && Math.abs(data.opening.contabileCents - data.opening.cents) >= 100
                  ? tr("Saldo contabile {importo} · il disponibile comprende fidi e somme bloccate", { importo: money(data.opening.contabileCents) })
                  : undefined
              }
              // Dove va la cassa da oggi: il saldo a fine di ogni settimana dell'orizzonte.
              tendenza={data.opening.cents == null ? undefined : [data.opening.cents, ...weeks.map((w) => w.balance).filter((b): b is number => b != null)]}
              etichettaTendenza={tr("Saldo previsto a fine di ogni settimana, da oggi")}
            />
            <RiquadroNumero
              etichetta={tr("Punto più basso")}
              valore={money(projection.minimum)}
              periodo={
                projection.minimumDate
                  ? tr("Il {data} · nei {giorni} giorni", { data: shortDate(projection.minimumDate), giorni: f.horizon })
                  : tr("Serve un saldo di partenza")
              }
              tono={projection.minimum == null ? "neutro" : projection.need ? "male" : "buono"}
              variazione={
                data.opening.cents && projection.minimum != null
                  ? { pct: ((projection.minimum - data.opening.cents) / Math.abs(data.opening.cents)) * 100, nota: tr("Rispetto alla disponibilità di oggi") }
                  : undefined
              }
            />
            <RiquadroNumero
              etichetta={tr("Ti mancano")}
              valore={money(projection.need)}
              periodo={tr("per restare sopra {soglia}", { soglia: money(f.threshold) })}
              tono={projection.need ? "male" : "buono"}
            />
            <RiquadroNumero
              etichetta={tr("Incassi scaduti da sollecitare")}
              valore={money(sum(overdueIncome))}
              periodo={tr(overdueIncome.length === 1 ? "{n} incasso oltre la scadenza" : "{n} incassi oltre la scadenza", { n: overdueIncome.length })}
              tono={overdueIncome.length > 0 ? "attenzione" : "neutro"}
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
                  ? tr("Simulazione · incassi in ritardo di {delayDays} giorni", { delayDays: String(delayDays ?? "") })
                  : tr("Piano delle scadenze")}
              </p>
              <h2 className="mt-0.5 text-base font-semibold">
                {data.opening.cents == null
                  ? tr("Completa il saldo per conoscere la cassa futura")
                  : projection.firstBelow
                    ? tr("Sotto la soglia dal {firstBelow}", { firstBelow: String(shortDate(projection.firstBelow) ?? "") })
                    : tr("La cassa prevista resta sopra la soglia")}
              </h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {data.opening.cents == null
                  ? tr("Entrate e uscite sono consultabili. Il saldo non viene sostituito con uno zero.")
                  : tr("A fine periodo: {finalBalance} · flusso del periodo: {net}.", { finalBalance: String(money(projection.finalBalance) ?? ""), net: String(money(projection.net) ?? "") })}
              </p>
              {data.opening.cents !== null && (
                <p className="mt-1 text-sm">
                  <strong>{tr("{daysBelow} giorni", { daysBelow: String(risk.daysBelow ?? "") })}</strong> {tr("con saldo a fine giornata sotto soglia")}
                  {risk.recovery
                    ? tr(" · primo rientro previsto {recovery}", { recovery: String(shortDate(risk.recovery) ?? "") })
                    : risk.daysBelow
                      ? ` ${tr("· nessun rientro a fine giornata nell’orizzonte")}`
                      : ""}
                  .
                </p>
              )}
              {projection.need !== null &&
                projection.need > 0 &&
                projection.finalBalance !== null &&
                projection.finalBalance >= f.threshold && (
                  <p className="mt-1 text-xs text-destructive">
                    {tr("Il saldo finale positivo non elimina il fabbisogno nel periodo intermedio.")}
                  </p>
                )}
              {!!projection.need && !!risk.expensesToMinimum.length && (
                <details className="mt-2 text-xs">
                  <summary className="cursor-pointer font-medium">
                    {tr("Uscite maggiori fino al minimo")}
                  </summary>
                  <ul className="mt-2 space-y-1.5">
                    {risk.expensesToMinimum.map((m) => (
                      <li
                        key={m.id}
                        className="flex flex-wrap items-baseline gap-x-2"
                      >
                        <Link
                          to={m.href}
                          className="underline underline-offset-2"
                        >
                          {m.description}
                        </Link>
                        <span className="tabular-nums">
                          {money(m.cents)} · {shortDate(m.date)}
                          {m.estimated ? ` ${tr("· stima")}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1 text-muted-foreground">
                    {tr("Il minimo dipende anche dagli incassi e dal saldo iniziale; queste non sono tutte le uscite del periodo.")}
                  </p>
                </details>
              )}
              {data.opening.cents != null && (incomplete || bankNote) && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {incomplete
                    ? tr("Verifica prima di decidere: mancano {issues}.", { issues: data.issues.join(", ") })
                    : bankNote}
                </p>
              )}
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setFilter({ scheda: "scenari" })}
              >
                {tr("Confronta scenari")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => openMovements("piano")}
              >
                {tr("Esamina i movimenti")}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
          <div>
            <ForecastCashChart
              rows={chartRows}
              opening={data.opening.cents}
              closing={projection.finalBalance}
              minimum={projection.minimum}
              minimumDate={projection.minimumDate}
              income={projection.income}
              expense={projection.expense}
              threshold={f.threshold}
              hasEstimates={!!estimatesIncluded.length}
              granularity={granularity}
              onGranularity={(value) => {
                setGranularity(value);
                setChartPeriod(null);
              }}
              onPeriod={setChartPeriod}
              onTable={() => setFilter({ scheda: "settimane" })}
            />
            {usciteCategoria.length > 1 && (
              <div className="mt-3 rounded-2xl border bg-card p-4 shadow-sm">
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-semibold text-foreground">{tr("Dove va la cassa")}</p>
                  <p className="text-xs text-muted-foreground">{tr("Uscite dei prossimi {horizon} giorni per categoria · clicca per filtrare", { horizon: String(f.horizon ?? "") })}</p>
                </div>
                <Ciambella
                  titolo={tr("Uscite per categoria")}
                  etichettaCentro={tr("Uscite")}
                  dimensione={150}
                  fette={usciteCategoria.map(([cat, cents]) => ({ nome: FORECAST_CATEGORIES[cat], valore: cents / 100 }))}
                  onFetta={(nome) => {
                    const cat = usciteCategoria.find(([c]) => FORECAST_CATEGORIES[c] === nome)?.[0];
                    if (cat) setFilter({ categoria: cat });
                  }}
                />
              </div>
            )}
            <Sheet
              open={!!chartPeriod}
              onOpenChange={(open) => {
                if (!open) setChartPeriod(null);
              }}
            >
              <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
                <SheetHeader>
                  <SheetTitle>{tr("Movimenti del periodo")}</SheetTitle>
                  <SheetDescription>
                    {tr("Dettaglio della simulazione; aprire una voce non modifica la scadenza.")}
                  </SheetDescription>
                </SheetHeader>
                {chartPeriod && (
                  <div
                    className="border-t"
                    aria-label={tr("Movimenti del periodo scelto")}
                  >
                    <div className="flex items-center justify-between gap-2 px-4 py-2">
                      <p className="text-sm font-medium">
                        {chartPeriod.start === chartPeriod.end
                          ? fullDate(chartPeriod.start)
                          : `${shortDate(chartPeriod.start)} – ${shortDate(chartPeriod.end)}`}{" "}
                        · {tr("{n} movimenti", { n: chartMovements.length })}
                      </p>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openMovements("piano", chartPeriod)}
                        >
                          {tr("Apri in Movimenti")}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={tr("Chiudi il periodo")}
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
                              aria-label={tr("Apri fonte: {description}", { description: String(m.description ?? "") })}
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
                        {tr("Nessun movimento in questo periodo.")}
                      </p>
                    )}
                    {chartMovements.length > 12 && (
                      <p className="px-4 py-2 text-xs text-muted-foreground">{tr("Mostrati 12 di {n} movimenti. Usa «Apri in Movimenti» per l’elenco completo.", { n: chartMovements.length })}</p>
                    )}
                  </div>
                )}
              </SheetContent>
            </Sheet>
          </div>
        </TabsContent>

        <TabsContent value="scenari" className="mt-4 space-y-4">
          {issues}
          <section
            className={cn(section, "overflow-hidden")}
            aria-label={tr("Confronto scenari di cassa")}
          >
            <div className="border-b p-4">
              <h2 className="font-semibold">
                {tr("Quanto cambia se gli incassi ritardano?")}
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {tr("Ritardo medio reale:")}{" "}
                {delay.days === null
                  ? tr("non disponibile")
                  : tr("{days} giorni su {samples} incassi con data attesa", { days: String(delay.days ?? ""), samples: String(delay.samples ?? "") })}
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    {[
                      "Scenario",
                      "Saldo minimo",
                      "Quando",
                      "Fabbisogno sopra soglia",
                      "Giorni sotto soglia",
                      "Saldo finale",
                      "Incassi oltre orizzonte",
                      "",
                    ].map((label, i) => (
                      <th
                        key={i}
                        className="whitespace-nowrap px-3 py-2 text-left font-medium"
                      >
                        {tr(label)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {comparisons.map((c) => (
                    <tr
                      key={c.key}
                      className={cn(
                        "border-t",
                        f.scenario === c.key && "bg-blue-50/50",
                      )}
                    >
                      <th
                        scope="row"
                        className="whitespace-nowrap px-3 py-3 text-left font-medium"
                      >
                        {tr(c.label)}
                        {f.scenario === c.key && (
                          <span className="ml-2 text-xs text-blue-700">
                            {tr("Attivo")}
                          </span>
                        )}
                      </th>
                      <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                        {money(c.projection?.minimum ?? null)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">
                        {c.projection
                          ? shortDate(c.projection.minimumDate)
                          : tr("Storico insufficiente")}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                        {money(c.projection?.need ?? null)}
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        {c.risk?.daysBelow ?? "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                        {money(c.projection?.finalBalance ?? null)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                        {c.projection
                          ? money(movementTotals(c.projection.outside).in)
                          : tr("Non disponibile")}
                      </td>
                      <td className="px-3 py-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!c.projection}
                          onClick={() =>
                            setFilter({
                              scenario: c.key === "puntuali" ? null : c.key,
                              scheda: null,
                            })
                          }
                          aria-label={tr("Usa scenario {label}", { label: String(c.label ?? "") })}
                        >
                          {tr("Usa")}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="border-t p-3 text-xs text-muted-foreground">
              {tr("Le esclusioni e le ipotesi indicate sopra valgono per ogni scenario. Il fabbisogno è una differenza matematica dalla soglia, non un finanziamento disponibile.")}
            </p>
          </section>
        </TabsContent>

        {/* ── Settimane ── */}
        <TabsContent value="settimane" className="mt-4 space-y-3">
          {issues}
          <div className={cn(section, "overflow-hidden")}>
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full text-sm">
                <caption className="sr-only">
                  {tr("Piano settimanale con minimo giornaliero e saldo finale")}
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
                        {tr(label)}
                      </th>
                    ))}
                    <th>
                      <span className="sr-only">{tr("Dettaglio")}</span>
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
                              {tr("sotto soglia")}
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
                            aria-label={tr("Apri movimenti {start}", { start: String(shortDate(w.start) ?? "") })}
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
                    aria-label={tr("Apri settimana {start}", { start: String(shortDate(w.start) ?? "") })}
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
                        className={cn(
                          "text-right",
                          below && "text-destructive",
                        )}
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
            <UniformSelect
              aria-label={tr("Movimenti da mostrare")}
              className={cn(selectClass, "h-10 text-sm")}
              value={view}
              onChange={(e) => {
                setView(e.target.value as MovementView);
                setPeriod(null);
              }}
            >
              {VIEWS.map(([value, label]) => (
                <option key={value} value={value}>
                  {tr(label)}
                </option>
              ))}
            </UniformSelect>
            {period && (
              <span className="flex items-center gap-1 text-sm">
                {tr("Periodo {inizio} – {fine}", { inizio: shortDate(period.start), fine: shortDate(period.end) })}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPeriod(null)}
                >
                  {tr("Rimuovi filtro periodo")}
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
                {tr("Ripristina tutte le date ({n})", { n: Object.keys(overrides).length })}
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
                ? tr("Nessun movimento nel periodo: allarga l’orizzonte o togli i filtri.")
                : tr("Niente in questa vista. Prova un’altra vista o togli i filtri comuni.")
            }
          />
        </TabsContent>

        {/* ── Da sistemare ── */}
        <TabsContent value="da-sistemare" className="mt-4 space-y-3">
          {issues}
          <div className={cn(section, "divide-y")}>
            {todo.every((t) => !t.rows.length) ? (
              <EmptyState
                title={tr("Niente da sistemare")}
                hint={tr("Scadenze, date e collegamenti sono a posto per il piano scelto.")}
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
                      aria-label={tr("Vedi {title}", { title: String(t.title ?? "") })}
                      onClick={() => openMovements(t.key)}
                    >
                      {tr("Vedi")}
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
              <h2 className="font-semibold">{tr("Cosa entra nel piano")}</h2>
              <p className="mt-1 text-muted-foreground">
                {tr("Partenza: {partenza}. Entrate: rate delle commesse con la regola della scheda commessa, fatture e scadenze attive non coperte da una rata, Blocca prezzo. Uscite: spese, scadenzario, pagamenti ai fornitori degli articoli, ODA aperti o ricevuti senza spesa, squadre esterne, provvigioni, cedolini, F24 registrati, stima IVA; per i mesi senza cedolino stipendi, F24 e tredicesima stimati dall’anagrafica; le spese ricorrenti mese per mese.", {
                  partenza: data.opening.source === "banca"
                    ? tr("saldo disponibile dei conti attivi (se manca, il saldo contabile), più i movimenti di Prima Nota registrati dopo la data del saldo")
                    : data.opening.source === "prima-nota"
                      ? tr("saldo della Prima Nota fino a oggi")
                      : tr("nessun saldo: collega un conto in Tesoreria"),
                })}
              </p>
            </div>
            <details>
              <summary className="cursor-pointer font-semibold">{tr("Come si calcola")}</summary>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
                <li>
                  {tr("Importi di cassa: IVA inclusa ove prevista, solo i residui non saldati; ritenuta applicata alle commesse con bonus.")}
                </li>
                <li>
                  {tr("Incassi e uscite scaduti restano fuori dal piano (spesso sono già pagati ma non segnati) ed entrano oggi solo con gli interruttori.")}
                </li>
                <li>
                  {tr("Le fatture di una commessa non collegate a nessuna rata restano fuori come possibili doppioni.")}
                </li>
                <li>
                  {tr("I movimenti senza data restano fuori e sono elencati in «Da sistemare».")}
                </li>
                <li>
                  {tr("Ritardo medio reale: {ritardo}, da {n} incassi degli ultimi 12 mesi con una data attesa.", {
                    ritardo: delay.days == null
                      ? tr("non disponibile")
                      : tr("{days} giorni", { days: String(delay.days ?? "") }),
                    n: delay.samples,
                  })}
                </li>
                <li>
                  {tr("Soglia, scenario e date spostate a mano sono simulazioni: non cambiano scadenze o pagamenti registrati.")}
                </li>
                <li>
                  {tr("Il minimo è a fine giornata: non rappresenta l’ordine dei bonifici nello stesso giorno.")}
                </li>
              </ul>
            </details>
            {data.warnings.length > 0 && (
              <div>
                <h2 className="font-semibold">{tr("Ipotesi sulle stime")}</h2>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
                  {data.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {(() => {
                const [caricamentoPrima, caricamentoDopo = ""] = tr("Ultimo caricamento: {data}. I margini delle commesse sono in {link}.", { data: new Date(data.updatedAt).toLocaleString(intlCampo()) }).split("{link}");
                return (
                  <>
                    {caricamentoPrima}
                    <Link className="underline" to="/azienda/ordini?tab=marginalita">
                      {tr("Commesse → Marginalità")}
                    </Link>
                    {caricamentoDopo}
                  </>
                );
              })()}
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
  const t = useT();
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
          label={t("Incassato nel mese")}
          value={money(month)}
          detail={t("Importi registrati, senza ripetere lo stesso pagamento")}
        />
        <Metric
          label={t("Ritardo medio reale")}
          value={
            delay.days == null ? t("Non disponibile") : t("{days} giorni", { days: delay.days })
          }
          detail={t("{n} incassi con scadenza collegata · ultimi 12 mesi", { n: delay.samples })}
        />
      </div>
      <MovementList
        rows={collected}
        today={data.today}
        collected
        emptyHint={t("Nessun incasso registrato negli ultimi 12 mesi: registra gli incassi in Prima Nota o sulle rate.")}
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
  const t = useT();
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
          aria-label={t("Sposta incasso: {description}", { description: String(m.description ?? "") })}
          title={t("Sposta la data di questo incasso solo nella simulazione")}
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
            {t("Ripristina")}
          </Button>
        )}
      </span>
    ) : null;
  return (
    <div className={cn(section, "overflow-hidden")}>
      <div className="flex flex-col gap-2 border-b p-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2 h-4 w-4 text-muted-foreground" />
          <Input
            aria-label={t("Cerca nei movimenti")}
            placeholder={t("Cerca descrizione, cliente, commessa o fonte")}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="h-8 pl-9 text-xs"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {!collected && (
            <UniformSelect
              aria-label={t("Direzione movimenti")}
              className={selectClass}
              value={direction}
              onChange={(e) => {
                setDirection(e.target.value);
                setPage(1);
              }}
            >
              <option value="all">{t("Entrate e uscite")}</option>
              <option value="in">{t("Solo entrate")}</option>
              <option value="out">{t("Solo uscite")}</option>
            </UniformSelect>
          )}
          <UniformSelect
            aria-label={t("Ordina movimenti")}
            className={selectClass}
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
          >
            <option value="data-asc">{t("Data: prima le vicine")}</option>
            <option value="data-desc">{t("Data: prima le lontane")}</option>
            <option value="importo-desc">{t("Importo: dal più alto")}</option>
            <option value="importo-asc">{t("Importo: dal più basso")}</option>
          </UniformSelect>
          <Button
            variant="outline"
            size="sm"
            onClick={exportView}
            disabled={!filtered.length}
            className={BOTTONE_SECONDARIO}
            title={t("Esporta tutti i movimenti che corrispondono ai filtri, anche nelle altre pagine")}
          >
            <Download aria-hidden />
            {t("Esporta vista")}
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 px-4 py-2 text-xs text-muted-foreground">
        <span>{t("{n} movimenti", { n: filtered.length })}</span>
        <span>
          {t("Entrate:")}{" "}
          <strong className="tabular-nums text-success">{money(income)}</strong>
        </span>
        {!collected && (
          <span>
            {t("Uscite:")}{" "}
            <strong className="tabular-nums text-destructive">
              {money(expenses)}
            </strong>
          </span>
        )}
      </div>
      {!visible.length ? (
        <EmptyState title={t("Nessun movimento in questa vista")} hint={emptyHint} />
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
                        {t(label)}
                      </th>
                    ),
                  )}
                  <th>
                    <span className="sr-only">{t("Apri la voce")}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((m) => (
                  <tr key={m.id} className="border-b last:border-0">
                    <td className="whitespace-nowrap px-3 py-2 align-top text-xs tabular-nums">
                      {shortDate(m.date)}
                      {m.expectedDate && m.expectedDate !== m.date && (
                        <p className="mt-0.5 text-[10px] text-muted-foreground">{t("Atteso {expectedDate}", { expectedDate: String(fullDate(m.expectedDate) ?? "") })}</p>
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
                        {t(status(m))}
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
                          aria-label={t("Apri fonte: {description}", { description: String(m.description ?? "") })}
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
                  {shortDate(m.date)} · {m.source} · {t(status(m))}
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
        <span>{t("Pagina {currentPage} di {pages}", { currentPage: String(currentPage ?? ""), pages: String(pages ?? "") })}</span>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("Pagina precedente")}
            disabled={currentPage <= 1}
            onClick={() => setPage(currentPage - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("Pagina successiva")}
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
