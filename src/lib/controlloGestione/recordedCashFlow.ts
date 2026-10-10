export interface RecordedCashEntry {
  id: string; direction: string; amount: number; entry_date: string; category: string;
}
export interface RecordedCashMonth { month: number; income: number; expense: number; net: number; count: number }

/** Cash date, not invoice date or payroll accrual month. This is a movement
 * statement, not a bank balance: no opening balance is invented from today's bank.
 */
export function recordedCashFlow(entries: RecordedCashEntry[], year: number) {
  const months: RecordedCashMonth[] = Array.from({ length: 12 }, (_, index) => ({ month: index + 1, income: 0, expense: 0, net: 0, count: 0 }));
  let invalid = 0;
  const ids = new Set<string>();
  for (const entry of entries) {
    if (ids.has(entry.id)) continue;
    ids.add(entry.id);
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(entry.entry_date);
    if (!match || !Number.isFinite(entry.amount) || entry.amount < 0 || !['entrata', 'uscita'].includes(entry.direction)) { invalid++; continue; }
    const [, y, m, d] = match;
    const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
    if (date.toISOString().slice(0, 10) !== entry.entry_date) { invalid++; continue; }
    if (Number(y) !== year) continue;
    const bucket = months[Number(m) - 1];
    bucket[entry.direction === 'entrata' ? 'income' : 'expense'] += Math.round(entry.amount * 100);
    bucket.count++;
  }
  for (const month of months) {
    month.net = (month.income - month.expense) / 100;
    month.income /= 100;
    month.expense /= 100;
  }
  const sum = (key: 'income' | 'expense' | 'net') => Math.round(months.reduce((s, m) => s + Math.round(m[key] * 100), 0)) / 100;
  return { months, income: sum('income'), expense: sum('expense'), net: sum('net'), count: months.reduce((s, m) => s + m.count, 0), invalid };
}
