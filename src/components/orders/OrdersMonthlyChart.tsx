import { useEffect, useId, useMemo, useState } from "react";
import { useReducedMotion } from "framer-motion";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ReferenceDot,
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
import { CATALOGO_SERIE, type SerieGrafico } from "@/lib/orders/riepilogoCommesse";

/** Chiave della serie nei dati del grafico e nel confronto con l'anno prima. */
const CHIAVE_SERIE: Record<SerieGrafico, { dato: "sold" | "collected" | "due"; confronto: string }> = {
  venduto: { dato: "sold", confronto: "comparison.venduto" },
  incassato: { dato: "collected", confronto: "comparison.incassato" },
  da_incassare: { dato: "due", confronto: "comparison.daIncassare" },
};
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
  serie = ["venduto", "incassato"],
  vistaIniziale = "money",
  formaIniziale = "lines",
}: {
  /** Le linee in euro, scelte dall'azienda (riepilogo commesse). */
  serie?: SerieGrafico[];
  vistaIniziale?: "money" | "count";
  formaIniziale?: "lines" | "bars";
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
  const [view, setView] = useState<"money" | "count">(vistaIniziale);
  const [shape, setShape] = useState<"lines" | "bars">(formaIniziale);
  // Quando l'azienda cambia la scelta, il grafico riparte da quella; chi guarda può poi cambiarla per sé.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setView(vistaIniziale), [vistaIniziale]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setShape(formaIniziale), [formaIniziale]);
  const linee = CATALOGO_SERIE.filter((s) => serie.includes(s.id));
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
    <section aria-label="Andamento commesse" className="flex min-w-0 flex-1 flex-col">
      <h3 className="text-base font-semibold tracking-tight text-slate-950">
        Andamento commesse{" "}
        <span className="font-normal text-slate-500">· {period}</span>
      </h3>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">
        {view === "count" ? "Commesse create per mese." : "Per mese di creazione. Incassato su quelle commesse, indipendentemente dalla data dell’incasso."}
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
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
              className={`orders-chart-control rounded-md px-2 py-1 text-xs font-medium ${view === item.value ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-900"}`}
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
                className={`orders-chart-control rounded-md px-2 py-1 text-xs ${shape === item.value ? "bg-blue-50 font-medium text-blue-800" : "text-slate-500"}`}
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
            className={`orders-chart-control rounded-lg border px-2 py-1 text-xs font-medium ${comparison.enabled ? "border-blue-200 bg-blue-50 text-blue-800" : "border-slate-200 text-slate-600"}`}
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
        className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600"
        aria-label="Legenda grafico"
      >
        {view === "money" ? (
          <>
            {linee.map((linea) => (
              <span key={linea.id} className="inline-flex items-center gap-1.5">
                <i className="h-2 w-2 rounded-full" style={{ background: linea.colore }} />
                {linea.nome}
              </span>
            ))}
            <span className="text-slate-500">IVA inclusa</span>
          </>
        ) : (
          <span className="inline-flex items-center gap-1.5">
            <i className="h-2 w-2 rounded-full bg-slate-800" />
            Numero commesse
          </span>
        )}
      </div>
      <div
        className={`mt-1 h-[140px] shrink-0 ${onSelectMonth ? "cursor-pointer" : ""}`}
        role="img"
        aria-label={
          view === "money"
            ? `${linee.map((l) => l.nome).join(", ")} per mese di creazione, in euro`
            : "Numero di commesse create per mese"
        }
      >
        <ResponsiveContainer width="100%" height={140}>
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
              {linee.map((linea) => ({ id: CHIAVE_SERIE[linea.id].dato, color: linea.colore })).map((item) => (
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
              tickFormatter={(label: string) => /^\d{4}$/.test(period) ? label.split(" ")[0] : label}
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
                label={{ value: "In corso", position: "insideTop", fontSize: 10, fill: "#475569" }}
                stroke="#94a3b8"
                strokeDasharray="4 4"
              />
            )}
            {selected && (
              <ReferenceLine
                x={selected.mese}
                label={selected.current ? { value: "In corso", position: "insideTop", fontSize: 10 } : undefined}
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
                  {linee.map((linea) => (
                    <Line
                      key={linea.id}
                      dataKey={CHIAVE_SERIE[linea.id].confronto}
                      name={`${linea.nome} ${comparison!.year}`}
                      type="monotone"
                      stroke={linea.colore}
                      strokeWidth={2}
                      strokeDasharray="6 4"
                      dot={false}
                      connectNulls={false}
                      {...animation}
                    />
                  ))}
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
                  {linee.map((linea) => (
                    <Bar
                      key={linea.id}
                      dataKey={CHIAVE_SERIE[linea.id].dato}
                      name={linea.nome}
                      fill={linea.colore}
                      radius={[5, 5, 0, 0]}
                      maxBarSize={24}
                      {...animation}
                    />
                  ))}
                </>
              ) : (
                <>
                  {linee.map((linea) => (
                    <Area
                      key={linea.id}
                      dataKey={CHIAVE_SERIE[linea.id].dato}
                      name={linea.nome}
                      type="monotone"
                      stroke={linea.colore}
                      strokeWidth={2.5}
                      fill={`url(#${gradient}-${CHIAVE_SERIE[linea.id].dato})`}
                      dot={false}
                      activeDot={{ r: 5, stroke: "white", strokeWidth: 2 }}
                      connectNulls={false}
                      {...animation}
                    />
                  ))}
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
            {view === "count" && selected && selected.count !== null && (
              <ReferenceDot x={selected.mese} y={selected.count} r={5} fill="#f97316" stroke="white" strokeWidth={2} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {onSelectMonth && (
        <div className="mt-1">
          {selected ? (
            <div className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <strong className="capitalize">{monthName(selected)}</strong>
              <button type="button" aria-label="Rimuovi filtro mese" title="Rimuovi filtro mese"
                onClick={() => onSelectMonth(null)} className="orders-chart-control rounded px-1.5">×</button>
              <span role="status" className="flex flex-wrap gap-x-3 tabular-nums">
                {view === "count" ? `${selected.commesse} ${selected.commesse === 1 ? "commessa" : "commesse"}` :
                  linee.map((serie) => (
                    <span key={serie.id}>{serie.nome} <strong>{chartMoney(selected[CHIAVE_SERIE[serie.id].dato] ?? 0)}</strong></span>
                  ))}
              </span>
            </div>
          ) : (
            <p className="mb-1 text-[11px] text-slate-500">Seleziona un mese per filtrare l’elenco.</p>
          )}
          <div
            role="group"
            aria-label="Filtra commesse per mese"
            className="grid grid-cols-6 gap-1 lg:grid-cols-12"
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

        </div>
      )}
      <div className="mt-1 flex flex-wrap items-start justify-between gap-2 text-[11px] text-slate-500">
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
