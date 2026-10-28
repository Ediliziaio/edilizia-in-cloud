/** Rounded axis marks only: source values and negative signs stay untouched. */
export function cashChartScale(values: (number | null)[]) {
  const finite = values.filter(
    (v): v is number => v !== null && Number.isFinite(v),
  );
  const low = Math.min(0, ...finite);
  const high = Math.max(0, ...finite);
  const rawStep = Math.max(100, (high - low) / 4);
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const step =
    ([1, 2, 2.5, 5, 10].find((v) => v * magnitude >= rawStep) ?? 10) *
    magnitude;
  const min = Math.floor(low / step) * step;
  const max = Math.max(min + step, Math.ceil(high / step) * step);
  const ticks = Array.from(
    { length: Math.round((max - min) / step) + 1 },
    (_, i) => min + i * step,
  );
  return { domain: [min, max] as [number, number], ticks };
}
