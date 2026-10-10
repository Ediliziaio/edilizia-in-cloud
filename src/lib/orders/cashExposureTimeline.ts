export interface DatedCashEvent { date: string; in: number; out: number }
const months = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
export function cashExposureTimeline(events: DatedCashEvent[], today: string) {
  const daily = new Map<string, { income: number; expense: number }>();
  for (const event of events) {
    const day = event.date.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(event.in) || !Number.isFinite(event.out)) continue;
    const [year, month, d] = day.split('-').map(Number);
    if (new Date(Date.UTC(year, month - 1, d)).toISOString().slice(0, 10) !== day) continue;
    const bucket = daily.get(day) ?? { income: 0, expense: 0 };
    bucket.income += Math.round(event.in * 100);
    bucket.expense += Math.round(event.out * 100);
    daily.set(day, bucket);
  }
  // There is no timestamp within a payment day. A peak based on array/query
  // order would be invented; aggregate the day before computing exposure.
  const days = [...daily].sort(([a], [b]) => a.localeCompare(b));
  let net = 0, income = 0, expense = 0;
  let peak: { value: number; date: string } | null = null;
  const perMonth = new Map<string, { income: number; expense: number }>();
  for (const [day, bucket] of days) {
    income += bucket.income;
    expense += bucket.expense;
    net += bucket.income - bucket.expense;
    if (!peak || net / 100 < peak.value) peak = { value: net / 100, date: day };
    const ym = day.slice(0, 7);
    const m = perMonth.get(ym) ?? { income: 0, expense: 0 };
    m.income += bucket.income; m.expense += bucket.expense; perMonth.set(ym, m);
  }
  const serieMensile: { ym: string; label: string; entrate: number; uscite: number; saldo: number }[] = [];
  if (days.length) {
    const firstMonth = days[0][0].slice(0, 7);
    const lastMonth = [today.slice(0, 7), days[days.length - 1][0].slice(0, 7)].sort().at(-1)!;
    const [lastYear, lastM] = lastMonth.split('-').map(Number);
    const lower = new Date(Date.UTC(lastYear, lastM - 24, 1)).toISOString().slice(0, 7);
    const from = firstMonth > lower ? firstMonth : lower;
    let running = [...perMonth].filter(([ym]) => ym < from).reduce((s, [, m]) => s + m.income - m.expense, 0);
    let [y, m] = from.split('-').map(Number);
    for (let i = 0; i < 24; i++) {
      const ym = `${y}-${String(m).padStart(2, '0')}`;
      if (ym > lastMonth) break;
      const bucket = perMonth.get(ym) ?? { income: 0, expense: 0 };
      running += bucket.income - bucket.expense;
      serieMensile.push({ ym, label: `${months[m - 1]} '${String(y).slice(2)}`, entrate: bucket.income / 100,
        uscite: bucket.expense / 100, saldo: running / 100 });
      if (++m > 12) { m = 1; y++; }
    }
  }
  return { hasMovimenti: days.length > 0, incassato: income / 100, uscite: expense / 100,
    saldoOggi: (income - expense) / 100, picco: peak, serieMensile };
}
