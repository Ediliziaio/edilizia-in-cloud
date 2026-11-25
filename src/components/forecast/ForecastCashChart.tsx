import { useId, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Area,
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
import { ArrowDownLeft, ArrowUpRight, ChevronDown, Table2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/formatters";
import { calendarDate } from "@/lib/finance/forecastLedger";
import { cashChartScale } from "@/lib/finance/forecastChart";
import { PillolaVariazione, StatGrafico, defsGrafico } from "@/components/charts/grafici/comune";
import { usePreferisceMenoMovimento } from "@/hooks/usePreferisceMenoMovimento";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

export interface CashChartPoint {
  start: string;
  end: string;
  label: string;
  income: number;
  expense: number;
  balance: number | null;
  withoutEstimates: number | null;
}
const money = (cents: number | null) =>
  cents === null ? "Non disponibile" : formatCurrency(cents / 100);
const dateLabel = (date: string) =>
  calendarDate(date).toLocaleDateString(intlCampo(), {
    day: "numeric",
    month: "short",
  });
const compact = (cents: number) =>
  new Intl.NumberFormat(intlCampo(), {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(cents / 100);
const blue = "hsl(var(--primary))";
// L'arancio delle uscite e della soglia è quello del tema (--chart-3).
const orange = "hsl(var(--chart-3))";

export function CashChartTooltip({
  active,
  point,
  comparison,
  threshold,
}: {
  active?: boolean;
  point?: CashChartPoint;
  comparison: boolean;
  threshold: number;
}) {
  const t = useT();
  if (!active || !point) return null;
  return (
    <div className="min-w-[220px] rounded-2xl border border-border/60 bg-popover/95 p-4 text-popover-foreground shadow-xl backdrop-blur-md">
      <p className="text-xs text-muted-foreground">
        {dateLabel(point.start)}
        {point.end !== point.start ? ` – ${dateLabel(point.end)}` : ""}
      </p>
      <p className="mt-1 text-xs font-medium">
        {point.start === point.end ? t("Saldo a fine giornata") : t("Saldo a fine settimana")}
      </p>
      <p
        className={cn(
          "mt-0.5 text-xl font-semibold tracking-tight tabular-nums",
          point.balance !== null && point.balance < threshold
            ? "text-destructive"
            : "text-primary",
        )}
      >
        {money(point.balance)}
      </p>
      {comparison && (
        <div className="mt-2 flex justify-between gap-4 text-xs text-muted-foreground">
          <span>{t("Senza stime")}</span>
          <span className="tabular-nums">{money(point.withoutEstimates)}</span>
        </div>
      )}
      <div className="mt-3 space-y-1.5 border-t pt-3 text-xs">
        <div className="flex justify-between gap-4">
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            {t("Entrate")}
          </span>
          <span className="tabular-nums">{money(point.income)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
            {t("Uscite")}
          </span>
          <span className="tabular-nums">{money(Math.abs(point.expense))}</span>
        </div>
      </div>
      <p className="mt-3 text-[10px] text-muted-foreground">
        {t("Seleziona il periodo per aprire i movimenti")}
      </p>
    </div>
  );
}

export function ForecastCashChart({
  rows,
  opening,
  closing,
  minimum,
  minimumDate,
  income,
  expense,
  threshold,
  hasEstimates,
  granularity,
  onGranularity,
  onPeriod,
  onTable,
}: {
  rows: CashChartPoint[];
  opening: number | null;
  closing: number | null;
  minimum: number | null;
  minimumDate: string | null;
  income: number;
  expense: number;
  threshold: number;
  hasEstimates: boolean;
  granularity: "giorni" | "settimane";
  onGranularity: (value: "giorni" | "settimane") => void;
  onPeriod: (period: { start: string; end: string }) => void;
  onTable: () => void;
}) {
  const t = useT();
  const [showFlows, setShowFlows] = useState(false);
  const [compare, setCompare] = useState(false);
  const comparison = compare && hasEstimates;
  const id = useId().replace(/:/g, "");
  const fermo = usePreferisceMenoMovimento();
  // Punto più alto e più basso del grafico, per la riga sopra e i due pallini.
  const estremi = useMemo(() => {
    const conSaldo = rows.filter((r) => r.balance !== null);
    if (conSaldo.length === 0) return null;
    const alto = conSaldo.reduce((a, b) => ((b.balance ?? 0) > (a.balance ?? 0) ? b : a));
    const bassoRighe = conSaldo.reduce((a, b) => ((b.balance ?? 0) < (a.balance ?? 0) ? b : a));
    // 15/11/2026: le righe sono saldi di fine giornata; il minimo della previsione conta anche la
    // disponibilità di stamattina. Prima «Più basso» diceva 122.419 € il 16/11 e, sotto, «Minimo
    // previsto» −48.514 € il 15/11: si prende il più basso dei due.
    const basso =
      minimum !== null && minimumDate && minimum < (bassoRighe.balance ?? Infinity)
        ? { ...bassoRighe, balance: minimum, start: minimumDate, end: minimumDate }
        : bassoRighe;
    return { alto, basso };
  }, [rows, minimum, minimumDate]);
  const scale = useMemo(
    () =>
      cashChartScale([
        opening,
        minimum,
        threshold,
        ...rows.flatMap((r) => [
          r.balance,
          ...(comparison ? [r.withoutEstimates] : []),
        ]),
      ]),
    [rows, opening, minimum, threshold, comparison],
  );
  const minimumRow = rows.find(
    (r) => minimumDate && r.start <= minimumDate && minimumDate <= r.end,
  );
  const flowScale = useMemo(
    () => cashChartScale(rows.flatMap((r) => [r.income, r.expense])),
    [rows],
  );
  const selectPoint = (state: unknown) => {
    const index = (state as { activeTooltipIndex?: number | string } | null)
      ?.activeTooltipIndex;
    if (index == null || index === "") return;
    const point = rows[Number(index)];
    if (point) onPeriod({ start: point.start, end: point.end });
  };
  const tooltip = (
    <Tooltip
      cursor={{
        stroke: "hsl(var(--muted-foreground))",
        strokeDasharray: "3 4",
        strokeOpacity: 0.4,
      }}
      content={({ active, payload }) => (
        <CashChartTooltip
          active={active}
          point={payload?.[0]?.payload as CashChartPoint | undefined}
          comparison={comparison}
          threshold={threshold}
        />
      )}
    />
  );
  return (
    <section
      aria-label={t("Andamento della cassa")}
      className="overflow-hidden rounded-2xl border border-border/70 bg-card text-card-foreground shadow-sm"
    >
      <div className="flex flex-col gap-5 px-5 pt-5 sm:flex-row sm:items-start sm:justify-between sm:px-6 sm:pt-6">
        <div>
          <h2 className="text-base font-semibold tracking-tight">
            {t("Andamento della cassa")}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {rows.length
              ? `${dateLabel(rows[0].start)} – ${dateLabel(rows[rows.length - 1].end)} · `
              : ""}
            {t("Saldi previsti, non incassi garantiti")}
          </p>
          <p className="mt-4 text-[11px] font-medium text-muted-foreground">
            {t("Saldo a fine periodo")}
          </p>
          <p
            className={cn(
              "mt-0.5 text-lg font-semibold tracking-tight tabular-nums sm:text-xl",
              closing !== null && closing < threshold
                ? "text-destructive"
                : "text-primary",
            )}
          >
            {money(closing)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <div
            aria-label={t("Dettaglio temporale del grafico")}
            role="group"
            className="inline-flex rounded-xl bg-muted/70 p-1"
          >
            {(["giorni", "settimane"] as const).map((g) => (
              <button
                key={g}
                type="button"
                aria-pressed={granularity === g}
                onClick={() => onGranularity(g)}
                className={cn(
                  "min-h-8 rounded-lg px-3 text-xs transition-colors",
                  granularity === g
                    ? "bg-background font-medium shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {g === "giorni" ? t("Per giorno") : t("Per settimana")}
              </button>
            ))}
          </div>
          {hasEstimates && (
            <button
              type="button"
              aria-pressed={comparison}
              onClick={() => setCompare((v) => !v)}
              className={cn(
                "min-h-10 rounded-xl border px-3 text-xs transition-colors",
                comparison
                  ? "border-primary/30 bg-primary/5 text-primary"
                  : "border-border/70 text-muted-foreground hover:bg-muted/50",
              )}
            >
              {t("Confronta senza stime")}
            </button>
          )}
        </div>
      </div>
      {opening === null ? (
        <div className="flex min-h-[280px] flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="text-sm text-muted-foreground">
            {t("Il grafico del saldo richiede una disponibilità iniziale.")}
          </p>
          <Button asChild variant="outline" size="sm">
            <Link to="/azienda/tesoreria">{t("Completa in Tesoreria")}</Link>
          </Button>
        </div>
      ) : (
        <>
          {estremi && (
            <div className="mx-5 mt-4 grid grid-cols-3 gap-3 rounded-xl border bg-muted/30 px-3 py-2 sm:mx-6">
              <StatGrafico etichetta={t("Più alto")} valore={money(estremi.alto.balance)} nota={dateLabel(estremi.alto.start)} />
              <StatGrafico
                etichetta={t("Più basso")}
                valore={money(estremi.basso.balance)}
                nota={dateLabel(estremi.basso.start)}
                tono={(estremi.basso.balance ?? 0) < threshold ? "cattivo" : "neutro"}
              />
              {/* Il saldo a fine periodo è già scritto grande qui sopra: qui la
                  differenza da oggi, che dice se la cassa cresce o cala. */}
              <StatGrafico
                etichetta={t("Rispetto a oggi")}
                valore={
                  <span className="inline-flex flex-wrap items-center gap-1.5">
                    {opening !== null && closing !== null ? `${closing - opening > 0 ? "+" : ""}${money(closing - opening)}` : "—"}
                    {/* Una percentuale su una base negativa (+993% partendo da −48.514 €) non dice niente. */}
                    {opening !== null && opening > 0 && closing !== null && (
                      <PillolaVariazione pct={((closing - opening) / Math.abs(opening)) * 100} titolo={t("Saldo a fine periodo rispetto alla disponibilità di oggi")} />
                    )}
                  </span>
                }
                nota={t("a fine periodo")}
                tono={opening !== null && closing !== null ? (closing >= opening ? "buono" : "cattivo") : "neutro"}
              />
            </div>
          )}
          <div
            className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 px-5 text-[11px] text-muted-foreground sm:px-6"
            aria-label={t("Legenda del grafico")}
          >
            <span className="inline-flex items-center gap-2">
              <span className="h-0.5 w-4 rounded-full bg-primary" />
              {t("Saldo previsto")}{hasEstimates ? ` ${t("· con stime")}` : ""}
            </span>
            {comparison && (
              <span className="inline-flex items-center gap-2">
                <span className="w-4 border-t border-dashed border-muted-foreground" />
                {t("Senza stime")}
              </span>
            )}
            <span className="inline-flex items-center gap-2">
              <span className="w-4 border-t border-dashed border-orange-400" />
              {t("Soglia {importo}", { importo: money(threshold) })}
            </span>
          </div>
          <div
            className="mt-2 h-[300px] w-full px-1 sm:h-[330px] sm:px-3"
            aria-label={t("Grafico saldo con entrate e uscite")}
          >
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={rows}
                margin={{ top: 20, right: 24, left: 0, bottom: 8 }}
                syncId={id}
                onClick={selectPoint}
              >
                {defsGrafico(id, { entrate: blue, uscite: orange })}
                <defs>
                  <linearGradient id={`${id}-cash`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={blue} stopOpacity={0.3} />
                    <stop offset="70%" stopColor={blue} stopOpacity={0.06} />
                    <stop offset="100%" stopColor={blue} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  vertical={false}
                  fill={`url(#${id}-punti)`}
                  stroke="hsl(var(--border))"
                  strokeOpacity={0.7}
                  strokeDasharray="4 6"
                />
                <XAxis
                  dataKey="label"
                  interval="preserveStartEnd"
                  minTickGap={72}
                  tickMargin={12}
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                  stroke="hsl(var(--muted-foreground))"
                />
                <YAxis
                  domain={scale.domain}
                  ticks={scale.ticks}
                  width={62}
                  tickMargin={10}
                  tickFormatter={compact}
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                  stroke="hsl(var(--muted-foreground))"
                />
                {tooltip}
                <ReferenceLine
                  y={threshold}
                  stroke={orange}
                  strokeOpacity={0.7}
                  strokeDasharray="4 5"
                />
                <ReferenceLine
                  y={0}
                  stroke="hsl(var(--muted-foreground))"
                  strokeOpacity={0.2}
                />
                <Area
                  type="stepAfter"
                  dataKey="balance"
                  stroke={blue}
                  strokeWidth={2.5}
                  fill={`url(#${id}-cash)`}
                  filter={`url(#${id}-ombra)`}
                  dot={false}
                  activeDot={{
                    r: 5,
                    stroke: "hsl(var(--card))",
                    strokeWidth: 3,
                  }}
                  isAnimationActive={!fermo}
                  animationDuration={900}
                />
                {comparison && (
                  <Line
                    type="stepAfter"
                    dataKey="withoutEstimates"
                    stroke="hsl(var(--muted-foreground))"
                    strokeDasharray="4 5"
                    strokeWidth={1.5}
                    strokeOpacity={0.65}
                    dot={false}
                    isAnimationActive={false}
                  />
                )}
                {estremi && estremi.alto.balance !== null && estremi.alto !== estremi.basso && (
                  <ReferenceDot
                    x={estremi.alto.label}
                    y={estremi.alto.balance}
                    r={4.5}
                    fill="hsl(var(--card))"
                    stroke={blue}
                    strokeWidth={2.5}
                  />
                )}
                {granularity === "giorni" &&
                  minimumRow &&
                  minimum !== null &&
                  minimumRow.balance === minimum && (
                    <ReferenceDot
                      x={minimumRow.label}
                      y={minimum}
                      r={5}
                      fill={orange}
                      stroke="hsl(var(--card))"
                      strokeWidth={2.5}
                    />
                  )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 px-5 pb-4 text-xs sm:px-6">
            {minimum !== null && minimumDate && (
              <button
                type="button"
                onClick={() =>
                  onPeriod({
                    start: minimumRow?.start ?? minimumDate,
                    end: minimumRow?.end ?? minimumDate,
                  })
                }
                className="inline-flex min-h-8 flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-orange-50 px-2.5 py-1.5 text-orange-900 transition-colors hover:bg-orange-100 dark:bg-orange-500/10 dark:text-orange-200"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
                {t("Minimo previsto")}{" "}
                <strong className="font-semibold tabular-nums">
                  {money(minimum)}
                </strong>
                <span className="opacity-75">· {dateLabel(minimumDate)}</span>
              </button>
            )}
            <button
              type="button"
              onClick={onTable}
              className="inline-flex min-h-8 items-center gap-1.5 text-muted-foreground transition-colors hover:text-primary"
            >
              <Table2 className="h-3.5 w-3.5" />
              {t("Tabella settimanale")}
            </button>
          </div>
          <div className="border-t border-border/60 bg-muted/20 px-5 py-4 sm:px-6">
            <div className="flex flex-wrap items-center gap-x-7 gap-y-4">
              <div className="flex items-center gap-2.5">
                <span className="rounded-xl bg-primary/10 p-2 text-primary">
                  <ArrowUpRight className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-[11px] text-muted-foreground">
                    {t("Entrate del periodo")}
                  </p>
                  <p className="text-sm font-semibold tabular-nums">
                    {money(income)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="rounded-xl bg-orange-500/10 p-2 text-orange-600 dark:text-orange-400">
                  <ArrowDownLeft className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-[11px] text-muted-foreground">
                    {t("Uscite del periodo")}
                  </p>
                  <p className="text-sm font-semibold tabular-nums">
                    {money(expense)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                aria-expanded={showFlows}
                aria-controls={`${id}-flows`}
                onClick={() => setShowFlows((v) => !v)}
                className="ml-auto inline-flex min-h-9 items-center gap-2 rounded-lg px-2 text-xs text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
              >
                {showFlows ? t("Nascondi flussi") : t("Mostra entrate e uscite")}
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5 transition-transform motion-reduce:transition-none",
                    showFlows && "rotate-180",
                  )}
                />
              </button>
            </div>
            {showFlows && (
              <div
                id={`${id}-flows`}
                className="mt-4 h-[110px] motion-safe:animate-in motion-safe:fade-in"
                aria-label={t("Grafico dettagliato entrate e uscite")}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={rows}
                    margin={{ top: 4, right: 24, left: 0, bottom: 4 }}
                    stackOffset="sign"
                    syncId={id}
                    onClick={selectPoint}
                  >
                    <XAxis dataKey="label" hide />
                    <YAxis
                      width={62}
                      domain={flowScale.domain}
                      ticks={[
                        ...new Set([
                          flowScale.domain[0],
                          0,
                          flowScale.domain[1],
                        ]),
                      ]}
                      tickFormatter={compact}
                      tickLine={false}
                      axisLine={false}
                      fontSize={10}
                      stroke="hsl(var(--muted-foreground))"
                      tickCount={3}
                    />
                    {tooltip}
                    <ReferenceLine y={0} stroke="hsl(var(--border))" />
                    <Bar
                      dataKey="income"
                      stackId="flows"
                      fill={`url(#${id}-barra-entrate)`}
                      radius={[3, 3, 0, 0]}
                      isAnimationActive={!fermo}
                      animationDuration={600}
                      cursor="pointer"
                    />
                    <Bar
                      dataKey="expense"
                      stackId="flows"
                      fill={`url(#${id}-barra-uscite)`}
                      radius={[0, 0, 3, 3]}
                      isAnimationActive={!fermo}
                      animationDuration={600}
                      cursor="pointer"
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
