import { useId, useMemo, useState } from "react";
import { useReducedMotion } from "framer-motion";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  chartMoney,
  clickedOrderChartMonth,
  orderChartMonths,
  type DisplayChartMonth,
  type OrderChartMonth,
} from "@/lib/orders/monthlyChart";
const monthName = (month: OrderChartMonth) =>
  new Date(`${month.key}-01T12:00:00`).toLocaleDateString("it-IT", {
    month: "long",
    year: "numeric",
  });

export function OrderMonthDetails({
  active,
  payload,
}: {
  active?: boolean;
  payload?: readonly { payload?: DisplayChartMonth }[];
}) {
  const month = payload?.[0]?.payload;
  if (!active || !month || month.count === null) return null;
  return (
    <div className="min-w-56 rounded-xl border border-slate-200 bg-white/95 p-3 text-xs shadow-xl backdrop-blur-sm">
      <p className="mb-2 font-semibold capitalize text-slate-950">
        {monthName(month)}
        {month.current && " · in corso"}
      </p>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 tabular-nums">
        <dt className="text-blue-700">Venduto</dt>
        <dd className="text-right font-semibold">
          {chartMoney(month.venduto)}
        </dd>
        <dt className="text-orange-700">Incassato</dt>
        <dd className="text-right font-semibold">
          {chartMoney(month.incassato)}
        </dd>
        <dt className="text-slate-600">Da incassare</dt>
        <dd className="text-right font-semibold">
          {chartMoney(month.daIncassare)}
        </dd>
        <dt className="text-slate-600">Commesse</dt>
        <dd className="text-right font-semibold">{month.commesse}</dd>
      </dl>
      {month.comparison && (
        <div className="mt-3 border-t border-slate-200 pt-2">
          <p className="mb-2 font-semibold">
            Confronto {month.comparison.year} · stesso periodo
          </p>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 tabular-nums">
            <dt>Venduto</dt>
            <dd className="text-right">
              {chartMoney(month.comparison.venduto)}
            </dd>
            <dt>Incassato</dt>
            <dd className="text-right">
              {chartMoney(month.comparison.incassato)}
            </dd>
            <dt>Da incassare</dt>
            <dd className="text-right">
              {chartMoney(month.comparison.daIncassare)}
            </dd>
            <dt>Commesse</dt>
            <dd className="text-right">{month.comparison.commesse}</dd>
            <dt>Variazione venduto</dt>
            <dd className="text-right font-semibold">
              {month.comparison.venduto > 0
                ? `${new Intl.NumberFormat("it-IT", { style: "percent", maximumFractionDigits: 1, signDisplay: "always" }).format((month.venduto - month.comparison.venduto) / month.comparison.venduto)}`
                : "Base precedente assente"}
            </dd>
          </dl>
        </div>
      )}
      <p className="mt-2 max-w-60 text-[11px] leading-relaxed text-slate-500">
        Commesse create nel mese · IVA inclusa
      </p>
    </div>
  );
}

export function OrdersMonthlyChart({
  months,
  period,
  selectedMonth = null,
  onSelectMonth,
  comparison,
}: {
  comparison?: {
    year: number;
    enabled: boolean;
    onToggle: () => void;
    loading: boolean;
    error: boolean;
    onRetry: () => void;
    label: string;
  };
  months: OrderChartMonth[];
  period: string;
  selectedMonth?: string | null;
  onSelectMonth?: (month: string | null) => void;
}) {
  const [view, setView] = useState<"money" | "count">("money");
  const [shape, setShape] = useState<"lines" | "bars">("lines");
  const reducedMotion = useReducedMotion();
  const [animateInteraction, setAnimateInteraction] = useState(true);
  const gradient = useId().replace(/:/g, "");
  const data = useMemo(() => orderChartMonths(months), [months]);
  const comparing =
    comparison?.enabled &&
    !comparison.loading &&
    !comparison.error &&
    data.some((month) => month.comparison);
  const current = data.find((month) => month.current);
  const selected = data.find((month) => month.key === selectedMonth);
  const hasFuture = data.some((month) => month.count === null);
  const select = (key: string) =>
    onSelectMonth?.(key === selectedMonth ? null : key);
  const animation = {
    isAnimationActive: reducedMotion === false && animateInteraction,
    animationDuration: 240,
    animationEasing: "ease-out" as const,
  };
  return (
    <section aria-label="Andamento commesse" className="min-w-0">
      <h3 className="text-base font-semibold tracking-tight text-slate-950">
        Andamento commesse{" "}
        <span className="font-normal text-slate-500">· {period}</span>
      </h3>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">
        Per mese di creazione. Incassato su quelle commesse, indipendentemente
        dalla data dell’incasso.
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <div
          role="group"
          aria-label="Visualizzazione andamento"
          className="inline-flex gap-1 rounded-lg bg-slate-100 p-1"
        >
          {(
            [
              { value: "money", label: "Importi" },
              { value: "count", label: "Numero commesse" },
            ] as const
          ).map((item) => (
            <button
              type="button"
              key={item.value}
              aria-pressed={view === item.value}
              onClick={(event) => {
                setAnimateInteraction(event.detail > 0);
                setView(item.value);
              }}
              className={`orders-chart-control rounded-md px-3 py-1.5 text-xs font-medium ${view === item.value ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-900"}`}
            >
              {item.label}
            </button>
          ))}
        </div>
        {view === "money" && (
          <div
            role="group"
            aria-label="Stile grafico"
            className="inline-flex gap-1 rounded-lg border border-slate-200 p-0.5"
          >
            {(
              [
                { value: "lines", label: "Linee" },
                { value: "bars", label: "Barre" },
              ] as const
            ).map((item) => (
              <button
                type="button"
                key={item.value}
                aria-pressed={shape === item.value}
                onClick={(event) => {
                  setAnimateInteraction(event.detail > 0);
                  setShape(item.value);
                }}
                className={`orders-chart-control rounded-md px-2 py-1.5 text-xs ${shape === item.value ? "bg-blue-50 font-medium text-blue-800" : "text-slate-500"}`}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}
        {comparison && (
          <button
            type="button"
            aria-pressed={comparison.enabled}
            onClick={(event) => {
              setAnimateInteraction(event.detail > 0);
              comparison.onToggle();
            }}
            className={`orders-chart-control rounded-lg border px-3 py-1.5 text-xs font-medium ${comparison.enabled ? "border-blue-200 bg-blue-50 text-blue-800" : "border-slate-200 text-slate-600"}`}
          >
            Confronta {comparison.year}
          </button>
        )}
      </div>
      {comparison?.enabled && (
        <div className="text-[11px] text-slate-500">
          <details className="mt-1 text-[11px] leading-relaxed text-slate-500">
            <summary className="cursor-pointer">
              Confronto a parità di periodo · dettagli
            </summary>
            <p>
              Stesso periodo: {comparison.label}, nei due anni. Linee
              tratteggiate: {comparison.year}.
            </p>
            <p>
              Incassi e residui aggiornati a oggi, non saldi storici. I filtri
              dell’elenco non cambiano.
            </p>
          </details>
          {comparison.loading && <p role="status">Caricamento confronto…</p>}
          {comparison.error && (
            <p role="alert">
              Confronto non disponibile.{" "}
              <button
                type="button"
                className="underline"
                onClick={comparison.onRetry}
              >
                Riprova confronto
              </button>
            </p>
          )}
        </div>
      )}
      <div
        className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600"
        aria-label="Legenda grafico"
      >
        {view === "money" ? (
          <>
            <span className="inline-flex items-center gap-1.5">
              <i className="h-2 w-2 rounded-full bg-blue-600" />
              Venduto
            </span>
            <span className="inline-flex items-center gap-1.5">
              <i className="h-2 w-2 rounded-full bg-orange-500" />
              Incassato · IVA inclusa
            </span>
          </>
        ) : (
          <span className="inline-flex items-center gap-1.5">
            <i className="h-2 w-2 rounded-full bg-slate-800" />
            Numero commesse
          </span>
        )}
        {current && (
          <span className="ml-auto text-slate-500">
            {monthName(current).replace(/ \d{4}$/, "")}: in corso
          </span>
        )}
      </div>
      <div
        className={`mt-1 h-[220px] ${onSelectMonth ? "cursor-pointer" : ""}`}
        role="img"
        aria-label={
          view === "money"
            ? "Venduto e incassato per mese di creazione, in euro"
            : "Numero di commesse create per mese"
        }
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={{ top: 18, right: 12, left: 0, bottom: 0 }}
            accessibilityLayer
            onClick={(state) => {
              const key = clickedOrderChartMonth(state, data);
              if (key) select(key);
            }}
          >
            <defs>
              {[
                { id: "sold", color: "#2563eb" },
                { id: "collected", color: "#f97316" },
              ].map((item) => (
                <linearGradient
                  key={item.id}
                  id={`${gradient}-${item.id}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="0%" stopColor={item.color} stopOpacity={0.16} />
                  <stop
                    offset="100%"
                    stopColor={item.color}
                    stopOpacity={0.01}
                  />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid
              vertical={false}
              stroke="#e2e8f0"
              strokeDasharray="3 5"
            />
            <XAxis
              dataKey="mese"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 10, fill: "#64748b" }}
              minTickGap={8}
              tickMargin={10}
            />
            <YAxis
              key={view}
              tickLine={false}
              axisLine={false}
              width={76}
              tick={{ fontSize: 10, fill: "#64748b" }}
              allowDecimals={view === "money"}
              tickFormatter={(value) =>
                view === "money"
                  ? `${new Intl.NumberFormat("it-IT", { notation: "compact", maximumFractionDigits: 1 }).format(Number(value))} €`
                  : String(value)
              }
            />
            {current && current.key !== selected?.key && (
              <ReferenceLine
                x={current.mese}
                stroke="#94a3b8"
                strokeDasharray="4 4"
              />
            )}
            {selected && (
              <ReferenceLine
                x={selected.mese}
                stroke="#f97316"
                strokeWidth={2}
                strokeDasharray="3 3"
              />
            )}
            <Tooltip
              content={<OrderMonthDetails />}
              cursor={
                shape === "bars" && view === "money"
                  ? { fill: "#f1f5f9", fillOpacity: 0.6 }
                  : { stroke: "#94a3b8", strokeDasharray: "3 3" }
              }
              filterNull
              isAnimationActive={false}
            />
            {comparing &&
              (view === "money" ? (
                <>
                  <Line
                    dataKey="comparison.venduto"
                    name={`Venduto ${comparison!.year}`}
                    type="monotone"
                    stroke="#2563eb"
                    strokeWidth={2}
                    strokeDasharray="6 4"
                    dot={false}
                    connectNulls={false}
                    {...animation}
                  />
                  <Line
                    dataKey="comparison.incassato"
                    name={`Incassato ${comparison!.year}`}
                    type="monotone"
                    stroke="#f97316"
                    strokeWidth={2}
                    strokeDasharray="6 4"
                    dot={false}
                    connectNulls={false}
                    {...animation}
                  />
                </>
              ) : (
                <Line
                  dataKey="comparison.commesse"
                  name={`Commesse ${comparison!.year}`}
                  type="monotone"
                  stroke="#1e293b"
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  dot={false}
                  connectNulls={false}
                  {...animation}
                />
              ))}
            {view === "money" ? (
              shape === "bars" ? (
                <>
                  <Bar
                    dataKey="sold"
                    name="Venduto"
                    fill="#2563eb"
                    radius={[5, 5, 0, 0]}
                    maxBarSize={24}
                    {...animation}
                  />
                  <Bar
                    dataKey="collected"
                    name="Incassato"
                    fill="#f97316"
                    radius={[5, 5, 0, 0]}
                    maxBarSize={24}
                    {...animation}
                  />
                </>
              ) : (
                <>
                  <Area
                    dataKey="sold"
                    name="Venduto"
                    type="monotone"
                    stroke="#2563eb"
                    strokeWidth={2.5}
                    fill={`url(#${gradient}-sold)`}
                    dot={false}
                    activeDot={{ r: 5, stroke: "white", strokeWidth: 2 }}
                    connectNulls={false}
                    {...animation}
                  />
                  <Area
                    dataKey="collected"
                    name="Incassato"
                    type="monotone"
                    stroke="#f97316"
                    strokeWidth={2.5}
                    fill={`url(#${gradient}-collected)`}
                    dot={false}
                    activeDot={{ r: 5, stroke: "white", strokeWidth: 2 }}
                    connectNulls={false}
                    {...animation}
                  />
                </>
              )
            ) : (
              <Line
                dataKey="count"
                name="Numero commesse"
                type="monotone"
                stroke="#1e293b"
                strokeWidth={2.5}
                dot={{ r: 3, fill: "#fff", strokeWidth: 2 }}
                activeDot={{ r: 5 }}
                connectNulls={false}
                {...animation}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {onSelectMonth && (
        <div className="mt-2">
          <p className="mb-1 text-[11px] text-slate-500">
            Seleziona un mese per filtrare l’elenco.
          </p>
          <div
            role="group"
            aria-label="Filtra commesse per mese"
            className="grid grid-cols-6 gap-1 2xl:grid-cols-12"
          >
            {data.map((month) => (
              <button
                key={month.key}
                type="button"
                disabled={month.count === null}
                aria-pressed={selectedMonth === month.key}
                aria-label={`Filtra commesse di ${monthName(month)}`}
                title={
                  month.count === null
                    ? "Mese futuro senza dati"
                    : monthName(month)
                }
                onClick={() => select(month.key)}
                className="orders-month-chip rounded-md border border-slate-200 py-1 text-[11px] text-slate-600"
              >
                {/^\d{4}$/.test(period) ? month.mese.split(" ")[0] : month.mese}
              </button>
            ))}
          </div>
          {selected && (
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-orange-50 px-2.5 py-2 text-xs text-orange-900">
              <span role="status">
                Elenco filtrato: <strong>{monthName(selected)}</strong>
              </span>
              <button
                type="button"
                className="orders-chart-control rounded underline underline-offset-2"
                onClick={() => onSelectMonth(null)}
              >
                Rimuovi filtro mese
              </button>
            </div>
          )}
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-start justify-between gap-2 text-[11px] text-slate-500">
        <p>
          {hasFuture
            ? "I mesi futuri senza dati restano vuoti; il mese in corso è parziale."
            : "Gli importi si riferiscono alle commesse create in ciascun mese."}
        </p>
        <details className="min-w-0 max-w-full">
          <summary className="orders-chart-control cursor-pointer rounded text-slate-600 underline underline-offset-2">
            Dati mese per mese
          </summary>
          <div className="mt-3 max-w-full overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-left text-xs tabular-nums">
              <caption className="sr-only">
                Andamento commesse · {period} · IVA inclusa
              </caption>
              <thead className="bg-slate-50">
                <tr>
                  {[
                    "Mese",
                    "Venduto",
                    "Incassato",
                    "Da incassare",
                    "Commesse",
                  ].map((label) => (
                    <th
                      key={label}
                      scope="col"
                      className="px-3 py-2 font-medium"
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.flatMap((month) => [
                  <tr key={month.key} className="border-t border-slate-100">
                    <th
                      scope="row"
                      className="whitespace-nowrap px-3 py-2 font-normal"
                    >
                      {month.mese}
                      {comparing ? ` · ${period}` : ""}
                      {month.current ? " · in corso" : ""}
                    </th>
                    <td className="whitespace-nowrap px-3 py-2">
                      {month.sold === null
                        ? "Non ancora disponibile"
                        : chartMoney(month.venduto)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {month.collected === null
                        ? "—"
                        : chartMoney(month.incassato)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {month.count === null
                        ? "—"
                        : chartMoney(month.daIncassare)}
                    </td>
                    <td className="px-3 py-2">{month.count ?? "—"}</td>
                  </tr>,
                  ...(month.comparison
                    ? [
                        <tr
                          key={`${month.key}-previous`}
                          className="border-t border-slate-100 bg-slate-50"
                        >
                          <th
                            scope="row"
                            className="whitespace-nowrap px-3 py-2 font-normal"
                          >
                            {month.mese.split(" ")[0]} · {month.comparison.year}
                          </th>
                          <td className="whitespace-nowrap px-3 py-2">
                            {chartMoney(month.comparison.venduto)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2">
                            {chartMoney(month.comparison.incassato)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2">
                            {chartMoney(month.comparison.daIncassare)}
                          </td>
                          <td className="px-3 py-2">
                            {month.comparison.commesse}
                          </td>
                        </tr>,
                      ]
                    : []),
                ])}
              </tbody>
            </table>
          </div>
        </details>
      </div>
    </section>
  );
}
