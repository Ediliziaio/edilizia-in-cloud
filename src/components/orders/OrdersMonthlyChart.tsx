import { useMemo, useState } from "react";
import {
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
  orderChartMonths,
  type DisplayChartMonth,
  type OrderChartMonth,
} from "@/lib/orders/monthlyChart";

function MonthDetails({
  active,
  payload,
}: {
  active?: boolean;
  payload?: readonly { payload?: DisplayChartMonth }[];
}) {
  const month = payload?.[0]?.payload;
  if (!active || !month) return null;
  return (
    <div className="min-w-56 rounded-xl border border-slate-200 bg-white p-3 text-xs shadow-lg">
      <p className="mb-2 font-semibold capitalize text-slate-950">
        {new Date(`${month.key}-01T12:00:00`).toLocaleDateString("it-IT", {
          month: "long",
          year: "numeric",
        })}
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
        <dt className="text-slate-600">Commesse</dt>
        <dd className="text-right font-semibold">{month.commesse}</dd>
      </dl>
      <p className="mt-2 max-w-60 text-[11px] leading-relaxed text-slate-500">
        Commesse create nel mese · IVA inclusa
      </p>
    </div>
  );
}

export function OrdersMonthlyChart({
  months,
  period,
}: {
  months: OrderChartMonth[];
  period: string;
}) {
  const [view, setView] = useState<"money" | "count">("money");
  const data = useMemo(() => orderChartMonths(months), [months]);
  const current = data.find((month) => month.current);
  const future = data.filter((month) => month.count === null);
  return (
    <section aria-label="Andamento commesse" className="min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold tracking-tight text-slate-950">
            Andamento commesse{" "}
            <span className="font-normal text-slate-500">· {period}</span>
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            Per mese di creazione. Incassato su quelle commesse,
            indipendentemente dalla data dell’incasso.
          </p>
        </div>
        <div
          role="group"
          aria-label="Visualizzazione andamento"
          className="inline-flex shrink-0 gap-1 rounded-lg bg-slate-100 p-1"
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
              onClick={() => setView(item.value)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-500 ${view === item.value ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-900"}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <div
        className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-600"
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
            {new Date(`${current.key}-01T12:00:00`).toLocaleDateString(
              "it-IT",
              { month: "long" },
            )}
            : mese in corso
          </span>
        )}
      </div>
      <div
        className="mt-2 h-[260px]"
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
            margin={{ top: 18, right: 12, left: 4, bottom: 0 }}
            accessibilityLayer
          >
            <CartesianGrid
              vertical={false}
              stroke="#e2e8f0"
              strokeDasharray="3 5"
            />
            <XAxis
              dataKey="mese"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: "#64748b" }}
              minTickGap={12}
              tickMargin={10}
            />
            <YAxis
              key={view}
              tickLine={false}
              axisLine={false}
              width={66}
              tick={{ fontSize: 11, fill: "#64748b" }}
              allowDecimals={view === "money"}
              tickFormatter={(value) =>
                view === "money"
                  ? `${new Intl.NumberFormat("it-IT", { notation: "compact", maximumFractionDigits: 1 }).format(Number(value))} €`
                  : String(value)
              }
            />
            {current && (
              <ReferenceLine
                x={current.mese}
                stroke="#94a3b8"
                strokeDasharray="4 4"
              />
            )}
            <Tooltip
              content={<MonthDetails />}
              cursor={{ fill: "#f1f5f9", fillOpacity: 0.6 }}
              filterNull
            />
            {view === "money" ? (
              <>
                <Bar
                  dataKey="sold"
                  name="Venduto"
                  fill="#2563eb"
                  radius={[5, 5, 0, 0]}
                  maxBarSize={28}
                  isAnimationActive={false}
                />
                <Bar
                  dataKey="collected"
                  name="Incassato"
                  fill="#f97316"
                  radius={[5, 5, 0, 0]}
                  maxBarSize={28}
                  isAnimationActive={false}
                />
              </>
            ) : (
              <Line
                dataKey="count"
                name="Numero commesse"
                type="linear"
                stroke="#1e293b"
                strokeWidth={2.5}
                dot={{ r: 3, fill: "#fff", strokeWidth: 2 }}
                activeDot={{ r: 5 }}
                connectNulls={false}
                isAnimationActive={false}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-2 text-xs text-slate-500">
        <p>
          {future.length > 0
            ? "I mesi futuri senza dati restano vuoti; il mese in corso è parziale."
            : "Gli importi si riferiscono alle commesse create in ciascun mese."}
        </p>
        <details className="min-w-0 max-w-full">
          <summary className="cursor-pointer rounded text-slate-600 underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-500">
            Dati mese per mese
          </summary>
          <div className="mt-3 max-w-full overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-left text-xs tabular-nums">
              <caption className="sr-only">
                Andamento commesse · {period} · IVA inclusa
              </caption>
              <thead className="bg-slate-50">
                <tr>
                  {["Mese", "Venduto", "Incassato", "Commesse"].map((label) => (
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
                {data.map((month) => (
                  <tr key={month.key} className="border-t border-slate-100">
                    <th
                      scope="row"
                      className="whitespace-nowrap px-3 py-2 font-normal"
                    >
                      {month.mese}
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
                    <td className="px-3 py-2">{month.count ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </div>
    </section>
  );
}
