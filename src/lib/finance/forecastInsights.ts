import {
  projectForecast,
  type ForecastMovement,
  type ForecastProjection,
  type ForecastScenario,
} from "./forecastLedger";

/** End-of-day risk, separate from the starting balance (which can already be below threshold). */
export function forecastRisk(
  projection: ForecastProjection,
  threshold: number,
) {
  const below = projection.days.filter(
    (d) => d.balance !== null && d.balance < threshold,
  );
  const first = below[0]?.date ?? null;
  const recovery = first
    ? (projection.days.find(
        (d) => d.date > first && d.balance !== null && d.balance >= threshold,
      )?.date ?? null)
    : null;
  return {
    daysBelow: projection.minimum === null ? null : below.length,
    first,
    recovery,
    expensesToMinimum: projection.minimumDate
      ? projection.included
          .filter(
            (m) =>
              m.direction === "out" &&
              m.date &&
              m.date <= projection.minimumDate!,
          )
          .sort((a, b) => b.cents - a.cents)
          .slice(0, 3)
      : [],
  };
}
export function movementTotals(rows: ForecastMovement[]) {
  return rows.reduce(
    (total, m) => {
      total[m.direction] += m.cents;
      return total;
    },
    { in: 0, out: 0 },
  );
}
export function compareForecastScenarios(input: {
  movements: ForecastMovement[];
  opening: number | null;
  today: string;
  horizon: number;
  threshold: number;
  scenario: ForecastScenario;
  realDelay: number | null;
}) {
  const options = [
    { key: "puntuali", label: "Incassi puntuali", delay: 0 },
    { key: "reale", label: "Ritardo medio reale", delay: input.realDelay },
    { key: "15", label: "Incassi +15 giorni", delay: 15 },
    { key: "30", label: "Incassi +30 giorni", delay: 30 },
  ];
  return options.map((option) => {
    if (option.delay === null)
      return { ...option, projection: null, risk: null };
    const projection = projectForecast(
      input.movements,
      input.opening,
      input.today,
      input.horizon,
      input.threshold,
      { ...input.scenario, delayDays: option.delay },
    );
    return {
      ...option,
      projection,
      risk: forecastRisk(projection, input.threshold),
    };
  });
}
/** Preserve negative balances in chart tooltips. Outgoing bars alone use absolute values. */
export const forecastTooltipAmount = (value: number, key: string) =>
  key === "balance" || key === "withoutEstimates" ? value : Math.abs(value);
